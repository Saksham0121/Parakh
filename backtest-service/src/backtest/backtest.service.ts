import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createKafkaClient, KafkaClient, KAFKA_TOPICS } from '@parakh/common';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class BacktestService {
  private kafkaClient: KafkaClient;

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {
    this.kafkaClient = createKafkaClient('backtest-api');
  }

  async triggerBacktest(userId: string, setupId: string, symbol: string, startDate: string, endDate: string) {
    // Verify setup belongs to user
    const setup = await this.prisma.setup.findFirst({ where: { id: setupId, userId } });
    if (!setup) throw new NotFoundException('Setup not found');

    // Create BacktestRun record (pending)
    const run = await this.prisma.backtestRun.create({
      data: {
        setupId,
        symbol,
        dateRangeStart: new Date(startDate),
        dateRangeEnd: new Date(endDate),
        status: 'pending',
      },
    });

    // Initialize status in Redis
    await this.redis.client.set(`backtest:status:${run.id}`, JSON.stringify({ status: 'pending', progress: 5 }), 'EX', 86400);

    // Publish job to Kafka
    await this.kafkaClient.publish(
      KAFKA_TOPICS.BACKTEST_JOBS,
      run.id,
      {
        runId: run.id,
        setupId,
        symbol,
        startDate: new Date(startDate).getTime(),
        endDate: new Date(endDate).getTime(),
      }
    );

    return { runId: run.id, status: 'pending' };
  }

  async getStatus(userId: string, runId: string) {
    const run = await this.prisma.backtestRun.findUnique({
      where: { id: runId },
    });

    if (!run) throw new NotFoundException('Backtest run not found');

    // Verify ownership
    const setup = await this.prisma.setup.findFirst({
      where: { id: run.setupId, userId },
    });
    if (!setup) throw new UnauthorizedException();

    const cachedStatus = await this.redis.client.get(`backtest:status:${runId}`);
    if (cachedStatus) {
      try {
        const parsed = JSON.parse(cachedStatus);
        return {
          runId,
          status: run.status === 'completed' ? 'completed' : (parsed.status || run.status),
          progress: run.status === 'completed' ? 100 : (parsed.progress ?? 0),
          error: parsed.error,
        };
      } catch {}
    }

    return {
      runId,
      status: run.status,
      progress: run.status === 'completed' ? 100 : 10,
    };
  }

  async getPlayback(userId: string, runId: string) {
    const run = await this.prisma.backtestRun.findUnique({
      where: { id: runId },
      include: {
        result: true,
        trades: { orderBy: { entryDate: 'asc' } },
      },
    });

    if (!run) throw new NotFoundException('Backtest run not found');

    const setup = await this.prisma.setup.findFirst({
      where: { id: run.setupId, userId },
    });
    if (!setup) throw new UnauthorizedException();

    // Check Redis for precomputed playback series
    const cachedPlayback = await this.redis.client.get(`backtest:playback:${runId}`);
    if (cachedPlayback) {
      try {
        return JSON.parse(cachedPlayback);
      } catch {}
    }

    // Fallback: reconstruct minimal playback response from DB
    return {
      runId: run.id,
      symbol: run.symbol,
      setupName: setup.name,
      dateRangeStart: run.dateRangeStart,
      dateRangeEnd: run.dateRangeEnd,
      bars: [],
      trades: run.trades,
      equityCurve: [],
      result: run.result,
    };
  }

  async getBacktestRun(userId: string, runId: string) {
    const run = await this.prisma.backtestRun.findUnique({
      where: { id: runId },
      include: {
        result: true,
        trades: { orderBy: { entryDate: 'asc' } },
      },
    });

    if (!run) throw new NotFoundException('Backtest run not found');

    const setup = await this.prisma.setup.findFirst({
      where: { id: run.setupId, userId },
    });
    if (!setup) throw new UnauthorizedException();

    return run;
  }


  async getSetupBacktests(setupId: string) {
    return this.prisma.backtestRun.findMany({
      where: { setupId },
      include: {
        result: true,
      },
      orderBy: { requestedAt: 'desc' },
      take: 50,
    });
  }

  async getSetupRankings() {
    return this.prisma.setupRanking.findMany({
      orderBy: { rankScore: 'desc' },
      take: 100,
    });
  }
}

