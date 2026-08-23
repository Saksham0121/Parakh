# Parakh — Project Flow

This document tracks the architecture and data flow of the Parakh platform as it evolves through development.

---

## Current State: Phase 1.1 — Foundation

### What's been set up
- **Monorepo structure** with npm workspaces (all services share one repo, each with independent package.json)
- **`@parakh/common`** package — shared DTOs, Kafka wrapper, logger, constants
- **Infrastructure** — Docker Compose with PostgreSQL, TimescaleDB, Redis, Kafka, Nginx
- **Environment config** — `.env.example` with all service variables

### Directory Layout
```
Parakh/
├── common/              # Shared package (@parakh/common)
├── infra/               # Docker, Nginx, monitoring configs
│   ├── docker-compose.yml
│   └── nginx/nginx.conf
├── package.json         # Root workspace config
├── tsconfig.base.json   # Shared TypeScript settings
├── .env.example         # Environment template
├── .gitignore
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
       ┌───────┴───────┐  ┌──────┴──────┐
       │  API Gateway  │  │  WS Gateway │
       └───────────────┘  └─────────────┘
               │
    ┌──────────┼──────────────┐
    │          │              │
┌───┴───┐ ┌───┴────┐  ┌─────┴─────┐
│Postgres│ │  Redis │  │   Kafka   │
│        │ │        │  │  (KRaft)  │
└────────┘ └────────┘  └───────────┘
    │
┌───┴────────┐
│TimescaleDB │
│(time-series)│
└─────────────┘
```

### Data Flow (planned for Phase 1)
```
Finnhub API ──→ market-data-service ──→ Kafka [price-ticks]
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
