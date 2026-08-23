import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { createLogger } from '@parakh/common';
import type { PriceTickDto } from '@parakh/common';

const logger = createLogger({ service: 'redis-cache' });

@Injectable()
export class RedisService implements OnModuleDestroy {
  private redis: Redis;

  constructor(private configService: ConfigService) {
    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD', ''),
    });

    this.redis.on('error', (err) => {
      logger.error('Redis connection error', { error: err.message });
    });
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  /**
   * Cache the latest price for a symbol.
   */
  async cachePrice(tick: PriceTickDto): Promise<void> {
    const key = `price:${tick.symbol}`;
    await this.redis.set(key, JSON.stringify(tick), 'EX', 60); // 60 second TTL
  }

  /**
   * Get cached price for a symbol.
   */
  async getCachedPrice(symbol: string): Promise<PriceTickDto | null> {
    const data = await this.redis.get(`price:${symbol}`);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Cache indicator values.
   */
  async cacheIndicator(symbol: string, indicatorKey: string, value: any): Promise<void> {
    const key = `indicator:${symbol}:${indicatorKey}`;
    await this.redis.set(key, JSON.stringify(value), 'EX', 120);
  }

  /**
   * Get cached indicator value.
   */
  async getCachedIndicator(symbol: string, indicatorKey: string): Promise<any | null> {
    const data = await this.redis.get(`indicator:${symbol}:${indicatorKey}`);
    return data ? JSON.parse(data) : null;
  }

  getClient(): Redis {
    return this.redis;
  }
}
