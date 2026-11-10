package com.parakh.engine.events;

import com.parakh.common.messaging.BusMessage;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

/**
 * Publishes engine events (price ticks, setup matches) to Kafka when it is configured, or in-process
 * when core and engine share one JVM ({@code parakh.messaging.mode=inprocess}) and no broker exists.
 */
@Component
public class EventPublisher {

    private final boolean useKafka;
    private final ObjectProvider<KafkaTemplate<String, String>> kafka;
    private final ApplicationEventPublisher events;

    public EventPublisher(@Value("${parakh.messaging.mode:kafka}") String mode,
                          ObjectProvider<KafkaTemplate<String, String>> kafka,
                          ApplicationEventPublisher events) {
        this.useKafka = !"inprocess".equalsIgnoreCase(mode);
        this.kafka = kafka;
        this.events = events;
    }

    public void publish(String topic, String key, String payload) {
        KafkaTemplate<String, String> template = useKafka ? kafka.getIfAvailable() : null;
        if (template != null) template.send(topic, key, payload);
        else events.publishEvent(new BusMessage(topic, key, payload));
    }
}
