package com.parakh.engine.market;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Thin, resilient Yahoo Finance adapter.
 *
 * <p>Design rules:</p>
 * <ul>
 *   <li>Never invent data. When Yahoo has nothing, methods return {@code null} and callers surface
 *       "data unavailable" — an analysis tool must not chart or backtest synthetic prices.</li>
 *   <li>Back off when rate limited (HTTP 429) instead of hammering the upstream, which only extends the ban.</li>
 *   <li>All network calls are bounded by short timeouts and run on virtual threads.</li>
 * </ul>
 */
@Component
public class YahooFinanceClient {

    private static final Logger log = LoggerFactory.getLogger(YahooFinanceClient.class);
    private static final String YF_HOST = "https://query2.finance.yahoo.com";
    private static final String USER_AGENT = "Mozilla/5.0 (compatible; yahoo-finance2/4.0.2)";

    private static final ExecutorService VT = Executors.newVirtualThreadPerTaskExecutor();

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    /** Epoch millis until which upstream calls are skipped after a 429. */
    private volatile long coolDownUntil = 0;
    private volatile long coolDownMs = 15_000;
    private volatile String crumb;
    private final java.util.concurrent.locks.ReentrantLock crumbLock = new java.util.concurrent.locks.ReentrantLock();

    /** Per-request upstream timeout; small CPU-starved instances need longer for TLS and parsing. */
    private final Duration requestTimeout;

    public YahooFinanceClient(ObjectMapper objectMapper,
                              @org.springframework.beans.factory.annotation.Value("${parakh.market.http-timeout-ms:10000}") long timeoutMs) {
        this.objectMapper = objectMapper;
        this.requestTimeout = Duration.ofMillis(Math.max(2000, timeoutMs));
        CookieManager cookies = new CookieManager();
        cookies.setCookiePolicy(CookiePolicy.ACCEPT_ALL);
        this.httpClient = HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.NORMAL)
                .connectTimeout(Duration.ofMillis(Math.max(5000, this.requestTimeout.toMillis() / 2)))
                .cookieHandler(cookies)
                .executor(VT)
                .build();
    }

    public boolean isRateLimited() {
        return System.currentTimeMillis() < coolDownUntil;
    }

    private record Resp(int status, String body) {}

    private Resp send(String url) {
        if (isRateLimited()) return new Resp(429, null);
        try {
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("User-Agent", USER_AGENT)
                    .header("Accept", "application/json, text/plain, */*")
                    .timeout(requestTimeout)
                    .GET()
                    .build();
            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() == 429) {
                coolDownUntil = System.currentTimeMillis() + coolDownMs;
                log.warn("Yahoo Finance rate limit hit; pausing upstream calls for {}s", coolDownMs / 1000);
                coolDownMs = Math.min(coolDownMs * 2, 300_000);
            } else if (resp.statusCode() == 200) {
                coolDownMs = 15_000;
            }
            return new Resp(resp.statusCode(), resp.body());
        } catch (Exception e) {
            log.debug("HTTP GET error for {}: {}", url, e.getMessage());
            return new Resp(-1, null);
        }
    }

    private String executeGet(String url) {
        Resp r = send(url);
        return r.status() == 200 ? r.body() : null;
    }

    // ─── Symbols & resolutions ──────────────────────────────────────────────────

    public String normalizeSymbol(String raw) {
        if (raw == null) return "";
        String clean = raw.trim().toUpperCase();
        if (clean.startsWith("BINANCE:")) clean = clean.substring("BINANCE:".length());
        if (clean.endsWith("USDT")) clean = clean.replaceAll("USDT$", "-USD");
        if (clean.endsWith("USD") && !clean.contains("-") && clean.length() > 3) clean = clean.replaceAll("USD$", "-USD");
        if (IndianEquityMaster.TICKERS.containsKey(clean)) return clean + ".NS";
        return clean;
    }

    public String mapResolutionToInterval(String resolution) {
        if (resolution == null) return "1d";
        return switch (resolution) {
            case "1" -> "1m";
            case "5" -> "5m";
            case "15" -> "15m";
            case "30" -> "30m";
            case "60" -> "60m";
            case "W" -> "1wk";
            case "M" -> "1mo";
            default -> "1d";
        };
    }

    /** Yahoo only serves limited history for intraday intervals; asking for more returns an error. */
    public long maxHistorySeconds(String resolution) {
        return switch (resolution == null ? "D" : resolution) {
            case "1" -> 7L * 86400;
            case "5", "15", "30" -> 59L * 86400;
            case "60" -> 729L * 86400;
            default -> 40L * 365 * 86400;
        };
    }

    // ─── Candles ────────────────────────────────────────────────────────────────

    /** Returns {t,o,h,l,c,v,s:"ok",symbol} or {@code null} when no real data is available. */
    public Map<String, Object> getCandles(String symbol, String resolution, long from, long to) {
        String norm = normalizeSymbol(symbol);
        long now = Instant.now().getEpochSecond();
        long p2 = to > 0 ? to : now;
        long p1 = from > 0 ? from : p2 - 365 * 86400L;
        p1 = Math.max(p1, now - maxHistorySeconds(resolution));

        Map<String, Object> data = fetchYahooCandles(norm, resolution, p1, p2);
        if (data != null || norm.contains(".") || norm.contains("-")) return data;

        // Bare ticker that Yahoo didn't recognise: try NSE and BSE in parallel.
        final long start = p1;
        var ns = CompletableFuture.supplyAsync(() -> fetchYahooCandles(norm + ".NS", resolution, start, p2), VT);
        var bo = CompletableFuture.supplyAsync(() -> fetchYahooCandles(norm + ".BO", resolution, start, p2), VT);
        Map<String, Object> nsData = await(ns, requestTimeout.toMillis());
        return nsData != null ? nsData : await(bo, 2_000);
    }

    private static <T> T await(CompletableFuture<T> f, long ms) {
        try {
            return f.get(ms, TimeUnit.MILLISECONDS);
        } catch (Exception e) {
            return null;
        }
    }

    private Map<String, Object> fetchYahooCandles(String symbol, String resolution, long p1, long p2) {
        String interval = mapResolutionToInterval(resolution);
        String url = String.format("%s/v8/finance/chart/%s?interval=%s&period1=%d&period2=%d&includePrePost=false&events=div%%2Csplits",
                YF_HOST, URLEncoder.encode(symbol, StandardCharsets.UTF_8), interval, p1, p2);
        try {
            String response = executeGet(url);
            if (response == null) return null;
            JsonNode result = objectMapper.readTree(response).path("chart").path("result");
            if (!result.isArray() || result.isEmpty()) return null;
            JsonNode node = result.get(0);
            JsonNode ts = node.path("timestamp");
            JsonNode quote = node.path("indicators").path("quote").path(0);
            if (!ts.isArray() || quote.isMissingNode()) return null;

            JsonNode opens = quote.path("open"), highs = quote.path("high"), lows = quote.path("low"),
                    closes = quote.path("close"), volumes = quote.path("volume");
            int n = ts.size();
            List<Long> t = new ArrayList<>(n);
            List<Double> o = new ArrayList<>(n), h = new ArrayList<>(n), l = new ArrayList<>(n), c = new ArrayList<>(n);
            List<Long> v = new ArrayList<>(n);
            for (int i = 0; i < n; i++) {
                JsonNode cl = closes.path(i), op = opens.path(i);
                if (cl.isMissingNode() || cl.isNull() || op.isMissingNode() || op.isNull()) continue;
                double close = cl.asDouble(), open = op.asDouble();
                t.add(ts.get(i).asLong());
                o.add(open);
                h.add(highs.path(i).isNumber() ? highs.path(i).asDouble() : Math.max(open, close));
                l.add(lows.path(i).isNumber() ? lows.path(i).asDouble() : Math.min(open, close));
                c.add(close);
                v.add(volumes.path(i).isNumber() ? volumes.path(i).asLong() : 0L);
            }
            if (t.isEmpty()) return null;
            JsonNode meta = node.path("meta");
            Map<String, Object> out = new HashMap<>();
            out.put("t", t); out.put("o", o); out.put("h", h); out.put("l", l); out.put("c", c); out.put("v", v);
            out.put("s", "ok");
            out.put("symbol", symbol);
            out.put("currency", meta.path("currency").asText(""));
            out.put("exchange", meta.path("exchangeName").asText(""));
            return out;
        } catch (Exception e) {
            log.debug("Yahoo candles parse failed for {}: {}", symbol, e.getMessage());
            return null;
        }
    }

    // ─── Quotes ─────────────────────────────────────────────────────────────────

    /** Returns a quote map or {@code null} when the symbol can't be priced right now. */
    public Map<String, Object> getQuote(String symbol) {
        String norm = normalizeSymbol(symbol);
        Map<String, Object> q = fetchYahooQuote(norm);
        if (q != null || norm.contains(".") || norm.contains("-")) return q;
        q = fetchYahooQuote(norm + ".NS");
        return q != null ? q : fetchYahooQuote(norm + ".BO");
    }

    private Map<String, Object> fetchYahooQuote(String symbol) {
        String url = String.format("%s/v8/finance/chart/%s?interval=1d&range=5d", YF_HOST, URLEncoder.encode(symbol, StandardCharsets.UTF_8));
        try {
            String response = executeGet(url);
            if (response == null) return null;
            JsonNode res = objectMapper.readTree(response).path("chart").path("result").path(0);
            JsonNode meta = res.path("meta");
            if (!meta.has("regularMarketPrice")) return null;
            double price = meta.path("regularMarketPrice").asDouble();
            // chartPreviousClose is the close before the *range*, so derive the prior session from the series.
            double prevClose = meta.path("previousClose").asDouble(Double.NaN);
            JsonNode closes = res.path("indicators").path("quote").path(0).path("close");
            if (Double.isNaN(prevClose) && closes.isArray() && closes.size() >= 2) {
                for (int i = closes.size() - 2; i >= 0; i--) {
                    if (closes.get(i).isNumber()) { prevClose = closes.get(i).asDouble(); break; }
                }
            }
            if (Double.isNaN(prevClose)) prevClose = meta.path("chartPreviousClose").asDouble(price);
            double diff = price - prevClose;
            Map<String, Object> q = new HashMap<>();
            q.put("symbol", symbol);
            q.put("c", price);
            q.put("price", price);
            q.put("d", diff);
            q.put("dp", prevClose > 0 ? diff / prevClose * 100 : 0.0);
            q.put("h", meta.path("regularMarketDayHigh").asDouble(price));
            q.put("l", meta.path("regularMarketDayLow").asDouble(price));
            q.put("o", meta.path("regularMarketDayOpen").asDouble(price));
            q.put("pc", prevClose);
            q.put("v", meta.path("regularMarketVolume").asLong(0));
            q.put("high52", meta.path("fiftyTwoWeekHigh").asDouble(Double.NaN));
            q.put("low52", meta.path("fiftyTwoWeekLow").asDouble(Double.NaN));
            q.put("currency", meta.path("currency").asText(""));
            q.put("exchange", meta.path("exchangeName").asText(""));
            q.put("name", meta.path("longName").asText(meta.path("shortName").asText(symbol)));
            q.put("t", meta.path("regularMarketTime").asLong(Instant.now().getEpochSecond()));
            q.values().removeIf(v -> v instanceof Double d && d.isNaN());
            return q;
        } catch (Exception e) {
            log.debug("Yahoo quote fetch failed for {}: {}", symbol, e.getMessage());
            return null;
        }
    }

    // ─── Fundamentals ───────────────────────────────────────────────────────────

    /**
     * Not {@code synchronized}: on Java 21 a virtual thread blocked inside a monitor pins its carrier,
     * and with one CPU (small containers) that starves the HTTP client's own tasks into timeouts.
     */
    private String crumb(boolean refresh) {
        if (crumb != null && !refresh) return crumb;
        if (isRateLimited()) return null;
        crumbLock.lock();
        try {
            if (crumb != null && !refresh) return crumb;
            send("https://fc.yahoo.com/"); // sets the consent cookie; a 404 here is expected
            Resp r = send(YF_HOST + "/v1/test/getcrumb");
            crumb = r.status() == 200 && r.body() != null && !r.body().isBlank() && !r.body().contains("<") ? r.body().trim() : null;
            return crumb;
        } finally {
            crumbLock.unlock();
        }
    }

    /**
     * Real company fundamentals from Yahoo's quoteSummary. Metric keys match
     * {@link com.parakh.common.analysis.SetupEvaluator#canonicalMetric}. Returns {@code null} when unavailable.
     */
    public Map<String, Object> getFundamentals(String symbol) {
        String norm = normalizeSymbol(symbol);
        String modules = "price,summaryDetail,defaultKeyStatistics,financialData,assetProfile";
        for (int attempt = 0; attempt < 2; attempt++) {
            String c = crumb(attempt > 0);
            if (c == null) return null;
            String url = String.format("%s/v10/finance/quoteSummary/%s?modules=%s&crumb=%s", YF_HOST,
                    URLEncoder.encode(norm, StandardCharsets.UTF_8), modules, URLEncoder.encode(c, StandardCharsets.UTF_8));
            Resp r = send(url);
            if (r.status() == 401 || r.status() == 403) continue;
            if (r.status() != 200 || r.body() == null) return null;
            try {
                JsonNode root = objectMapper.readTree(r.body()).path("quoteSummary").path("result").path(0);
                if (root.isMissingNode()) return null;
                return parseFundamentals(norm, root);
            } catch (Exception e) {
                log.debug("Fundamentals parse failed for {}: {}", norm, e.getMessage());
                return null;
            }
        }
        return null;
    }

    private Map<String, Object> parseFundamentals(String symbol, JsonNode root) {
        JsonNode price = root.path("price"), sd = root.path("summaryDetail"), ks = root.path("defaultKeyStatistics"),
                fd = root.path("financialData"), ap = root.path("assetProfile");
        Map<String, Double> m = new LinkedHashMap<>();
        put(m, "pe_ratio", raw(sd, "trailingPE"), 1);
        put(m, "forward_pe", raw(sd, "forwardPE"), 1);
        put(m, "pb_ratio", raw(ks, "priceToBook"), 1);
        put(m, "peg_ratio", raw(ks, "pegRatio"), 1);
        put(m, "eps", raw(ks, "trailingEps"), 1);
        put(m, "roe", raw(fd, "returnOnEquity"), 100);
        put(m, "roa", raw(fd, "returnOnAssets"), 100);
        put(m, "debt_to_equity", raw(fd, "debtToEquity"), 0.01); // Yahoo reports D/E as a percentage
        Double cap = raw(price, "marketCap");
        put(m, "market_cap_cr", cap, 1e-7);
        put(m, "market_cap_bn", cap, 1e-9);
        put(m, "dividend_yield", raw(sd, "dividendYield"), 100);
        put(m, "profit_margin", raw(fd, "profitMargins"), 100);
        put(m, "revenue_growth", raw(fd, "revenueGrowth"), 100);
        put(m, "earnings_growth", raw(fd, "earningsGrowth"), 100);
        put(m, "current_ratio", raw(fd, "currentRatio"), 1);
        put(m, "beta", raw(sd, "beta"), 1);
        put(m, "avg_volume", raw(sd, "averageVolume"), 1);
        Double hi = raw(sd, "fiftyTwoWeekHigh"), last = raw(price, "regularMarketPrice");
        if (hi != null && last != null && hi > 0) m.put("pct_from_52w_high", Math.round((hi - last) / hi * 10000) / 100.0);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("symbol", symbol);
        out.put("name", price.path("longName").asText(price.path("shortName").asText(symbol)));
        out.put("currency", price.path("currency").asText(""));
        out.put("sector", ap.path("sector").asText(""));
        out.put("industry", ap.path("industry").asText(""));
        out.put("metrics", m);
        out.put("asOf", Instant.now().getEpochSecond());
        out.put("source", "Yahoo Finance");
        return out;
    }

    private static Double raw(JsonNode parent, String field) {
        JsonNode n = parent.path(field);
        if (n.isNumber()) return n.asDouble();
        JsonNode r = n.path("raw");
        return r.isNumber() ? r.asDouble() : null;
    }

    private static void put(Map<String, Double> m, String key, Double v, double scale) {
        if (v == null || v.isNaN() || v.isInfinite()) return;
        m.put(key, Math.round(v * scale * 100.0) / 100.0);
    }

    // ─── Search ─────────────────────────────────────────────────────────────────

    public Map<String, Object> searchSymbol(String query) {
        if (query == null || query.isBlank()) return Map.of("count", 0, "result", List.of());
        String qClean = query.trim();
        String qUpper = qClean.toUpperCase();
        Map<String, Map<String, String>> resultMap = new LinkedHashMap<>();

        for (Map.Entry<String, String> e : IndianEquityMaster.TICKERS.entrySet()) {
            if (e.getKey().startsWith(qUpper) || e.getValue().toUpperCase().contains(qUpper)) {
                String sym = e.getKey() + ".NS";
                resultMap.put(sym, entry(sym, e.getValue(), "EQUITY", "NSE"));
            }
        }

        try {
            String url = String.format("%s/v1/finance/search?q=%s&quotesCount=15&newsCount=0&enableFuzzyQuery=false",
                    YF_HOST, URLEncoder.encode(qClean, StandardCharsets.UTF_8));
            String response = executeGet(url);
            if (response != null) {
                for (JsonNode item : objectMapper.readTree(response).path("quotes")) {
                    String sym = item.path("symbol").asText("");
                    if (sym.isBlank() || resultMap.containsKey(sym)) continue;
                    String desc = item.path("shortname").asText(item.path("longname").asText(sym));
                    String exch = item.path("exchDisp").asText(item.path("exchange").asText(""));
                    resultMap.put(sym, entry(sym, desc, item.path("quoteType").asText("EQUITY"), exch));
                }
            }
        } catch (Exception e) {
            log.debug("Yahoo search failed for '{}': {}", qClean, e.getMessage());
        }

        List<Map<String, String>> sorted = new ArrayList<>(resultMap.values());
        sorted.sort(Comparator
                .comparing((Map<String, String> a) -> !(a.get("symbol").equalsIgnoreCase(qUpper) || a.get("symbol").equalsIgnoreCase(qUpper + ".NS")))
                .thenComparing(a -> !isIndian(a.get("symbol"))));
        if (sorted.size() > 15) sorted = sorted.subList(0, 15);
        return Map.of("count", sorted.size(), "result", sorted);
    }

    private static boolean isIndian(String sym) {
        return sym.endsWith(".NS") || sym.endsWith(".BO");
    }

    private static Map<String, String> entry(String sym, String desc, String type, String exch) {
        return Map.of("symbol", sym, "displaySymbol", sym, "description", desc, "type", type, "exchange", exch);
    }
}
