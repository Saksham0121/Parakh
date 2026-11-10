package com.parakh.common.messaging;

/**
 * An event that normally travels over Kafka. In single-process deployments (parakh-app with
 * {@code parakh.messaging.mode=inprocess}) it is delivered as a Spring application event instead.
 */
public record BusMessage(String topic, String key, String payload) {}
