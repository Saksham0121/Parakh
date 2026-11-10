package com.parakh.app;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * Translates the connection strings that hosting platforms inject (Render, Railway, Fly, Heroku-style)
 * into Spring properties, so no hand-built JDBC URL is needed:
 * <ul>
 *   <li>{@code DATABASE_URL=postgres://user:pass@host:5432/db?sslmode=require} → {@code spring.datasource.*}</li>
 *   <li>{@code REDIS_URL=redis://host:6379} → {@code spring.data.redis.url} and enables the Redis cache layer</li>
 * </ul>
 * Explicit {@code SPRING_DATASOURCE_URL} / {@code SPRING_DATA_REDIS_*} settings always win.
 */
public class PlatformEnvironment implements EnvironmentPostProcessor {

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment env, SpringApplication app) {
        Map<String, Object> props = new HashMap<>();

        String db = env.getProperty("DATABASE_URL");
        if (hasText(db) && !hasText(env.getProperty("SPRING_DATASOURCE_URL"))) {
            URI uri = URI.create(db.replaceFirst("^postgres(ql)?://", "http://"));
            int port = uri.getPort() > 0 ? uri.getPort() : 5432;
            String query = uri.getRawQuery() != null ? "?" + uri.getRawQuery() : "";
            props.put("spring.datasource.url", "jdbc:postgresql://" + uri.getHost() + ":" + port + uri.getRawPath() + query);
            String userInfo = uri.getRawUserInfo();
            if (userInfo != null) {
                String[] parts = userInfo.split(":", 2);
                props.put("spring.datasource.username", decode(parts[0]));
                if (parts.length > 1) props.put("spring.datasource.password", decode(parts[1]));
            }
        }

        String redis = env.getProperty("REDIS_URL");
        if (hasText(redis)) {
            if (!hasText(env.getProperty("SPRING_DATA_REDIS_URL")) && !hasText(env.getProperty("SPRING_DATA_REDIS_HOST"))) {
                props.put("spring.data.redis.url", redis);
            }
            if (!hasText(env.getProperty("REDIS_ENABLED"))) props.put("parakh.redis.enabled", "true");
        }

        if (!props.isEmpty()) env.getPropertySources().addFirst(new MapPropertySource("platformEnvironment", props));
    }

    private static boolean hasText(String s) {
        return s != null && !s.isBlank();
    }

    private static String decode(String s) {
        return URLDecoder.decode(s, StandardCharsets.UTF_8);
    }
}
