package com.parakh.app;

import com.parakh.core.ParakhCoreApplication;
import com.parakh.engine.ParakhEngineApplication;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Runs parakh-core and parakh-engine in one process. Events that normally travel over Kafka
 * (setup matches) are delivered in-process, so the whole backend fits a single small container.
 */
@SpringBootApplication
@EnableScheduling
@ComponentScan(
        basePackages = {"com.parakh.app", "com.parakh.core", "com.parakh.engine"},
        excludeFilters = @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE,
                classes = {ParakhCoreApplication.class, ParakhEngineApplication.class}))
@EntityScan(basePackages = "com.parakh.common.domain")
@EnableJpaRepositories(basePackages = {"com.parakh.core.repository", "com.parakh.engine.repository"})
public class ParakhApplication {

    public static void main(String[] args) {
        SpringApplication.run(ParakhApplication.class, args);
    }
}
