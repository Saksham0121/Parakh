package com.parakh.engine.backtest;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.NotBlank;

public class BacktestDtos {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record CreateBacktestRequest(
        @NotBlank String setupId,
        @NotBlank String symbol,
        @JsonAlias({"startDate", "dateRangeStart"}) String startDate,
        @JsonAlias({"endDate", "dateRangeEnd"}) String endDate
    ) {}

    public record BacktestStatusResponse(
        String runId,
        String status,
        int progress,
        String error
    ) {}
}
