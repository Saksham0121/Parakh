package com.parakh.core.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.parakh.common.constants.KafkaTopics;
import com.parakh.common.domain.SetupMatch;
import com.parakh.core.repository.SetupMatchRepository;
import com.parakh.core.repository.SetupRepository;
import com.parakh.core.websocket.SocketIOEventHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Receives setup matches detected by the engine's SetupMonitor, records them as alerts and pushes them
 * to the owner's open sessions in real time.
 */
@Service
public class SetupTriggerListener {

    private static final Logger log = LoggerFactory.getLogger(SetupTriggerListener.class);

    private final SetupRepository setupRepository;
    private final SetupMatchRepository matchRepository;
    private final SocketIOEventHandler sockets;
    private final ObjectMapper mapper;

    public SetupTriggerListener(SetupRepository setupRepository, SetupMatchRepository matchRepository,
                                SocketIOEventHandler sockets, ObjectMapper mapper) {
        this.setupRepository = setupRepository;
        this.matchRepository = matchRepository;
        this.sockets = sockets;
        this.mapper = mapper;
    }

    @KafkaListener(topics = KafkaTopics.SETUP_TRIGGERED, groupId = "setup-trigger-core-group")
    public void onSetupTriggered(String message) {
        try {
            Map<String, Object> event = mapper.readValue(message, new TypeReference<>() {});
            String setupId = (String) event.get("setupId");
            String userId = (String) event.get("userId");
            var setup = setupRepository.findByIdAndUserId(setupId, userId).orElse(null);
            if (setup == null) return;

            Map<String, Object> technical = new LinkedHashMap<>();
            technical.put("timeframe", event.get("timeframe"));
            technical.put("barTime", event.get("barTime"));
            technical.put("close", event.get("close"));
            technical.put("changePct", event.get("changePct"));
            technical.put("conditions", event.getOrDefault("technical", List.of()));

            SetupMatch match = new SetupMatch();
            match.setSetup(setup);
            match.setSymbol((String) event.get("symbol"));
            match.setMatchedAt(Instant.now());
            match.setTechnicalSnapshot(technical);
            match.setFundamentalsSnapshot(Map.of("conditions", event.getOrDefault("fundamental", List.of())));
            match.setFundamentalsPassed(Boolean.TRUE.equals(event.get("fundamentalsPassed")));
            match.setAlertFired(true);
            match = matchRepository.save(match);

            Map<String, Object> alert = new LinkedHashMap<>(event);
            alert.put("id", match.getId());
            alert.put("matchedAt", match.getMatchedAt().toString());
            sockets.broadcastToUser(userId, "alert:fired", alert);
            log.info("Setup '{}' matched {}", setup.getName(), match.getSymbol());
        } catch (Exception e) {
            log.error("Failed to record setup trigger: {}", e.getMessage());
        }
    }
}
