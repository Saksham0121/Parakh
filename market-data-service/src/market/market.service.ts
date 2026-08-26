import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { YahooFinanceService } from '../yahoo-finance/yahoo-finance.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { RedisService } from '../redis/redis.service';
import { createLogger } from '@parakh/common';
import type { PriceTickDto } from '@parakh/common';

const logger = createLogger({ service: 'market-service' });

@Injectable()
export class MarketService implements OnModuleInit, OnModuleDestroy {
  private subscribedSymbols: Set<string> = new Set(['AAPL', 'MSFT', 'BINANCE:BTCUSDT']);
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private yahooFinance: YahooFinanceService,
    private kafkaProducer: KafkaProducerService,
    private redis: RedisService,
  ) {}

  async onModuleInit() {
    // Start continuous live price polling for subscribed symbols (every 3 seconds)
    this.pollTimer = setInterval(async () => {
      await this.pollSubscribedPrices();
    }, 3000);

    // Initial poll
    await this.pollSubscribedPrices();

    logger.info('Market service initialized — Yahoo Finance price stream pipeline active');
  }

  onModuleDestroy() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Polls latest prices for all active watched symbols and publishes ticks to Kafka & Redis.
   */
  private async pollSubscribedPrices() {
    if (this.subscribedSymbols.size === 0) return;

    for (const symbol of this.subscribedSymbols) {
      try {
        const quote = await this.yahooFinance.getQuote(symbol);
        if (quote && quote.c != null) {
          const tick: PriceTickDto = {
            symbol,
            price: quote.c,
            volume: 0,
            timestamp: quote.t || Math.floor(Date.now() / 1000),
          };

          // Publish to Kafka
          await this.kafkaProducer.publishPriceTick(tick);
          // Cache in Redis
          await this.redis.cachePrice(tick);
        }
      } catch (err: any) {
        logger.error('Error streaming price tick', { symbol, error: err.message });
      }
    }
  }

  /**
   * Subscribe to live updates for a symbol.
   */
  subscribeSymbol(symbol: string) {
    this.subscribedSymbols.add(symbol.toUpperCase());
    logger.info(`Subscribed to real-time price updates for ${symbol.toUpperCase()}`);
    // Immediately fetch and broadcast one tick
    this.pollSubscribedPrices().catch(() => {});
  }

  /**
   * Unsubscribe from a symbol.
   */
  unsubscribeSymbol(symbol: string) {
    this.subscribedSymbols.delete(symbol.toUpperCase());
    logger.info(`Unsubscribed from real-time price updates for ${symbol.toUpperCase()}`);
  }

  /**
   * Get historical candles for a symbol via Yahoo Finance (unlimited, no API key needed).
   */
  async getCandles(symbol: string, resolution: string = 'D', from: number = 0, to: number = 0) {
    return this.yahooFinance.getCandles(symbol, resolution, from, to);
  }

  /**
   * Get current quote (cached in Redis or fresh from Yahoo Finance).
   */
  async getQuote(symbol: string) {
    // Check Redis cache first
    const cached = await this.redis.getCachedPrice(symbol);
    if (cached) return cached;

    // Fetch from Yahoo Finance
    const quote = await this.yahooFinance.getQuote(symbol);
    if (quote) {
      // Warm Redis cache
      await this.redis.cachePrice({
        symbol,
        price: quote.c,
        volume: 0,
        timestamp: quote.t,
      });
      return quote;
    }

    return null;
  }

  /**
   * Search for stock symbols via Yahoo Finance.
   */
  async searchSymbol(query: string) {
    return this.yahooFinance.searchSymbol(query);
  }
}
