import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';
import CircuitBreaker from 'opossum';
import { createLogger } from '@parakh/common';
import type { PriceTickDto } from '@parakh/common';

const logger = createLogger({ service: 'finnhub-client' });

@Injectable()
export class FinnhubService implements OnModuleInit, OnModuleDestroy {
  private ws: WebSocket | null = null;
  private apiKey: string;
  private baseUrl = 'https://finnhub.io/api/v1';
  private subscribedSymbols: Set<string> = new Set();
  private priceHandlers: Array<(tick: PriceTickDto) => void> = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private fetchBreaker: CircuitBreaker;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('FINNHUB_API_KEY', '');

    // Circuit breaker for REST API calls
    this.fetchBreaker = new CircuitBreaker(
      (url: string) => this.rawFetch(url),
      {
        timeout: 10000,     // 10 second timeout
        errorThresholdPercentage: 50,
        resetTimeout: 30000, // 30 seconds before trying again
      },
    );

    this.fetchBreaker.on('open', () => logger.warn('Finnhub circuit breaker opened'));
    this.fetchBreaker.on('halfOpen', () => logger.info('Finnhub circuit breaker half-open'));
    this.fetchBreaker.on('close', () => logger.info('Finnhub circuit breaker closed'));
  }

  async onModuleInit() {
    if (this.apiKey) {
      this.connectWebSocket();
    } else {
      logger.warn('No FINNHUB_API_KEY set — running without live data');
    }
  }

  async onModuleDestroy() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Register a handler for incoming price ticks.
   */
  onPriceTick(handler: (tick: PriceTickDto) => void) {
    this.priceHandlers.push(handler);
  }

  /**
   * Subscribe to real-time trades for a symbol.
   */
  subscribeSymbol(symbol: string) {
    this.subscribedSymbols.add(symbol);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'subscribe', symbol }));
      logger.info(`Subscribed to ${symbol}`);
    }
  }

  /**
   * Unsubscribe from a symbol.
   */
  unsubscribeSymbol(symbol: string) {
    this.subscribedSymbols.delete(symbol);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'unsubscribe', symbol }));
    }
  }

  /**
   * Fetch stock candles (historical OHLCV data).
   */
  async getCandles(symbol: string, resolution: string, from: number, to: number): Promise<any> {
    const url = `${this.baseUrl}/stock/candle?symbol=${symbol}&resolution=${resolution}&from=${from}&to=${to}&token=${this.apiKey}`;
    return this.fetchBreaker.fire(url);
  }

  /**
   * Fetch current quote for a symbol.
   */
  async getQuote(symbol: string): Promise<any> {
    const url = `${this.baseUrl}/quote?symbol=${symbol}&token=${this.apiKey}`;
    return this.fetchBreaker.fire(url);
  }

  /**
   * Search for symbols.
   */
  async searchSymbol(query: string): Promise<any> {
    const url = `${this.baseUrl}/search?q=${query}&token=${this.apiKey}`;
    return this.fetchBreaker.fire(url);
  }

  /**
   * Fetch company profile.
   */
  async getCompanyProfile(symbol: string): Promise<any> {
    const url = `${this.baseUrl}/stock/profile2?symbol=${symbol}&token=${this.apiKey}`;
    return this.fetchBreaker.fire(url);
  }

  private connectWebSocket() {
    const wsUrl = `wss://ws.finnhub.io?token=${this.apiKey}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      logger.info('Finnhub WebSocket connected');
      // Re-subscribe to all symbols on reconnect
      for (const symbol of this.subscribedSymbols) {
        this.ws!.send(JSON.stringify({ type: 'subscribe', symbol }));
      }
    });

    this.ws.on('message', (data: WebSocket.RawData) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === 'trade' && parsed.data) {
          for (const trade of parsed.data) {
            const tick: PriceTickDto = {
              symbol: trade.s,
              price: trade.p,
              volume: trade.v,
              timestamp: trade.t,
            };
            this.priceHandlers.forEach((handler) => handler(tick));
          }
        }
      } catch (err) {
        logger.error('Failed to parse Finnhub message', { error: err });
      }
    });

    this.ws.on('close', () => {
      logger.warn('Finnhub WebSocket disconnected, reconnecting in 5s...');
      this.reconnectTimer = setTimeout(() => this.connectWebSocket(), 5000);
    });

    this.ws.on('error', (err) => {
      logger.error('Finnhub WebSocket error', { error: err.message });
    });
  }

  private async rawFetch(url: string): Promise<any> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Finnhub API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }
}
