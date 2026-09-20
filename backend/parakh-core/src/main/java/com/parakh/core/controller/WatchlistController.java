package com.parakh.core.controller;

import com.parakh.core.dto.WatchlistDtos.*;
import com.parakh.core.service.WatchlistService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/watchlist")
public class WatchlistController {

    private final WatchlistService watchlistService;

    public WatchlistController(WatchlistService watchlistService) {
        this.watchlistService = watchlistService;
    }

    @GetMapping
    public List<WatchlistItemResponse> getWatchlist(@AuthenticationPrincipal String userId) {
        return watchlistService.getWatchlist(userId);
    }

    @PostMapping
    public WatchlistItemResponse addSymbol(@AuthenticationPrincipal String userId,
                                           @Valid @RequestBody AddWatchlistRequest request) {
        return watchlistService.addSymbol(userId, request.symbol());
    }

    @DeleteMapping("/{symbol}")
    public Map<String, Object> removeSymbol(@AuthenticationPrincipal String userId,
                                            @PathVariable String symbol) {
        watchlistService.removeSymbol(userId, symbol);
        return Map.of("success", true, "symbol", symbol.toUpperCase());
    }

    @GetMapping("/cache-metrics")
    public CacheMetricsResponse getCacheMetrics() {
        return watchlistService.getCacheMetrics();
    }
}
