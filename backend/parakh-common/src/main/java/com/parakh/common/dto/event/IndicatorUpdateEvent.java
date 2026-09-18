package com.parakh.common.dto.event;

import java.util.Map;

public record IndicatorUpdateEvent(String symbol, String indicatorType, Map<String, Object> params, Object value, long timestamp) {}
