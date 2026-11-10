package com.parakh.engine.scanner;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.parakh.common.constants.KafkaTopics;
import com.parakh.common.domain.Setup;
import com.parakh.engine.repository.SetupEngineRepository;
import com.parakh.engine.repository.WatchlistEngineRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Automatic setup detection. Every interval it scans each active setup's universe (or its owner's watchlist)
 * and emits a {@code setup-triggered} event the first time a symbol matches on a given bar. Edge-triggering
 * per bar means a breakout produces one alert, not one every minute for the rest of the session.
 */
@Component
public class SetupMonitor {

    private static final Logger log = LoggerFactory.getLogger(SetupMonitor.class);

    private final SetupEngineRepository setups;
    private final WatchlistEngineRepository watchlists;
    private final ScannerService scanner;
    private final KafkaTemplate<String, String> kafka;
    private final StringRedisTemplate redis;
    private final ObjectMapper mapper;
    private final boolean enabled;

    /** Local de-dupe; Redis SETNX de-dupes across engine replicas. */
    private final Map<String, Long> firedBars = new ConcurrentHashMap<>();

    public SetupMonitor(SetupEngineRepository setups, WatchlistEngineRepository watchlists, ScannerService scanner,
                        KafkaTemplate<String, String> kafka, StringRedisTemplate redis, ObjectMapper mapper,
                        @Value("${parakh.scanner.enabled:true}") boolean enabled) {
        this.setups = setups;
        this.watchlists = watchlists;
        this.scanner = scanner;
        this.kafka = kafka;
        this.redis = redis;
        this.mapper = mapper;
        this.enabled = enabled;
    }

    @Scheduled(initialDelayString = "${parakh.scanner.initial-delay-ms:20000}", fixedDelayString = "${parakh.scanner.interval-ms:60000}")
    public void scanActiveSetups() {
        if (!enabled) return;
        List<Setup> active;
        try {
            active = setups.findActiveWithUser();
        } catch (Exception e) {
            log.warn("Setup monitor could not load active setups: {}", e.getMessage());
            return;
        }
        if (active.isEmpty()) return;

        long started = System.currentTimeMillis();
        int fired = 0;
        Map<String, List<String>> watchlistCache = new HashMap<>();
        for (Setup setup : active) {
            String userId = setup.getUser().getId();
            List<String> universe = setup.getUniverse() != null && !setup.getUniverse().isEmpty()
                    ? setup.getUniverse()
                    : watchlistCache.computeIfAbsent(userId, watchlists::findSymbolsByUserId);
            if (universe.isEmpty() || setup.getTechnicalConditions() == null || setup.getTechnicalConditions().isEmpty()) continue;

            var spec = new ScannerService.SetupSpec(setup.getTechnicalConditions(), setup.getFundamentalConditions(),
                    setup.getFundamentalMode(), setup.getTimeframe());
            for (ScannerService.SymbolResult r : scanner.scan(universe, spec)) {
                if (r.matched() && r.barTime() != null && firstMatchOnBar(setup.getId(), r.symbol(), r.barTime())) {
                    publish(setup, userId, r);
                    fired++;
                }
            }
        }
        log.info("Setup monitor scanned {} active setups in {} ms, {} new matches", active.size(),
                System.currentTimeMillis() - started, fired);
    }

    private boolean firstMatchOnBar(String setupId, String symbol, long barTime) {
        String key = setupId + "|" + symbol;
        Long previous = firedBars.get(key);
        if (previous != null && previous == barTime) return false;
        firedBars.put(key, barTime);
        try {
            Boolean fresh = redis.opsForValue().setIfAbsent("scan:fired:" + key + "|" + barTime, "1", Duration.ofDays(7));
            return !Boolean.FALSE.equals(fresh);
        } catch (Exception e) {
            return true; // Redis down: fall back to local de-dupe only
        }
    }

    private void publish(Setup setup, String userId, ScannerService.SymbolResult r) {
        try {
            Map<String, Object> event = new LinkedHashMap<>();
            event.put("userId", userId);
            event.put("setupId", setup.getId());
            event.put("setupName", setup.getName());
            event.put("symbol", r.symbol());
            event.put("timeframe", setup.getTimeframe());
            event.put("barTime", r.barTime());
            event.put("close", r.close());
            event.put("changePct", r.changePct());
            event.put("technical", r.technical());
            event.put("fundamental", r.fundamental());
            event.put("fundamentalsPassed", r.fundamentalsPassed());
            event.put("timestamp", System.currentTimeMillis());
            kafka.send(KafkaTopics.SETUP_TRIGGERED, userId, mapper.writeValueAsString(event));
        } catch (Exception e) {
            log.warn("Failed to publish setup trigger for {} / {}: {}", setup.getName(), r.symbol(), e.getMessage());
        }
    }
}
