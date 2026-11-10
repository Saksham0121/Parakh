import type { SetupInput, TechnicalCondition } from './types';

export interface ParamDef { key: string; label: string; def: number; step?: number; min?: number }
export interface IndicatorDef { id: string; label: string; group: 'Price' | 'Trend' | 'Momentum' | 'Volatility' | 'Volume' | 'Pattern'; params: ParamDef[]; pattern?: boolean; hint?: string }

const P = (key: string, label: string, def: number, step = 1, min = 1): ParamDef => ({ key, label, def, step, min });
const period = (def: number) => [P('period', 'Period', def)];
const macdP = [P('fastPeriod', 'Fast', 12), P('slowPeriod', 'Slow', 26), P('signalPeriod', 'Signal', 9)];
const bbP = [P('period', 'Period', 20), P('stdDev', 'Std dev', 2, 0.5, 0.5)];

export const INDICATORS: IndicatorDef[] = [
  { id: 'BREAKOUT', label: 'Breakout above N-bar high', group: 'Pattern', pattern: true, params: [P('lookback', 'Lookback bars', 20), P('volumeMultiplier', 'Min volume × avg', 1.5, 0.1, 0)], hint: 'Close above the highest high of the previous N bars. Set volume to 0 to ignore it.' },
  { id: 'BREAKDOWN', label: 'Breakdown below N-bar low', group: 'Pattern', pattern: true, params: [P('lookback', 'Lookback bars', 20), P('volumeMultiplier', 'Min volume × avg', 1.5, 0.1, 0)], hint: 'Close below the lowest low of the previous N bars.' },
  { id: 'VOLUME_SPIKE', label: 'Volume spike', group: 'Pattern', pattern: true, params: [P('lookback', 'Average of bars', 20), P('volumeMultiplier', 'At least × avg', 2, 0.1, 1)], hint: 'Volume at least N times its recent average.' },
  { id: 'PRICE', label: 'Price (close)', group: 'Price', params: [] },
  { id: 'CHANGE_PCT', label: 'Change %', group: 'Price', params: [P('period', 'Over bars', 1)] },
  { id: 'SMA', label: 'SMA', group: 'Trend', params: period(20) },
  { id: 'EMA', label: 'EMA', group: 'Trend', params: period(20) },
  { id: 'BB_UPPER', label: 'Bollinger upper', group: 'Volatility', params: bbP },
  { id: 'BB_MIDDLE', label: 'Bollinger middle', group: 'Volatility', params: bbP },
  { id: 'BB_LOWER', label: 'Bollinger lower', group: 'Volatility', params: bbP },
  { id: 'ATR', label: 'ATR', group: 'Volatility', params: period(14) },
  { id: 'RSI', label: 'RSI', group: 'Momentum', params: period(14) },
  { id: 'MACD', label: 'MACD line', group: 'Momentum', params: macdP },
  { id: 'MACD_SIGNAL', label: 'MACD signal', group: 'Momentum', params: macdP },
  { id: 'MACD_HIST', label: 'MACD histogram', group: 'Momentum', params: macdP },
  { id: 'STOCH_K', label: 'Stochastic %K', group: 'Momentum', params: [P('period', 'Period', 14), P('smooth', 'Smooth', 3)] },
  { id: 'STOCH_D', label: 'Stochastic %D', group: 'Momentum', params: [P('period', 'Period', 14), P('smooth', 'Smooth', 3)] },
  { id: 'VOLUME', label: 'Volume', group: 'Volume', params: [] },
  { id: 'VOLUME_SMA', label: 'Volume SMA', group: 'Volume', params: period(20) },
];

export const indicatorDef = (id: string) => INDICATORS.find((i) => i.id === id) ?? INDICATORS[3];

export const OPERATORS = [
  { id: 'gt', label: 'is above' },
  { id: 'lt', label: 'is below' },
  { id: 'gte', label: 'is at least' },
  { id: 'lte', label: 'is at most' },
  { id: 'crosses_above', label: 'crosses above' },
  { id: 'crosses_below', label: 'crosses below' },
];

export interface MetricDef { id: string; label: string; op: string; def: number; unit?: string; hint?: string }
export const METRICS: MetricDef[] = [
  { id: 'pe_ratio', label: 'P/E ratio', op: 'lt', def: 30, hint: 'Trailing twelve months' },
  { id: 'forward_pe', label: 'Forward P/E', op: 'lt', def: 25 },
  { id: 'pb_ratio', label: 'Price / Book', op: 'lt', def: 5 },
  { id: 'peg_ratio', label: 'PEG ratio', op: 'lt', def: 1.5 },
  { id: 'roe', label: 'Return on equity', op: 'gt', def: 15, unit: '%' },
  { id: 'roa', label: 'Return on assets', op: 'gt', def: 5, unit: '%' },
  { id: 'debt_to_equity', label: 'Debt / Equity', op: 'lt', def: 1 },
  { id: 'profit_margin', label: 'Net profit margin', op: 'gt', def: 10, unit: '%' },
  { id: 'revenue_growth', label: 'Revenue growth (YoY)', op: 'gt', def: 10, unit: '%' },
  { id: 'earnings_growth', label: 'Earnings growth (YoY)', op: 'gt', def: 10, unit: '%' },
  { id: 'eps', label: 'EPS', op: 'gt', def: 0 },
  { id: 'dividend_yield', label: 'Dividend yield', op: 'gt', def: 1, unit: '%' },
  { id: 'current_ratio', label: 'Current ratio', op: 'gt', def: 1.2 },
  { id: 'market_cap_cr', label: 'Market cap', op: 'gt', def: 5000, unit: 'Cr' },
  { id: 'market_cap_bn', label: 'Market cap', op: 'gt', def: 2, unit: 'Bn' },
  { id: 'avg_volume', label: 'Average daily volume', op: 'gt', def: 500000 },
  { id: 'beta', label: 'Beta', op: 'lt', def: 1.5 },
  { id: 'pct_from_52w_high', label: '% below 52-week high', op: 'lt', def: 15, unit: '%' },
];
export const metricDef = (id: string) => METRICS.find((m) => m.id === id) ?? METRICS[0];
export const metricLabel = (id: string) => { const m = metricDef(id); return m.unit && !['%'].includes(m.unit) ? `${m.label} (${m.unit})` : m.unit ? `${m.label} ${m.unit}` : m.label; };

export const TIMEFRAMES = [
  { id: '5', label: '5m', long: '5 minutes' },
  { id: '15', label: '15m', long: '15 minutes' },
  { id: '30', label: '30m', long: '30 minutes' },
  { id: '60', label: '1h', long: '1 hour' },
  { id: 'D', label: '1D', long: 'Daily' },
  { id: 'W', label: '1W', long: 'Weekly' },
  { id: 'M', label: '1M', long: 'Monthly' },
];
export const tfLabel = (id: string) => TIMEFRAMES.find((t) => t.id === id)?.label ?? id;

export function defaultParams(id: string): Record<string, number> {
  return Object.fromEntries(indicatorDef(id).params.map((p) => [p.key, p.def]));
}

export function newCondition(indicator = 'RSI'): TechnicalCondition {
  return { indicator, params: defaultParams(indicator), operator: 'gt', value: indicator === 'RSI' ? 50 : 0, compareTo: 'value', logic: 'AND' };
}

const cond = (c: TechnicalCondition): TechnicalCondition => ({ compareTo: 'value', logic: 'AND', ...c });

export const TEMPLATES: Array<{ name: string; blurb: string; setup: Omit<SetupInput, 'universe'> }> = [
  {
    name: 'Breakout with sane valuation',
    blurb: '20-day high on 1.5× volume, P/E < 30, ROE > 15%, D/E < 1',
    setup: {
      name: 'Breakout + quality', timeframe: 'D', fundamentalMode: 'required_for_signal',
      technicalConditions: [
        cond({ indicator: 'BREAKOUT', params: { lookback: 20, volumeMultiplier: 1.5 } }),
        cond({ indicator: 'PRICE', operator: 'gt', compareTo: 'indicator', compareIndicator: 'SMA', compareParams: { period: 50 } }),
      ],
      fundamentalConditions: [
        { metric: 'pe_ratio', operator: 'lt', value: 30 },
        { metric: 'roe', operator: 'gt', value: 15 },
        { metric: 'debt_to_equity', operator: 'lt', value: 1 },
      ],
      orderRule: { side: 'LONG', stopLossPct: 5, takeProfitPct: 15, trailingStopPct: null, maxHoldBars: 40 },
    },
  },
  {
    name: 'Golden cross',
    blurb: 'SMA 50 crosses above SMA 200',
    setup: {
      name: 'Golden cross', timeframe: 'D', fundamentalMode: 'display_only',
      technicalConditions: [cond({ indicator: 'SMA', params: { period: 50 }, operator: 'crosses_above', compareTo: 'indicator', compareIndicator: 'SMA', compareParams: { period: 200 } })],
      fundamentalConditions: [],
      orderRule: { side: 'LONG', stopLossPct: 8, takeProfitPct: null, trailingStopPct: 10, maxHoldBars: null },
    },
  },
  {
    name: 'RSI oversold bounce',
    blurb: 'RSI(14) crosses back above 30 while price holds above SMA 200',
    setup: {
      name: 'RSI oversold bounce', timeframe: 'D', fundamentalMode: 'display_only',
      technicalConditions: [
        cond({ indicator: 'RSI', params: { period: 14 }, operator: 'crosses_above', value: 30 }),
        cond({ indicator: 'PRICE', operator: 'gt', compareTo: 'indicator', compareIndicator: 'SMA', compareParams: { period: 200 } }),
      ],
      fundamentalConditions: [],
      orderRule: { side: 'LONG', stopLossPct: 4, takeProfitPct: 8, trailingStopPct: null, maxHoldBars: 20 },
    },
  },
  {
    name: 'MACD momentum',
    blurb: 'MACD crosses above its signal line, above zero',
    setup: {
      name: 'MACD momentum', timeframe: 'D', fundamentalMode: 'display_only',
      technicalConditions: [
        cond({ indicator: 'MACD', params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }, operator: 'crosses_above', compareTo: 'indicator', compareIndicator: 'MACD_SIGNAL', compareParams: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } }),
        cond({ indicator: 'MACD', params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }, operator: 'gt', value: 0 }),
      ],
      fundamentalConditions: [],
      orderRule: { side: 'LONG', stopLossPct: 5, takeProfitPct: 10, trailingStopPct: null, maxHoldBars: 30 },
    },
  },
  {
    name: 'Breakdown short',
    blurb: '20-day low on heavy volume, below SMA 50',
    setup: {
      name: 'Breakdown short', timeframe: 'D', fundamentalMode: 'display_only',
      technicalConditions: [
        cond({ indicator: 'BREAKDOWN', params: { lookback: 20, volumeMultiplier: 1.5 } }),
        cond({ indicator: 'PRICE', operator: 'lt', compareTo: 'indicator', compareIndicator: 'SMA', compareParams: { period: 50 } }),
      ],
      fundamentalConditions: [],
      orderRule: { side: 'SHORT', stopLossPct: 4, takeProfitPct: 10, trailingStopPct: null, maxHoldBars: 20 },
    },
  },
];

export function describeCondition(c: TechnicalCondition): string {
  const def = indicatorDef(c.indicator);
  const name = (id: string, p?: Record<string, number>) => {
    const d = indicatorDef(id);
    if (id === 'PRICE') return 'Close';
    if (['SMA', 'EMA', 'RSI', 'ATR', 'VOLUME_SMA'].includes(id)) return `${d.label}(${p?.period ?? d.params[0]?.def})`;
    return d.label;
  };
  if (def.pattern) {
    const lb = c.params?.lookback ?? 20;
    const vm = c.params?.volumeMultiplier ?? 0;
    if (c.indicator === 'VOLUME_SPIKE') return `Volume ≥ ${vm}× ${lb}-bar avg`;
    return `${c.indicator === 'BREAKOUT' ? 'Breakout ↑' : 'Breakdown ↓'} ${lb}-bar ${c.indicator === 'BREAKOUT' ? 'high' : 'low'}${vm > 0 ? ` · vol ${vm}×` : ''}`;
  }
  const op = OPERATORS.find((o) => o.id === c.operator)?.label ?? String(c.operator ?? '').toLowerCase().replace(/_/g, ' ');
  const rhs = c.compareTo === 'indicator' && c.compareIndicator ? name(c.compareIndicator, c.compareParams) : typeof c.value === 'number' ? String(c.value) : '—';
  return `${name(c.indicator, c.params)} ${op} ${rhs}`;
}
