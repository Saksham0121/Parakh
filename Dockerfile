# syntax=docker/dockerfile:1
# ═══════════════════════════════════════════════════════════════════════════
#  Parakh all-in-one backend (parakh-core + parakh-engine in one JVM)
#  Built for small hosts such as Render's free tier: 512 MB RAM, 0.1 CPU,
#  a single public port ($PORT) and no Kafka.
#
#    docker build -t parakh .
#    docker run -p 8080:8080 -e DATABASE_URL=postgres://user:pass@host:5432/db parakh
# ═══════════════════════════════════════════════════════════════════════════

# ─── 1. Build ──────────────────────────────────────────────────────────────
FROM maven:3.9.9-eclipse-temurin-21-alpine AS build
WORKDIR /build

# POMs first: dependency downloads stay cached until a pom.xml changes.
COPY backend/pom.xml ./
COPY backend/parakh-common/pom.xml parakh-common/
COPY backend/parakh-core/pom.xml   parakh-core/
COPY backend/parakh-engine/pom.xml parakh-engine/
COPY backend/parakh-app/pom.xml    parakh-app/
RUN mvn -B -q dependency:go-offline -DexcludeGroupIds=com.parakh || true

COPY backend/parakh-common/src parakh-common/src
COPY backend/parakh-core/src   parakh-core/src
COPY backend/parakh-engine/src parakh-engine/src
COPY backend/parakh-app/src    parakh-app/src
RUN mvn -B -q -pl parakh-app -am package -DskipTests \
 # Unpack the fat jar: an exploded classpath starts faster and uses less memory than nested jars.
 && java -Djarmode=tools -jar parakh-app/target/parakh-app.jar extract --destination /app

# ─── 2. Run ────────────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S parakh && adduser -S -G parakh parakh
WORKDIR /app
COPY --from=build --chown=parakh:parakh /app /app
USER parakh

# Memory budget for a 512 MB container:
#   heap ≈ 60 % of the limit, the rest for metaspace, code cache, thread stacks and native buffers.
# SerialGC has the smallest footprint; C1-only JIT (TieredStopAtLevel=1) cuts JIT memory and CPU,
# which matters on a fraction of a vCPU. Override JAVA_OPTS on larger instances.
ENV JAVA_OPTS="-XX:MaxRAMPercentage=60 -XX:InitialRAMPercentage=20 \
 -XX:+UseSerialGC -XX:TieredStopAtLevel=1 \
 -XX:MaxMetaspaceSize=160m -XX:ReservedCodeCacheSize=48m -XX:MaxDirectMemorySize=32m \
 -Xss512k -XX:+ExitOnOutOfMemoryError \
 -Djava.security.egd=file:/dev/./urandom -Dfile.encoding=UTF-8"

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-8080}/actuator/health" >/dev/null || exit 1

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/parakh-app.jar"]
