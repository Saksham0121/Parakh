// @parakh/common — shared utilities for all Parakh services

// Constants
export {
  KAFKA_TOPICS,
  INDICATOR_TYPES,
  OPERATORS,
  FUNDAMENTAL_METRICS,
  FUNDAMENTAL_MODES,
  TIME_IN_FORCE,
  SERVICE_PORTS,
} from './constants';

// DTOs
export type {
  CreateUserDto,
  LoginDto,
  UserResponseDto,
  AuthResponseDto,
  AddWatchlistDto,
  WatchlistItemDto,
  PriceTickDto,
  CandleDto,
  IndicatorParamsDto,
  IndicatorValueDto,
  TechnicalConditionDto,
  FundamentalConditionDto,
  OrderRuleDto,
  CreateSetupDto,
  SetupResponseDto,
  SetupMatchDto,
  AlertNotificationDto,
  CreateBacktestDto,
  BacktestTradeDto,
  BacktestResultDto,
  SetupRankingDto,
  CompanyFundamentalsDto,
} from './dto';

// Kafka
export { KafkaClient, createKafkaClient } from './kafka';
export type { KafkaClientOptions } from './kafka';

// Logger
export { createLogger, generateCorrelationId } from './logger';
export type { LoggerOptions } from './logger';

// Condition Matcher
export {
  evaluateCondition,
  evaluateCrossingCondition,
  evaluateTechnicalConditions,
  evaluateFundamentalConditions,
} from './condition-matcher';

// Metrics
export * from './metrics';

// Tracing
export * from './tracing';
