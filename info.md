# Parakh: Algorithmic Trading & Backtesting Platform

**Parakh** (परख — Hindi for "to assess/evaluate") is an enterprise-grade, event-driven algorithmic trading, technical charting, and backtesting platform. It allows traders and quants to build hybrid trading setups (combining technical indicators and fundamental metrics), evaluate market data in real-time, dispatch instant alerts when conditions trigger, and simulate historical strategies with interactive visual playback.

---

## 🏗 System Architecture

The platform is designed around a high-performance **multi-module Spring Boot backend**, a responsive **Vite + React frontend**, and a production-grade **containerized data infrastructure**.

```
Parakh/
├── backend/                       # Spring Boot Multi-Module Backend (Java 21)
│   ├── parakh-common/             # Shared DTOs, models, domain entities, and utilities
│   ├── parakh-core/               # Identity (JWT), Watchlists, Setups, and Alert Engine (Port 8080)
│   └── parakh-engine/             # Live Market Data, Yahoo Finance, Candles, Indicators & Backtesting (Port 8082)
├── frontend/                      # React 19 + TypeScript + Vite + KLineCharts UI (Port 5173)
├── infra/                         # Docker Compose Infrastructure
│   ├── PostgreSQL (Port 5434)     # Relational DB (Users, Setups, Watchlists)
│   ├── TimescaleDB (Port 5433)    # Hypertable time-series data
│   ├── Redis (Port 6379)          # Low-latency caching & rate limiting
│   ├── Kafka KRaft (Port 29092)   # Event bus for streaming prices and indicators
│   ├── PgBouncer (Port 6432)      # Connection pooling
│   └── Prometheus & Grafana       # Telemetry and metrics
├── scripts/                       # Turnkey cold start and development orchestration
│   └── dev.sh                     # Automated startup script
└── legacy_archive/                # Locally preserved prototyping services (Git-ignored)
```

---

## 🛠 Technology Stack

### Backend & Analytics Engine
- **Framework:** Spring Boot 3.4.x, Spring Data JPA, Spring Security
- **Language:** Java 21 (LTS)
- **Market Data Feed:** Yahoo Finance API (real-time quotes, OHLCV historical candles, and live symbol resolution)
- **Event Streaming:** Apache Kafka (KRaft mode)
- **Security & Auth:** Stateless JWT Authentication with BCrypt password hashing

### Databases & Caching
- **PostgreSQL 16:** Relational persistence for user accounts, custom setups, order rules, and watchlist items.
- **TimescaleDB:** Time-series database optimized for storing massive volumes of financial market ticks and calculated indicators.
- **Redis 7:** High-speed in-memory caching for real-time quotes, session tokens, and fundamentals.
- **PgBouncer:** Lightweight connection pooling for PostgreSQL.

### Frontend Client
- **Framework:** React 19, TypeScript
- **Build Tool:** Vite with Rolldown compiler
- **Chart Engine:** **KLineCharts** (custom drawing overlays, multi-timeframe OHLCV, indicator panes for MA, EMA, RSI, MACD, BOLL, and KDJ)
- **State Management:** Zustand with instant local storage hydration and optimistic UI updates
- **Styling:** CSS variables design system with dark TradingView-inspired aesthetic

---

## 🚀 Key Platform Features

1. **Comprehensive Stock Discovery & Indian Market Support**:
   - Built-in recognition and prioritization for Indian equities (NSE `.NS` and BSE `.BO`) such as `RELIANCE.NS`, `TCS.NS`, `HDFCBANK.NS`, `INFY.NS`, and `TATAMOTORS.NS`.
   - Live international symbol resolution via Yahoo Finance search API for US equities (`AAPL`, `NVDA`, `MSFT`) and cryptocurrencies (`BINANCE:BTCUSDT`).

2. **Professional Interactive Charting**:
   - Candlestick, Line, and Area visualization powered by KLineCharts.
   - Comprehensive drawing suite: Trend lines, Segments, Rays, Horizontal Support/Resistance levels, Price lines, Fibonacci Retracements, Rectangle/Supply-Demand zones, and Annotations.
   - Draggable quick-tools palette with favorite tools and keyboard navigation (`Escape`, `Delete`).

3. **Hybrid Setup Builder**:
   - Construct rules combining **Technical conditions** (e.g., RSI < 30, SMA(20) crosses above SMA(50), Volume > 1.5x) with **Fundamental thresholds** (e.g., P/E < 25, Market Cap > 100B, Debt/Equity < 1.0).
   - Attach order management rules: Stop Loss, Take Profit, and Trailing Stops.

4. **Interactive Historical Backtest Playback**:
   - Simulate strategy performance across historical dates.
   - Step-by-step visual trade replay displaying entry and exit markers, cumulative PnL, win/loss rates, and max drawdown.

5. **Watchlist Resilience**:
   - Zero-latency optimistic updates backed by local storage caching, ensuring watchlists remain intact even through server restarts or offline sessions.

---

## 🚦 Getting Started

### Prerequisites
- Java 21 JDK
- Node.js 20+ & npm
- Maven 3.9+
- Docker Desktop

### Turnkey One-Command Launch
```bash
npm run dev
```

The startup script (`scripts/dev.sh`) automatically:
1. Validates local environment configuration (`.env`).
2. Starts containerized dependencies (`postgres`, `timescaledb`, `redis`, `kafka`).
3. Bootstraps schemas and seeds default admin credentials.
4. Concurrently launches `parakh-core` (8080), `parakh-engine` (8082), and the `frontend` (5173).

### Default Test Credentials
- **Email:** `admin@parakh.com`
- **Password:** `password123`
