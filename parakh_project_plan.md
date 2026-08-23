# Parakh — Project Plan

A full-stack, real-time trading analytics platform combining technical analysis, fundamental analysis, and custom alerting (including combined technical + fundamental "setups" with backtesting and ranking) — built to demonstrate production-grade system design.

**Parakh** (परख) — Hindi for "to assess/evaluate" — fitting, since the app's core job is helping you evaluate a stock before you act on it.

---

## 1. Product Summary

A personal trading dashboard where a user can:
- Watch live prices and candlestick charts for stocks on their watchlist, with drawing tools for their own analysis
- View technical indicators (RSI, MACD, SMA/EMA, Bollinger Bands, and more — customizable parameters)
- View fundamental data (P/E, EPS, ROE, Debt/Equity, sector comparisons)
- Create and save multiple **Setups** — named, renameable combinations of technical **and** fundamental conditions
- Attach an **order rule** to a setup (Stop Loss, Stop Limit, Take Profit, Trailing Stop, GTC/IOC) describing how a trade based on that setup would be managed
- **Backtest** any setup against historical data for a chosen stock, see win/loss probability, and see all setups **ranked** by backtest performance
- Get alerted when a setup's technical conditions hit **and** have fundamentals automatically evaluated against the setup's own fundamental rules, so the alert reflects both dimensions, not just price action

This is an educational/personal-use tool, not a trading execution platform — no real order placement. Order-type fields describe the *intended* trade management strategy for backtesting and analysis purposes.

---

## 2. Tech Stack (final)

### Backend
- **Node.js + NestJS** (TypeScript) — all services, **polyrepo** (each service its own repo, no monorepo tooling)
- **`@parakh/common`** — shared DTOs, Kafka client wrapper, logger config, published as a private npm package (GitHub Packages), versioned independently per service

### Real-time / Streaming
- **Apache Kafka** (via KafkaJS) — event backbone (price ticks, indicator updates, alert triggers, notification jobs, backtest jobs — single broker)
- **Socket.IO** — WebSocket gateway to clients, with **Redis adapter** for cross-instance pub/sub

### Databases
- **PostgreSQL** — users, watchlists, setups, order rules, alert history, fundamentals, backtest results
- **TimescaleDB** — time-series price & indicator history (hypertables for native time-based partitioning)
- **Redis** — cache (latest prices, indicators, fundamentals snapshots), Socket.IO adapter backend
- **PgBouncer** — connection pooling, read/write routing once read replicas are added

### ORM
- **Prisma**

### Auth
- **`@nestjs/passport` + `passport-jwt`** — JWT auth (OAuth2/Google optional, not MVP)

### API / Gateway
- **NestJS API Gateway** — routing, JWT validation, rate limiting (token bucket via Redis)

### Load Balancing
- **Nginx** — reverse proxy in front of api_gateway and websocket_gateway instances (round-robin/least-conn for HTTP, sticky sessions for WebSocket)
- Internal service traffic: Docker/K8s networking (no separate service mesh needed at this scale)

### Observability
- **Prometheus + Grafana** — metrics (request latency, Kafka consumer lag, indicator computation time, WS connection count, backtest job duration)
- **VictoriaLogs + Vector** — structured JSON log aggregation, correlation IDs
- **OpenTelemetry + Jaeger** — distributed tracing (HTTP + Kafka context propagation)
- **`@nestjs/terminus`** — health check endpoints (`/health`, `/ready`) per service
- **vmalert + Alertmanager** — log/metric-based alerting

### Resilience
- **`opossum`** — circuit breakers on external API calls and inter-service calls

### DevOps
- **Docker + docker-compose** (local/dev) — all services + infra (Kafka, Redis, Postgres, TimescaleDB, VictoriaLogs, Prometheus, Grafana, Nginx)
- **Kubernetes** — optional stretch goal for orchestration

### Frontend
- **React** — dashboard, charts, setup builder, backtest results, leaderboard
- Charting: candlestick support + drawing tools (trendlines, rectangles, long/short position markers) required — evaluate **KLineCharts** (open-source, built specifically for this: candlesticks + built-in drawing tool overlays) vs **TradingView's Advanced/Lightweight Charting Library** (check current licensing terms before committing, since Lightweight Charts alone does not include drawing tools out of the box)

### External Data
- **Finnhub** (primary — 60 calls/min free tier, real-time-ish quotes + fundamentals) with **Alpha Vantage** as a secondary source for cross-checking technical indicator values

### Load Testing
- **k6** — HTTP + WebSocket load testing
- Kafka's built-in `kafka-producer-perf-test.sh` / `kafka-consumer-perf-test.sh`
- **pgbench** — Postgres throughput

---

## 3. Service Architecture (polyrepo, simple repo names)

Each service lives in its **own repo**, with its own Dockerfile, its own CI/CD pipeline (lint → test → build → push image), and its own deployment lifecycle.

```
common/                  # Published npm package: shared DTOs, Kafka wrapper, logger
user_service/            # Auth, profiles, watchlists
market_data_service/     # Ingests external API, publishes price ticks to Kafka
indicator_service/       # Consumes ticks, computes technical indicators (full library, configurable params)
setup_service/           # Setup CRUD (create/rename/delete), technical + fundamental conditions, order rules
alert_service/           # Evaluates live setups against streams, fires alerts per user's alert/signal mode
backtest_service/        # Runs historical backtests, computes win/loss stats, ranks setups
fundamentals_service/    # Scheduled batch jobs pulling company financials
notification_service/    # Consumes alert-triggered events, sends email
websocket_gateway/       # Client-facing real-time push (Socket.IO + Redis adapter)
api_gateway/             # Routing, JWT guard, rate limiting
frontend/                # React dashboard, chart, setup builder, backtest & leaderboard UI
infra/                   # docker-compose, Nginx config, Prometheus/Grafana/VictoriaLogs configs
```

Each service repo installs `@parakh/common` from GitHub Packages. When a shared DTO changes, bump the package's semver, publish, then update consumers — this demonstrates understanding of API contracts and independent versioning between deployed services.

**Note on service split:** setups, alerts, and backtesting were split into three services (`setup_service`, `alert_service`, `backtest_service`) rather than one combined "alert-service" — each has a different lifecycle and load profile (setup CRUD is low-traffic and simple; live alert evaluation is continuous and latency-sensitive; backtesting is bursty and CPU-heavy). All three share condition-evaluation logic via `@parakh/common` so live and backtested behavior stay consistent.

### Kafka topics
- `price-ticks` (key = symbol, for per-symbol ordering)
- `indicator-updates`
- `setup-triggered` (technical condition matched, before fundamentals check)
- `alert-fired` (after fundamentals evaluation, ready for notification)
- `notification-jobs`
- `backtest-jobs` (backtest requests, consumed by `backtest_service` workers)

---

## 4. Core Data Model (Prisma / Postgres + TimescaleDB)

```
users (id, email, password_hash, created_at)
watchlists (id, user_id, symbol)

-- Setups: combined technical + fundamental, renameable
setups (
  id, user_id, name, active,
  technical_conditions JSON,      -- [{ indicator, params, operator, value }, ...]
  fundamental_conditions JSON,    -- [{ metric, operator, value }, ...]  e.g. P/E < 20, ROE > 15
  fundamental_mode ENUM,          -- 'display_only' | 'required_for_signal'
  order_rule JSON,                -- see order_rule shape below
  created_at, updated_at
)

-- order_rule JSON shape:
-- {
--   stop_loss_pct, stop_limit_price, take_profit_pct,
--   trailing_stop_pct, time_in_force: 'GTC' | 'IOC'
-- }

setup_matches (
  id, setup_id, symbol, matched_at,
  technical_snapshot JSON,
  fundamentals_snapshot JSON,
  fundamentals_passed BOOLEAN,    -- did it satisfy fundamental_conditions
  alert_fired BOOLEAN             -- true only if mode rules were satisfied
)

company_fundamentals (symbol, pe_ratio, eps, roe, debt_to_equity, market_cap, sector, updated_at)

-- Backtesting
backtest_runs (id, setup_id, symbol, date_range_start, date_range_end, status, requested_at, completed_at)
backtest_trades (
  id, backtest_run_id, entry_date, entry_price,
  exit_date, exit_price, exit_reason,   -- 'stop_loss' | 'take_profit' | 'trailing_stop' | 'time_exit'
  return_pct, result ENUM               -- 'win' | 'loss'
)
backtest_results (
  backtest_run_id, total_trades, wins, losses,
  win_rate, avg_return_pct, max_drawdown_pct,
  best_trade_pct, worst_trade_pct
)

-- Aggregated per setup, updated after each backtest run, powers the leaderboard
setup_rankings (
  setup_id, total_backtest_runs,
  aggregate_win_rate, aggregate_avg_return_pct,
  rank_score, last_ranked_at
)

-- TimescaleDB hypertables
price_history (time, symbol, open, high, low, close, volume)
indicator_history (time, symbol, indicator_type, params, value)
```

---

## 5. Feature List

**Auth & Users:** register/login (JWT), watchlist management

**Market Data & Charts:**
- Live price feed (WebSocket), **candlestick charts** with multiple intervals
- **Drawing tools**: trendlines, rectangles, long position markers, short position markers, and other standard chart annotations
- Historical lookup, symbol search

**Technical Analysis:**
- Full library of commonly used indicators (SMA, EMA, RSI, MACD, Bollinger Bands, Stochastic, ATR, VWAP, etc.)
- Every indicator's parameters are user-configurable (e.g. RSI period, MACD fast/slow/signal lengths)

**Fundamental Analysis:** key ratios (P/E, EPS, ROE, Debt/Equity), financial statement highlights, peer/sector comparison

**Setups (flagship feature):**
- Save multiple named setups, each combining technical **and** fundamental conditions
- **Rename** or edit any saved setup at any time
- Attach an **order rule** per setup: Stop Loss, Stop Limit, Take Profit, Trailing Stop, plus time-in-force (**GTC**, **IOC**) — describes how the trade would be managed if acted on
- Choose a **fundamental mode** per setup: fundamentals shown for context only (`display_only`), or required to pass before an alert fires (`required_for_signal`)

**Live Alerts:**
- When a setup's technical conditions hit, fundamentals are automatically evaluated against that setup's fundamental rules
- Whether the alert actually fires depends on the setup's chosen mode — informational display vs a strict combined signal
- Delivered via email + in-app WebSocket

**Backtesting:**
- Run any saved setup against historical data for a chosen stock and date range
- Uses the setup's own order rule (stop loss / take profit / trailing stop / time-in-force) to determine simulated trade exits
- Stores every simulated trade and computes **win/loss probability**, average return, max drawdown per run
- **Setup Leaderboard**: all setups ranked by aggregate backtest performance (win rate, average return) across every backtest run — lets you see at a glance which of your setups actually works before trusting it live

**Dashboard:** live watchlist view, optional news feed per symbol, dark/light theme

**Ops:** health checks, metrics dashboard, per-user rate limiting

---

## 6. Scaling & Load Balancing Strategy

| Layer | Mechanism |
|---|---|
| HTTP traffic | Nginx → api_gateway instances (round-robin/least-conn) |
| WebSocket connections | Nginx (sticky sessions) → websocket_gateway instances + Redis pub/sub adapter for cross-instance broadcast |
| Stream processing | Kafka partitioning by symbol, consumer groups scale independently per service |
| Background jobs (notifications, backtests) | Dedicated Kafka topics/consumer groups (no separate broker) |
| DB reads | Postgres read replicas (add when needed) + PgBouncer for pooling |
| High-volume time-series | TimescaleDB native hypertable partitioning (no custom sharding needed) |

Explicitly NOT included (avoid unjustified complexity): RabbitMQ, Redis Cluster, Consul/service mesh, Kubernetes for MVP — documented as "how I'd scale further" in the README, not built.

---

## 7. Build Order

**Phase 1 — MVP**
1. `user_service`: auth + watchlist
2. `market_data_service` → Kafka `price-ticks`
3. `indicator_service`: SMA/RSI minimum, cached in Redis
4. `websocket_gateway`: live price + indicator push to client
5. `frontend`: candlestick chart (basic), live price display
6. `setup_service`: create/rename/edit setups (technical conditions only to start)
7. `alert_service`: evaluate live setups, price/indicator-based alerts, email via `notification_service`
8. Deploy (even basic) so there's always something demoable

**Phase 2 — Depth**
9. `fundamentals_service`: scheduled fetch + endpoints
10. Extend setups with fundamental conditions + `fundamental_mode`, wire fundamentals check into `alert_service`
11. Order rules (Stop Loss/Stop Limit/Take Profit/Trailing Stop, GTC/IOC) added to setup model
12. `backtest_service`: async backtest engine reusing shared condition-matcher, trade simulation using order rules
13. Backtest results storage + `setup_rankings` leaderboard computation
14. `frontend`: setup builder UI, backtest results view (trade table + equity curve), leaderboard, drawing tools on chart

**Phase 3 — System design polish**
15. Nginx load balancing + multiple instances via docker-compose
16. Observability: Prometheus/Grafana, VictoriaLogs, OpenTelemetry/Jaeger, health checks
17. Circuit breakers (`opossum`) on external API + inter-service calls
18. PgBouncer + (optionally) read replicas
19. Load testing with k6 — baseline vs scaled, document real throughput/latency numbers

**Phase 4 — Resume polish**
20. README with architecture diagram, explicit design-decision write-ups
21. Record actual load test results to quote in resume bullets

---

## 8. Backtesting & Ranking Engine Design

Lives in `backtest_service`, reusing the exact same condition-evaluation logic as live setup matching (via `@parakh/common`) — a deliberate reuse decision worth calling out in the README: "the backtest engine and live evaluator share one condition-matching function, so backtested results are a true reflection of how the setup would behave live, not a separate approximation."

**Flow:**
1. User picks a saved setup + symbol + date range → `POST /backtest`
2. Request publishes a `backtest-jobs` Kafka message, creates a `backtest_runs` row (status: `pending`), returns immediately with the run ID
3. Worker replays historical bars from TimescaleDB in order, re-computing indicators bar-by-bar and running them through the same condition matcher used live
4. On each technical match, fundamentals for that point in time are checked against the setup's fundamental conditions (if `required_for_signal`)
5. On a valid signal, simulate entry; apply the setup's own **order rule** (stop loss / stop limit / take profit / trailing stop, respecting GTC vs IOC) to determine the exit
6. Store each simulated trade (`win`/`loss`) in `backtest_trades`, compute aggregate stats into `backtest_results`
7. Update `setup_rankings` for that setup: recompute aggregate win rate/return across all its backtest runs, recalculate `rank_score`
8. Frontend polls (or subscribes via WebSocket) for run status, renders trade table, equity curve, and updated leaderboard position once done

**Why async instead of synchronous request/response:** a multi-year backtest replaying thousands of bars can take longer than a reasonable HTTP timeout — modeling it as a job with a status you poll is both more correct and a better "I thought about UX under load" story for interviews.

**Ranking approach:** `rank_score` is a simple weighted combination of win rate and average return to start (e.g. `win_rate * 0.6 + normalized_avg_return * 0.4`) — documented as a deliberately simple v1 formula, with "more sophisticated risk-adjusted ranking (e.g. Sharpe-like scoring)" noted as a stated stretch goal rather than pretending it's more rigorous than it is.

---

## 9. Design Decisions to Document in README (interview talking points)

- Why Kafka partitioned by symbol (ordering guarantee per symbol across consumers)
- Why fundamentals enrichment reads from Redis cache, not a fresh API call, at match time
- Why TimescaleDB over hand-rolled sharding for price history
- Why WebSocket scaling needs sticky sessions + Redis pub/sub adapter (and what breaks without it)
- Why RabbitMQ was deliberately not added (one broker, one story, avoided unjustified complexity)
- Why polyrepo over monorepo (independent deploy lifecycles per service, versioned shared package as an explicit API contract)
- Why setups/alerts/backtesting are three separate services, not one (different load profiles and lifecycles)
- Why the backtest engine reuses the live condition-matcher instead of a separate implementation
- Why backtesting is modeled as an async job with polling, not a synchronous request
- Why `fundamental_mode` exists as a per-setup choice rather than one global rule (different setups need different strictness)
- Real load test numbers: throughput, p50/p95/p99 latency, before/after horizontal scaling
