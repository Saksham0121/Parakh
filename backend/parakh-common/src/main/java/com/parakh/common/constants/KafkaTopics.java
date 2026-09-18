package com.parakh.common.constants;

public final class KafkaTopics {
    private KafkaTopics() {}

    public static final String PRICE_TICKS = "price-ticks";
    public static final String INDICATOR_UPDATES = "indicator-updates";
    public static final String SETUP_TRIGGERED = "setup-triggered";
    public static final String ALERT_FIRED = "alert-fired";
    public static final String NOTIFICATION_JOBS = "notification-jobs";
    public static final String BACKTEST_JOBS = "backtest-jobs";
}
