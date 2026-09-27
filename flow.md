# Parakh — Project Architecture & Data Flow

This document tracks the architecture, runtime components, and data flows of the Parakh trading intelligence platform.

---

## 1. System Overview

Parakh is organized into three primary operational pillars:

```
Parakh/
├── backend/             # High-performance multi-module Spring Boot application
│   ├── parakh-common/   # Shared DTOs, domain models, entity enums, and utility constants
│   ├── parakh-core/     # Spring Boot API Gateway, Auth (JWT), Watchlists, Setups, and Alert Management (Port 8080)
│   └── parakh-engine/   # Market data ingestion (Yahoo Finance / Finnhub), Candlestick streaming, Indicator & Backtest Engine (Port 8082)
├── frontend/            # High-performance Trading UI (React 19 + TypeScript + Vite + KLineCharts) (Port 5173)
├── infra/               # Production-grade infrastructure (Docker Compose)
│   ├── PostgreSQL (5434), TimescaleDB (5433), Redis (6379), Kafka KRaft (29092)
│   └── PgBouncer, Prometheus, Grafana, Nginx, Vector
└── legacy_archive/      # Preserved local archive of initial prototyping services (excluded from Git)
```

---

## 2. Infrastructure & Runtime Topology

```
                                  ┌─────────────────────────────┐
                                  │      Client Web Browser     │
                                  │   (React + KLineCharts UI)  │
                                  └──────────────┬──────────────┘
                                                 │
                                 HTTP / REST & WebSocket / Vite Proxy
                                                 │
                         ┌───────────────────────┴───────────────────────┐
                         │                                               │
                         ▼ (port 8080)                                   ▼ (port 8082)
              ┌───────────────────────────┐                   ┌───────────────────────────┐
              │        parakh-core        │                   │       parakh-engine       │
              │  - User Auth & JWT        │                   │  - Market Data & Quote    │
              │  - Watchlist Store (Sync) │                   │  - Real-time Candles      │
              │  - Setup Management       │                   │  - Historical Backtesting │
              │  - Alert Subscriptions   │                   │  - Technical Indicators   │
              └──────────────┬────────────┘                   └──────────────┬────────────┘
                             │                                               │
               ┌─────────────┴─────────────┐                   ┌─────────────┴─────────────┐
               ▼                           ▼                   ▼                           ▼
        ┌─────────────┐             ┌─────────────┐     ┌─────────────┐             ┌─────────────┐
        │ PostgreSQL  │             │    Redis    │     │ TimescaleDB │             │ Apache Kafka│
        │ (Relational)│             │ (Fast Cache)│     │(Time-series)│             │(Event Bus)  │
        └─────────────┘             └─────────────┘     └─────────────┘             └─────────────┘
```

---

## 3. Core Data Flows

### A. Live Market Data & Candlestick Streaming
1. **Search & Discovery**:
   - Operator types a ticker (e.g. `RELIANCE`, `TCS`, `AAPL`, `NVDA`) in the dashboard search bar.
   - Frontend calls `GET /api/market/search?q={query}` via Vite proxy to `parakh-engine`.
   - `parakh-engine` first queries its curated Indian equity database (`INDIAN_EQUITY_MASTER`), resolves symbols with proper exchange tags (`.NS`, `.BO`), queries Yahoo Finance live search API, and returns an ordered list prioritizing Indian equities followed by global assets.
2. **Candles & Chart Ingestion**:
   - When a symbol is selected, `Chart.tsx` calls `GET /api/market/candles/{symbol}?resolution={res}`.
   - `parakh-engine` fetches data from Yahoo Finance API / local cache, converts epoch timestamps to milliseconds, and hands structured OHLCV arrays directly to **KLineCharts**.
3. **Live Price Polling & WebSockets**:
   - Background quotes continuously refresh active tickers with zero-latency updates reflected on ticker tabs, watchlist items, and the main chart header.

### B. Watchlist Resilience & Hydration Flow
```
App Launch / Reload
       │
       ▼
Hydrate from LocalStorage (Instant UI paint with top Indian tickers fallback)
       │
       ▼
Async Fetch to Backend (/api/watchlist)
       │
       ├─► Success & Non-Empty: Sync DB IDs to LocalStorage & State
       └─► Offline / Error: Gracefully preserve existing LocalStorage entries
```

### C. Strategy Setup & Alert Evaluation Flow
1. **Setup Builder**:
   - Operators combine **Technical conditions** (SMA, EMA, RSI, MACD, Volume, Breakouts) and **Fundamental criteria** (P/E ratio, Market Cap, Debt-to-Equity).
   - Setups include execution order rules (Stop Loss, Take Profit, Trailing Stop) saved to PostgreSQL.
2. **Backtesting Pipeline**:
   - `BacktestDashboard` sends strategy parameters and date ranges to `POST /api/backtests`.
   - `parakh-engine` simulates bar-by-bar execution against historical data, records simulated trades, calculates Sharpe ratio, max drawdown, and equity curves.
   - Frontend renders step-by-step interactive candlestick playback with animated trade markers and equity charts.

---

## 4. Development & Cold Start Flow

Run a single turnkey command to launch the entire system:
```bash
npm run dev
```

1. Verifies local `.env` and port mappings (PostgreSQL on port 5434).
2. Verifies Docker daemon status and spins up containerized dependencies (`postgres`, `timescaledb`, `redis`, `kafka`, `pgbouncer`).
3. Verifies Flyway migrations and schema initialization in `parakh-core`.
4. Spawns `parakh-core`, `parakh-engine`, and the Vite React frontend concurrently with synchronized shutdown handling.
