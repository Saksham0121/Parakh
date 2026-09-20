package com.parakh.core.dto;

import jakarta.validation.constraints.NotBlank;

public class WatchlistDtos {

    public record AddWatchlistRequest(
        @NotBlank String symbol
    ) {}

    public record WatchlistItemResponse(
        String id,
        String userId,
        String symbol
    ) {}

    public record CacheMetricsResponse(
        long hits,
        long misses,
        double hitRate
    ) {}
}
