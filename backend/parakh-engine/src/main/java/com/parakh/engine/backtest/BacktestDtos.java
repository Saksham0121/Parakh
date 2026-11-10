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
        @JsonAlias({"endDate", "dateRangeEnd"}) String endDate,
        /** Overrides the setup's timeframe for this run. */
        String timeframe,
        Double initialCapital,
        /** Per-side cost (brokerage + slippage) in percent. */
        Double commissionPct,
        /** Percent of equity committed per trade. */
        Double positionSizePct,
        /** Gate entries on today's fundamentals (historical fundamentals aren't available). */
        Boolean applyFundamentals
    ) {}

    /** Everything the simulator needs, resolved and validated by the controller. */
    public record BacktestJob(String runId, String setupId, String symbol, long startEpoch, long endEpoch,
                              String timeframe, double initialCapital, double commissionPct, double positionSizePct,
                              boolean applyFundamentals) {}
}
