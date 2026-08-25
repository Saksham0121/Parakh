# Parakh: Algorithmic Trading & Backtesting Platform

**Parakh** is an enterprise-grade, event-driven algorithmic trading and backtesting platform built on a scalable microservices architecture. It allows users to define complex trading setups (combining technical indicators and fundamental metrics), evaluates market data in real-time, dispatches instant alerts when conditions are met, and provides robust backtesting capabilities.

---

## 🏗 System Architecture

The system is built as a **Polyrepo / Monorepo** (NPM Workspaces) utilizing **9 decoupled NestJS microservices**. Communication between services is primarily asynchronous and event-driven via **Kafka**.

### Microservices
1. **API Gateway (`api-gateway`)**: Entry point for all HTTP traffic. Handles JWT authentication, rate limiting, and reverse proxies requests to internal services. Scaled horizontally behind Nginx.
2. **WebSocket Gateway (`websocket-gateway`)**: Dedicated gateway for real-time bi-directional communication (pushing live market data and alerts to clients).
3. **User Service (`user-service`)**: Manages user accounts, authentication (JWT/bcrypt), and user watchlists. Connects to PostgreSQL.
4. **Market Data Service (`market-data-service`)**: Ingests real-time market ticks via third-party APIs (Finnhub). Publishes ticks to Kafka.
5. **Indicator Service (`indicator-service`)**: Consumes live ticks from Kafka, calculates technical indicators (SMA, EMA, RSI, MACD, Bollinger Bands) on the fly, and stores them in TimescaleDB.
6. **Fundamentals Service (`fundamentals-service`)**: Periodically scheduled cron jobs to fetch and cache company fundamentals (P/E Ratio, Market Cap, EPS) in PostgreSQL and Redis.
7. **Setup Service (`setup-service`)**: Core business logic. Manages user-defined trading setups (rules and conditions) and evaluates live data streams against these rules in real-time.
8. **Alert Service (`alert-service`)**: Triggered by the Setup Service when conditions are met. Dispatches notifications to users via WebSockets (or email).
9. **Backtest Service (`backtest-service`)**: Simulates user-defined trading setups against historical market data to calculate strategy profitability, win rate, and drawdown.

### Shared Libraries
- **`@parakh/common`**: A shared NPM workspace package containing unified DTOs, interfaces, constants, logger utilities, OpenTelemetry tracing interceptors, and a Kafka Client wrapper to enforce DRY principles across microservices.

---

## 🛠 Technology Stack

### Backend & Core
- **Framework:** NestJS, Express
- **Language:** TypeScript, Node.js
- **Event Bus:** Apache Kafka (KRaft mode)
- **API Communication:** REST APIs, WebSockets (Socket.io)

### Databases & Caching
- **PostgreSQL:** Relational data (Users, Watchlists, Trading Setups, Fundamentals). Managed via Prisma ORM.
- **TimescaleDB:** Time-series database optimized for storing massive volumes of financial market ticks and calculated indicators.
- **Redis:** High-speed caching layer (fundamentals, rate limiting, session state) and Pub/Sub for WebSockets.

### Infrastructure & DevOps
- **Containerization:** Docker & Docker Compose
- **Reverse Proxy / Load Balancer:** Nginx
- **Connection Pooling:** PgBouncer (for PostgreSQL)

### Observability & Resilience (Phase 3)
- **Metrics:** Prometheus & Grafana (HTTP request durations, Kafka consumption rates).
- **Distributed Tracing:** OpenTelemetry & Jaeger (propagating trace context across HTTP and Kafka).
- **Centralized Logging:** VictoriaLogs & Vector (efficiently routing and storing Docker container logs).
- **Circuit Breakers:** Opossum (protecting the system from cascading failures during third-party API outages).
- **Load Testing:** k6 (Validating p95/p99 latencies under high concurrency).

---

## 🚀 Key Features

* **Real-time Technical Analysis:** Calculates complex technical indicators on live tick streams with minimal latency.
* **Hybrid Setup Engine:** Evaluates complex strategies that require both *Fundamental* (e.g., P/E < 15) and *Technical* (e.g., Price crosses above SMA-50) conditions simultaneously.
* **High-Throughput Data Pipeline:** Kafka + TimescaleDB architecture capable of ingesting and persisting thousands of market events per second.
* **Fault Tolerance:** Circuit breakers implemented on external data providers ensure the platform remains stable even if external APIs go down.
* **Scalable Gateway:** Nginx dynamically load balances traffic across horizontally scaled instances of the API Gateway.
* **Historical Backtesting:** Run strategies against historical data to generate detailed performance reports.

---

## 🔄 Data & Infrastructure Flow

### 1. Infrastructure Stack
```text
┌─────────────────────────────────────────────┐
│                   Nginx                      │
│         (reverse proxy, load balancer)       │
└──────────────┬──────────────────┬────────────┘
               │                  │
        HTTP traffic         WebSocket
               │                  │
     ┌─────────┴─────────┐  ┌─────┴───────┐
     │  API Gateway (x3) │  │  WS Gateway │
     └─────────┬─────────┘  └──────┬──────┘
               │                   │
    ┌──────────┼───────────────┬───┴──────────┐
    │          │               │              │
┌───┴───┐ ┌────┴────┐  ┌───────┴──────┐ ┌─────┴─────┐
│Postgres│ │  Redis  │  │    Kafka     │ │ Victoria  │
│        │ │         │  │   (KRaft)    │ │   Logs    │
└────────┘ └─────────┘  └──────────────┘ └───────────┘
    │                                          ▲
┌───┴────────┐  ┌─────────────┐                │
│TimescaleDB │  │ Prometheus  │  Vector (Docker Logs)
│(time-series)│  │ & Grafana   │
└─────────────┘  └─────────────┘
```

### 2. Live Market Data Flow
```text
Finnhub API ──(Circuit Breaker)──→ market-data-service ──→ Kafka [price-ticks]
                                               │
                               ┌───────────────┼───────────────┐
                               │               │               │
                      indicator-service   ws-gateway     alert-service
                               │               │               │
                      Kafka [indicator-    Push to       Kafka [alert-fired]
                       updates]           clients              │
                               │                        notification-service
                          TimescaleDB                          │
                                                          Email + WS
```

---

## 📂 Directory Structure

```text
Parakh/
├── api-gateway/         
├── alert-service/
├── backtest-service/
├── common/              
├── frontend/            
├── fundamentals-service/
├── indicator-service/
├── market-data-service/
├── setup-service/
├── user-service/
├── websocket-gateway/
├── infra/               # Docker Compose, Nginx, Prometheus, Grafana, Vector configs
├── k6/                  # Performance load testing scripts
├── package.json         # Root workspace config
├── tsconfig.base.json   
└── info.md              # This file
```
