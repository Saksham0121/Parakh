import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { createKafkaClient, KafkaClient, KAFKA_TOPICS, createLogger } from '@parakh/common';
import type { PriceTickDto, IndicatorValueDto } from '@parakh/common';
import { PriceGateway } from '../gateways/price.gateway';

const logger = createLogger({ service: 'ws-kafka-consumer' });

/**
 * Consumes price-ticks and indicator-updates from Kafka,
 * then broadcasts them to connected WebSocket clients via the PriceGateway.
 */
@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private kafkaClient: KafkaClient;

  constructor(private priceGateway: PriceGateway) {
    this.kafkaClient = createKafkaClient('websocket-gateway');
  }

  async onModuleInit() {
    // Consume price ticks
    await this.kafkaClient.subscribe(
      'ws-gateway-price-group',
      [KAFKA_TOPICS.PRICE_TICKS],
      async ({ message }) => {
        if (!message.value) return;
        try {
          const tick: PriceTickDto = JSON.parse(message.value.toString());
          this.priceGateway.broadcastPrice(tick.symbol, tick);
        } catch (err) {
          logger.error('Error broadcasting price', { error: err });
        }
      },
    );

    // Consume indicator updates
    await this.kafkaClient.subscribe(
      'ws-gateway-indicator-group',
      [KAFKA_TOPICS.INDICATOR_UPDATES],
      async ({ message }) => {
        if (!message.value) return;
        try {
          const update: IndicatorValueDto = JSON.parse(message.value.toString());
          this.priceGateway.broadcastIndicator(update.symbol, update);
        } catch (err) {
          logger.error('Error broadcasting indicator', { error: err });
        }
      },
    );

    // Consume alert-fired events
    await this.kafkaClient.subscribe(
      'ws-gateway-alert-group',
      [KAFKA_TOPICS.ALERT_FIRED],
      async ({ message }) => {
        if (!message.value) return;
        try {
          const alert = JSON.parse(message.value.toString());
          if (alert.userId) {
            this.priceGateway.broadcastAlert(alert.userId, alert);
          }
        } catch (err) {
          logger.error('Error broadcasting alert', { error: err });
        }
      },
    );

    logger.info('Kafka consumers started for WS gateway');
  }

  async onModuleDestroy() {
    await this.kafkaClient.disconnect();
  }
}
