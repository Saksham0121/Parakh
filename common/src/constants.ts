// Kafka topic names — single source of truth across all services
export const KAFKA_TOPICS = {
  PRICE_TICKS: 'price-ticks',
  INDICATOR_UPDATES: 'indicator-updates',
  SETUP_TRIGGERED: 'setup-triggered',
  ALERT_FIRED: 'alert-fired',
  NOTIFICATION_JOBS: 'notification-jobs',
  BACKTEST_JOBS: 'backtest-jobs',
} as const;

// Supported indicator types
export const INDICATOR_TYPES = {
  SMA: 'SMA',
  EMA: 'EMA',
  RSI: 'RSI',
  MACD: 'MACD',
  BOLLINGER_BANDS: 'BOLLINGER_BANDS',
  STOCHASTIC: 'STOCHASTIC',
  ATR: 'ATR',
  VWAP: 'VWAP',
} as const;

// Comparison operators for setup conditions
export const OPERATORS = {
  GREATER_THAN: 'gt',
  LESS_THAN: 'lt',
  GREATER_EQUAL: 'gte',
  LESS_EQUAL: 'lte',
  EQUALS: 'eq',
  CROSSES_ABOVE: 'crosses_above',
  CROSSES_BELOW: 'crosses_below',
} as const;

// Fundamental metrics
export const FUNDAMENTAL_METRICS = {
  PE_RATIO: 'pe_ratio',
  EPS: 'eps',
  ROE: 'roe',
  DEBT_TO_EQUITY: 'debt_to_equity',
  MARKET_CAP: 'market_cap',
} as const;

// Setup fundamental mode
export const FUNDAMENTAL_MODES = {
  DISPLAY_ONLY: 'display_only',
  REQUIRED_FOR_SIGNAL: 'required_for_signal',
} as const;

// Order time-in-force
export const TIME_IN_FORCE = {
  GTC: 'GTC', // Good 'til cancelled
  IOC: 'IOC', // Immediate or cancel
} as const;

// Service ports
export const SERVICE_PORTS = {
  API_GATEWAY: 3000,
  USER_SERVICE: 3001,
  MARKET_DATA_SERVICE: 3002,
  INDICATOR_SERVICE: 3003,
  SETUP_SERVICE: 3004,
  ALERT_SERVICE: 3005,
  BACKTEST_SERVICE: 3007,
  FUNDAMENTALS_SERVICE: 3006,
  NOTIFICATION_SERVICE: 3008,
  WEBSOCKET_GATEWAY: 3009,
} as const;
