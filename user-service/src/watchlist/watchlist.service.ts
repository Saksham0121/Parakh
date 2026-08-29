import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AddWatchlistDto } from './dto/watchlist.dto';

@Injectable()
export class WatchlistService {
  constructor(private prisma: PrismaService) {}

  async getWatchlist(userId: string) {
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

      return this.prisma.watchlist.findMany({
        where: { userId },
        orderBy: { symbol: 'asc' },
      });
    }

    return list;
  }

  async addSymbol(userId: string, dto: AddWatchlistDto) {
    const symbol = dto.symbol.toUpperCase();
    // Check for duplicate for this specific user
    const existing = await this.prisma.watchlist.findUnique({
      where: {
        userId_symbol: { userId, symbol },
      },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.watchlist.create({
      data: {
        userId,
        symbol,
      },
    });
  }

  async removeSymbol(userId: string, symbol: string) {
    const norm = symbol.toUpperCase();
    await this.prisma.watchlist.deleteMany({
      where: {
        userId,
        symbol: norm,
      },
    });

    return { message: `${norm} removed from watchlist` };
  }
}
