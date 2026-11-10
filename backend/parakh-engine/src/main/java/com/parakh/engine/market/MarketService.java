package com.parakh.engine.market;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.parakh.common.analysis.Candles;
import com.parakh.common.constants.KafkaTopics;
import com.parakh.common.dto.event.PriceTickEvent;
import com.parakh.engine.cache.TieredCache;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;

/**
 * Market data facade: every read goes through {@link TieredCache}, so the upstream provider sees at most
 * one request per symbol/timeframe per TTL window regardless of how many users are watching.
 */
@Service
public class MarketService {

    private static final Logger log = LoggerFactory.getLogger(MarketService.class);
    private static final Duration SUBSCRIPTION_IDLE = Duration.ofMinutes(15);
    private static final int MAX_PARALLEL_UPSTREAM = 8;

    private final YahooFinanceClient yahoo;
    private final KafkaTemplate<String, String> kafka;
    private final TieredCache cache;
    private final ObjectMapper mapper;
    private final ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor();
    private final Semaphore upstreamPermits = new Semaphore(MAX_PARALLEL_UPSTREAM);

    /** symbol -> last time a client asked for it. Idle symbols stop being polled. */
    private final Map<String, Long> subscriptions = new ConcurrentHashMap<>();
    private final Map<String, Double> lastPublished = new ConcurrentHashMap<>();

    public MarketService(YahooFinanceClient yahoo, KafkaTemplate<String, String> kafka, TieredCache cache, ObjectMapper mapper) {
        this.yahoo = yahoo;
        this.kafka = kafka;
        this.cache = cache;
        this.mapper = mapper;
    }

    private static String clean(String symbol) {
        return symbol == null ? "" : symbol.trim().toUpperCase();
    }

    // ─── Candles ────────────────────────────────────────────────────────────────

    public static Duration candleTtl(String resolution) {
        return switch (resolution == null ? "D" : resolution) {
            case "1", "5" -> Duration.ofSeconds(20);
            case "15", "30" -> Duration.ofSeconds(45);
            case "60" -> Duration.ofMinutes(2);
            case "W", "M" -> Duration.ofHours(1);
            default -> Duration.ofMinutes(5);
        };
    }

    /** Default history used by the chart and the scanner for each timeframe. */
    public static long defaultLookbackSeconds(String resolution) {
        return switch (resolution == null ? "D" : resolution) {
            case "1" -> 5L * 86400;
            case "5" -> 30L * 86400;
            case "15", "30" -> 59L * 86400;
            case "60" -> 365L * 86400;
            case "W" -> 10L * 365 * 86400;
            case "M" -> 25L * 365 * 86400;
            default -> 3L * 365 * 86400;
        };
    }

    public Map<String, Object> getCandles(String symbol, String resolution, long from, long to) {
        String sym = clean(symbol);
        long now = Instant.now().getEpochSecond();
        long toTs = to > 0 ? to : now;
        long fromTs = from > 0 ? from : toTs - defaultLookbackSeconds(resolution);
        // Bucket ranges so overlapping chart windows share cache entries.
        String toKey = now - toTs < 3600 ? "now" : String.valueOf(toTs / 3600 * 3600);
        String key = "candles:v2:" + sym + ":" + resolution + ":" + (fromTs / 86400) + ":" + toKey;
        return cache.get(key, candleTtl(resolution), Duration.ofSeconds(10),
                () -> throttled(() -> yahoo.getCandles(sym, resolution, fromTs, toTs)));
    }

    public Candles getCandleSeries(String symbol, String resolution) {
        return Candles.fromMap(getCandles(symbol, resolution, 0, 0));
    }

    // ─── Quotes ─────────────────────────────────────────────────────────────────

    public Map<String, Object> getQuote(String symbol) {
        String sym = clean(symbol);
        touch(sym);
        return cache.get("quote:v2:" + sym, Duration.ofSeconds(10), Duration.ofSeconds(20),
                () -> throttled(() -> yahoo.getQuote(sym)));
    }

    /** Resolves many quotes in parallel; one round trip from the browser instead of one per watchlist row. */
    public Map<String, Object> getQuotes(Collection<String> symbols) {
        Map<String, Future<Map<String, Object>>> futures = new LinkedHashMap<>();
        for (String s : symbols) {
            String sym = clean(s);
            if (!sym.isEmpty() && futures.size() < 100) futures.putIfAbsent(sym, pool.submit(() -> getQuote(sym)));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        futures.forEach((sym, f) -> {
            try {
                Map<String, Object> q = f.get(12, TimeUnit.SECONDS);
                if (q != null) out.put(sym, q);
            } catch (Exception ignored) {
                // a slow symbol must not hold up the whole batch
            }
        });
        return out;
    }

    // ─── Fundamentals ───────────────────────────────────────────────────────────

    public Map<String, Object> getFundamentals(String symbol) {
        String sym = clean(symbol);
        return cache.get("fundamentals:v2:" + sym, Duration.ofHours(12), Duration.ofMinutes(2),
                () -> throttled(() -> yahoo.getFundamentals(sym)));
    }

    @SuppressWarnings("unchecked")
    public Map<String, Double> getFundamentalMetrics(String symbol) {
        Map<String, Object> f = getFundamentals(symbol);
        if (f == null || !(f.get("metrics") instanceof Map<?, ?> m)) return Map.of();
        Map<String, Double> out = new HashMap<>();
        ((Map<String, Object>) m).forEach((k, v) -> {
            if (v instanceof Number n) out.put(k, n.doubleValue());
        });
        return out;
    }

    // ─── Search ─────────────────────────────────────────────────────────────────

    public Map<String, Object> searchSymbol(String query) {
        if (query == null || query.isBlank()) return Map.of("count", 0, "result", List.of());
        String q = query.trim().toUpperCase();
        Map<String, Object> res = cache.get("search:v2:" + q, Duration.ofMinutes(30), Duration.ofMinutes(2),
                () -> throttled(() -> yahoo.searchSymbol(query)));
        return res != null ? res : Map.of("count", 0, "result", List.of());
    }

    // ─── Live polling ───────────────────────────────────────────────────────────

    public void subscribe(String symbol) {
        String sym = clean(symbol);
        if (!sym.isEmpty()) subscriptions.put(sym, System.currentTimeMillis());
    }

    public void unsubscribe(String symbol) {
        subscriptions.remove(clean(symbol));
    }

    private void touch(String sym) {
        subscriptions.computeIfPresent(sym, (k, v) -> System.currentTimeMillis());
    }

    /**
     * Refreshes quotes for symbols someone is actively watching, in parallel, and publishes a tick only when
     * the price actually moved. Fixed-delay scheduling means a slow upstream can never stack up overlapping runs.
     */
    @Scheduled(fixedDelayString = "${parakh.market.poll-interval-ms:5000}")
    public void pollSubscribedPrices() {
        long cutoff = System.currentTimeMillis() - SUBSCRIPTION_IDLE.toMillis();
        subscriptions.entrySet().removeIf(e -> e.getValue() < cutoff);
        if (subscriptions.isEmpty() || yahoo.isRateLimited()) return;

        List<Future<?>> jobs = new ArrayList<>();
        for (String sym : subscriptions.keySet()) {
            jobs.add(pool.submit(() -> refreshQuote(sym)));
        }
        for (Future<?> f : jobs) {
            try {
                f.get(10, TimeUnit.SECONDS);
            } catch (Exception ignored) {
                f.cancel(true);
            }
        }
    }

    private void refreshQuote(String sym) {
        Map<String, Object> quote = throttled(() -> yahoo.getQuote(sym));
        if (quote == null || !(quote.get("c") instanceof Number price)) return;
        cache.put("quote:v2:" + sym, quote, Duration.ofSeconds(10));

        double p = price.doubleValue();
        Double prev = lastPublished.put(sym, p);
        if (prev != null && prev == p) return;
        try {
            long ts = quote.get("t") instanceof Number t ? t.longValue() : Instant.now().getEpochSecond();
            double vol = quote.get("v") instanceof Number v ? v.doubleValue() : 0.0;
            kafka.send(KafkaTopics.PRICE_TICKS, sym, mapper.writeValueAsString(new PriceTickEvent(sym, p, vol, ts)));
        } catch (Exception e) {
            log.debug("Could not publish tick for {}: {}", sym, e.getMessage());
        }
    }

    /** Caps concurrent upstream calls so a cold cache under load can't trigger a rate-limit ban. */
    private <T> T throttled(Callable<T> call) {
        boolean acquired = false;
        try {
            acquired = upstreamPermits.tryAcquire(15, TimeUnit.SECONDS);
            if (!acquired) return null;
            return call.call();
        } catch (Exception e) {
            return null;
        } finally {
            if (acquired) upstreamPermits.release();
        }
    }

    public boolean isUpstreamRateLimited() {
        return yahoo.isRateLimited();
    }
}
