import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AddWatchlistDto } from './dto/watchlist.dto';

@Injectable()
export class WatchlistService {
  constructor(private prisma: PrismaService) {}

  async getWatchlist(userId: string) {
    return this.prisma.watchlist.findMany({
      where: { userId },
      orderBy: { symbol: 'asc' },
    });
  }

  async addSymbol(userId: string, dto: AddWatchlistDto) {
    // Check for duplicate
    const existing = await this.prisma.watchlist.findUnique({
      where: {
        userId_symbol: { userId, symbol: dto.symbol },
      },
    });

    if (existing) {
      throw new ConflictException(`${dto.symbol} is already in your watchlist`);
    }

    return this.prisma.watchlist.create({
      data: {
        userId,
        symbol: dto.symbol,
      },
    });
  }

  async removeSymbol(userId: string, symbol: string) {
    const item = await this.prisma.watchlist.findUnique({
      where: {
        userId_symbol: { userId, symbol },
      },
    });

    if (!item) {
      throw new NotFoundException(`${symbol} is not in your watchlist`);
    }

    await this.prisma.watchlist.delete({
      where: { id: item.id },
    });

    return { message: `${symbol} removed from watchlist` };
  }
}
