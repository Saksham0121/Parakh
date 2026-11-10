package com.parakh.engine.market;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Arrays;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/market")
public class MarketController {

    private static final Set<String> RESOLUTIONS = Set.of("1", "5", "15", "30", "60", "D", "W", "M");

    private final MarketService marketService;

    public MarketController(MarketService marketService) {
        this.marketService = marketService;
    }

    @GetMapping("/quote/{symbol}")
    public ResponseEntity<Map<String, Object>> getQuote(@PathVariable String symbol) {
        Map<String, Object> q = marketService.getQuote(symbol);
        if (q == null) return unavailable("No live price available for " + symbol.toUpperCase());
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(5, TimeUnit.SECONDS)).body(q);
    }

    /** Batch quotes: {@code /api/market/quotes?symbols=TCS.NS,INFY.NS}. Missing symbols are simply omitted. */
    @GetMapping("/quotes")
    public Map<String, Object> getQuotes(@RequestParam String symbols) {
        return marketService.getQuotes(Arrays.asList(symbols.split(",")));
    }

    @GetMapping("/candles/{symbol}")
    public ResponseEntity<Map<String, Object>> getCandles(
            @PathVariable String symbol,
            @RequestParam(defaultValue = "D") String resolution,
            @RequestParam(defaultValue = "0") long from,
            @RequestParam(defaultValue = "0") long to) {
        if (!RESOLUTIONS.contains(resolution)) {
            return ResponseEntity.badRequest().body(Map.of("message", "Unsupported resolution " + resolution));
        }
        Map<String, Object> candles = marketService.getCandles(symbol, resolution, from, to);
        if (candles == null) {
            return unavailable(marketService.isUpstreamRateLimited()
                    ? "Market data provider is rate limiting requests. Try again in a minute."
                    : "No price history found for " + symbol.toUpperCase() + " on this timeframe.");
        }
        long maxAge = MarketService.candleTtl(resolution).toSeconds();
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(maxAge, TimeUnit.SECONDS)).body(candles);
    }

    @GetMapping("/fundamentals/{symbol}")
    public ResponseEntity<Map<String, Object>> getFundamentals(@PathVariable String symbol) {
        Map<String, Object> f = marketService.getFundamentals(symbol);
        if (f == null) return unavailable("Fundamentals are not available for " + symbol.toUpperCase());
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(30, TimeUnit.MINUTES)).body(f);
    }

    @GetMapping("/search")
    public Map<String, Object> search(@RequestParam(name = "q", defaultValue = "") String query) {
        return marketService.searchSymbol(query);
    }

    @PostMapping("/subscribe/{symbol}")
    public Map<String, String> subscribe(@PathVariable String symbol) {
        marketService.subscribe(symbol);
        return Map.of("message", "Subscribed to " + symbol.toUpperCase());
    }

    @DeleteMapping("/subscribe/{symbol}")
    public Map<String, String> unsubscribe(@PathVariable String symbol) {
        marketService.unsubscribe(symbol);
        return Map.of("message", "Unsubscribed from " + symbol.toUpperCase());
    }

    private static ResponseEntity<Map<String, Object>> unavailable(String message) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", message));
    }
}
