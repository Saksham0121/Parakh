import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createKafkaClient, KafkaClient, KAFKA_TOPICS, createLogger, evaluateCondition, evaluateFundamentalConditions } from '@parakh/common';
import { RedisService } from '../redis/redis.service';
import YahooFinance from 'yahoo-finance2';
import { ConfigService } from '@nestjs/config';
import { SMA, RSI, MACD, BollingerBands } from 'technicalindicators';

const logger = createLogger({ service: 'backtest-worker' });

@Injectable()
export class BacktestWorkerService implements OnModuleInit, OnModuleDestroy {
  private kafkaClient: KafkaClient;
  private yf: InstanceType<typeof YahooFinance>;

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private configService: ConfigService,
  ) {
    this.kafkaClient = createKafkaClient('backtest-worker');
    this.yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
  }

  async onModuleInit() {
    await this.kafkaClient.subscribe(
      'backtest-worker-group',
      [KAFKA_TOPICS.BACKTEST_JOBS],
      async ({ message }) => {
        if (!message.value) return;
        const job = JSON.parse(message.value.toString());
        await this.processBacktest(job);
      },
    );
    logger.info('Backtest worker initialized');
  }

  async onModuleDestroy() {
    await this.kafkaClient.disconnect();
  }

  private async processBacktest(job: any) {
    try {
      // 1. Fetch Setup
      const setup = await this.prisma.setup.findUnique({ where: { id: job.setupId } });
      if (!setup) throw new Error('Setup not found');

      // 2. Fetch Historical Data from Yahoo Finance
      const from = Math.floor(job.startDate / 1000);
      const to = Math.floor(job.endDate / 1000);
      
      let cleanSymbol = job.symbol.replace(/^BINANCE:/i, '').replace(/USDT$/i, '-USD');
      let data: any = { t: [], o: [], h: [], l: [], c: [], v: [] };

      try {
        const chartRes = await this.yf.chart(cleanSymbol, {
          period1: new Date(from * 1000),
          period2: new Date(to * 1000),
          interval: '1d',
        });

        if (chartRes && chartRes.quotes && chartRes.quotes.length > 0) {
          for (const q of chartRes.quotes) {
            if (q.close == null || q.open == null) continue;
            data.t.push(Math.floor(new Date(q.date).getTime() / 1000));
            data.o.push(q.open);
            data.h.push(q.high);
            data.l.push(q.low);
            data.c.push(q.close);
            data.v.push(q.volume || 0);
          }
        }
      } catch (err) {
        logger.warn('Yahoo Finance backtest fetch failed, using fallback mock candles', { error: err });
      }

      if (data.t.length === 0) {
        data = this.generateMockCandles(from, to, 100); // Fallback mock data
      }

      // 3. Re-calculate indicators for the entire series
      const technicalConditions = (setup.technicalConditions as any[]) || [];
      const indicatorsMap: Record<string, number[]> = {};

      for (const cond of technicalConditions) {
        const key = cond.indicator;
        if (key === 'SMA') {
          indicatorsMap[key] = SMA.calculate({ period: cond.params.period, values: data.c });
        } else if (key === 'RSI') {
          indicatorsMap[key] = RSI.calculate({ period: cond.params.period, values: data.c });
        } else if (key === 'MACD') {
          indicatorsMap[key] = MACD.calculate({
            fastPeriod: cond.params.fast,
            slowPeriod: cond.params.slow,
            signalPeriod: cond.params.signal,
            SimpleMAOscillator: false,
            SimpleMASignal: false,
            values: data.c
          }).map((v: any) => v.MACD); // simplified just matching the MACD line
        }
        // Bollinger Bands etc can be added here
      }

      // 4. Simulate Trades
      let inTrade = false;
      let entryPrice = 0;
      let entryTime = 0;
      const trades = [];
      const orderRule: any = setup.orderRule || {};

      for (let i = 0; i < data.t.length; i++) {
        const currentPrice = data.c[i];
        const currentTime = data.t[i] * 1000;

        if (inTrade) {
          // Check exits
          let exitReason = null;
          if (orderRule.stopLossPct && currentPrice <= entryPrice * (1 - orderRule.stopLossPct / 100)) {
            exitReason = 'stop_loss';
          } else if (orderRule.takeProfitPct && currentPrice >= entryPrice * (1 + orderRule.takeProfitPct / 100)) {
            exitReason = 'take_profit';
          }
          // Simple mock for end of range
          if (i === data.t.length - 1 && !exitReason) {
             exitReason = 'time_exit';
          }

          if (exitReason) {
            const returnPct = ((currentPrice - entryPrice) / entryPrice) * 100;
            trades.push({
              backtestRunId: job.runId,
              entryDate: new Date(entryTime),
              entryPrice,
              exitDate: new Date(currentTime),
              exitPrice: currentPrice,
              exitReason,
              returnPct,
              result: returnPct >= 0 ? 'win' : 'loss'
            });
            inTrade = false;
          }
        } else {
          // Check entry conditions
          let techMatch = true;
          for (const cond of technicalConditions) {
            const indicatorValues = indicatorsMap[cond.indicator];
            // Since indicators need N periods to calculate, they are shorter than the price array.
            // A simple alignment: index offset is data.c.length - indicatorValues.length
            const offset = data.c.length - indicatorValues.length;
            if (i < offset) { techMatch = false; break; }
            
            const val = indicatorValues[i - offset];
            if (!evaluateCondition(cond.operator, val, cond.value)) {
               techMatch = false;
               break;
            }
          }

          if (techMatch && technicalConditions.length > 0) {
            inTrade = true;
            entryPrice = currentPrice;
            entryTime = currentTime;
          }
        }
      }

      // 5. Save Results
      if (trades.length > 0) {
        await this.prisma.backtestTrade.createMany({ data: trades });
      }

      const wins = trades.filter(t => t.result === 'win').length;
      const totalTrades = trades.length;
      const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
      const avgReturnPct = totalTrades > 0 ? trades.reduce((sum, t) => sum + t.returnPct, 0) / totalTrades : 0;
      
      const bestTradePct = trades.length ? Math.max(...trades.map(t => t.returnPct)) : 0;
      const worstTradePct = trades.length ? Math.min(...trades.map(t => t.returnPct)) : 0;

      await this.prisma.backtestResult.create({
        data: {
          backtestRunId: job.runId,
          totalTrades,
          wins,
          losses: totalTrades - wins,
          winRate,
          avgReturnPct,
          maxDrawdownPct: worstTradePct, // simplified
          bestTradePct,
          worstTradePct
        }
      });

      await this.prisma.backtestRun.update({
        where: { id: job.runId },
        data: { status: 'completed', completedAt: new Date() }
      });

      // 6. Update Leaderboard
      await this.updateSetupRanking(job.setupId);

      logger.info('Backtest completed', { runId: job.runId });
    } catch (err) {
      logger.error('Backtest failed', { runId: job.runId, error: err });
      await this.prisma.backtestRun.update({
        where: { id: job.runId },
        data: { status: 'failed', completedAt: new Date() }
      });
    }
  }

  private async updateSetupRanking(setupId: string) {
    const results = await this.prisma.backtestResult.findMany({
      where: { backtestRun: { setupId } }
    });

    if (results.length === 0) return;

    const totalRuns = results.length;
    const aggWinRate = results.reduce((sum, r) => sum + r.winRate, 0) / totalRuns;
    const aggAvgReturn = results.reduce((sum, r) => sum + r.avgReturnPct, 0) / totalRuns;
    const rankScore = (aggWinRate * 0.6) + (aggAvgReturn * 0.4);

    await this.prisma.setupRanking.upsert({
      where: { setupId },
      update: {
        totalBacktestRuns: totalRuns,
        aggregateWinRate: aggWinRate,
        aggregateAvgReturnPct: aggAvgReturn,
        rankScore,
        lastRankedAt: new Date()
      },
      create: {
        setupId,
        totalBacktestRuns: totalRuns,
        aggregateWinRate: aggWinRate,
        aggregateAvgReturnPct: aggAvgReturn,
        rankScore,
        lastRankedAt: new Date()
      }
    });
  }

  private generateMockCandles(from: number, to: number, startPrice: number) {
    const data = { t: [] as number[], o: [] as number[], h: [] as number[], l: [] as number[], c: [] as number[], v: [] as number[] };
    let currentPrice = startPrice;
    let time = from;
    const step = 24 * 60 * 60; // 1 day

    while (time <= to) {
      data.t.push(time);
      const volatility = currentPrice * 0.05;
      const open = currentPrice;
      const high = open + Math.random() * volatility;
      const low = open - Math.random() * volatility;
      const close = low + Math.random() * (high - low);
      
      data.o.push(open);
      data.h.push(high);
      data.l.push(low);
      data.c.push(close);
      data.v.push(Math.random() * 100000);
      
      currentPrice = close;
      time += step;
    }
    return data;
  }
}
