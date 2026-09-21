package com.parakh.engine;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
@EntityScan(basePackages = "com.parakh.common.domain")
@EnableJpaRepositories(basePackages = "com.parakh.engine.repository")
public class ParakhEngineApplication {

    public static void main(String[] args) {
        SpringApplication.run(ParakhEngineApplication.class, args);
    }
}
