package com.parakh.core;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
@EntityScan(basePackages = "com.parakh.common.domain")
@EnableJpaRepositories(basePackages = "com.parakh.core.repository")
public class ParakhCoreApplication {

    public static void main(String[] args) {
        SpringApplication.run(ParakhCoreApplication.class, args);
    }
}
