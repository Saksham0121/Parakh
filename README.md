# 🚀 Parakh — Enterprise-Grade Algorithmic Trading Platform

<div align="center">

**Parakh** (परख — *"to evaluate / test"*) is a high-throughput, event-driven algorithmic trading, technical charting, and backtesting platform built on a modern **Spring Boot + React + Kafka** architecture.

[![Java](https://img.shields.io/badge/Java-21%20LTS-orange.svg)](https://www.oracle.com/java/)
[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.4.x-brightgreen.svg)](https://spring.io/projects/spring-boot)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Kafka](https://img.shields.io/badge/Apache%20Kafka-KRaft-black.svg)](https://kafka.apache.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue.svg)](https://www.postgresql.org/)

</div>

---

## 🏗 Architecture Overview

Parakh is built around three core pillars: a high-throughput **Spring Boot multi-module backend**, a fast **Vite + React frontend**, and a production **containerized data infrastructure**.

```text
Parakh/
├── backend/                       # Spring Boot Multi-Module Backend (Java 21)
│   ├── parakh-common/             # Shared DTOs, domain models, entity enums, and utility constants
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
└── legacy_archive/                # Locally preserved prototyping services (Git-ignored)
```

---

## ⚡ Core Features

### 1. Advanced Charting & Drawing Tools (TradingView-Grade)
- Powered by **KLineCharts** with full support for Candlestick, Line, and Area modes across multiple resolutions (`1m`, `5m`, `15m`, `30m`, `1h`, `1D`, `1W`, `1M`).
- Rich drawing tool suite: Trend lines, Segments, Rays, Horizontal Support/Resistance levels, Price lines, Fibonacci Retracements, Supply/Demand zones (Rectangles), and Text Annotations.
- Draggable floating quick-tools palette with favorite tools and keyboard navigation (`Escape`, `Delete`).
- Technical indicator overlays and sub-panes: **SMA, EMA, Bollinger Bands, Volume (VOL), RSI, MACD, and KDJ**.

### 2. Multi-Market Discovery & Indian Equities
- Built-in recognition and prioritization for Indian equities on the **NSE** and **BSE** (`RELIANCE.NS`, `TCS.NS`, `HDFCBANK.NS`, `INFY.NS`, `TATAMOTORS.NS`).
- Live international symbol resolution via Yahoo Finance search API for US equities (`AAPL`, `NVDA`, `MSFT`) and cryptocurrencies (`BINANCE:BTCUSDT`).

### 3. Hybrid Strategy Setup Builder
- Create complex rules combining:
  - **Technical conditions**: Indicator thresholds (e.g. `RSI < 30`), moving average crossovers (`SMA 20 > SMA 50`), breakout/breakdown patterns, and volume spikes.
  - **Fundamental criteria**: Valuation metrics (`P/E < 25`, `Market Cap > 100B`, `Debt/Equity < 1.0`).
- Attach automated trade management rules: Stop Loss, Take Profit, and Trailing Stops.

### 4. Interactive Visual Backtesting
- Bar-by-bar historical trade simulation.
- Interactive playback controls: step forward, pause/play, adjustable speed, trade marker highlighting, cumulative equity curve tracking, and win/loss analytics.

### 5. Resilient Watchlist Management
- Instant local storage hydration with zero-latency optimistic updates and background database synchronization.
- Watchlists persist seamlessly across reloads and offline sessions.

---

## 🛠 Technology Stack

| Layer | Technologies |
|---|---|
| **Backend** | Java 21 LTS, Spring Boot 3.4.x, Spring Data JPA, Spring Security, Maven |
| **Market Feeds** | Yahoo Finance API (real-time quotes, historical OHLCV, live search resolution) |
| **Streaming & Messaging** | Apache Kafka (KRaft mode) |
| **Persistence & Caching** | PostgreSQL 16, TimescaleDB, Redis 7, PgBouncer |
| **Frontend** | React 19, TypeScript, Vite, KLineCharts, TailwindCSS, Zustand |
| **DevOps & Infra** | Docker, Docker Compose, Prometheus, Grafana |

---

## 🚀 Getting Started

### Prerequisites
- **Java 21 JDK** installed (`java -version`)
- **Node.js 20+** & **npm** installed (`node -v`)
- **Maven 3.9+** (`mvn -v`)
- **Docker Desktop** running

### Turnkey One-Command Start
Run the cold start script to spin up all Docker infrastructure, databases, migrations, Spring Boot microservices, and frontend in one step:

```bash
npm run dev
```

*(Press `Ctrl+C` at any time to cleanly stop all background services).*

### Individual Service Commands
- **Backends Only:** `npm run dev:backend`
- **Frontend Only:** `npm run dev:frontend`
- **Build Backend JARs:** `npm run build:backend`
- **Build Frontend Bundle:** `npm run build:frontend`
- **Docker Infrastructure:** `npm run infra:up` / `npm run infra:down`

### Default Credentials
- **Email:** `admin@parakh.com`
- **Password:** `password123`

---

## 📄 License
This project is licensed under the MIT License.
