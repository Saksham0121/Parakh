import { Injectable, NestMiddleware, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';

/**
 * Token bucket rate limiter using Redis.
 * Each user (or IP for unauthenticated requests) gets a bucket
 * that refills at a fixed rate.
 */
@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private redis: Redis;
  private maxTokens: number;
  private refillRate: number; // tokens per second

  constructor(private configService: ConfigService) {
    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD', ''),
    });

    this.maxTokens = 60; // 60 requests max
    this.refillRate = 1;  // 1 token/second (60/min matches Finnhub free tier)
  }

  async use(req: Request, res: Response, next: NextFunction) {
    // Use user ID if authenticated, otherwise use IP
    const key = `rate_limit:${(req as any).user?.userId || req.ip}`;

    try {
      const now = Date.now();
      const bucketData = await this.redis.get(key);

      let tokens: number;
      let lastRefill: number;

      if (bucketData) {
        const parsed = JSON.parse(bucketData);
        tokens = parsed.tokens;
        lastRefill = parsed.lastRefill;

        // Refill tokens based on elapsed time
        const elapsed = (now - lastRefill) / 1000;
        tokens = Math.min(this.maxTokens, tokens + elapsed * this.refillRate);
      } else {
        tokens = this.maxTokens;
        lastRefill = now;
      }

      if (tokens < 1) {
        res.setHeader('X-RateLimit-Limit', this.maxTokens.toString());
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader('Retry-After', Math.ceil(1 / this.refillRate).toString());
        throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
      }

      // Consume one token
      tokens -= 1;

      // Store updated bucket
      await this.redis.set(
        key,
        JSON.stringify({ tokens, lastRefill: now }),
        'EX',
        120, // Expire after 2 minutes of inactivity
      );

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', this.maxTokens.toString());
      res.setHeader('X-RateLimit-Remaining', Math.floor(tokens).toString());

      next();
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      // If Redis is down, allow the request (fail open)
      next();
    }
  }
}
