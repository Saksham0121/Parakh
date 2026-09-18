package com.parakh.common.dto.event;

import java.util.Map;

public record AlertFiredEvent(
    String userId,
    String setupId,
    String setupName,
    String symbol,
    String conditions,
    Map<String, Object> snapshot,
    long timestamp
) {}
