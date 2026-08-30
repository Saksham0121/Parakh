import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createKafkaClient, KafkaClient, KAFKA_TOPICS, createLogger, evaluateFundamentalConditions } from '@parakh/common';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';

const logger = createLogger({ service: 'alert-consumer' });

@Injectable()
export class AlertConsumerService implements OnModuleInit, OnModuleDestroy {
  private kafkaClient: KafkaClient;
  private redisClient: Redis;

  constructor(private prisma: PrismaService, private configService: ConfigService) {
    this.kafkaClient = createKafkaClient('alert-service');
    
    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = this.configService.get<number>('REDIS_PORT', 6379);
    this.redisClient = new Redis({
      host,
      port,
      lazyConnect: true,         // Don't connect in constructor — wait until first use
      retryStrategy: (times) => Math.min(times * 500, 5000), // backoff, max 5s
    });
    // Suppress "Unhandled error event" — log cleanly instead
    this.redisClient.on('error', (err) => {
      logger.warn('Redis connection error', { error: err.message });
    });
  }

  async onModuleInit() {
    await this.kafkaClient.subscribe(
      'alert-service-group',
      [KAFKA_TOPICS.ALERT_FIRED],
      async ({ message }) => {
        if (!message.value) return;
        try {
          const alert = JSON.parse(message.value.toString());
          await this.processAlert(alert);
        } catch (err) {
          logger.error('Error processing alert', { error: err });
        }
      },
    );
    logger.info('Alert consumer initialized');
  }

  async onModuleDestroy() {
    await this.kafkaClient.disconnect();
    this.redisClient.disconnect();
  }

  private async processAlert(alert: any) {
    // 1. Fetch setup details to know the fundamental conditions & mode
    const setup = await this.prisma.setup.findUnique({
      where: { id: alert.setupId }
    });

    if (!setup) return;

    // 2. Fetch fundamentals from Redis
    const fundStr = await this.redisClient.get(`fundamentals:${alert.symbol}`);
    let fundamentals: any = null;
    if (fundStr) {
      fundamentals = JSON.parse(fundStr);
    } else {
      // Fallback to DB
      fundamentals = await this.prisma.companyFundamentals.findUnique({
        where: { symbol: alert.symbol }
      });
    }

    // 3. Evaluate Fundamentals
    let fundamentalsPassed = true;
    const fundamentalConditions = setup.fundamentalConditions as any[];

    if (fundamentalConditions && fundamentalConditions.length > 0 && fundamentals) {
      fundamentalsPassed = evaluateFundamentalConditions(fundamentalConditions, fundamentals);
    } else if (fundamentalConditions && fundamentalConditions.length > 0 && !fundamentals) {
      fundamentalsPassed = false;
    }

    // 4. Decide whether alert actually fires
    let alertFired = true;
    if (setup.fundamentalMode === 'required_for_signal' && !fundamentalsPassed) {
      alertFired = false;
      logger.info('Alert blocked by fundamentals', { setupId: alert.setupId, symbol: alert.symbol });
    }

    // 5. Save the match
    await this.prisma.setupMatch.create({
      data: {
        setupId: alert.setupId,
        symbol: alert.symbol,
        matchedAt: new Date(alert.timestamp),
        technicalSnapshot: { condition: alert.condition, value: alert.value },
        fundamentalsSnapshot: fundamentals || {},
        fundamentalsPassed,
        alertFired,
      },
    });

    if (alertFired) {
      logger.info('Final alert fired and persisted', { setupId: alert.setupId, symbol: alert.symbol });
      // TODO: push to notification service via Kafka
    }
  }
}
