import { Injectable, NestMiddleware, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';

/**
 * Atomic token-bucket Lua script executed via EVALSHA.
 * Evaluates tokens, updates bucket, and sets TTL in a single Redis roundtrip.
 */
const RATE_LIMIT_LUA = `
local key = KEYS[1]
local maxTokens = tonumber(ARGV[1])
local refillRate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local data = redis.call('GET', key)
local tokens = maxTokens
local lastRefill = now

if data then
  local p = cjson.decode(data)
  tokens = p.tokens
  lastRefill = p.lastRefill
  local elapsed = (now - lastRefill) / 1000
  tokens = math.min(maxTokens, tokens + elapsed * refillRate)
end

if tokens < 1 then
  return {0, math.floor(tokens)}
end

tokens = tokens - 1
redis.call('SET', key, cjson.encode({ tokens = tokens, lastRefill = now }), 'EX', 120)
return {1, math.floor(tokens)}
`;

let sharedRedis: Redis | null = null;

function getSharedRedis(configService: ConfigService): Redis {
  if (!sharedRedis) {
    sharedRedis = new Redis({
      host: configService.get<string>('REDIS_HOST', 'localhost'),
      port: configService.get<number>('REDIS_PORT', 6379),
      password: configService.get<string>('REDIS_PASSWORD', ''),
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
    });
    sharedRedis.defineCommand('consumeToken', {
      numberOfKeys: 1,
      lua: RATE_LIMIT_LUA,
    });
  }
  return sharedRedis;
}

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private redis: Redis;
  private maxTokens: number;
  private refillRate: number; // tokens per second

  constructor(private configService: ConfigService) {
    this.redis = getSharedRedis(this.configService);
    this.maxTokens = parseInt(this.configService.get<string>('RATE_LIMIT_MAX_TOKENS', '60'), 10);
    this.refillRate = parseFloat(this.configService.get<string>('RATE_LIMIT_REFILL_RATE', '1'));
  }

  async use(req: Request, res: Response, next: NextFunction) {
    const key = `rate_limit:${(req as any).user?.userId || req.ip}`;

    try {
      const now = Date.now();
      // Atomic EVALSHA invocation
      const result = await (this.redis as any).consumeToken(
        key,
        this.maxTokens,
        this.refillRate,
        now,
      );
      const [allowed, remaining] = result;

      if (allowed === 0) {
        res.setHeader('X-RateLimit-Limit', this.maxTokens.toString());
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader('Retry-After', Math.ceil(1 / this.refillRate).toString());
        throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
      }

      res.setHeader('X-RateLimit-Limit', this.maxTokens.toString());
      res.setHeader('X-RateLimit-Remaining', remaining.toString());

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
