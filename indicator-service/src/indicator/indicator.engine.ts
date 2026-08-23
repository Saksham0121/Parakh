import { SMA, EMA, RSI, MACD, BollingerBands, Stochastic, ATR, VWAP } from 'technicalindicators';
import { INDICATOR_TYPES } from '@parakh/common';
import type { IndicatorParamsDto } from '@parakh/common';

/**
 * Technical indicator computation engine.
 * Wraps the technicalindicators library with a unified interface.
 * All parameters are configurable per the project spec.
 */
export class IndicatorEngine {
  /**
   * Compute an indicator given price data and parameters.
   * Returns the latest computed value(s).
   */
  static compute(
    indicatorType: string,
    closes: number[],
    params: IndicatorParamsDto,
    highs?: number[],
    lows?: number[],
    volumes?: number[],
  ): number | Record<string, number> | null {
    try {
      switch (indicatorType) {
        case INDICATOR_TYPES.SMA: {
          const period = params.period || 14;
          const result = SMA.calculate({ period, values: closes });
          return result.length > 0 ? result[result.length - 1] : null;
        }

        case INDICATOR_TYPES.EMA: {
          const period = params.period || 14;
          const result = EMA.calculate({ period, values: closes });
          return result.length > 0 ? result[result.length - 1] : null;
        }

        case INDICATOR_TYPES.RSI: {
          const period = params.period || 14;
          const result = RSI.calculate({ period, values: closes });
          return result.length > 0 ? result[result.length - 1] : null;
        }

        case INDICATOR_TYPES.MACD: {
          const fastPeriod = params.fastPeriod || 12;
          const slowPeriod = params.slowPeriod || 26;
          const signalPeriod = params.signalPeriod || 9;
          const result = MACD.calculate({
            fastPeriod,
            slowPeriod,
            signalPeriod,
            SimpleMAOscillator: false,
            SimpleMASignal: false,
            values: closes,
          });
          if (result.length === 0) return null;
          const last = result[result.length - 1];
          return {
            macd: last.MACD ?? 0,
            signal: last.signal ?? 0,
            histogram: last.histogram ?? 0,
          };
        }

        case INDICATOR_TYPES.BOLLINGER_BANDS: {
          const period = params.period || 20;
          const stdDev = params.stdDev || 2;
          const result = BollingerBands.calculate({
            period,
            stdDev,
            values: closes,
          });
          if (result.length === 0) return null;
          const last = result[result.length - 1];
          return {
            upper: last.upper,
            middle: last.middle,
            lower: last.lower,
          };
        }

        case INDICATOR_TYPES.STOCHASTIC: {
          if (!highs || !lows) return null;
          const period = params.period || 14;
          const signalPeriod = params.signalPeriod || 3;
          const result = Stochastic.calculate({
            high: highs,
            low: lows,
            close: closes,
            period,
            signalPeriod,
          });
          if (result.length === 0) return null;
          const last = result[result.length - 1];
          return { k: last.k, d: last.d };
        }

        case INDICATOR_TYPES.ATR: {
          if (!highs || !lows) return null;
          const period = params.period || 14;
          const result = ATR.calculate({
            high: highs,
            low: lows,
            close: closes,
            period,
          });
          return result.length > 0 ? result[result.length - 1] : null;
        }

        case INDICATOR_TYPES.VWAP: {
          if (!highs || !lows || !volumes) return null;
          const result = VWAP.calculate({
            high: highs,
            low: lows,
            close: closes,
            volume: volumes,
          });
          return result.length > 0 ? result[result.length - 1] : null;
        }

        default:
          return null;
      }
    } catch {
      return null;
    }
  }
}
