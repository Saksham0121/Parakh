import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { createLogger } from '@parakh/common';
import axios from 'axios';
import CircuitBreaker from 'opossum';

const logger = createLogger({ service: 'fundamentals-scheduler' });

@Injectable()
export class FundamentalsSchedulerService implements OnModuleInit {
  private finnhubApiKey: string;
  private fetchBreaker: CircuitBreaker;

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private configService: ConfigService,
  ) {
    this.finnhubApiKey = this.configService.get<string>('FINNHUB_API_KEY', '');
    
    // Circuit breaker for Finnhub API calls
    this.fetchBreaker = new CircuitBreaker(
      (url: string) => axios.get(url),
      {
        timeout: 10000,     // 10 second timeout
        errorThresholdPercentage: 50, // open circuit if 50% of requests fail
        resetTimeout: 30000, // 30 seconds before trying again
      },
    );

    this.fetchBreaker.on('open', () => logger.warn('Finnhub fundamentals circuit breaker opened'));
    this.fetchBreaker.on('halfOpen', () => logger.info('Finnhub fundamentals circuit breaker half-open'));
    this.fetchBreaker.on('close', () => logger.info('Finnhub fundamentals circuit breaker closed'));
  }

  async onModuleInit() {
    // Run once on startup
    await this.fetchAndStoreFundamentals();
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCron() {
    await this.fetchAndStoreFundamentals();
  }

  private async fetchAndStoreFundamentals() {
    logger.info('Starting fundamentals sync');
    try {
      // 1. Get all unique symbols from watchlists
      const watchlists = await this.prisma.watchlist.findMany({ select: { symbol: true } });
      const uniqueSymbols = [...new Set(watchlists.map(w => w.symbol))];

      if (uniqueSymbols.length === 0) {
        // Fallback demo symbols
        uniqueSymbols.push('BINANCE:BTCUSDT', 'AAPL', 'MSFT');
      }

      for (const symbol of uniqueSymbols) {
        await this.syncSymbolFundamentals(symbol);
        // Sleep to avoid rate limits (Finnhub allows 60 calls/min free tier)
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      
      logger.info('Fundamentals sync complete');
    } catch (err) {
      logger.error('Fundamentals sync failed', { error: err });
    }
  }

    private async syncSymbolFundamentals(symbol: string) {
    try {
      let data: any = null;

      if (this.finnhubApiKey && !symbol.includes('BINANCE:')) {
        const url = `https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${this.finnhubApiKey}`;
        try {
          const res = (await this.fetchBreaker.fire(url)) as any;
          if (res.data && res.data.metric) {
            const metrics = res.data.metric;
            data = {
              symbol,
              peRatio: metrics.peNormalizedAnnual || metrics.peTTM || null,
              eps: metrics.epsNormalizedAnnual || metrics.epsTTM || null,
              roe: metrics.roeTTM || null,
              debtToEquity: metrics.totalDebtToEquityAnnual || metrics.totalDebtToEquityQuarterly || null,
              marketCap: metrics.marketCapitalization || null,
              sector: res.data.profile?.finnhubIndustry || null,
            };
          }
        } catch (error) {
          logger.error(`Finnhub request failed for ${symbol} via circuit breaker`, { error });
        }
      }

      // Mock data if API is not available, circuit opened, or for crypto
      if (!data) {
        data = this.generateMockFundamentals(symbol);
      }

      // Upsert to DB
      const updated = await this.prisma.companyFundamentals.upsert({
        where: { symbol },
        update: {
          peRatio: data.peRatio,
          eps: data.eps,
          roe: data.roe,
          debtToEquity: data.debtToEquity,
          marketCap: data.marketCap,
          sector: data.sector,
        },
        create: data,
      });

      // Cache in Redis for quick access by Alert/Backtest services
      await this.redis.client.set(`fundamentals:${symbol}`, JSON.stringify(updated));

      logger.info(`Synced fundamentals for ${symbol}`);
    } catch (err) {
      logger.error(`Failed to sync fundamentals for ${symbol}`, { error: err });
    }
  }

  private generateMockFundamentals(symbol: string) {
    // Generate deterministic mock data based on symbol length
    const hash = symbol.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    return {
      symbol,
      peRatio: 10 + (hash % 40), // 10 to 50
      eps: 1 + (hash % 10), // 1 to 11
      roe: 5 + (hash % 25), // 5 to 30
      debtToEquity: (hash % 100) / 50, // 0 to 2.0
      marketCap: 1000000000 * (1 + (hash % 2000)), // $1B to $2000B
      sector: 'Technology',
    };
  }
}
