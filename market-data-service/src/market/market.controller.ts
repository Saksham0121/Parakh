import { Controller, Get, Post, Delete, Query, Param } from '@nestjs/common';
import { MarketService } from './market.service';

@Controller('market')
export class MarketController {
  constructor(private marketService: MarketService) {}

  @Get('quote/:symbol')
  async getQuote(@Param('symbol') symbol: string) {
    return this.marketService.getQuote(symbol.toUpperCase());
  }

  @Get('candles/:symbol')
  async getCandles(
    @Param('symbol') symbol: string,
    @Query('resolution') resolution: string = 'D',
    @Query('from') from: string = '',
    @Query('to') to: string = '',
  ) {
    const now = Math.floor(Date.now() / 1000);
    const fromTs = from ? parseInt(from) : now - 365 * 24 * 60 * 60; // Default: 1 year ago
    const toTs = to ? parseInt(to) : now;

    return this.marketService.getCandles(symbol.toUpperCase(), resolution, fromTs, toTs);
  }

  @Get('search')
  async search(@Query('q') query: string) {
    return this.marketService.searchSymbol(query);
  }

  @Post('subscribe/:symbol')
  async subscribe(@Param('symbol') symbol: string) {
    this.marketService.subscribeSymbol(symbol.toUpperCase());
    return { message: `Subscribed to ${symbol.toUpperCase()}` };
  }

  @Delete('subscribe/:symbol')
  async unsubscribe(@Param('symbol') symbol: string) {
    this.marketService.unsubscribeSymbol(symbol.toUpperCase());
    return { message: `Unsubscribed from ${symbol.toUpperCase()}` };
  }
}
