package com.parakh.common.dto.event;

public record PriceTickEvent(String symbol, double price, double volume, long timestamp) {}
