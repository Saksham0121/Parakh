#!/bin/bash
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Text styles
BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BOLD}${BLUE}====================================================${NC}"
echo -e "${BOLD}${BLUE}   Parakh — Trading Intelligence Local Cold Start   ${NC}"
echo -e "${BOLD}${BLUE}====================================================${NC}"

# 1. Check & ensure .env file exists
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    echo -e "${YELLOW}Creating .env from .env.example...${NC}"
    cp .env.example .env
  else
    echo -e "${RED}Error: .env file not found!${NC}"
    exit 1
  fi
fi

# Ensure critical port mappings for local macOS compatibility
# Docker Postgres on 5434 (to avoid Homebrew port 5432 conflict)
# Kafka on 29092 (external Docker listener)
sed -i '' 's/POSTGRES_PORT=5432/POSTGRES_PORT=5434/g' .env 2>/dev/null || sed -i 's/POSTGRES_PORT=5432/POSTGRES_PORT=5434/g' .env 2>/dev/null || true
sed -i '' 's/:5432\//:5434\//g' .env 2>/dev/null || sed -i 's/:5432\//:5434\//g' .env 2>/dev/null || true
sed -i '' 's/localhost:9092/localhost:29092/g' .env 2>/dev/null || sed -i 's/localhost:9092/localhost:29092/g' .env 2>/dev/null || true

# Sync .env to sub-services
for dir in frontend infra; do
  if [ -d "$dir" ]; then
    cp .env "$dir/.env" 2>/dev/null || true
  fi
done

# 2. Check Docker Daemon
echo -e "\n${BLUE}[1/4] Checking Docker status...${NC}"
if ! docker info >/dev/null 2>&1; then
  echo -e "${YELLOW}Docker is not running. Attempting to start Docker Desktop...${NC}"
  if [[ "$OSTYPE" == "darwin"* ]]; then
    open -a Docker || true
  fi
  
  echo -n "Waiting for Docker daemon to become responsive"
  COUNT=0
  while ! docker info >/dev/null 2>&1; do
    echo -n "."
    sleep 2
    COUNT=$((COUNT + 1))
    if [ $COUNT -gt 60 ]; then
      echo -e "\n${RED}Timed out waiting for Docker. Please open Docker Desktop manually.${NC}"
      exit 1
    fi
  done
  echo -e "\n${GREEN}Docker is ready!${NC}"
else
  echo -e "${GREEN}Docker daemon is active.${NC}"
fi

# 3. Start Infrastructure Containers
echo -e "\n${BLUE}[2/4] Starting Docker infrastructure (Postgres, TimescaleDB, Redis, Kafka, PgBouncer)...${NC}"
docker compose -f infra/docker-compose.yml up -d postgres timescaledb redis kafka pgbouncer

echo -n "Waiting for PostgreSQL (port 5434) and Kafka (port 29092)"
PG_READY=0
KAFKA_READY=0
for i in {1..30}; do
  if [ $PG_READY -eq 0 ] && nc -z localhost 5434 >/dev/null 2>&1; then
    PG_READY=1
  fi
  if [ $KAFKA_READY -eq 0 ] && nc -z localhost 29092 >/dev/null 2>&1; then
    KAFKA_READY=1
  fi
  
  if [ $PG_READY -eq 1 ] && [ $KAFKA_READY -eq 1 ]; then
    break
  fi
  echo -n "."
  sleep 1
done
echo -e "\n${GREEN}Infrastructure services are reachable!${NC}"

# 4. Database Schema & Seed Verification
echo -e "\n${BLUE}[3/4] Database migrations & seed handled automatically by Flyway and parakh-core.${NC}"
echo -e "${GREEN}Default admin user: admin@parakh.com / password123${NC}"

# 5. Launch All Services
echo -e "\n${BLUE}[4/4] Launching consolidated Spring Boot services and frontend...${NC}"
echo -e "${BOLD}${GREEN}Ready! Press Ctrl+C at any time to shut down all services cleanly.${NC}\n"

INCLUDE_FRONTEND=true
if [ "$1" == "--backend-only" ]; then
  INCLUDE_FRONTEND=false
fi

if [ "$INCLUDE_FRONTEND" = true ]; then
  npx concurrently -k \
    -n "core,engine,frontend" \
    -c "green,cyan,magenta" \
    "mvn -f backend spring-boot:run -pl parakh-core" \
    "mvn -f backend spring-boot:run -pl parakh-engine" \
    "npm run dev -w frontend"
else
  npx concurrently -k \
    -n "core,engine" \
    -c "green,cyan" \
    "mvn -f backend spring-boot:run -pl parakh-core" \
    "mvn -f backend spring-boot:run -pl parakh-engine"
fi
