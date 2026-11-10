# Parakh

**Parakh** (परख, *"to evaluate"*) is a trade **analysis** tool. You describe the kind of trade you look for as a *setup*, a mix of technical triggers and fundamental filters, and Parakh finds stocks that have it, alerts you when a new one appears, and backtests the setup on past data.

> Parakh never places orders and never connects to a broker. Long/short positions, stops and targets exist only for charting and simulation.

Example setup: *"Close breaks above its 20-day high on at least 1.5× average volume, price is above the 50-day SMA, **and** P/E < 30, ROE > 15 %, Debt/Equity < 1."* Parakh checks this against your watchlist (or any symbol list) every minute and tells you which stocks match and why.

---

## Contents

1. [Features](#features)
2. [Tech stack](#tech-stack)
3. [Architecture](#architecture)
4. [How it works](#how-it-works)
5. [Request flows](#request-flows)
6. [Caching and performance](#caching-and-performance)
7. [Data model](#data-model)
8. [API reference](#api-reference)
9. [Project structure](#project-structure)
10. [Getting started](#getting-started)
11. [Deploying free on Render](#deploying-free-on-render)
12. [Configuration](#configuration)
13. [Testing](#testing)
14. [Known limitations](#known-limitations)

---

## Features

### Setups: your trade idea as rules
- **Technical conditions**, joined with AND / OR:
  - Patterns: **breakout** above the N-bar high, **breakdown** below the N-bar low (each with an optional "volume ≥ X × average" check), and **volume spike**.
  - Series: price, change %, SMA, EMA, RSI, MACD (line / signal / histogram), Bollinger Bands (upper / middle / lower), ATR, Stochastic %K/%D, volume, and volume SMA.
  - Operators: above, below, at least, at most, **crosses above**, **crosses below**.
  - Each condition compares against **a value** (RSI > 60) **or another indicator** (SMA 50 crosses above SMA 200, Close > EMA 20).
- **Fundamental filters**: P/E, forward P/E, P/B, PEG, ROE, ROA, Debt/Equity, net margin, revenue and earnings growth, EPS, dividend yield, current ratio, market cap (₹ Cr or Bn), average volume, beta, and % below the 52-week high.
  - **Must pass** mode: a stock only matches if every filter passes. Missing data counts as a fail.
  - **Info only** mode: the filters are shown next to each match but don't block it.
- **Timeframe** (5m … 1M) and **symbol list** (a custom list, or your watchlist by default).
- **Trade plan** used by the backtester: long or short, stop-loss %, take-profit %, trailing stop %, and max bars held.
- **Templates** to start from: Breakout + quality, Golden cross, RSI oversold bounce, MACD momentum, Breakdown short.

### Automatic detection and alerts
- Turn on **Monitoring** for a setup and the engine scans its symbols every 60 s.
- Alerts fire **once per bar**: a breakout produces one alert, not one a minute for the rest of the day.
- Alerts are pushed live over WebSocket (with a toast), stored, and listed in **Alerts** with the exact reasons each condition passed.

### Scanner
- Run any setup against its symbols, your watchlist, or the NSE large caps (NIFTY 50 constituents).
- For every symbol you see whether it matched, whether only the technicals passed, and the actual value of each condition, with the level it was compared to.

### Backtesting
- Replays history bar by bar. The signal is read on a bar's close and the trade enters at the **next bar's open**, so there is no look-ahead.
- Manages each trade with stop, target, trailing stop and max hold. Gaps fill at the open. When the stop and the target are both touched in the same bar, the stop is assumed to have hit first (the conservative choice).
- Supports long and short trades, a cost (brokerage + slippage) per side, position size as a % of equity, and starting capital.
- Reports total return vs **buy & hold**, win rate, profit factor, max drawdown, average win and loss, Sharpe, exposure, and average bars held.
- Shows a price chart with trade markers, the equity curve against buy & hold, the trade log, and run history.

### Charting
- KLineCharts with candles, hollow candles, OHLC bars or area; 5m → 1M timeframes; 16 indicators (MA, EMA, BOLL, SAR, BBI, VOL, RSI, MACD, KDJ, CCI, DMI, OBV, WR, ROC, MTM, TRIX).
- **Drawing tools**:
  - Lines: trend line, ray, extended line, horizontal line, horizontal ray, vertical line, price line.
  - Channels: parallel channel, price channel.
  - Fibonacci retracement.
  - Shapes: rectangle, circle, triangle.
  - **Long position** and **Short position**: entry, target and stop are each draggable, with live R:R and % labels.
  - **Price range / measure**: Δ price, Δ %, and number of bars.
  - Text notes, up and down arrows.
- Drawing controls: magnet (snap to OHLC), lock, hide, undo (⌘/Ctrl+Z), recolour, delete (Del). Shortcuts: Alt+T/H/V/F/R/L/S/M.
- Drawings are **saved per symbol** and survive reloads and timeframe changes.
- **Key levels**: support and resistance found from swing pivots, ranked by how many times price touched them.
- **Analysis panel**: real fundamentals, the 52-week range, and a **Setup check** that shows whether this chart has your setup right now, condition by condition.
- Live price ticks update the last candle.

### Interface
- Responsive layout:
  - Desktop: nav rail, chart, and watchlist.
  - Tablet: slide-over panels.
  - Phone: bottom tab bar, a drawing toolbar that scrolls sideways, and bottom sheets.
- Symbol search: press `/` or ⌘K. Indian stocks (NSE `.NS`, BSE `.BO`), US stocks, indices and crypto are supported.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 8, Zustand, KLineCharts 9, lucide-react, socket.io-client |
| Backend | Java 21, Spring Boot 3.3 (Web, Data JPA, Security, Validation, Actuator), virtual threads, Maven multi-module |
| Messaging | Apache Kafka (KRaft) |
| Database | PostgreSQL 16 with Flyway migrations |
| Cache | Redis 7 (shared L2 cache, alert de-duplication) + in-process L1 cache |
| Realtime | netty-socketio (Socket.IO server inside `parakh-core`) |
| Auth | JWT (jjwt), BCrypt password hashing |
| Market data | Yahoo Finance: chart, search, and quoteSummary (fundamentals). No API key needed |
| Infra / ops | Docker Compose, Nginx, PgBouncer, Prometheus, Grafana, Jaeger, k6 load tests |

---

## Architecture

```
                         ┌──────────────────────────────────────────────┐
  Browser (React SPA)    │  Nginx (prod) / Vite dev proxy (dev)          │
  ───────────────────►   │   /api/market|scanner|backtests|indicators ──►│──► parakh-engine :8082
                         │   /api/*  (auth, setups, watchlist, alerts) ─►│──► parakh-core   :8080
                         │   /socket.io  (live prices, alerts) ─────────►│──► parakh-core   :3009
                         └──────────────────────────────────────────────┘

 ┌─────────────────────────── parakh-engine ───────────────────────────┐
 │ MarketService ── TieredCache (L1 memory → L2 Redis → Yahoo Finance)  │
 │ ScannerService ─ SetupEvaluator (parakh-common)                      │
 │ SetupMonitor (every 60 s) ──► Kafka "setup-triggered"               │
 │ BacktestSimulatorService ─ SetupEvaluator                            │
 │ Price poller (every 5 s) ──► Kafka "price-ticks"                    │
 └──────────────────────────────────────────────────────────────────────┘
              │ Kafka                                     │ JPA
              ▼                                           ▼
 ┌──────────────────── parakh-core ────────────────────┐   PostgreSQL
 │ Auth (JWT) · Setups CRUD · Watchlist · Alerts       │◄──(users, setups,
 │ SetupTriggerListener ── saves match, pushes alert    │    watchlists, matches,
 │ WebSocketKafkaBridge ── relays price ticks to rooms  │    backtests)
 │ Socket.IO server :3009                               │
 └──────────────────────────────────────────────────────┘
```

### Modules

| Module | Responsibility |
|---|---|
| `parakh-common` | Shared JPA entities, DTOs and constants, plus the **analysis engine**: `Candles` (column-oriented OHLCV), `IndicatorMath` (O(n) SMA/EMA/RSI/MACD/Bollinger/ATR/Stochastic/pivot helpers) and `SetupEvaluator` (the single place that decides whether a setup matches). |
| `parakh-core` | User accounts and JWT issuing, setup CRUD and validation, watchlists, alert history, the Socket.IO server, and Kafka consumers that turn engine events into pushed alerts. Owns the Flyway migrations. |
| `parakh-engine` | Market data (candles, quotes, fundamentals, search) behind a tiered cache, the scanner, the setup monitor, the backtester, and indicator snapshots. Verifies JWTs issued by core for user-scoped endpoints. |
| `frontend` | The React SPA. Views are lazy-loaded (Chart, Scanner, Setups, Backtest, Alerts), and KLineCharts is in its own cached chunk. |

### Key design decisions
- **One evaluator everywhere.** The scanner, the chart's setup check, live monitoring and the backtester all call `SetupEvaluator`, so a setup behaves the same in a backtest as it does live.
- **Real data or none.** If Yahoo has no data, the API returns `404` with a message and the UI says so. Nothing synthetic is ever charted or backtested.
- **Edge-triggered alerts.** A match is keyed by `setupId | symbol | barTime`, stored with Redis `SETNX`, so each bar alerts once even with several engine replicas.
- **Stateless engine.** All shared state is in Redis or Postgres, so the engine scales horizontally behind Nginx.

---

## How it works

### Evaluating a setup (`SetupEvaluator`)
1. Candles for the setup's timeframe are loaded: 3 years for daily bars, less for intraday, because Yahoo limits intraday history.
2. Each indicator series is computed **once over the whole series** and cached for the evaluator's lifetime (e.g. `SMA:{period=50}`). Evaluating many bars or conditions therefore reuses arrays instead of recomputing.
3. Each condition is checked at bar *i*:
   - Comparison operators check `left[i]` vs `right[i]` (a value or another series).
   - `crosses_above` requires `left[i-1] ≤ right[i-1]` **and** `left[i] > right[i]`.
   - `BREAKOUT` requires `close[i] > max(high[i-N … i-1])` (and volume ≥ X × the average of the previous N bars).
4. Conditions are combined left to right using each one's AND/OR.
5. Fundamental filters are checked against the company's latest metrics. A missing metric fails the filter.
6. The result lists every condition with its label, pass/fail, actual value, target level and a note. This is what the scanner, alerts and setup check display.

### Live monitoring (`SetupMonitor`)
Every `SCANNER_INTERVAL_MS` (default 60 s) the engine:
1. loads all active setups (with their owners) in one query;
2. resolves each setup's symbols: its own list, or the owner's watchlist;
3. evaluates every symbol in parallel on virtual threads. Many setups share symbols, so the candle cache usually turns this into very few upstream calls;
4. for each match on a bar not alerted before, publishes a `setup-triggered` event to Kafka.

`parakh-core` consumes the event, saves a `setup_matches` row, and pushes `alert:fired` to the owner's open Socket.IO sessions.

### Backtesting (`BacktestSimulatorService`)
1. `POST /api/backtests` checks that the setup belongs to the caller, creates a `backtest_runs` row, and starts the simulation on a virtual thread. The response returns immediately with a `runId`.
2. Candles are fetched with about 250 extra bars before the start date, so indicators have enough history from the first tested bar.
3. For each bar: fill a pending entry at the open → check exits against the bar's high/low → evaluate the setup on the close and queue an entry for the next bar → record mark-to-market equity.
4. Trades, the result summary and the setup's ranking are saved. The full playback (bars, trades, equity curve, stats) is cached for 7 days.
5. The UI polls `/status` (progress %) and then loads `/playback`.

### Market data and live prices
- **Candles, quotes and search** come from Yahoo's `v8/finance/chart` and `v1/finance/search` endpoints. Bare tickers are tried on NSE and BSE in parallel.
- **Fundamentals** come from `v10/finance/quoteSummary`, using the cookie + crumb handshake that endpoint requires. They are normalised to the metric keys used by setups (`pe_ratio`, `roe` in %, `debt_to_equity` as a ratio, `market_cap_cr`, …).
- **Live prices:** symbols someone is watching (refreshed whenever they're requested, dropped after 15 min idle) are polled every 5 s in parallel. A tick goes to Kafka only when the price actually changes. Core relays ticks to the Socket.IO room `symbol:<SYM>`, and the browser batches incoming ticks into one render per animation frame.
- **Rate limits:** on HTTP 429, upstream calls pause with exponential back-off (15 s → 5 min). Concurrent upstream calls are capped at 8.

---

## Request flows

### 1. Opening a chart
```
Browser                    Vite/Nginx           parakh-engine                    Redis        Yahoo
  │ GET /api/market/candles/TCS.NS?resolution=D
  │──────────────────────────►│──────────────────►│ TieredCache.get(key)
  │                           │                   │  L1 hit? ── yes ──► return (≈4 ms)
  │                           │                   │  stale? ─── return stale + refresh in background
  │                           │                   │  miss ──► single-flight ──► GET ───►│ (hit → return)
  │                           │                   │                       miss ────────────────►│ chart API
  │                           │                   │◄── candles (gzip, Cache-Control) ────────────│
  │◄─────────────── {t,o,h,l,c,v} ─────────────────│ store L1 + L2
  │ KLineCharts.applyNewData · restore saved drawings · subscribe socket room
```
The browser also keeps a stale-while-revalidate cache, so switching back to a symbol you've already opened draws instantly.

### 2. Creating a setup and getting an alert
```
1. POST /api/setups          → core validates indicators/timeframe/symbols → Postgres
2. PATCH /api/setups/{id}/activate → active = true
3. SetupMonitor (engine, every 60 s)
     load active setups ─► scan symbols in parallel ─► SetupEvaluator
     match on a new bar? ─► Redis SETNX scan:fired:{setup}|{sym}|{bar}
     first time ─► Kafka "setup-triggered"
4. SetupTriggerListener (core)
     save setup_matches ─► Socket.IO "alert:fired" to the user's sessions
5. Browser: toast + Alerts badge; GET /api/alerts lists history
```

### 3. Running a scan
```
POST /api/scanner/run  { setupId, symbols? }   (Authorization: Bearer <jwt>)
  JwtAuthFilter → userId
  load setup (owner check) → symbols = request ∪ setup list ∪ watchlist
  parallel per symbol: candles (cached) → evaluate technicals
                       → fundamentals only if technicals pass (or ≤ 30 symbols)
  sort: matches first → JSON {scanned, matched, durationMs, results[]}
```

### 4. Running a backtest
```
POST /api/backtests {setupId, symbol, startDate, endDate, timeframe, costs…}
  → owner check → backtest_runs(pending) → submit to virtual-thread worker → {runId}
GET  /api/backtests/{runId}/status    (polled every 600 ms: pending → running 40/80 % → completed)
GET  /api/backtests/{runId}/playback  → bars, trades, equity curve, stats
```

### 5. Signing in
```
POST /api/auth/login → core checks the BCrypt hash → JWT (HS256, 7 days)
The browser stores the token; REST calls send it as "Authorization: Bearer"; Socket.IO sends it as ?token=
Engine endpoints under /api/scanner and /api/backtests verify the same JWT using the shared JWT_SECRET.
```

---

## Caching and performance

| Data | L1 TTL (served stale up to 6× TTL) | Negative cache | Browser cache |
|---|---|---|---|
| Candles, 1m / 5m | 20 s | 10 s | 15 s |
| Candles, 15m / 30m | 45 s | 10 s | 30 s |
| Candles, 1h | 2 min | 10 s | 60 s |
| Candles, daily | 5 min | 10 s | 2 min |
| Candles, weekly / monthly | 1 h | 10 s | 10 min |
| Quotes | 10 s (poller refreshes every 5 s) | 20 s | none |
| Fundamentals | 12 h | 2 min | 30 min |
| Search | 30 min | 2 min | 10 min |

Other techniques used:
- **Single-flight:** concurrent misses for the same key share one upstream request.
- **Redis is optional at runtime:** if it goes down, the engine serves from L1 and retries Redis after 10 s.
- **Kafka is optional at runtime:** the producer's `max.block.ms` is 2 s, so a Kafka outage can't stall the poller or the monitor.
- **Smaller responses:** gzip on JSON responses, and a batch quotes endpoint (`/api/market/quotes?symbols=…`) so the watchlist loads in one request.
- **Faster frontend:** views are lazy-loaded, the charting library is its own long-lived chunk, ticks are batched per animation frame, and watchlist rows re-render independently.

Measured locally (laptop, Docker infra):
- Daily candles: about 4 ms cached vs about 2.3 s cold.
- 10-symbol scan: about 3 ms with a warm cache.
- Monitor pass over 201 active setups: about 250 ms once the cache is warm.

---

## Data model

| Table | Purpose |
|---|---|
| `users` | Accounts (email, BCrypt hash) |
| `watchlists` | `(user_id, symbol)`, unique per user |
| `setups` | Name, `technical_conditions` (jsonb), `fundamental_conditions` (jsonb), `fundamental_mode`, `order_rule` (jsonb), `timeframe`, `universe` (jsonb), `active` |
| `setup_matches` | One row per alert: symbol, time, condition snapshots |
| `backtest_runs` / `backtest_trades` / `backtest_results` | Backtest history |
| `setup_rankings` | Aggregate backtest score per setup |

Migrations live in `backend/parakh-core/src/main/resources/db/migration` (`V1` schema, `V2` timeframe + universe).

Example technical condition (JSON stored in `setups.technical_conditions`):
```json
{ "indicator": "SMA", "params": { "period": 50 }, "operator": "crosses_above",
  "compareTo": "indicator", "compareIndicator": "SMA", "compareParams": { "period": 200 }, "logic": "AND" }
```
Older formats (`LESS_THAN`, `CROSSES_ABOVE`, an indicator stored inside `value`) are normalised when read.

---

## API reference

**parakh-core (:8080)**

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login` | Returns `{ user, accessToken }` |
| GET / POST / DELETE | `/api/watchlist`, `/api/watchlist/{symbol}` | Watchlist |
| GET / POST | `/api/setups` | List / create setups |
| GET / PATCH / DELETE | `/api/setups/{id}` | Read / update / delete |
| PATCH | `/api/setups/{id}/activate` | Toggle monitoring |
| POST | `/api/setups/{id}/duplicate` | Copy a setup |
| GET | `/api/alerts` | Latest 50 matches |

**parakh-engine (:8082)**

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/market/candles/{sym}?resolution=D&from&to` | public | OHLCV |
| GET | `/api/market/quote/{sym}` | public | Latest quote |
| GET | `/api/market/quotes?symbols=A,B` | public | Batch quotes |
| GET | `/api/market/fundamentals/{sym}` | public | Normalised fundamentals |
| GET | `/api/market/search?q=` | public | Symbol search |
| POST / DELETE | `/api/market/subscribe/{sym}` | public | Start / stop live polling |
| GET | `/api/indicators/{sym}?resolution=D` | public | Latest indicator snapshot |
| POST | `/api/scanner/run` | JWT | Scan a saved or inline setup |
| POST | `/api/backtests` | JWT | Start a backtest |
| GET | `/api/backtests/{id}/status`, `/{id}/playback` | JWT | Progress / results |
| GET | `/api/backtests/mine` | JWT | Recent runs |

**Socket.IO (:3009)**
- The client emits `subscribe:symbol` / `unsubscribe:symbol`.
- The server emits `price:update` and `alert:fired`.

---

## Project structure

```
Parakh/
├── backend/
│   ├── parakh-common/   analysis/ (Candles, IndicatorMath, SetupEvaluator), domain/, dto/, constants/
│   ├── parakh-core/     controller/, service/ (Setup, Watchlist, Auth, SetupTriggerListener), websocket/, db/migration/
│   ├── parakh-engine/   market/ (YahooFinanceClient, MarketService), cache/ (TieredCache), scanner/,
│   │                    backtest/, indicator/, security/ (JwtAuthFilter), events/, repository/
│   └── parakh-app/      all-in-one launcher: core + engine in one JVM, in-process events (for small hosts)
├── frontend/src/
│   ├── pages/           Workspace (app shell), Login, Register
│   ├── components/
│   │   ├── chart/       ChartView, SidePanel, overlays (custom drawings), tools, levels, drawings
│   │   ├── setups/      SetupsView, SetupEditor
│   │   ├── scanner/ backtest/ alerts/ layout/ ui/
│   ├── store/           auth, socket, watchlist, setups, alerts, ui, toasts (Zustand)
│   └── lib/             api (with SWR cache), catalog (indicators/metrics/templates), types, format
├── infra/               docker-compose.yml, nginx/, prometheus/, grafana/, vector/
├── loadtests/           k6 scenarios
├── scripts/dev.sh       one-command local start
├── Dockerfile           lean image for parakh-app (Render / any single-container host)
└── render.yaml          Render Blueprint: API, static frontend, Postgres, Key Value
```

---

## Getting started

**Prerequisites:** Java 21+, Maven 3.9+, Node 20+, Docker Desktop.

```bash
npm install
```
```bash
npm run dev
```
`npm run dev` starts Postgres, TimescaleDB, Redis, Kafka and PgBouncer in Docker, then runs core, engine and the frontend (http://localhost:5173). Flyway applies migrations on core start-up.

Run pieces individually:
```bash
npm run infra:up
```
```bash
mvn -f backend spring-boot:run -pl parakh-core
```
```bash
mvn -f backend spring-boot:run -pl parakh-engine
```
```bash
npm run dev -w frontend
```

Default local account (seeded): `admin@parakh.com` / `password123`.

Production-style: `npm run docker:build && npm run docker:up` serves everything behind Nginx on port 80.

---

## Deploying free on Render

The full stack (two services, Kafka, Redis, Socket.IO on its own port) doesn't fit Render's free tier: 512 MB RAM, 0.1 CPU, one public port, no Kafka. So the repo also ships a **single-container mode**:

| Normal (Docker Compose) | Render free (`parakh-app`) |
|---|---|
| `parakh-core` and `parakh-engine` as two JVMs | One JVM running both (`backend/parakh-app`) |
| Engine → core events over Kafka | Delivered in-process (`MESSAGING_MODE=inprocess`) |
| Redis shared cache | Optional: used when `REDIS_URL` is set; otherwise in-memory only |
| Socket.IO push on port 3009 | Off (`REALTIME_ENABLED=false`); the UI polls prices every 10 s and alerts every minute |
| Frontend served by Nginx | Render static site (free, CDN, no instance hours); `/api/*` is rewritten to the API |

### What the image does to fit in 512 MB
- **Multi-stage build:** Maven builds only `parakh-app` and its modules. The runtime is the JRE on Alpine, and the app runs as a non-root user.
- **Faster start-up:** the fat jar is **extracted**, which starts faster and uses less memory than a nested jar.
- **JVM tuning:**
  - `SerialGC` (smallest collector);
  - C1-only JIT (`TieredStopAtLevel=1`), which needs less memory and CPU on 0.1 vCPU;
  - heap capped at 60 % of the container;
  - bounded metaspace and code cache;
  - `ExitOnOutOfMemoryError`, so Render restarts the service instead of leaving it hung.
- **App settings:**
  - 5 database connections (free Postgres tiers allow few);
  - in-memory cache capped at 400 entries;
  - Kafka auto-configuration excluded;
  - quieter logging;
  - setup scans every 3 min and price polling every 20 s on the free plan.

### Steps
1. Push the repo to GitHub.
2. In Render: **New → Blueprint**, pick the repo. `render.yaml` creates:
   - `parakh-api`: a Docker web service, built from `./Dockerfile`, with health check `/actuator/health`;
   - `parakh-web`: a static site built from `frontend/` with `VITE_REALTIME=false`;
   - `parakh-db`: Postgres, passed to the API as `DATABASE_URL` (converted to JDBC automatically);
   - `parakh-cache`: Key Value, passed as `REDIS_URL`;
   - `JWT_SECRET`: generated for you.
3. After the first deploy, check the API's URL. If it isn't `https://parakh-api.onrender.com`, update the `/api/*` rewrite destination in `render.yaml` (or in the static site's **Redirects/Rewrites** settings).
4. Open the static site's URL and create an account.

Flyway creates the schema on first start. The first boot on a free instance takes about 1–2 minutes.

Measured locally with the same limits (`docker run -m 512m --cpus 0.1`):
- **Start-up:** about 135 s to healthy.
- **Memory:** about 270 MB steady, and 274 MB after scanning 48 stocks. That leaves roughly 240 MB of headroom, with no out-of-memory kills.
- **Fundamentals:** 0.3–6 s cold. The 6 s case includes Yahoo's one-time cookie handshake.
- **Candles:** 1–3 s cold, about 0.5 s cached.
- **Scanning 48 stocks:** 8.7 s cold, 0.8 s warm.

### Running it next to another free backend
- **Instance hours:** free web services in a workspace share **750 instance-hours a month**. One service running non-stop uses about 744, so two always-on services won't fit. Free services **sleep after 15 minutes** without traffic and only use hours while awake, so Parakh and another backend can share the allowance if neither is kept awake 24/7. The static frontend doesn't count.
- **Database and Key Value limits:** a workspace can have only **one free Postgres** and **one free Key Value**. If your other backend already uses them, either:
  - point `DATABASE_URL` at a free external Postgres (Neon, Supabase), remembering to keep `?sslmode=require`; or
  - reuse the existing database by creating a separate database or schema for Parakh;
  - and delete the `parakh-cache` block. The API runs fine without Redis.
- **Free Postgres expiry:** Render's free Postgres **expires after 30 days**. For anything long-lived, use Neon or Supabase.

### While the API is asleep
Setup monitoring only runs while the instance is awake. The first request after a sleep wakes it, which takes about a minute. Alerts that matter to you require the service to be awake, e.g. by a free uptime pinger hitting `/actuator/health`. That spends instance hours, so do it for one service at most.

### Running the single-container image anywhere
```bash
docker build -t parakh .
```
```bash
docker run -p 8080:8080 -m 512m -e DATABASE_URL=postgres://user:pass@host:5432/parakh -e JWT_SECRET=change-me parakh
```

On a bigger host, run the Compose stack instead, or set `MESSAGING_MODE=kafka`, `SPRING_AUTOCONFIGURE_EXCLUDE=` (empty) and `REALTIME_ENABLED=true` to turn Kafka and Socket.IO back on.

---

## Configuration

| Variable | Default | Used by |
|---|---|---|
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://localhost:5434/parakh` | core, engine |
| `REDIS_HOST` / `REDIS_PORT` | `localhost` / `6379` | core, engine |
| `KAFKA_BROKERS` | `localhost:29092` | core, engine |
| `JWT_SECRET` | `parakh_secret` (**change it**; must match in both services) | core, engine |
| `WEBSOCKET_PORT` | `3009` | core |
| `MARKET_POLL_INTERVAL_MS` | `5000` | engine |
| `SCANNER_ENABLED` | `true` | engine |
| `SCANNER_INTERVAL_MS` | `60000` | engine |
| `DATABASE_URL` | none | parakh-app: `postgres://…` URL, converted to JDBC |
| `REDIS_URL` | none | parakh-app: enables the Redis cache layer |
| `PORT` | `8080` | parakh-app HTTP port (set by Render) |
| `MESSAGING_MODE` | `inprocess` (parakh-app) / `kafka` (services) | engine → core events |
| `REALTIME_ENABLED` | `false` (parakh-app) / `true` (core) | Socket.IO server |
| `REDIS_ENABLED` | `false` (parakh-app) / `true` (services) | Redis cache layer |
| `CACHE_L1_MAX_ENTRIES` | `400` (parakh-app) / `5000` | in-memory cache size |
| `DB_POOL_SIZE` | `5` | parakh-app connection pool |
| `JAVA_OPTS` | tuned for 512 MB | JVM flags in the Docker image |
| `VITE_REALTIME` | unset (on) | frontend build: `false` disables the socket and polls instead |

---

## Testing

```bash
mvn -f backend test -pl parakh-engine -am
```
`AnalysisEngineTest` covers:
- SMA/EMA/RSI against hand-computed values;
- breakout + volume confirmation;
- indicator-vs-indicator crossovers;
- that "RSI > 70" compares RSI, not price;
- fundamental key aliases and the missing-data fail rule;
- next-bar-open entries, take-profit exits, and short trades.

```bash
npm run build -w frontend
```
This type-checks and builds the frontend.

```bash
k6 run loadtests/realistic_sustained.js
```
This runs the load-test scenario.

---

## Known limitations

- **Delayed data:** Yahoo Finance prices may be delayed, and the endpoints are unofficial and can rate-limit. Swap `YahooFinanceClient` for a licensed feed for production use.
- **Fundamentals are current-only:** backtests can optionally gate on *today's* fundamentals; historical point-in-time fundamentals aren't available.
- **Live alerts with several core replicas:** alerts are pushed by the core instance that consumes the Kafka event, so multiple core replicas need a shared Socket.IO adapter (e.g. Redis pub/sub) to reach every browser.
- **Drawings stay in the browser:** they're saved in `localStorage`, so they're per browser and don't sync across devices.
- **Port clash:** `kafka-ui` in `docker-compose.yml` also maps port 8080, so don't start it together with a locally run `parakh-core`.

---

## License

MIT
