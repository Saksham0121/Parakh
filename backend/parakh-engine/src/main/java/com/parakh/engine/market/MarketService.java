package com.parakh.engine.market;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.parakh.common.constants.KafkaTopics;
import com.parakh.common.dto.event.PriceTickEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class MarketService {

    private static final Logger log = LoggerFactory.getLogger(MarketService.class);

    private final YahooFinanceClient yahooClient;
    private final KafkaTemplate<String, String> kafkaTemplate;
    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    private final Set<String> subscribedSymbols = ConcurrentHashMap.newKeySet();

    public MarketService(YahooFinanceClient yahooClient,
                         KafkaTemplate<String, String> kafkaTemplate,
                         StringRedisTemplate redisTemplate,
                         ObjectMapper objectMapper) {
        this.yahooClient = yahooClient;
        this.kafkaTemplate = kafkaTemplate;
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;

        // Default initial watched symbols
        subscribedSymbols.add("AAPL");
        subscribedSymbols.add("MSFT");
        subscribedSymbols.add("NVDA");
        subscribedSymbols.add("RELIANCE.NS");
        subscribedSymbols.add("TCS.NS");
        subscribedSymbols.add("HDFCBANK.NS");
        subscribedSymbols.add("BINANCE:BTCUSDT");
    }

    @Scheduled(fixedDelay = 3000)
    public void pollSubscribedPrices() {
        if (subscribedSymbols.isEmpty()) return;

        for (String symbol : subscribedSymbols) {
            try {
                Map<String, Object> quote = yahooClient.getQuote(symbol);
                if (quote != null && quote.containsKey("c")) {
                    double price = ((Number) quote.get("c")).doubleValue();
                    long timestamp = quote.containsKey("t") ? ((Number) quote.get("t")).longValue() : Instant.now().getEpochSecond();

                    PriceTickEvent tick = new PriceTickEvent(symbol, price, 0.0, timestamp);
                    String payload = objectMapper.writeValueAsString(tick);

                    // 1. Publish to Kafka
                    kafkaTemplate.send(KafkaTopics.PRICE_TICKS, symbol, payload);

                    // 2. Cache in Redis (TTL 10s)
                    redisTemplate.opsForValue().set("price:" + symbol, payload, Duration.ofSeconds(10));
                }
            } catch (Exception e) {
                log.error("Error polling price for {}: {}", symbol, e.getMessage());
            }
        }
    }

    public void subscribe(String symbol) {
        String clean = symbol.trim().toUpperCase();
        subscribedSymbols.add(clean);
        log.info("Subscribed to live market updates for {}", clean);
    }

    public void unsubscribe(String symbol) {
        String clean = symbol.trim().toUpperCase();
        subscribedSymbols.remove(clean);
        log.info("Unsubscribed from live market updates for {}", clean);
    }

    public Map<String, Object> getQuote(String symbol) {
        String clean = symbol.trim().toUpperCase();
        Map<String, Object> quote = yahooClient.getQuote(clean);
        if (quote != null) {
            Map<String, Object> res = new HashMap<>(quote);
            if (res.containsKey("c") && !res.containsKey("price")) {
                res.put("price", res.get("c"));
            }
            return res;
        }

        try {
            String cached = redisTemplate.opsForValue().get("price:" + clean);
            if (cached != null) {
                Map<String, Object> cachedMap = objectMapper.readValue(cached, Map.class);
                cachedMap.put("c", cachedMap.get("price"));
                return cachedMap;
            }
        } catch (Exception ignored) {}

        return Map.of("c", 100.0, "price", 100.0, "d", 0.0, "dp", 0.0);
    }

    public Map<String, Object> getCandles(String symbol, String resolution, long from, long to) {
        return yahooClient.getCandles(symbol, resolution, from, to);
    }

    public Map<String, Object> searchSymbol(String query) {
        return yahooClient.searchSymbol(query);
    }
}
