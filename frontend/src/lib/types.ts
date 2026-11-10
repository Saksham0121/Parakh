export interface Candles {
  t: number[]; o: number[]; h: number[]; l: number[]; c: number[]; v: number[];
  symbol?: string; currency?: string; exchange?: string;
}

export interface Quote {
  symbol: string; c: number; price: number; d: number; dp: number; h: number; l: number; o: number; pc: number;
  v?: number; high52?: number; low52?: number; currency?: string; exchange?: string; name?: string; t: number;
}

export interface Fundamentals {
  symbol: string; name: string; currency: string; sector: string; industry: string;
  metrics: Record<string, number>; asOf: number; source: string;
}

export interface TechnicalCondition {
  indicator: string;
  params?: Record<string, number>;
  operator?: string;
  value?: number;
  compareTo?: 'value' | 'indicator';
  compareIndicator?: string;
  compareParams?: Record<string, number>;
  logic?: 'AND' | 'OR';
}

export interface FundamentalCondition {
  metric: string;
  operator: string;
  value: number;
}

export interface OrderRule {
  side?: 'LONG' | 'SHORT';
  stopLossPct?: number | null;
  takeProfitPct?: number | null;
  trailingStopPct?: number | null;
  maxHoldBars?: number | null;
}

export interface SetupInput {
  name: string;
  technicalConditions: TechnicalCondition[];
  fundamentalConditions: FundamentalCondition[];
  fundamentalMode: 'required_for_signal' | 'display_only';
  orderRule: OrderRule;
  timeframe: string;
  universe: string[];
}

export interface Setup extends SetupInput {
  id: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  setupMatches?: Array<{ id: string; symbol: string; matchedAt: string }>;
}

export interface ConditionResult {
  label: string; passed: boolean; actual: number | null; target: number | null; detail: string | null;
}

export interface ScanRow {
  symbol: string; matched: boolean; technicalPassed: boolean; fundamentalsPassed: boolean; fundamentalsChecked: boolean;
  close: number | null; changePct: number | null; barTime: number | null;
  technical: ConditionResult[]; fundamental: ConditionResult[]; error: string | null;
}

export interface ScanResponse {
  setupId?: string; setupName?: string; timeframe: string; fundamentalsRequired: boolean;
  scanned: number; matched: number; durationMs: number; results: ScanRow[];
}

export interface Alert {
  id: string; setupId: string; setupName: string; symbol: string; matchedAt: string;
  technicalSnapshot: { close?: number; changePct?: number; timeframe?: string; conditions?: ConditionResult[] };
  fundamentalsSnapshot: { conditions?: ConditionResult[] };
  fundamentalsPassed: boolean;
}

export interface BacktestTrade {
  side: 'LONG' | 'SHORT'; entryTime: number; entryPrice: number; exitTime: number; exitPrice: number;
  exitReason: string; returnPct: number; pnl: number; barsHeld: number; entryIndex: number; exitIndex: number;
  result: 'win' | 'loss'; equityAfter: number;
}

export interface BacktestStats {
  totalTrades: number; wins: number; losses: number; winRate: number; avgReturnPct: number; avgWinPct: number;
  avgLossPct: number; bestTradePct: number; worstTradePct: number; profitFactor: number | null; totalReturnPct: number;
  buyHoldReturnPct: number; maxDrawdownPct: number; sharpe: number; avgBarsHeld: number; exposurePct: number; finalEquity: number;
}

export interface BacktestPlayback {
  runId: string; setupId: string; setupName: string; symbol: string; timeframe: string; side: string;
  dateRangeStart: string; dateRangeEnd: string; initialCapital: number; commissionPct: number;
  bars: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>;
  trades: BacktestTrade[];
  equityCurve: Array<{ time: number; value: number }>;
  result: BacktestStats;
  fundamentals?: { passed: boolean; dataAvailable: boolean; applied: boolean; note: string; conditions: ConditionResult[] } | null;
}

export interface BacktestRunSummary {
  runId: string; setupId: string; symbol: string; status: string; requestedAt: string;
  dateRangeStart: string; dateRangeEnd: string;
  result?: { totalTrades: number; winRate: number; avgReturnPct: number; maxDrawdownPct: number };
}
