import { Injectable, OnModuleInit } from '@nestjs/common';
import YahooFinance from 'yahoo-finance2';
import { createLogger } from '@parakh/common';

const logger = createLogger({ service: 'yahoo-finance' });

@Injectable()
export class YahooFinanceService implements OnModuleInit {
  private yf: InstanceType<typeof YahooFinance>;

  constructor() {
    // Initialize Yahoo Finance instance and suppress non-critical survey notices
    this.yf = new YahooFinance({
      suppressNotices: ['yahooSurvey'],
    });
  }

  onModuleInit() {
    logger.info('Yahoo Finance service initialized — unlimited candles & quotes ready');
  }

  /**
   * Helper to normalize symbols from UI / broker format to Yahoo Finance format.
   * e.g. "BINANCE:BTCUSDT" -> "BTC-USD"
   *      "BTCUSDT"         -> "BTC-USD"
   *      "AAPL"            -> "AAPL"
   */
  private normalizeSymbol(symbol: string): string {
    let clean = symbol.trim().toUpperCase();
    if (clean.startsWith('BINANCE:')) {
      clean = clean.replace('BINANCE:', '');
    }
    if (clean.endsWith('USDT')) {
      clean = clean.replace(/USDT$/, '-USD');
    }
    if (clean.endsWith('USD') && !clean.includes('-')) {
      clean = clean.replace(/USD$/, '-USD');
    }
    return clean;
  }

  /**
   * Helper to map resolution to Yahoo Finance interval
   */
  private mapResolutionToInterval(resolution: string): '1m' | '2m' | '5m' | '15m' | '30m' | '60m' | '1d' | '1wk' | '1mo' {
    switch (resolution) {
      case '1': return '1m';
      case '5': return '5m';
      case '15': return '15m';
      case '30': return '30m';
      case '60': return '60m';
      case 'W': return '1wk';
      case 'M': return '1mo';
      case 'D':
      default:
        return '1d';
    }
  }

  /**
   * Fetch historical candles in Finnhub/Frontend compatible format { t, o, h, l, c, v, s }
   */
  async getCandles(
    symbol: string,
    resolution: string = 'D',
    from?: number,
    to?: number,
  ): Promise<{ t: number[]; o: number[]; h: number[]; l: number[]; c: number[]; v: number[]; s: string }> {
    const normSymbol = this.normalizeSymbol(symbol);
    const interval = this.mapResolutionToInterval(resolution);

    const now = Math.floor(Date.now() / 1000);
    // Default to 1 year of history if from not provided or 0
    const period1Ts = from && from > 0 ? from : now - 365 * 24 * 60 * 60;
    const period2Ts = to && to > 0 ? to : now;

    try {
      const chartResult = await this.yf.chart(normSymbol, {
        period1: new Date(period1Ts * 1000),
        period2: new Date(period2Ts * 1000),
        interval,
      });

      if (!chartResult || !chartResult.quotes || chartResult.quotes.length === 0) {
        logger.warn('Yahoo Finance returned 0 quotes for symbol', { symbol: normSymbol });
        return { t: [], o: [], h: [], l: [], c: [], v: [], s: 'no_data' };
      }

      const t: number[] = [];
      const o: number[] = [];
      const h: number[] = [];
      const l: number[] = [];
      const c: number[] = [];
      const v: number[] = [];

      for (const q of chartResult.quotes) {
        // Skip quotes with missing OHLC values (e.g. holidays / missing ticks)
        if (q.close == null || q.open == null || q.high == null || q.low == null) continue;

        const ts = Math.floor(new Date(q.date).getTime() / 1000);
        t.push(ts);
        o.push(q.open);
        h.push(q.high);
        l.push(q.low);
        c.push(q.close);
        v.push(q.volume ?? 0);
      }

      logger.info('Yahoo Finance candles retrieved', { symbol: normSymbol, count: t.length });
      return { t, o, h, l, c, v, s: 'ok' };
    } catch (err: any) {
      logger.error('Failed to fetch Yahoo Finance candles', { symbol: normSymbol, error: err.message });
      return { t: [], o: [], h: [], l: [], c: [], v: [], s: 'no_data' };
    }
  }

  /**
   * Fetch current quote for a symbol
   */
  async getQuote(symbol: string): Promise<any> {
    const normSymbol = this.normalizeSymbol(symbol);
    try {
      const q = await this.yf.quote(normSymbol);
      if (!q || q.regularMarketPrice == null) return null;

      return {
        c: q.regularMarketPrice,
        d: q.regularMarketChange ?? 0,
        dp: q.regularMarketChangePercent ?? 0,
        h: q.regularMarketDayHigh ?? q.regularMarketPrice,
        l: q.regularMarketDayLow ?? q.regularMarketPrice,
        o: q.regularMarketOpen ?? q.regularMarketPrice,
        pc: q.regularMarketPreviousClose ?? q.regularMarketPrice,
        t: Math.floor(Date.now() / 1000),
      };
    } catch (err: any) {
      logger.error('Failed to fetch Yahoo Finance quote', { symbol: normSymbol, error: err.message });
      return null;
    }
  }

  /**
   * Search symbols via Yahoo Finance
   */
  async searchSymbol(query: string): Promise<any> {
    try {
      const searchRes = await this.yf.search(query);
      const quotes = searchRes?.quotes || [];
      const results = quotes
        .filter((item: any) => item.symbol && item.shortname)
        .map((item: any) => ({
          description: item.shortname || item.longname || item.symbol,
          displaySymbol: item.symbol,
          symbol: item.symbol,
          type: item.quoteType || 'Common Stock',
        }));

      return { count: results.length, result: results };
    } catch (err: any) {
      logger.error('Failed to search Yahoo Finance symbols', { query, error: err.message });
      return { count: 0, result: [] };
    }
  }
}
