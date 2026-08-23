import { Injectable, OnModuleInit } from '@nestjs/common';
import { FinnhubService } from '../finnhub/finnhub.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { RedisService } from '../redis/redis.service';
import { createLogger } from '@parakh/common';
import type { PriceTickDto } from '@parakh/common';

const logger = createLogger({ service: 'market-service' });

@Injectable()
export class MarketService implements OnModuleInit {
  constructor(
    private finnhub: FinnhubService,
    private kafkaProducer: KafkaProducerService,
    private redis: RedisService,
  ) {}

  async onModuleInit() {
    // Wire Finnhub price ticks to Kafka + Redis
    this.finnhub.onPriceTick(async (tick: PriceTickDto) => {
      try {
        // Publish to Kafka
        await this.kafkaProducer.publishPriceTick(tick);
        // Cache in Redis
        await this.redis.cachePrice(tick);
      } catch (err) {
        logger.error('Error processing price tick', { symbol: tick.symbol, error: err });
      }
    });

    logger.info('Market service initialized — price tick pipeline ready');
  }

  /**
   * Subscribe to live updates for a symbol.
   */
  subscribeSymbol(symbol: string) {
    this.finnhub.subscribeSymbol(symbol);
  }

  /**
   * Unsubscribe from a symbol.
   */
  unsubscribeSymbol(symbol: string) {
    this.finnhub.unsubscribeSymbol(symbol);
  }

  /**
   * Get historical candles for a symbol.
   */
  async getCandles(symbol: string, resolution: string, from: number, to: number) {
    return this.finnhub.getCandles(symbol, resolution, from, to);
  }

  /**
   * Get current quote (cached or fresh).
   */
  async getQuote(symbol: string) {
    // Try cache first
    const cached = await this.redis.getCachedPrice(symbol);
    if (cached) return cached;

    // Fall back to API
    return this.finnhub.getQuote(symbol);
  }

  /**
   * Search for stock symbols.
   */
  async searchSymbol(query: string) {
    return this.finnhub.searchSymbol(query);
  }
}
