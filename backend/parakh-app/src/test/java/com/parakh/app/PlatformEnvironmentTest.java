package com.parakh.app;

import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.mock.env.MockEnvironment;

import static org.junit.jupiter.api.Assertions.*;

class PlatformEnvironmentTest {

    private MockEnvironment apply(String databaseUrl) {
        MockEnvironment env = new MockEnvironment().withProperty("DATABASE_URL", databaseUrl);
        new PlatformEnvironment().postProcessEnvironment(env, new SpringApplication());
        return env;
    }

    @Test
    void neonUrlKeepsSslAndDropsChannelBinding() {
        MockEnvironment env = apply("postgresql://neondb_owner:p%40ss@ep-cool-123.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require");
        assertEquals("jdbc:postgresql://ep-cool-123.ap-southeast-1.aws.neon.tech:5432/neondb?sslmode=require", env.getProperty("spring.datasource.url"));
        assertEquals("neondb_owner", env.getProperty("spring.datasource.username"));
        assertEquals("p@ss", env.getProperty("spring.datasource.password"));
    }

    @Test
    void renderInternalUrlWithoutPortOrQuery() {
        MockEnvironment env = apply("postgres://parakh:secret@dpg-abc123-a/parakh");
        assertEquals("jdbc:postgresql://dpg-abc123-a:5432/parakh", env.getProperty("spring.datasource.url"));
    }

    @Test
    void prismaSchemaParamIsDropped() {
        MockEnvironment env = apply("postgresql://parakh:parakh_secret@localhost:5434/parakh?schema=public");
        assertEquals("jdbc:postgresql://localhost:5434/parakh", env.getProperty("spring.datasource.url"));
    }
}
