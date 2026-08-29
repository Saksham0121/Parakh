import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { createLogger } from '@parakh/common';
import YahooFinance from 'yahoo-finance2';

const logger = createLogger({ service: 'fundamentals-scheduler' });

@Injectable()
export class FundamentalsSchedulerService implements OnModuleInit {
  private yf: InstanceType<typeof YahooFinance>;

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {
    this.yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
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
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      logger.info('Fundamentals sync complete');
    } catch (err) {
      logger.error('Fundamentals sync failed', { error: err });
    }
  }

  private async syncSymbolFundamentals(symbol: string) {
    try {
      let data: any = null;
      const cleanSymbol = symbol.replace(/^BINANCE:/i, '').replace(/USDT$/i, '-USD');

      try {
        const summary = await this.yf.quoteSummary(cleanSymbol, {
          modules: ['summaryProfile', 'financialData', 'defaultKeyStatistics', 'price'],
        });

        if (summary) {
          const stats = summary.defaultKeyStatistics;
          const fin = summary.financialData;
          const profile = summary.summaryProfile;
          const price = summary.price;

          data = {
            symbol,
            peRatio: stats?.trailingPE || stats?.forwardPE || null,
            eps: stats?.trailingEps || null,
            roe: fin?.returnOnEquity ? fin.returnOnEquity * 100 : null,
            debtToEquity: fin?.debtToEquity || null,
            marketCap: price?.marketCap || null,
            sector: profile?.sector || 'Equities',
          };
        }
      } catch (error: any) {
        logger.warn(`Yahoo Finance quoteSummary failed for ${symbol}`, { error: error.message });
      }

      // Mock data if API is not available (e.g. for crypto or unavailable tickers)
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
