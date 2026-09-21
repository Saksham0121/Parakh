package com.parakh.engine.backtest;

import jakarta.validation.constraints.NotBlank;

import java.time.Instant;

public class BacktestDtos {

    public record CreateBacktestRequest(
        @NotBlank String setupId,
        @NotBlank String symbol,
        @NotBlank String startDate,
        @NotBlank String endDate
    ) {}

    public record BacktestStatusResponse(
        String runId,
        String status,
        int progress,
        String error
    ) {}
}
