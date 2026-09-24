package com.parakh.core.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.parakh.common.constants.KafkaTopics;
import com.parakh.common.domain.CompanyFundamentals;
import com.parakh.common.domain.Setup;
import com.parakh.common.domain.SetupMatch;
import com.parakh.common.dto.condition.TechnicalConditionDto;
import com.parakh.common.dto.event.AlertFiredEvent;
import com.parakh.common.dto.event.IndicatorUpdateEvent;
import com.parakh.common.matcher.ConditionMatcher;
import com.parakh.core.repository.CompanyFundamentalsRepository;
import com.parakh.core.repository.SetupMatchRepository;
import com.parakh.core.repository.SetupRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class SetupMatcherService {

    private static final Logger log = LoggerFactory.getLogger(SetupMatcherService.class);

    private final SetupRepository setupRepository;
    private final SetupMatchRepository setupMatchRepository;
    private final CompanyFundamentalsRepository fundamentalsRepository;
    private final StringRedisTemplate redisTemplate;
    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;

    // Latest indicators per symbol: symbol -> (indicatorKey -> IndicatorUpdateEvent)
    private final Map<String, Map<String, IndicatorUpdateEvent>> latestIndicators = new ConcurrentHashMap<>();

    public SetupMatcherService(SetupRepository setupRepository,
                               SetupMatchRepository setupMatchRepository,
                               CompanyFundamentalsRepository fundamentalsRepository,
                               StringRedisTemplate redisTemplate,
                               KafkaTemplate<String, String> kafkaTemplate,
                               ObjectMapper objectMapper) {
        this.setupRepository = setupRepository;
        this.setupMatchRepository = setupMatchRepository;
        this.fundamentalsRepository = fundamentalsRepository;
        this.redisTemplate = redisTemplate;
        this.kafkaTemplate = kafkaTemplate;
        this.objectMapper = objectMapper;
    }

    @KafkaListener(topics = KafkaTopics.INDICATOR_UPDATES, groupId = "setup-matcher-core-group")
    public void processIndicatorUpdate(String message) {
        try {
            IndicatorUpdateEvent update = objectMapper.readValue(message, IndicatorUpdateEvent.class);
            if (update.symbol() == null || update.indicatorType() == null) return;

            // Cache latest in-memory
            latestIndicators.computeIfAbsent(update.symbol(), k -> new ConcurrentHashMap<>())
                    .put(update.indicatorType(), update);

            List<Setup> activeSetups = setupRepository.findByActiveTrue();
            if (activeSetups.isEmpty()) return;

            for (Setup setup : activeSetups) {
                evaluateSetupAgainstUpdate(setup, update);
            }
        } catch (Exception e) {
            log.error("Error processing indicator update in setup matcher: {}", e.getMessage());
        }
    }

    private void evaluateSetupAgainstUpdate(Setup setup, IndicatorUpdateEvent update) {
        List<TechnicalConditionDto> conditions = setup.getTechnicalConditions();
        if (conditions == null || conditions.isEmpty()) return;

        Map<String, Object> snapshot = new HashMap<>();
        Boolean combinedMatch = null;

        for (TechnicalConditionDto cond : conditions) {
            String indType = cond.getIndicator() != null ? cond.getIndicator().toUpperCase() : "";
            IndicatorUpdateEvent relevant = indType.equals(update.indicatorType()) ? update :
                    latestIndicators.getOrDefault(update.symbol(), Map.of()).get(indType);

            boolean isMatch = false;
            if (relevant == null || relevant.value() == null) {
                snapshot.put(indType, Map.of("isMatch", false, "reason", "value unavailable"));
            } else {
                double val = extractNumericValue(relevant.value());
                double threshold = cond.getNumericTarget(0.0);
                String op = cond.getOperator() != null ? cond.getOperator() : "gt";

                isMatch = ConditionMatcher.evaluate(op, val, threshold);
                snapshot.put(indType, Map.of("val", val, "operator", op, "threshold", threshold, "isMatch", isMatch));
            }

            if (combinedMatch == null) {
                combinedMatch = isMatch;
            } else if ("OR".equalsIgnoreCase(cond.getLogic())) {
                combinedMatch = combinedMatch || isMatch;
            } else {
                combinedMatch = combinedMatch && isMatch;
            }
        }

        if (combinedMatch == null || !combinedMatch) return;

        // Technical conditions passed! Check fundamentals
        boolean fundamentalsPassed = checkFundamentals(setup, update.symbol(), snapshot);

        boolean alertFired = fundamentalsPassed || !"required_for_signal".equalsIgnoreCase(setup.getFundamentalMode());

        // Persist match record
        try {
            SetupMatch match = new SetupMatch();
            match.setSetup(setup);
            match.setSymbol(update.symbol());
            match.setMatchedAt(Instant.now());
            match.setTechnicalSnapshot(snapshot);
            match.setFundamentalsSnapshot(new HashMap<>());
            match.setFundamentalsPassed(fundamentalsPassed);
            match.setAlertFired(alertFired);

            setupMatchRepository.save(match);
        } catch (Exception e) {
            log.error("Failed to save setup match: {}", e.getMessage());
        }

        // Fire alert to Kafka if conditions satisfied
        if (alertFired) {
            try {
                AlertFiredEvent alertEvent = new AlertFiredEvent(
                        setup.getUser().getId(),
                        setup.getId(),
                        setup.getName(),
                        update.symbol(),
                        formatConditions(conditions),
                        snapshot,
                        System.currentTimeMillis()
                );

                String payload = objectMapper.writeValueAsString(alertEvent);
                kafkaTemplate.send(KafkaTopics.ALERT_FIRED, setup.getUser().getId(), payload);
                log.info("Setup condition matched! Alert fired for setup: '{}', symbol: {}", setup.getName(), update.symbol());
            } catch (Exception e) {
                log.error("Failed to publish alert-fired: {}", e.getMessage());
            }
        }
    }

    private boolean checkFundamentals(Setup setup, String symbol, Map<String, Object> snapshot) {
        if (setup.getFundamentalConditions() == null || setup.getFundamentalConditions().isEmpty()) {
            return true;
        }

        Map<String, Double> fundamentalsMap = fetchFundamentals(symbol);
        if (fundamentalsMap.isEmpty()) {
            return !"required_for_signal".equalsIgnoreCase(setup.getFundamentalMode());
        }

        return ConditionMatcher.evaluateFundamentalConditions(setup.getFundamentalConditions(), fundamentalsMap);
    }

    private Map<String, Double> fetchFundamentals(String symbol) {
        String cacheKey = "fundamentals:" + symbol.toUpperCase();
        try {
            String cached = redisTemplate.opsForValue().get(cacheKey);
            if (cached != null) {
                CompanyFundamentals cf = objectMapper.readValue(cached, CompanyFundamentals.class);
                return toFundamentalsMap(cf);
            }
        } catch (Exception ignored) {}

        Optional<CompanyFundamentals> dbCf = fundamentalsRepository.findBySymbol(symbol.toUpperCase());
        return dbCf.map(this::toFundamentalsMap).orElse(Map.of());
    }

    private Map<String, Double> toFundamentalsMap(CompanyFundamentals cf) {
        Map<String, Double> map = new HashMap<>();
        if (cf.getPeRatio() != null) map.put("pe_ratio", cf.getPeRatio());
        if (cf.getEps() != null) map.put("eps", cf.getEps());
        if (cf.getRoe() != null) map.put("roe", cf.getRoe());
        if (cf.getDebtToEquity() != null) map.put("debt_to_equity", cf.getDebtToEquity());
        if (cf.getMarketCap() != null) map.put("market_cap", cf.getMarketCap());
        return map;
    }

    private double extractNumericValue(Object val) {
        if (val instanceof Number n) return n.doubleValue();
        if (val instanceof Map<?, ?> m) {
            for (Object v : m.values()) {
                if (v instanceof Number n) return n.doubleValue();
            }
        }
        return 0.0;
    }

    private String formatConditions(List<TechnicalConditionDto> conditions) {
        return String.join(" AND ", conditions.stream()
                .map(c -> c.getIndicator() + " " + c.getOperator() + " " + c.getValue())
                .toList());
    }
}
