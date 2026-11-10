package com.parakh.engine.cache;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/**
 * Two-level read-through cache for market data.
 *
 * <ol>
 *   <li><b>L1</b> in-process map: sub-microsecond hits, no serialisation, no network.</li>
 *   <li><b>L2</b> Redis: shared between engine replicas so a horizontal scale-out doesn't multiply upstream calls.
 *       Redis being down degrades to L1-only instead of failing requests.</li>
 *   <li><b>Single-flight</b>: concurrent misses for the same key share one upstream load, so a
 *       burst of users opening the same chart triggers exactly one Yahoo request.</li>
 *   <li><b>Negative caching</b>: a {@code null} load is remembered briefly so unknown symbols and
 *       upstream outages are not retried on every keystroke.</li>
 * </ol>
 */
@Component
public class TieredCache {

    private static final Logger log = LoggerFactory.getLogger(TieredCache.class);
    private static final int L1_MAX_ENTRIES = 5_000;
    private static final String NULL_MARKER = "__null__";
    private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() {};

    /** Identity sentinel meaning "L2 remembers that this key has no data". */
    private static final Map<String, Object> NULL_VALUE = new java.util.HashMap<>();

    private record Entry(Map<String, Object> value, long expiresAt, long staleUntil) {}

    private static final java.util.concurrent.ExecutorService REFRESH = java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor();

    private final Map<String, Entry> l1 = new ConcurrentHashMap<>();
    private final Map<String, CompletableFuture<Map<String, Object>>> inFlight = new ConcurrentHashMap<>();
    private final StringRedisTemplate redis;
    private final ObjectMapper mapper;
    private volatile long redisRetryAt = 0;

    public TieredCache(StringRedisTemplate redis, ObjectMapper mapper) {
        this.redis = redis;
        this.mapper = mapper;
    }

    public Map<String, Object> get(String key, Duration ttl, Duration negativeTtl, Supplier<Map<String, Object>> loader) {
        long now = System.currentTimeMillis();
        Entry e = l1.get(key);
        if (e != null && e.expiresAt() > now) return e.value();
        // Stale-while-revalidate: an expired-but-recent value is returned immediately while one
        // background load refreshes it, so popular charts never wait on the upstream provider.
        if (e != null && e.value() != null && e.staleUntil() > now) {
            if (!inFlight.containsKey(key)) REFRESH.submit(() -> { try { load(key, ttl, negativeTtl, loader, false); } catch (RuntimeException ignored) {} });
            return e.value();
        }
        return load(key, ttl, negativeTtl, loader, true);
    }

    private Map<String, Object> load(String key, Duration ttl, Duration negativeTtl, Supplier<Map<String, Object>> loader, boolean useL2) {
        CompletableFuture<Map<String, Object>> mine = new CompletableFuture<>();
        CompletableFuture<Map<String, Object>> existing = inFlight.putIfAbsent(key, mine);
        if (existing != null) return existing.join();

        try {
            Map<String, Object> value = useL2 ? readL2(key) : null;
            if (value == NULL_VALUE) {
                value = null;
            } else if (value == null) {
                value = loader.get();
                if (value == null && !useL2) {
                    // A failed background refresh keeps serving the last good value.
                    Entry prev = l1.get(key);
                    if (prev != null && prev.value() != null) { mine.complete(prev.value()); return prev.value(); }
                }
                writeL2(key, value, value != null ? ttl : negativeTtl);
            }
            putL1(key, value, value != null ? ttl : negativeTtl);
            mine.complete(value);
            return value;
        } catch (RuntimeException ex) {
            mine.completeExceptionally(ex);
            throw ex;
        } finally {
            inFlight.remove(key, mine);
        }
    }

    /** Writes a fresh value (e.g. a polled quote) to both levels. */
    public void put(String key, Map<String, Object> value, Duration ttl) {
        putL1(key, value, ttl);
        writeL2(key, value, ttl);
    }

    /** Reads L1 only; used by hot paths that must never block on the network. */
    public Map<String, Object> peek(String key) {
        Entry e = l1.get(key);
        return e != null && e.expiresAt() > System.currentTimeMillis() ? e.value() : null;
    }

    private void putL1(String key, Map<String, Object> value, Duration ttl) {
        if (l1.size() >= L1_MAX_ENTRIES) evictExpired();
        long now = System.currentTimeMillis();
        long life = ttl.toMillis();
        l1.put(key, new Entry(value, now + life, now + Math.max(life * 6, 60_000)));
    }

    private void evictExpired() {
        long now = System.currentTimeMillis();
        l1.values().removeIf(en -> en.staleUntil() <= now);
        if (l1.size() >= L1_MAX_ENTRIES) {
            Iterator<String> it = l1.keySet().iterator();
            for (int i = 0; i < L1_MAX_ENTRIES / 10 && it.hasNext(); i++) {
                it.next();
                it.remove();
            }
        }
    }

    private Map<String, Object> readL2(String key) {
        if (System.currentTimeMillis() < redisRetryAt) return null;
        try {
            String raw = redis.opsForValue().get(key);
            if (raw == null) return null;
            if (NULL_MARKER.equals(raw)) return NULL_VALUE;
            return mapper.readValue(raw, MAP);
        } catch (Exception ex) {
            redisUnavailable(ex);
            return null;
        }
    }

    private void writeL2(String key, Map<String, Object> value, Duration ttl) {
        if (System.currentTimeMillis() < redisRetryAt) return;
        try {
            redis.opsForValue().set(key, value == null ? NULL_MARKER : mapper.writeValueAsString(value), ttl);
        } catch (Exception ex) {
            redisUnavailable(ex);
        }
    }

    private void redisUnavailable(Exception ex) {
        // Stop paying Redis timeouts on every request; retry after a short pause.
        redisRetryAt = System.currentTimeMillis() + 10_000;
        log.warn("Redis unavailable, serving from in-process cache only: {}", ex.getMessage());
    }
}
