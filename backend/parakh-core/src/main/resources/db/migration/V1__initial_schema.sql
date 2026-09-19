-- =============================================================================
-- Parakh Database Schema Migration V1
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS watchlists (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol VARCHAR(50) NOT NULL,
    CONSTRAINT uq_watchlist_user_symbol UNIQUE (user_id, symbol)
);

CREATE TABLE IF NOT EXISTS setups (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    active BOOLEAN DEFAULT false NOT NULL,
    technical_conditions JSONB NOT NULL,
    fundamental_conditions JSONB,
    fundamental_mode VARCHAR(50) DEFAULT 'display_only' NOT NULL,
    order_rule JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS setup_matches (
    id VARCHAR(36) PRIMARY KEY,
    setup_id VARCHAR(36) NOT NULL REFERENCES setups(id) ON DELETE CASCADE,
    symbol VARCHAR(50) NOT NULL,
    matched_at TIMESTAMP WITH TIME ZONE NOT NULL,
    technical_snapshot JSONB NOT NULL,
    fundamentals_snapshot JSONB,
    fundamentals_passed BOOLEAN NOT NULL,
    alert_fired BOOLEAN NOT NULL
);

CREATE TABLE IF NOT EXISTS company_fundamentals (
    id VARCHAR(36) PRIMARY KEY,
    symbol VARCHAR(50) NOT NULL UNIQUE,
    pe_ratio DOUBLE PRECISION,
    eps DOUBLE PRECISION,
    roe DOUBLE PRECISION,
    debt_to_equity DOUBLE PRECISION,
    market_cap DOUBLE PRECISION,
    sector VARCHAR(100),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS backtest_runs (
    id VARCHAR(36) PRIMARY KEY,
    setup_id VARCHAR(36) NOT NULL REFERENCES setups(id) ON DELETE CASCADE,
    symbol VARCHAR(50) NOT NULL,
    date_range_start TIMESTAMP WITH TIME ZONE NOT NULL,
    date_range_end TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' NOT NULL,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS backtest_trades (
    id VARCHAR(36) PRIMARY KEY,
    backtest_run_id VARCHAR(36) NOT NULL REFERENCES backtest_runs(id) ON DELETE CASCADE,
    entry_date TIMESTAMP WITH TIME ZONE NOT NULL,
    entry_price DOUBLE PRECISION NOT NULL,
    exit_date TIMESTAMP WITH TIME ZONE NOT NULL,
    exit_price DOUBLE PRECISION NOT NULL,
    exit_reason VARCHAR(50) NOT NULL,
    return_pct DOUBLE PRECISION NOT NULL,
    result VARCHAR(20) NOT NULL
);

CREATE TABLE IF NOT EXISTS backtest_results (
    id VARCHAR(36) PRIMARY KEY,
    backtest_run_id VARCHAR(36) NOT NULL UNIQUE REFERENCES backtest_runs(id) ON DELETE CASCADE,
    total_trades INTEGER NOT NULL,
    wins INTEGER NOT NULL,
    losses INTEGER NOT NULL,
    win_rate DOUBLE PRECISION NOT NULL,
    avg_return_pct DOUBLE PRECISION NOT NULL,
    max_drawdown_pct DOUBLE PRECISION NOT NULL,
    best_trade_pct DOUBLE PRECISION NOT NULL,
    worst_trade_pct DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS setup_rankings (
    id VARCHAR(36) PRIMARY KEY,
    setup_id VARCHAR(36) NOT NULL UNIQUE,
    total_backtest_runs INTEGER NOT NULL,
    aggregate_win_rate DOUBLE PRECISION NOT NULL,
    aggregate_avg_return_pct DOUBLE PRECISION NOT NULL,
    rank_score DOUBLE PRECISION NOT NULL,
    last_ranked_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_watchlists_user_id ON watchlists(user_id);
CREATE INDEX IF NOT EXISTS idx_setups_user_id ON setups(user_id);
CREATE INDEX IF NOT EXISTS idx_setup_matches_setup_id ON setup_matches(setup_id);
CREATE INDEX IF NOT EXISTS idx_setup_matches_matched_at ON setup_matches(matched_at DESC);
CREATE INDEX IF NOT EXISTS idx_backtest_runs_setup_id ON backtest_runs(setup_id);
CREATE INDEX IF NOT EXISTS idx_backtest_trades_run_id ON backtest_trades(backtest_run_id);
CREATE INDEX IF NOT EXISTS idx_setup_rankings_rank_score ON setup_rankings(rank_score DESC);
