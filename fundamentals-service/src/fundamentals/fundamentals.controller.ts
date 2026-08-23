import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Controller('fundamentals')
export class FundamentalsController {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService
  ) {}

  @Get(':symbol')
  async getFundamentals(@Param('symbol') symbol: string) {
    // Try Redis first
    const cached = await this.redis.client.get(`fundamentals:${symbol}`);
    if (cached) {
      return JSON.parse(cached);
    }

    // Fallback to DB
    const fundamentals = await this.prisma.companyFundamentals.findUnique({
      where: { symbol },
    });

    if (!fundamentals) {
      throw new NotFoundException(`Fundamentals not found for ${symbol}`);
    }

    return fundamentals;
  }
}
