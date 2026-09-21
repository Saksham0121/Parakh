package com.parakh.engine.market;

import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Map;

@RestController
@RequestMapping("/api/market")
public class MarketController {

    private final MarketService marketService;

    public MarketController(MarketService marketService) {
        this.marketService = marketService;
    }

    @GetMapping("/quote/{symbol}")
    public Map<String, Object> getQuote(@PathVariable String symbol) {
        return marketService.getQuote(symbol);
    }

    @GetMapping("/candles/{symbol}")
    public Map<String, Object> getCandles(
            @PathVariable String symbol,
            @RequestParam(defaultValue = "D") String resolution,
            @RequestParam(defaultValue = "0") long from,
            @RequestParam(defaultValue = "0") long to) {

        long now = Instant.now().getEpochSecond();
        long fromTs = from > 0 ? from : now - 365 * 86400L;
        long toTs = to > 0 ? to : now;

        return marketService.getCandles(symbol, resolution, fromTs, toTs);
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
}
