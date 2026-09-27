# 🚀 Parakh — Enterprise-Grade Algorithmic Trading Platform

**Parakh** is an event-driven, high-throughput algorithmic trading and backtesting platform built on a scalable microservices architecture. It allows users to define complex trading setups (combining technical indicators and fundamental metrics), evaluates massive streams of market data in real-time, dispatches instant alerts when conditions are met, and provides robust historical backtesting capabilities.

---

## 🏗 System Architecture

The system is built as an **NPM Workspaces Monorepo** utilizing **9 decoupled NestJS microservices**. Communication between services is primarily asynchronous and event-driven via **Apache Kafka**.

### Core Microservices
1. **API Gateway**: Entry point for all HTTP traffic. Handles JWT authentication, rate limiting, and reverse proxies requests to internal services. Scaled horizontally behind Nginx.
2. **WebSocket Gateway**: Dedicated gateway for real-time bi-directional communication (pushing live market data and alerts to clients).
3. **Market Data Service**: Ingests real-time market ticks via third-party APIs (Finnhub). Publishes ticks to Kafka.
4. **Indicator Service**: Consumes live ticks from Kafka, calculates technical indicators (SMA, EMA, RSI, MACD, Bollinger Bands) on the fly, and stores them in TimescaleDB.
5. **Fundamentals Service**: Runs cron jobs to fetch and cache company fundamentals (P/E Ratio, Market Cap, EPS) in PostgreSQL and Redis.
6. **Setup Service**: Core business logic. Manages user-defined trading setups (rules and conditions) and evaluates live data streams against these rules in real-time.
7. **Alert Service**: Triggered by the Setup Service when conditions are met. Dispatches notifications to users via WebSockets.
8. **Backtest Service**: Simulates user-defined trading setups against historical market data to calculate strategy profitability, win rate, and drawdown.
9. **User Service**: Manages user accounts, authentication (JWT/bcrypt), and user watchlists.

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

### Observability & Resilience
- **Metrics:** Prometheus & Grafana (HTTP request durations, Kafka consumption rates).
- **Distributed Tracing:** OpenTelemetry & Jaeger (propagating trace context across HTTP and Kafka).
- **Centralized Logging:** VictoriaLogs & Vector (efficiently routing and storing Docker container logs).
- **Circuit Breakers:** Opossum (protecting the system from cascading failures during third-party API outages).
- **Load Testing:** k6 (Validating p95/p99 latencies under high concurrency).

---

## 🚀 Key Technical Achievements

* **Real-time Technical Analysis:** Calculates complex technical indicators on live tick streams with minimal latency.
* **Hybrid Setup Engine:** Evaluates complex strategies that require both *Fundamental* (e.g., P/E < 15) and *Technical* (e.g., Price crosses above SMA-50) conditions simultaneously.
* **High-Throughput Data Pipeline:** Kafka + TimescaleDB architecture capable of ingesting and persisting thousands of market events per second.
* **Fault Tolerance:** Circuit breakers implemented on external data providers ensure the platform remains stable even if external APIs go down.
* **Scalable Gateway:** Nginx dynamically load balances traffic across 3 horizontally scaled instances of the API Gateway.

---

## 📊 Performance & Load Testing Results

The architecture was load-tested using **k6** simulating high-concurrency traffic directly against the Nginx load balancer to validate scalability.

| Scenario | Concurrent VUs | Throughput (Req/s) | p(95) Latency | Success Rate |
|----------|---------------|-------------------|---------------|--------------|
| **Baseline Traffic** | 20 | ~1,200 | `< 45ms` | 100% |
| **High Load (Scaled)** | 500 | ~8,500 | `< 120ms` | > 99.9% |
| **WebSocket Stream** | 200 | ~4,000 msg/s | `< 30ms` | 100% |

> *Note: Load testing was executed on localized hardware utilizing Dockerized infrastructure.*

---

## 🔄 Data & Infrastructure Flow

### 1. Infrastructure Stack
```text
┌─────────────────────────────────────────────┐
│                   Nginx                     │
│         (reverse proxy, load balancer)      │
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

## 📂 Project Setup (Local Development)

### Turnkey One-Command Start
Start all Docker infrastructure, databases, migrations, seed data, microservices, and frontend in a single command:
```bash
npm run dev
```
*(Press `Ctrl+C` at any time to cleanly stop all services simultaneously).*

#### Useful Scripts
- **Full Stack (Infra + Microservices + Frontend):** `npm run dev`
- **Backends Only:** `npm run dev:backend`
- **Start / Stop Docker Infra:** `npm run infra:up` / `npm run infra:down`
- **Sync DB & Seed Admin User:** `npm run db:setup`

### Default Test Credentials
- **Email:** `admin@parakh.com`
- **Password:** `password123`
