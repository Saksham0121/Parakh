import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createKafkaClient, KafkaClient, KAFKA_TOPICS, evaluateCondition, createLogger } from '@parakh/common';
import type { IndicatorValueDto } from '@parakh/common';

const logger = createLogger({ service: 'setup-matcher' });

// Market data service base URL (internal Docker network)
const MARKET_DATA_URL = process.env.MARKET_DATA_SERVICE_URL || 'http://market-data-service:3000';

@Injectable()
export class SetupMatcherService implements OnModuleInit, OnModuleDestroy {
  private kafkaClient: KafkaClient;

  constructor(private prisma: PrismaService) {
    this.kafkaClient = createKafkaClient('setup-service');
  }

  async onModuleInit() {
    await this.kafkaClient.subscribe(
      'setup-matcher-group',
      [KAFKA_TOPICS.INDICATOR_UPDATES],
      async ({ message }) => {
        if (!message.value) return;
        try {
          const update: IndicatorValueDto = JSON.parse(message.value.toString());
          await this.processIndicatorUpdate(update);
        } catch (err) {
          logger.error('Error processing indicator update', { error: err });
        }
      },
    );
    logger.info('Setup matcher initialized');
  }

  async onModuleDestroy() {
    await this.kafkaClient.disconnect();
  }

  // ─── Breakout / Breakdown evaluation ───────────────────────────────────────

  private async fetchRecentBars(symbol: string, lookbackBars: number): Promise<any[]> {
    try {
      const to = Math.floor(Date.now() / 1000);
      // Approximate: each bar is ~1 day; fetch enough history
      const from = to - lookbackBars * 2 * 86400;
      const res = await fetch(
        `${MARKET_DATA_URL}/market/candles/${symbol}?resolution=D&from=${from}&to=${to}`,
      );
      if (!res.ok) return [];
      const data: any = await res.json();
      if (!data || !data.c) return [];
      // Return array of OHLCV objects (most recent last)
      return (data.t as number[]).map((_: number, i: number) => ({
        t: data.t[i],
        o: data.o[i],
        h: data.h[i],
        l: data.l[i],
        c: data.c[i],
        v: data.v[i],
      }));
    } catch {
      return [];
    }
  }

  /**
   * Breakout: current close > highest high of last `lookbackPeriod` bars (excluding current bar).
   * Optionally checks volume multiplier vs average volume over the same window.
   */
  private evaluateBreakout(bars: any[], params: any): boolean {
    const lookback = params.lookback_period || 20;
    const volMultiplier = params.volume_multiplier || 1.0;
    if (bars.length < lookback + 1) return false;

    const historicalBars = bars.slice(-(lookback + 1), -1); // excludes current bar → no look-ahead
    const currentBar = bars[bars.length - 1];

    const highestHigh = Math.max(...historicalBars.map((b: any) => b.h));
    const avgVolume = historicalBars.reduce((s: number, b: any) => s + b.v, 0) / historicalBars.length;

    const priceBreaks = currentBar.c > highestHigh;
    const volumeConfirms = volMultiplier <= 1.0 || currentBar.v >= avgVolume * volMultiplier;

    return priceBreaks && volumeConfirms;
  }

  /**
   * Breakdown: current close < lowest low of last `lookbackPeriod` bars (excluding current bar).
   */
  private evaluateBreakdown(bars: any[], params: any): boolean {
    const lookback = params.lookback_period || 20;
    const volMultiplier = params.volume_multiplier || 1.0;
    if (bars.length < lookback + 1) return false;

    const historicalBars = bars.slice(-(lookback + 1), -1);
    const currentBar = bars[bars.length - 1];

    const lowestLow = Math.min(...historicalBars.map((b: any) => b.l));
    const avgVolume = historicalBars.reduce((s: number, b: any) => s + b.v, 0) / historicalBars.length;

    const priceBreaks = currentBar.c < lowestLow;
    const volumeConfirms = volMultiplier <= 1.0 || currentBar.v >= avgVolume * volMultiplier;

    return priceBreaks && volumeConfirms;
  }

  // ─── Core evaluation logic ──────────────────────────────────────────────────

  private async evaluateTechnicalConditions(
    conditions: any[],
    update: IndicatorValueDto,
  ): Promise<{ allMatch: boolean; snapshot: any }> {
    const snapshot: any = {};
    let allMatch = true;

    for (const condition of conditions) {
      const type = (condition.indicator || '').toLowerCase();

      if (type === 'breakout' || type === 'breakdown') {
        const bars = await this.fetchRecentBars(
          update.symbol,
          (condition.params?.lookback_period || 20) + 5,
        );
        const result =
          type === 'breakout'
            ? this.evaluateBreakout(bars, condition.params || {})
            : this.evaluateBreakdown(bars, condition.params || {});

        snapshot[type] = { result, params: condition.params };
        if (!result) allMatch = false;
      } else {
        // Standard indicator condition
        if (condition.indicator !== update.indicatorType) continue;

        const rawVal = update.value;
        const val =
          typeof rawVal === 'object' && rawVal !== null
            ? (rawVal as any).value ??
              (rawVal as any).macd ??
              Object.values(rawVal)[0]
            : rawVal;

        const operator = condition.operator || '>';
        const threshold = condition.value ?? condition.threshold ?? 0;
        const isMatch = evaluateCondition(operator, val as number, threshold);

        snapshot[condition.indicator] = { val, operator, threshold, isMatch };
        if (!isMatch) allMatch = false;
      }
    }

    return { allMatch, snapshot };
  }

  private async processIndicatorUpdate(update: IndicatorValueDto) {
    const activeSetups = await this.prisma.setup.findMany({
      where: { active: true },
    });

    if (activeSetups.length === 0) return;

    for (const setup of activeSetups) {
      const conditions = setup.technicalConditions as any[];
      if (!conditions || conditions.length === 0) continue;

      const { allMatch, snapshot } = await this.evaluateTechnicalConditions(conditions, update);

      if (!allMatch) continue;

      // Determine if fundamentals pass
      const fundMode = setup.fundamentalMode || 'display_only';
      // For now, fundamentals are always considered passed unless mode is required
      // (fundamentals data from a separate service is not yet pushed to this topic)
      const fundamentalsPassed = fundMode !== 'required_for_signal'; // TODO: integrate fundamentals check

      // Persist match history (immutable snapshot) regardless of fundamentals
      try {
        await this.prisma.setupMatch.create({
          data: {
            setupId: setup.id,
            symbol: update.symbol,
            matchedAt: new Date(),
            technicalSnapshot: snapshot,
            fundamentalsPassed,
            alertFired: fundamentalsPassed,
          },
        });
      } catch (err) {
        logger.error('Failed to persist setup match', { error: err, setupId: setup.id });
      }

      // Only fire alert if fundamentals pass (or mode is display_only)
      if (fundamentalsPassed) {
        const alertEvent = {
          userId: setup.userId,
          setupId: setup.id,
          setupName: setup.name,
          symbol: update.symbol,
          conditions: conditions.map((c: any) => `${c.indicator} ${c.operator} ${c.value}`).join(' AND '),
          snapshot,
          timestamp: Date.now(),
        };

        await this.kafkaClient.publish(KAFKA_TOPICS.ALERT_FIRED, setup.userId, alertEvent);
        logger.info('Condition matched, alert fired', { setupId: setup.id, symbol: update.symbol });
      }
    }
  }
}

