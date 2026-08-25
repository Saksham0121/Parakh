# Parakh — Project Flow

This document tracks the architecture and data flow of the Parakh platform as it evolves through development.

---

## Current State: Phase 3 — Observability, Resilience, and Polish

### What's been set up
- **Monorepo structure** with npm workspaces
- **`@parakh/common`** package — shared DTOs, Kafka wrapper, logger, metrics/tracing interceptors, constants
- **Infrastructure** — Docker Compose with PostgreSQL, TimescaleDB, Redis, Kafka, Nginx
- **Observability** — Prometheus, Grafana, Node Exporter, Kafka Exporter, Jaeger (OTel), VictoriaLogs + Vector
- **Resilience** — Opossum Circuit Breakers for Finnhub API calls
- **Scaling** — API Gateway scaled to 3 instances via Docker Compose replicas

### Directory Layout
```
Parakh/
├── api-gateway/         # Scaled to 3 replicas
├── alert-service/
├── backtest-service/
├── common/              # Shared package (@parakh/common)
├── frontend/            # React frontend
├── fundamentals-service/
├── indicator-service/
├── market-data-service/
├── setup-service/
├── user-service/
├── websocket-gateway/
├── infra/               # Docker, Nginx, Prometheus, Grafana, Vector configs
│   ├── docker-compose.yml
│   └── nginx/nginx.conf
├── package.json         # Root workspace config
├── tsconfig.base.json   # Shared TypeScript settings
└── flow.md              # This file
```

### Infrastructure Stack
```
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

### Data Flow (Phase 3)
```
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

*This document will be updated as each phase is completed.*
