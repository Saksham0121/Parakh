import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { createKafkaClient, KafkaClient, KAFKA_TOPICS, createLogger } from '@parakh/common';
import type { PriceTickDto } from '@parakh/common';

const logger = createLogger({ service: 'kafka-producer' });

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private kafkaClient: KafkaClient;

  constructor() {
    this.kafkaClient = createKafkaClient('market-data-service');
  }

  async onModuleInit() {
    try {
      await this.kafkaClient.getProducer();
      logger.info('Kafka producer connected');
    } catch (err) {
      logger.error('Failed to connect Kafka producer', { error: err });
    }
  }

  async onModuleDestroy() {
    await this.kafkaClient.disconnect();
  }

  /**
   * Publish a price tick to Kafka, keyed by symbol for ordering guarantee.
   */
  async publishPriceTick(tick: PriceTickDto): Promise<void> {
    try {
      await this.kafkaClient.publish(KAFKA_TOPICS.PRICE_TICKS, tick.symbol, tick);
    } catch (err) {
      logger.error('Failed to publish price tick', { symbol: tick.symbol, error: err });
    }
  }
}
