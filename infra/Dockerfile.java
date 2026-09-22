# ═══════════════════════════════════════════════════════════════════════════
#  Parakh — Multi-Stage Java 21 & Spring Boot 3 Image
#  Target: Builds parakh-core or parakh-engine via Maven multi-module
# ═══════════════════════════════════════════════════════════════════════════

# ─── Stage 1: Build JARs ───────────────────────────────────────────────────
FROM maven:3.9.9-eclipse-temurin-21-alpine AS builder

WORKDIR /build

# Copy Maven POMs first for dependency caching
COPY backend/pom.xml ./
COPY backend/parakh-common/pom.xml ./parakh-common/
COPY backend/parakh-core/pom.xml ./parakh-core/
COPY backend/parakh-engine/pom.xml ./parakh-engine/

# Download dependencies offline
RUN mvn dependency:go-offline -B || true

# Copy all source code
COPY backend/parakh-common/src ./parakh-common/src
COPY backend/parakh-core/src ./parakh-core/src
COPY backend/parakh-engine/src ./parakh-engine/src

# Package production executable JARs
RUN mvn clean package -DskipTests -B

# ─── Stage 2: Minimal Production JRE Runtime ──────────────────────────────
FROM eclipse-temurin:21-jre-alpine AS production

ARG SERVICE_NAME
ENV SERVICE_NAME=${SERVICE_NAME}

# Create non-root user for security
RUN addgroup -g 1001 -S parakh && adduser -S parakh -u 1001

WORKDIR /app

# Copy the target fat JAR from builder
COPY --from=builder --chown=parakh:parakh /build/${SERVICE_NAME}/target/${SERVICE_NAME}-1.0.0-SNAPSHOT.jar /app/app.jar

USER parakh

# Optimized container JVM flags (G1GC, RAM sizing, fast entropy)
ENV JAVA_OPTS="-XX:+UseG1GC -XX:+UseStringDeduplication -XX:MaxRAMPercentage=75.0 -Djava.security.egd=file:/dev/./urandom"

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
