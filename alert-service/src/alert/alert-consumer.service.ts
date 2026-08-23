import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createKafkaClient, KafkaClient, KAFKA_TOPICS, createLogger } from '@parakh/common';

const logger = createLogger({ service: 'alert-consumer' });

@Injectable()
export class AlertConsumerService implements OnModuleInit, OnModuleDestroy {
  private kafkaClient: KafkaClient;

  constructor(private prisma: PrismaService) {
    this.kafkaClient = createKafkaClient('alert-service');
  }

  async onModuleInit() {
    await this.kafkaClient.subscribe(
      'alert-service-group',
      [KAFKA_TOPICS.ALERT_FIRED],
      async ({ message }) => {
        if (!message.value) return;
        try {
          const alert = JSON.parse(message.value.toString());
          await this.saveAlert(alert);
        } catch (err) {
          logger.error('Error saving alert', { error: err });
        }
      },
    );
    logger.info('Alert consumer initialized');
  }

  async onModuleDestroy() {
    await this.kafkaClient.disconnect();
  }

  private async saveAlert(alert: any) {
    await this.prisma.setupMatch.create({
      data: {
        setupId: alert.setupId,
        symbol: alert.symbol,
        matchedAt: new Date(alert.timestamp),
        technicalSnapshot: { condition: alert.condition, value: alert.value },
        alertFired: true,
        fundamentalsPassed: true, // simplified for MVP
      },
    });
  }
}
