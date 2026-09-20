package com.parakh.core.websocket;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.parakh.common.constants.KafkaTopics;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class WebSocketKafkaBridge {

    private static final Logger log = LoggerFactory.getLogger(WebSocketKafkaBridge.class);

    private final SocketIOEventHandler eventHandler;
    private final ObjectMapper objectMapper;

    public WebSocketKafkaBridge(SocketIOEventHandler eventHandler, ObjectMapper objectMapper) {
        this.eventHandler = eventHandler;
        this.objectMapper = objectMapper;
    }

    @KafkaListener(topics = KafkaTopics.PRICE_TICKS, groupId = "ws-core-price-group")
    public void onPriceTick(String message) {
        try {
            Map<String, Object> tick = objectMapper.readValue(message, new TypeReference<>() {});
            String symbol = (String) tick.get("symbol");
            if (symbol != null) {
                eventHandler.broadcastToSymbolRoom(symbol, "price:update", tick);
            }
        } catch (Exception e) {
            log.error("Failed to broadcast price tick: {}", e.getMessage());
        }
    }

    @KafkaListener(topics = KafkaTopics.INDICATOR_UPDATES, groupId = "ws-core-indicator-group")
    public void onIndicatorUpdate(String message) {
        try {
            Map<String, Object> update = objectMapper.readValue(message, new TypeReference<>() {});
            String symbol = (String) update.get("symbol");
            if (symbol != null) {
                eventHandler.broadcastToSymbolRoom(symbol, "indicator:update", update);
            }
        } catch (Exception e) {
            log.error("Failed to broadcast indicator update: {}", e.getMessage());
        }
    }

    @KafkaListener(topics = KafkaTopics.ALERT_FIRED, groupId = "ws-core-alert-group")
    public void onAlertFired(String message) {
        try {
            Map<String, Object> alert = objectMapper.readValue(message, new TypeReference<>() {});
            String userId = (String) alert.get("userId");
            if (userId != null) {
                eventHandler.broadcastToUser(userId, "alert:fired", alert);
                log.info("Dispatched alert:fired to user {}", userId);
            }
        } catch (Exception e) {
            log.error("Failed to broadcast alert:fired: {}", e.getMessage());
        }
    }
}
