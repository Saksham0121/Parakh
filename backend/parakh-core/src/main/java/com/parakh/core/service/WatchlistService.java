package com.parakh.core.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.parakh.common.domain.User;
import com.parakh.common.domain.Watchlist;
import com.parakh.core.dto.WatchlistDtos.*;
import com.parakh.core.repository.UserRepository;
import com.parakh.core.repository.WatchlistRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

@Service
public class WatchlistService {

    private static final Logger log = LoggerFactory.getLogger(WatchlistService.class);

    private final WatchlistRepository watchlistRepository;
    private final UserRepository userRepository;
    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final boolean redisEnabled;

    private final AtomicLong hits = new AtomicLong(0);
    private final AtomicLong misses = new AtomicLong(0);

    public WatchlistService(WatchlistRepository watchlistRepository,
                            UserRepository userRepository,
                            StringRedisTemplate redisTemplate,
                            ObjectMapper objectMapper,
                            @org.springframework.beans.factory.annotation.Value("${parakh.redis.enabled:true}") boolean redisEnabled) {
        this.redisEnabled = redisEnabled;
        this.watchlistRepository = watchlistRepository;
        this.userRepository = userRepository;
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
    }

    public List<WatchlistItemResponse> getWatchlist(String userId) {
        String cacheKey = "watchlist:" + userId;

        if (redisEnabled) try {
            String cached = redisTemplate.opsForValue().get(cacheKey);
            if (cached != null) {
                hits.incrementAndGet();
                return objectMapper.readValue(cached, new TypeReference<List<WatchlistItemResponse>>() {});
            }
            misses.incrementAndGet();
        } catch (Exception e) {
            log.warn("Redis read error for key {}: {}", cacheKey, e.getMessage());
        }

        List<Watchlist> list = watchlistRepository.findByUserIdOrderBySymbolAsc(userId);

        // Auto-seed starter symbols if empty
        if (list.isEmpty()) {
            User user = userRepository.findById(userId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

            List<String> defaultSymbols = List.of("RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "AAPL", "NVDA");
            for (String symbol : defaultSymbols) {
                watchlistRepository.save(new Watchlist(user, symbol));
            }
            list = watchlistRepository.findByUserIdOrderBySymbolAsc(userId);
        }

        List<WatchlistItemResponse> response = list.stream()
                .map(w -> new WatchlistItemResponse(w.getId(), userId, w.getSymbol()))
                .toList();

        if (redisEnabled) try {
            redisTemplate.opsForValue().set(cacheKey, objectMapper.writeValueAsString(response), Duration.ofSeconds(10));
        } catch (Exception e) {
            log.warn("Redis write error for key {}: {}", cacheKey, e.getMessage());
        }

        return response;
    }

    @Transactional
    public WatchlistItemResponse addSymbol(String userId, String rawSymbol) {
        String symbol = rawSymbol.toUpperCase().trim();

        var existing = watchlistRepository.findByUserIdAndSymbol(userId, symbol);
        if (existing.isPresent()) {
            return new WatchlistItemResponse(existing.get().getId(), userId, symbol);
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        Watchlist created = watchlistRepository.save(new Watchlist(user, symbol));

        // Invalidate cache
        if (redisEnabled) try {
            redisTemplate.delete("watchlist:" + userId);
        } catch (Exception ignored) {}

        return new WatchlistItemResponse(created.getId(), userId, created.getSymbol());
    }

    @Transactional
    public void removeSymbol(String userId, String rawSymbol) {
        String symbol = rawSymbol.toUpperCase().trim();
        watchlistRepository.deleteByUserIdAndSymbol(userId, symbol);

        // Invalidate cache
        if (redisEnabled) try {
            redisTemplate.delete("watchlist:" + userId);
        } catch (Exception ignored) {}
    }

    public CacheMetricsResponse getCacheMetrics() {
        long h = hits.get();
        long m = misses.get();
        double rate = (h + m > 0) ? (double) h / (h + m) : 0.0;
        return new CacheMetricsResponse(h, m, rate);
    }
}
