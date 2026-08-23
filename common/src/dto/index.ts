// --- User DTOs ---

export interface CreateUserDto {
  email: string;
  password: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface UserResponseDto {
  id: string;
  email: string;
  createdAt: Date;
}

export interface AuthResponseDto {
  accessToken: string;
  user: UserResponseDto;
}

// --- Watchlist DTOs ---

export interface AddWatchlistDto {
  symbol: string;
}

export interface WatchlistItemDto {
  id: string;
  userId: string;
  symbol: string;
}

// --- Price DTOs ---

export interface PriceTickDto {
  symbol: string;
  price: number;
  volume: number;
  timestamp: number;
}

export interface CandleDto {
  time: Date;
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// --- Indicator DTOs ---

export interface IndicatorParamsDto {
  period?: number;
  fastPeriod?: number;
  slowPeriod?: number;
  signalPeriod?: number;
  stdDev?: number;
  [key: string]: number | undefined;
}

export interface IndicatorValueDto {
  symbol: string;
  indicatorType: string;
  params: IndicatorParamsDto;
  value: number | Record<string, number>; // MACD returns { macd, signal, histogram }
  timestamp: number;
}

// --- Setup DTOs ---

export interface TechnicalConditionDto {
  indicator: string;
  params: IndicatorParamsDto;
  operator: string;
  value: number;
}

export interface FundamentalConditionDto {
  metric: string;
  operator: string;
  value: number;
}

export interface OrderRuleDto {
  stopLossPct?: number;
  stopLimitPrice?: number;
  takeProfitPct?: number;
  trailingStopPct?: number;
  timeInForce: 'GTC' | 'IOC';
}

export interface CreateSetupDto {
  name: string;
  technicalConditions: TechnicalConditionDto[];
  fundamentalConditions?: FundamentalConditionDto[];
  fundamentalMode?: 'display_only' | 'required_for_signal';
  orderRule?: OrderRuleDto;
}

export interface SetupResponseDto {
  id: string;
  userId: string;
  name: string;
  active: boolean;
  technicalConditions: TechnicalConditionDto[];
  fundamentalConditions: FundamentalConditionDto[];
  fundamentalMode: string;
  orderRule: OrderRuleDto | null;
  createdAt: Date;
  updatedAt: Date;
}

// --- Alert DTOs ---

export interface SetupMatchDto {
  setupId: string;
  symbol: string;
  matchedAt: Date;
  technicalSnapshot: Record<string, unknown>;
  fundamentalsSnapshot: Record<string, unknown> | null;
  fundamentalsPassed: boolean;
  alertFired: boolean;
}

export interface AlertNotificationDto {
  userId: string;
  email: string;
  setupName: string;
  symbol: string;
  matchedAt: Date;
  technicalSnapshot: Record<string, unknown>;
  fundamentalsSnapshot: Record<string, unknown> | null;
  fundamentalsPassed: boolean;
}

// --- Backtest DTOs ---

export interface CreateBacktestDto {
  setupId: string;
  symbol: string;
  dateRangeStart: Date;
  dateRangeEnd: Date;
}

export interface BacktestTradeDto {
  entryDate: Date;
  entryPrice: number;
  exitDate: Date;
  exitPrice: number;
  exitReason: 'stop_loss' | 'take_profit' | 'trailing_stop' | 'time_exit';
  returnPct: number;
  result: 'win' | 'loss';
}

export interface BacktestResultDto {
  backtestRunId: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgReturnPct: number;
  maxDrawdownPct: number;
  bestTradePct: number;
  worstTradePct: number;
}

export interface SetupRankingDto {
  setupId: string;
  setupName: string;
  totalBacktestRuns: number;
  aggregateWinRate: number;
  aggregateAvgReturnPct: number;
  rankScore: number;
  lastRankedAt: Date;
}

// --- Fundamentals DTOs ---

export interface CompanyFundamentalsDto {
  symbol: string;
  peRatio: number | null;
  eps: number | null;
  roe: number | null;
  debtToEquity: number | null;
  marketCap: number | null;
  sector: string | null;
  updatedAt: Date;
}
