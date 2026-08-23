import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import {
  createKafkaClient,
  KafkaClient,
  KAFKA_TOPICS,
  INDICATOR_TYPES,
  createLogger,
} from '@parakh/common';
import type { PriceTickDto, IndicatorValueDto } from '@parakh/common';
import { IndicatorEngine } from './indicator.engine';

const logger = createLogger({ service: 'indicator-service' });

// How many price points to keep per symbol for computation
const PRICE_BUFFER_SIZE = 200;

/**
 * Consumes price-ticks from Kafka, computes indicators, and publishes
 * indicator-updates back to Kafka + caches in Redis.
 */
@Injectable()
export class IndicatorService implements OnModuleInit, OnModuleDestroy {
  private kafkaClient: KafkaClient;
  private redis: Redis;

  // In-memory price buffers per symbol
  private priceBuffers: Map<string, number[]> = new Map();

  // Default indicator configurations to compute on every tick
  private defaultIndicators = [
    { type: INDICATOR_TYPES.SMA, params: { period: 20 } },
    { type: INDICATOR_TYPES.SMA, params: { period: 50 } },
    { type: INDICATOR_TYPES.EMA, params: { period: 12 } },
    { type: INDICATOR_TYPES.EMA, params: { period: 26 } },
    { type: INDICATOR_TYPES.RSI, params: { period: 14 } },
    { type: INDICATOR_TYPES.MACD, params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
    { type: INDICATOR_TYPES.BOLLINGER_BANDS, params: { period: 20, stdDev: 2 } },
  ];

  constructor(private configService: ConfigService) {
    this.kafkaClient = createKafkaClient('indicator-service');
    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
    });
  }

  async onModuleInit() {
    // Subscribe to price-ticks
    await this.kafkaClient.subscribe(
      'indicator-service-group',
      [KAFKA_TOPICS.PRICE_TICKS],
      async ({ message }) => {
        if (!message.value) return;

        try {
          const tick: PriceTickDto = JSON.parse(message.value.toString());
          await this.processTick(tick);
        } catch (err) {
          logger.error('Error processing price tick', { error: err });
        }
      },
    );

    logger.info('Indicator service consuming price-ticks');
  }

  async onModuleDestroy() {
    await this.kafkaClient.disconnect();
    await this.redis.quit();
  }

  /**
   * Process a price tick: update buffer, compute all indicators, publish results.
   */
  private async processTick(tick: PriceTickDto) {
    // Update price buffer
    let buffer = this.priceBuffers.get(tick.symbol);
    if (!buffer) {
      buffer = [];
      this.priceBuffers.set(tick.symbol, buffer);
    }
    buffer.push(tick.price);
    if (buffer.length > PRICE_BUFFER_SIZE) {
      buffer.shift(); // Remove oldest
    }

    // Need minimum data points
    if (buffer.length < 2) return;

    // Compute all default indicators
    for (const indicator of this.defaultIndicators) {
      const value = IndicatorEngine.compute(indicator.type, buffer, indicator.params);

      if (value !== null) {
        const update: IndicatorValueDto = {
          symbol: tick.symbol,
          indicatorType: indicator.type,
          params: indicator.params,
          value,
          timestamp: tick.timestamp,
        };

        // Publish to Kafka
        await this.kafkaClient.publish(
          KAFKA_TOPICS.INDICATOR_UPDATES,
          tick.symbol,
          update,
        );

        // Cache in Redis
        const cacheKey = `indicator:${tick.symbol}:${indicator.type}_${JSON.stringify(indicator.params)}`;
        await this.redis.set(cacheKey, JSON.stringify(update), 'EX', 120);
      }
    }
  }

  /**
   * Get latest cached indicator value.
   */
  async getLatestIndicator(symbol: string, indicatorType: string, params: Record<string, number>) {
    const cacheKey = `indicator:${symbol}:${indicatorType}_${JSON.stringify(params)}`;
    const data = await this.redis.get(cacheKey);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Get all cached indicators for a symbol.
   */
  async getAllIndicators(symbol: string) {
    const results: Record<string, any> = {};
    for (const indicator of this.defaultIndicators) {
      const key = `${indicator.type}_${JSON.stringify(indicator.params)}`;
      const cacheKey = `indicator:${symbol}:${key}`;
      const data = await this.redis.get(cacheKey);
      if (data) {
        results[key] = JSON.parse(data);
      }
    }
    return results;
  }
}
