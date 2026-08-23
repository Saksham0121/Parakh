import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createKafkaClient, KafkaClient, KAFKA_TOPICS } from '@parakh/common';

@Injectable()
export class BacktestService {
  private kafkaClient: KafkaClient;

  constructor(private prisma: PrismaService) {
    this.kafkaClient = createKafkaClient('backtest-api');
  }

  async triggerBacktest(userId: string, setupId: string, symbol: string, startDate: string, endDate: string) {
    // Verify setup belongs to user
    const setup = await this.prisma.setup.findUnique({ where: { id: setupId, userId } });
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

  async getBacktestRun(userId: string, runId: string) {
    const run = await this.prisma.backtestRun.findUnique({
      where: { id: runId },
      include: {
        result: true,
        trades: { orderBy: { entryDate: 'asc' } },
      }
    });

    if (!run) throw new NotFoundException();

    // Verify ownership
    const setup = await this.prisma.setup.findUnique({ where: { id: run.setupId } });
    if (!setup || setup.userId !== userId) throw new UnauthorizedException();

    return run;
  }

  async getSetupRankings() {
    return this.prisma.setupRanking.findMany({
      orderBy: { rankScore: 'desc' },
      take: 100,
    });
  }
}
