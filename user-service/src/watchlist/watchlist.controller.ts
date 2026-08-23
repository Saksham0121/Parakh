import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { WatchlistService } from './watchlist.service';
import { AddWatchlistDto } from './dto/watchlist.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('watchlist')
export class WatchlistController {
  constructor(private watchlistService: WatchlistService) {}

  @Get()
  async getWatchlist(@Request() req: any) {
    return this.watchlistService.getWatchlist(req.user.userId);
  }

  @Post()
  async addSymbol(@Request() req: any, @Body() dto: AddWatchlistDto) {
    return this.watchlistService.addSymbol(req.user.userId, dto);
  }

  @Delete(':symbol')
  async removeSymbol(@Request() req: any, @Param('symbol') symbol: string) {
    return this.watchlistService.removeSymbol(req.user.userId, symbol.toUpperCase());
  }
}
