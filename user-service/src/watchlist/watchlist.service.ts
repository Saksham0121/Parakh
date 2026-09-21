import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AddWatchlistDto } from './dto/watchlist.dto';
import Redis from 'ioredis';

@Injectable()
export class WatchlistService {
  private redis: Redis;
  private hits = 0;
  private misses = 0;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD', ''),
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
    });
  }

  async getWatchlist(userId: string) {
    const cacheKey = `watchlist:${userId}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        this.hits++;
        return JSON.parse(cached);
      }
      this.misses++;
    } catch {
      // Fail open on Redis error
    }

    const list = await this.prisma.watchlist.findMany({
      where: { userId },
      orderBy: { symbol: 'asc' },
    });

    // If user is brand new with an empty watchlist, initialize starter symbols
    if (list.length === 0) {
      const defaultSymbols = ['RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'AAPL', 'NVDA'];
      await this.prisma.watchlist.createMany({
        data: defaultSymbols.map((symbol) => ({
          userId,
          symbol,
        })),
        skipDuplicates: true,
      });

      const initializedList = await this.prisma.watchlist.findMany({
        where: { userId },
        orderBy: { symbol: 'asc' },
      });

      try {
        await this.redis.set(cacheKey, JSON.stringify(initializedList), 'EX', 10);
      } catch {}

      return initializedList;
    }

    try {
      await this.redis.set(cacheKey, JSON.stringify(list), 'EX', 10);
    } catch {}

    return list;
  }

  async addSymbol(userId: string, dto: AddWatchlistDto) {
    const symbol = dto.symbol.toUpperCase();
    const existing = await this.prisma.watchlist.findUnique({
      where: {
        userId_symbol: { userId, symbol },
      },
    });

    if (existing) {
      return existing;
    }

    const created = await this.prisma.watchlist.create({
      data: {
        userId,
        symbol,
      },
    });

    // Invalidate cache on write
    try {
      await this.redis.del(`watchlist:${userId}`);
    } catch {}

    return created;
  }

  async removeSymbol(userId: string, symbol: string) {
    const norm = symbol.toUpperCase();
    await this.prisma.watchlist.deleteMany({
      where: {
        userId,
        symbol: norm,
      },
    });

    // Invalidate cache on write
    try {
      await this.redis.del(`watchlist:${userId}`);
    } catch {}

    return { message: `${norm} removed from watchlist` };
  }

  async getCacheMetrics() {
    const hits = this.hits;
    const misses = this.misses;
    const total = hits + misses;
    const hitRate = total > 0 ? (hits / total) * 100 : 0;
    return { hits, misses, total, hitRate: `${hitRate.toFixed(2)}%` };
  }
}
