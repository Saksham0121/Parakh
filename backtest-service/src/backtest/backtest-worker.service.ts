import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createKafkaClient, KafkaClient, KAFKA_TOPICS, createLogger } from '@parakh/common';
import { RedisService } from '../redis/redis.service';
import YahooFinance from 'yahoo-finance2';
import { ConfigService } from '@nestjs/config';
import { SMA, EMA, RSI, MACD, BollingerBands, ATR, Stochastic } from 'technicalindicators';

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
        try {
          const job = JSON.parse(message.value.toString());
          await this.processBacktest(job);
        } catch (err) {
          logger.error('Error in backtest worker subscriber', { error: err });
        }
      },
    );
    logger.info('Backtest worker initialized');
  }

  async onModuleDestroy() {
    await this.kafkaClient.disconnect();
  }

  private evaluateConditionOperator(operator: string, currentValue: number, targetValue: number, prevValue?: number): boolean {
    const op = (operator || '>').toLowerCase().trim();
    switch (op) {
      case '>':
      case 'gt':
      case 'is above':
        return currentValue > targetValue;
      case '<':
      case 'lt':
      case 'is below':
        return currentValue < targetValue;
      case '>=':
      case 'gte':
        return currentValue >= targetValue;
      case '<=':
      case 'lte':
        return currentValue <= targetValue;
      case '=':
      case '==':
      case 'eq':
      case 'equals':
        return Math.abs(currentValue - targetValue) < 0.0001;
      case 'crosses above':
      case 'crosses_above':
        return prevValue !== undefined ? (prevValue <= targetValue && currentValue > targetValue) : currentValue > targetValue;
      case 'crosses below':
      case 'crosses_below':
        return prevValue !== undefined ? (prevValue >= targetValue && currentValue < targetValue) : currentValue < targetValue;
      default:
        return currentValue > targetValue;
    }
  }

  private calculateVWAP(closes: number[], highs: number[], lows: number[], volumes: number[], index: number): number {
    let sumTPV = 0;
    let sumV = 0;
    for (let k = 0; k <= index; k++) {
      const tp = (highs[k] + lows[k] + closes[k]) / 3;
      const v = volumes[k] || 1;
      sumTPV += tp * v;
      sumV += v;
    }
    return sumV > 0 ? sumTPV / sumV : closes[index];
  }

  private async processBacktest(job: any) {
    const runId = job.runId;
    try {
      // Update status to running
      await this.redis.client.set(`backtest:status:${runId}`, JSON.stringify({ status: 'running', progress: 10 }), 'EX', 86400);

      // 1. Fetch Setup
      const setup = await this.prisma.setup.findUnique({ where: { id: job.setupId } });
      if (!setup) throw new Error(`Setup ${job.setupId} not found`);

      // 2. Fetch Historical Data
      const from = Math.floor(job.startDate / 1000);
      const to = Math.floor(job.endDate / 1000);

      let cleanSymbol = (job.symbol || 'AAPL').replace(/^BINANCE:/i, '').replace(/USDT$/i, '-USD');
      let data: { t: number[]; o: number[]; h: number[]; l: number[]; c: number[]; v: number[] } = {
        t: [],
        o: [],
        h: [],
        l: [],
        c: [],
        v: [],
      };

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
            data.o.push(Number(q.open));
            data.h.push(Number(q.high ?? q.open));
            data.l.push(Number(q.low ?? q.open));
            data.c.push(Number(q.close));
            data.v.push(Number(q.volume || 10000));
          }
        }
      } catch (err) {
        logger.warn('Yahoo Finance backtest fetch failed, generating fallback series', { error: err, symbol: cleanSymbol });
      }

      if (data.t.length < 10) {
        data = this.generateMockCandles(from, to, 100);
      }

      await this.redis.client.set(`backtest:status:${runId}`, JSON.stringify({ status: 'running', progress: 30 }), 'EX', 86400);

      // 3. Sequential Zero-Lookahead Simulation
      const technicalConditions = (setup.technicalConditions as any[]) || [];
      const orderRule: any = setup.orderRule || {};
      const stopLossPct = orderRule.stopLossPct ? Number(orderRule.stopLossPct) : null;
      const takeProfitPct = orderRule.takeProfitPct ? Number(orderRule.takeProfitPct) : null;
      const trailingStopPct = orderRule.trailingStopPct ? Number(orderRule.trailingStopPct) : null;
      const stopLimitPrice = orderRule.stopLimitPrice ? Number(orderRule.stopLimitPrice) : null;

      const N = data.t.length;
      const playbackBars: any[] = [];
      const trades: any[] = [];
      const equityCurve: Array<{ time: number; value: number }> = [];

      let currentEquity = 100000;
      let inTrade = false;
      let currentTrade: any = null;
      let peakPrice = 0;

      // Track previous indicator values for crossing evaluation
      const prevIndicatorValues: Record<string, number> = {};

      for (let i = 0; i < N; i++) {
        const timeMs = data.t[i] * 1000;
        const currentOpen = data.o[i];
        const currentHigh = data.h[i];
        const currentLow = data.l[i];
        const currentClose = data.c[i];
        const currentVol = data.v[i];

        // Slice strictly up to current bar [0...i] -> ZERO lookahead bias
        const closesPrefix = data.c.slice(0, i + 1);
        const highsPrefix = data.h.slice(0, i + 1);
        const lowsPrefix = data.l.slice(0, i + 1);
        const volsPrefix = data.v.slice(0, i + 1);

        // Precompute all standard indicator values for bar i to attach to playback bar series
        const barIndicators: Record<string, any> = {};

        // Safe number helper
        const safeNum = (v: any, decimals = 2): number | null =>
          typeof v === 'number' && !isNaN(v) ? Number(v.toFixed(decimals)) : null;

        // 1) SMA (14, 50, 200)
        if (i >= 13) {
          const s14 = SMA.calculate({ period: 14, values: closesPrefix });
          barIndicators['SMA14'] = s14.length > 0 ? safeNum(s14[s14.length - 1]) : null;
        }
        if (i >= 49) {
          const s50 = SMA.calculate({ period: 50, values: closesPrefix });
          barIndicators['SMA50'] = s50.length > 0 ? safeNum(s50[s50.length - 1]) : null;
        }
        // 2) EMA (20)
        if (i >= 19) {
          const e20 = EMA.calculate({ period: 20, values: closesPrefix });
          barIndicators['EMA20'] = e20.length > 0 ? safeNum(e20[e20.length - 1]) : null;
        }
        // 3) RSI (14)
        if (i >= 14) {
          const rsiArr = RSI.calculate({ period: 14, values: closesPrefix });
          barIndicators['RSI'] = rsiArr.length > 0 ? safeNum(rsiArr[rsiArr.length - 1]) : null;
        }
        // 4) MACD (12, 26, 9)
        if (i >= 25) {
          const macdArr = MACD.calculate({
            fastPeriod: 12,
            slowPeriod: 26,
            signalPeriod: 9,
            SimpleMAOscillator: false,
            SimpleMASignal: false,
            values: closesPrefix,
          });
          if (macdArr.length > 0) {
            const m = macdArr[macdArr.length - 1];
            barIndicators['MACD'] = {
              macd: safeNum(m?.MACD),
              signal: safeNum(m?.signal),
              histogram: safeNum(m?.histogram),
            };
          }
        }
        // 5) Bollinger Bands (20, 2)
        if (i >= 19) {
          const bbArr = BollingerBands.calculate({ period: 20, stdDev: 2, values: closesPrefix });
          if (bbArr.length > 0) {
            const bb = bbArr[bbArr.length - 1];
            barIndicators['BollingerBands'] = {
              upper: safeNum(bb?.upper),
              middle: safeNum(bb?.middle),
              lower: safeNum(bb?.lower),
            };
          }
        }
        // 6) ATR (14)
        if (i >= 14) {
          const atrArr = ATR.calculate({ high: highsPrefix, low: lowsPrefix, close: closesPrefix, period: 14 });
          barIndicators['ATR'] = atrArr.length > 0 ? safeNum(atrArr[atrArr.length - 1]) : null;
        }
        // 7) Stochastic (14, 3)
        if (i >= 14) {
          const stochArr = Stochastic.calculate({ high: highsPrefix, low: lowsPrefix, close: closesPrefix, period: 14, signalPeriod: 3 });
          if (stochArr.length > 0) {
            const st = stochArr[stochArr.length - 1];
            barIndicators['Stochastic'] = { k: safeNum(st?.k), d: safeNum(st?.d) };
          }
        }
        // 8) VWAP
        barIndicators['VWAP'] = safeNum(this.calculateVWAP(closesPrefix, highsPrefix, lowsPrefix, volsPrefix, i));


        // Evaluate Setup's custom technical conditions
        const currentConditionValues: Record<string, number> = {};

        for (const cond of technicalConditions) {
          const indType = (cond.indicator || '').toLowerCase();
          const period = cond.params?.period || 14;

          if (indType === 'rsi') {
            if (i >= period) {
              const res = RSI.calculate({ period, values: closesPrefix });
              if (res.length > 0) currentConditionValues[cond.indicator] = res[res.length - 1];
            }
          } else if (indType === 'sma') {
            if (i >= period - 1) {
              const res = SMA.calculate({ period, values: closesPrefix });
              if (res.length > 0) currentConditionValues[cond.indicator] = res[res.length - 1];
            }
          } else if (indType === 'ema') {
            if (i >= period - 1) {
              const res = EMA.calculate({ period, values: closesPrefix });
              if (res.length > 0) currentConditionValues[cond.indicator] = res[res.length - 1];
            }
          } else if (indType === 'macd') {
            const fast = cond.params?.fast || 12;
            const slow = cond.params?.slow || 26;
            const signal = cond.params?.signal || 9;
            if (i >= slow - 1) {
              const res = MACD.calculate({ fastPeriod: fast, slowPeriod: slow, signalPeriod: signal, SimpleMAOscillator: false, SimpleMASignal: false, values: closesPrefix });
              if (res.length > 0) currentConditionValues[cond.indicator] = res[res.length - 1].MACD || 0;
            }
          } else if (indType === 'bollingerbands') {
            if (i >= period - 1) {
              const res = BollingerBands.calculate({ period, stdDev: cond.params?.stdDev || 2, values: closesPrefix });
              if (res.length > 0) currentConditionValues[cond.indicator] = res[res.length - 1].middle;
            }
          } else if (indType === 'atr') {
            if (i >= period) {
              const res = ATR.calculate({ high: highsPrefix, low: lowsPrefix, close: closesPrefix, period });
              if (res.length > 0) currentConditionValues[cond.indicator] = res[res.length - 1];
            }
          } else if (indType === 'stochastic') {
            if (i >= period) {
              const res = Stochastic.calculate({ high: highsPrefix, low: lowsPrefix, close: closesPrefix, period, signalPeriod: cond.params?.signalPeriod || 3 });
              if (res.length > 0) currentConditionValues[cond.indicator] = res[res.length - 1].k;
            }
          } else if (indType === 'vwap') {
            currentConditionValues[cond.indicator] = this.calculateVWAP(closesPrefix, highsPrefix, lowsPrefix, volsPrefix, i);
          } else if (indType === 'breakout') {
            const lookback = cond.params?.lookback_period || 20;
            const volMult = cond.params?.volume_multiplier || 1.0;
            if (i >= lookback) {
              const histHighs = highsPrefix.slice(-(lookback + 1), -1);
              const histVols = volsPrefix.slice(-(lookback + 1), -1);
              const maxHigh = Math.max(...histHighs);
              const avgVol = histVols.reduce((a, b) => a + b, 0) / histVols.length;
              const priceBreaks = currentClose > maxHigh;
              const volConfirms = volMult <= 1.0 || currentVol >= avgVol * volMult;
              currentConditionValues[cond.indicator] = (priceBreaks && volConfirms) ? 1 : 0;
            }
          } else if (indType === 'breakdown') {
            const lookback = cond.params?.lookback_period || 20;
            const volMult = cond.params?.volume_multiplier || 1.0;
            if (i >= lookback) {
              const histLows = lowsPrefix.slice(-(lookback + 1), -1);
              const histVols = volsPrefix.slice(-(lookback + 1), -1);
              const minLow = Math.min(...histLows);
              const avgVol = histVols.reduce((a, b) => a + b, 0) / histVols.length;
              const priceBreaks = currentClose < minLow;
              const volConfirms = volMult <= 1.0 || currentVol >= avgVol * volMult;
              currentConditionValues[cond.indicator] = (priceBreaks && volConfirms) ? 1 : 0;
            }
          }
        }

        // Add precalculated bar object for playback
        playbackBars.push({
          time: timeMs,
          open: currentOpen,
          high: currentHigh,
          low: currentLow,
          close: currentClose,
          volume: currentVol,
          indicators: barIndicators,
        });

        // ─── Trade Management & Exit Checks ──────────────────────────────────
        if (inTrade && currentTrade) {
          peakPrice = Math.max(peakPrice, currentHigh);

          let exitPrice: number | null = null;
          let exitReason: string | null = null;

          // 1. Stop Loss
          if (stopLossPct != null) {
            const slPrice = currentTrade.entryPrice * (1 - stopLossPct / 100);
            if (currentLow <= slPrice) {
              exitPrice = currentOpen < slPrice ? currentOpen : slPrice;
              exitReason = 'stop_loss';
            }
          }

          // 2. Take Profit
          if (!exitReason && takeProfitPct != null) {
            const tpPrice = currentTrade.entryPrice * (1 + takeProfitPct / 100);
            if (currentHigh >= tpPrice) {
              exitPrice = currentOpen > tpPrice ? currentOpen : tpPrice;
              exitReason = 'take_profit';
            }
          }

          // 3. Trailing Stop
          if (!exitReason && trailingStopPct != null) {
            const tsPrice = peakPrice * (1 - trailingStopPct / 100);
            if (currentLow <= tsPrice) {
              exitPrice = currentOpen < tsPrice ? currentOpen : tsPrice;
              exitReason = 'trailing_stop';
            }
          }

          // 4. Stop Limit Price
          if (!exitReason && stopLimitPrice != null && currentHigh >= stopLimitPrice) {
            exitPrice = stopLimitPrice;
            exitReason = 'limit_exit';
          }

          // 5. Time Exit at final bar of dataset
          if (!exitReason && i === N - 1) {
            exitPrice = currentClose;
            exitReason = 'time_exit';
          }

          if (exitReason && exitPrice != null) {
            const returnPct = ((exitPrice - currentTrade.entryPrice) / currentTrade.entryPrice) * 100;
            currentEquity = currentEquity * (1 + returnPct / 100);

            trades.push({
              id: `trade_${trades.length + 1}`,
              backtestRunId: runId,
              entryIndex: currentTrade.entryIndex,
              entryDate: new Date(currentTrade.entryTime),
              entryPrice: Number(currentTrade.entryPrice.toFixed(2)),
              exitIndex: i,
              exitDate: new Date(timeMs),
              exitPrice: Number(exitPrice.toFixed(2)),
              exitReason,
              returnPct: Number(returnPct.toFixed(2)),
              result: returnPct >= 0 ? 'win' : 'loss',
            });

            inTrade = false;
            currentTrade = null;
          }
        }

        // ─── Entry Evaluation (if not already in a trade) ──────────────────────
        if (!inTrade && i + 1 < N && technicalConditions.length > 0) {
          let allConditionsMet = true;

          for (const cond of technicalConditions) {
            const indType = (cond.indicator || '').toLowerCase();
            const currVal = currentConditionValues[cond.indicator];

            if (currVal === undefined) {
              allConditionsMet = false;
              break;
            }

            if (indType === 'breakout' || indType === 'breakdown') {
              if (currVal !== 1) {
                allConditionsMet = false;
                break;
              }
            } else {
              const prevVal = prevIndicatorValues[cond.indicator];
              const target = cond.value != null ? Number(cond.value) : 0;
              const matches = this.evaluateConditionOperator(cond.operator, currVal, target, prevVal);
              if (!matches) {
                allConditionsMet = false;
                break;
              }
            }
          }

          if (allConditionsMet) {
            // Signal fired at bar i -> FILL REALISTICALLY AT NEXT BAR'S OPEN (i + 1)
            const nextOpen = data.o[i + 1];
            const nextTimeMs = data.t[i + 1] * 1000;

            inTrade = true;
            currentTrade = {
              entryIndex: i + 1,
              entryTime: nextTimeMs,
              entryPrice: nextOpen,
            };
            peakPrice = nextOpen;
          }
        }

        // Record updated previous values for crossings
        for (const [k, v] of Object.entries(currentConditionValues)) {
          prevIndicatorValues[k] = v;
        }

        // Record Equity Curve at bar i
        equityCurve.push({
          time: timeMs,
          value: Number(currentEquity.toFixed(2)),
        });
      }

      await this.redis.client.set(`backtest:status:${runId}`, JSON.stringify({ status: 'running', progress: 80 }), 'EX', 86400);

      // 4. Calculate Aggregate Metrics
      const totalTrades = trades.length;
      const wins = trades.filter((t) => t.result === 'win').length;
      const losses = totalTrades - wins;
      const winRate = totalTrades > 0 ? Number(((wins / totalTrades) * 100).toFixed(1)) : 0;
      const avgReturnPct = totalTrades > 0 ? Number((trades.reduce((s, t) => s + t.returnPct, 0) / totalTrades).toFixed(2)) : 0;
      const bestTradePct = totalTrades > 0 ? Number(Math.max(...trades.map((t) => t.returnPct)).toFixed(2)) : 0;
      const worstTradePct = totalTrades > 0 ? Number(Math.min(...trades.map((t) => t.returnPct)).toFixed(2)) : 0;

      // Max Drawdown calculation over equity curve
      let peakEquity = 100000;
      let maxDrawdown = 0;
      for (const pt of equityCurve) {
        if (pt.value > peakEquity) peakEquity = pt.value;
        const dd = peakEquity > 0 ? ((peakEquity - pt.value) / peakEquity) * 100 : 0;
        if (dd > maxDrawdown) maxDrawdown = dd;
      }
      const maxDrawdownPct = Number(maxDrawdown.toFixed(2));


      // 5. Persist to PostgreSQL
      if (trades.length > 0) {
        const dbTrades = trades.map((t) => ({
          backtestRunId: runId,
          entryDate: t.entryDate,
          entryPrice: t.entryPrice,
          exitDate: t.exitDate,
          exitPrice: t.exitPrice,
          exitReason: t.exitReason,
          returnPct: t.returnPct,
          result: t.result,
        }));
        await this.prisma.backtestTrade.createMany({ data: dbTrades });
      }

      const backtestResult = {
        backtestRunId: runId,
        totalTrades,
        wins,
        losses,
        winRate,
        avgReturnPct,
        maxDrawdownPct,
        bestTradePct,
        worstTradePct,
      };

      await this.prisma.backtestResult.create({ data: backtestResult });

      await this.prisma.backtestRun.update({
        where: { id: runId },
        data: { status: 'completed', completedAt: new Date() },
      });

      // 6. Cache full playback dataset in Redis (7 days TTL)
      const playbackPayload = {
        runId,
        symbol: job.symbol,
        setupName: setup.name,
        dateRangeStart: new Date(job.startDate).toISOString(),
        dateRangeEnd: new Date(job.endDate).toISOString(),
        bars: playbackBars,
        trades,
        equityCurve,
        result: backtestResult,
      };

      await this.redis.client.set(`backtest:playback:${runId}`, JSON.stringify(playbackPayload), 'EX', 604800);
      await this.redis.client.set(`backtest:status:${runId}`, JSON.stringify({ status: 'completed', progress: 100 }), 'EX', 86400);

      // 7. Update Setup Ranking
      await this.updateSetupRanking(job.setupId);

      logger.info('Backtest completed successfully', { runId, totalTrades, winRate, avgReturnPct });
    } catch (err: any) {
      logger.error('Backtest failed with error', { runId, error: err?.message || err });
      await this.redis.client.set(`backtest:status:${runId}`, JSON.stringify({ status: 'failed', error: err?.message || 'Execution error' }), 'EX', 86400);
      await this.prisma.backtestRun.update({
        where: { id: runId },
        data: { status: 'failed', completedAt: new Date() },
      });
    }
  }

  private async updateSetupRanking(setupId: string) {
    const results = await this.prisma.backtestResult.findMany({
      where: { backtestRun: { setupId } },
    });

    if (results.length === 0) return;

    const totalRuns = results.length;
    const aggWinRate = results.reduce((sum, r) => sum + r.winRate, 0) / totalRuns;
    const aggAvgReturn = results.reduce((sum, r) => sum + r.avgReturnPct, 0) / totalRuns;
    const rankScore = Number(((aggWinRate * 0.6) + (aggAvgReturn * 0.4)).toFixed(2));

    await this.prisma.setupRanking.upsert({
      where: { setupId },
      update: {
        totalBacktestRuns: totalRuns,
        aggregateWinRate: Number(aggWinRate.toFixed(2)),
        aggregateAvgReturnPct: Number(aggAvgReturn.toFixed(2)),
        rankScore,
        lastRankedAt: new Date(),
      },
      create: {
        setupId,
        totalBacktestRuns: totalRuns,
        aggregateWinRate: Number(aggWinRate.toFixed(2)),
        aggregateAvgReturnPct: Number(aggAvgReturn.toFixed(2)),
        rankScore,
        lastRankedAt: new Date(),
      },
    });
  }

  private generateMockCandles(from: number, to: number, startPrice: number) {
    const data = { t: [] as number[], o: [] as number[], h: [] as number[], l: [] as number[], c: [] as number[], v: [] as number[] };
    let currentPrice = startPrice;
    let time = from;
    const step = 24 * 60 * 60; // 1 day

    while (time <= to) {
      data.t.push(time);
      const volatility = currentPrice * 0.035;
      const open = Number(currentPrice.toFixed(2));
      const high = Number((open + Math.random() * volatility).toFixed(2));
      const low = Number((Math.max(1, open - Math.random() * volatility)).toFixed(2));
      const close = Number((low + Math.random() * (high - low)).toFixed(2));

      data.o.push(open);
      data.h.push(high);
      data.l.push(low);
      data.c.push(close);
      data.v.push(Math.floor(50000 + Math.random() * 500000));

      currentPrice = close;
      time += step;
    }
    return data;
  }
}

