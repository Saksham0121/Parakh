package com.parakh.common.dto.event;

public record BacktestJobEvent(
    String runId,
    String setupId,
    String symbol,
    long startDate,
    long endDate
) {}
