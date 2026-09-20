package com.parakh.core.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.parakh.common.domain.CompanyFundamentals;
import com.parakh.core.repository.CompanyFundamentalsRepository;
import com.parakh.core.repository.WatchlistRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.util.*;

@Service
public class FundamentalsService {

    private static final Logger log = LoggerFactory.getLogger(FundamentalsService.class);

    private final CompanyFundamentalsRepository fundamentalsRepository;
    private final WatchlistRepository watchlistRepository;
    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    public FundamentalsService(CompanyFundamentalsRepository fundamentalsRepository,
                               WatchlistRepository watchlistRepository,
                               StringRedisTemplate redisTemplate,
                               ObjectMapper objectMapper) {
        this.fundamentalsRepository = fundamentalsRepository;
        this.watchlistRepository = watchlistRepository;
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
    }

    public CompanyFundamentals getFundamentals(String symbol) {
        String cacheKey = "fundamentals:" + symbol.toUpperCase();

        try {
            String cached = redisTemplate.opsForValue().get(cacheKey);
            if (cached != null) {
                return objectMapper.readValue(cached, CompanyFundamentals.class);
            }
        } catch (Exception e) {
            log.warn("Redis read error for key {}: {}", cacheKey, e.getMessage());
        }

        CompanyFundamentals fundamentals = fundamentalsRepository.findBySymbol(symbol.toUpperCase())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Fundamentals not found for " + symbol));

        try {
            redisTemplate.opsForValue().set(cacheKey, objectMapper.writeValueAsString(fundamentals), Duration.ofDays(1));
        } catch (Exception ignored) {}

        return fundamentals;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onStartup() {
        syncFundamentals();
    }

    @Scheduled(cron = "0 0 0 * * ?") // Midnight daily
    public void scheduledSync() {
        syncFundamentals();
    }

    @Transactional
    public void syncFundamentals() {
        log.info("Starting company fundamentals sync");
        try {
            Set<String> uniqueSymbols = new HashSet<>();
            watchlistRepository.findAll().forEach(w -> uniqueSymbols.add(w.getSymbol()));

            if (uniqueSymbols.isEmpty()) {
                uniqueSymbols.addAll(List.of("AAPL", "MSFT", "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "BINANCE:BTCUSDT"));
            }

            for (String symbol : uniqueSymbols) {
                syncSymbol(symbol.toUpperCase());
                Thread.sleep(200); // Gentle spacing
            }

            log.info("Company fundamentals sync complete for {} symbols", uniqueSymbols.size());
        } catch (Exception e) {
            log.error("Company fundamentals sync error: {}", e.getMessage(), e);
        }
    }

    private void syncSymbol(String symbol) {
        try {
            // Deterministic mock / fallback fundamentals generator (same logic as Node.js service)
            int hash = Math.abs(symbol.hashCode());
            double pe = 10.0 + (hash % 40);
            double eps = 1.0 + (hash % 10);
            double roe = 5.0 + (hash % 25);
            double debtToEquity = (hash % 100) / 50.0;
            double marketCap = 1_000_000_000.0 + (hash % 500_000_000_000L);
            String sector = symbol.contains("BTC") || symbol.contains("USDT") ? "Cryptocurrency" : "Equities";

            CompanyFundamentals record = fundamentalsRepository.findBySymbol(symbol)
                    .orElseGet(() -> {
                        CompanyFundamentals cf = new CompanyFundamentals();
                        cf.setSymbol(symbol);
                        return cf;
                    });

            record.setPeRatio(pe);
            record.setEps(eps);
            record.setRoe(roe);
            record.setDebtToEquity(debtToEquity);
            record.setMarketCap(marketCap);
            record.setSector(sector);

            record = fundamentalsRepository.save(record);

            // Cache in Redis
            String cacheKey = "fundamentals:" + symbol;
            redisTemplate.opsForValue().set(cacheKey, objectMapper.writeValueAsString(record), Duration.ofDays(1));
        } catch (Exception e) {
            log.error("Failed to sync fundamentals for {}: {}", symbol, e.getMessage());
        }
    }
}
