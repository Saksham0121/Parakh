/**
 * ============================================================================
 * Production-Grade Realistic Load Test: In-Memory / Cache-Fronted Architecture
 * ============================================================================
 * Target System: Spring Boot / Redis / PostgreSQL (TimescaleDB) / CDN Proxy
 * 
 * Workload & Persona Distribution:
 *  - Hot-Cache Consumers (~65%): Repeated requests for popular items/quotes.
 *  - Cold-Cache / Long-Tail (~25%): Wide time ranges, long-tail symbols,
 *    and dynamic queries forcing cache misses to exercise the origin DB.
 *  - Dynamic State Changers (~10%): POST/PUT mutations or heavy CPU/analytical workloads.
 *
 * Metrics & Observability:
 *  - Separate custom Trend metrics for Cache Hits vs. Cache Misses.
 *  - Evaluates standard CDN/Proxy headers (X-Cache, CF-Cache-Status, X-Proxy-Cache)
 *    with latency-based fallback.
 *  - Thresholds enforced on p95 latencies, minimum RPS throughput, and error rates.
 *  - Randomized Gaussian-like sleep jitter to eliminate synchronous VU burst anomalies.
 * ============================================================================
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';

// ----------------------------------------------------------------------------
// Custom Metrics Configuration
// ----------------------------------------------------------------------------
export const cacheHitDuration = new Trend('cache_hit_duration', true);
export const cacheMissDuration = new Trend('cache_miss_duration', true);
export const mutationDuration = new Trend('mutation_duration', true);

export const cacheHitsCount = new Counter('cache_hits_total');
export const cacheMissesCount = new Counter('cache_misses_total');
export const cacheHitRate = new Rate('cache_hit_ratio');
export const backendErrorRate = new Rate('backend_error_rate');

// ----------------------------------------------------------------------------
// Test Configuration & Target Environment
// ----------------------------------------------------------------------------
const BASE_URL = __ENV.TARGET_URL || 'http://localhost:8082';
const CORE_URL = __ENV.CORE_URL || 'http://localhost:8080';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

// High-demand items (Hot Cache Pool: ~80% of consumer traffic targets these 5 items)
const HOT_SYMBOLS = [
  'RELIANCE.NS',
  'TCS.NS',
  'HDFCBANK.NS',
  'INFY.NS',
  'TATAMOTORS.NS',
];

// Long-tail items (Cold Cache / Long-Tail Pool: large surface area forcing DB queries)
const COLD_SYMBOLS = [
  'WIPRO.NS', 'SBIN.NS', 'ICICIBANK.NS', 'BHARTIARTL.NS', 'ITC.NS',
  'KOTAKBANK.NS', 'LT.NS', 'AXISBANK.NS', 'ASIANPAINT.NS', 'MARUTI.NS',
  'TITAN.NS', 'BAJFINANCE.NS', 'SUNPHARMA.NS', 'ULTRACEMCO.NS', 'NESTLEIND.NS',
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META', 'NFLX', 'AMD', 'INTC'
];

// Active Setup IDs discovered from the live PostgreSQL database for backtest mutations
const VALID_SETUP_IDS = [
  '78b0a2af-2361-4d9f-bf68-5568be9d9b4a',
  'ff575807-52ae-45b7-a69e-9dc555fba58f',
  'ea63c60a-423b-4dc4-b322-5bbe516fe43a',
  '3a97b67b-4f2d-49c9-9e7d-3c46637e75a2',
];

// ----------------------------------------------------------------------------
// Load Stages & Execution Lifecycle
// ----------------------------------------------------------------------------
const isFullProfile = __ENV.TEST_PROFILE === 'full' || __ENV.FULL_TEST === 'true';

const stages = isFullProfile
  ? [
      // Full 8.5-minute Enterprise Soak Profile
      { duration: '30s', target: 20 },   // Warm-up & Cache Pre-population
      { duration: '1m30s', target: 80 }, // Linear Ramp-up to Expected Peak
      { duration: '3m', target: 80 },    // Steady Sustained Peak
      { duration: '1m', target: 150 },   // Stress Spike (sudden volatility burst)
      { duration: '2m', target: 80 },    // Post-Spike Soak (resource stabilization)
      { duration: '30s', target: 0 },    // Controlled Cooldown & Drain
    ]
  : [
      // Standard 90-second Multi-Phase Execution
      { duration: '15s', target: 15 },   // Warm-up & Cache priming
      { duration: '30s', target: 35 },   // Sustained peak load
      { duration: '20s', target: 60 },   // Stress spike
      { duration: '15s', target: 25 },   // Post-spike soak
      { duration: '10s', target: 0 },    // Controlled cooldown
    ];

export const options = {
  scenarios: {
    realistic_production_traffic: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: stages,
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    // 1. Error Rate: Hard SLA: less than 1% failed requests across the entire test
    'http_req_failed': [
      { threshold: 'rate<0.01', abortOnFail: false }
    ],
    'backend_error_rate': [
      { threshold: 'rate<0.01', abortOnFail: false }
    ],

    // 2. Cache Hit Performance: Sub-35ms p95 latency expected from Redis/Proxy/CDN
    'cache_hit_duration': [
      { threshold: 'p(90)<20', abortOnFail: false },
      { threshold: 'p(95)<35', abortOnFail: false },
      { threshold: 'p(99)<75', abortOnFail: false }
    ],

    // 3. Cache Miss / Origin DB Performance: Sub-600ms p95 latency for DB scans/joins
    'cache_miss_duration': [
      { threshold: 'p(90)<400', abortOnFail: false },
      { threshold: 'p(95)<650', abortOnFail: false },
      { threshold: 'p(99)<1500', abortOnFail: false }
    ],

    // 4. Mutation / Analytical Compute Performance
    'mutation_duration': [
      { threshold: 'p(95)<750', abortOnFail: false }
    ],

    // 5. Throughput Rate: Maintain minimum sustainable HTTP RPS
    'http_reqs': [
      { threshold: 'rate>10', abortOnFail: false }
    ],
  },
};

// ----------------------------------------------------------------------------
// Helper Utilities
// ----------------------------------------------------------------------------
function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Dynamic randomized think time (jitter) to prevent artificial
 * synchronous request lockstep (micro-bursting).
 */
function dynamicThinkTime(minSec = 0.5, maxSec = 2.0) {
  const duration = minSec + Math.random() * (maxSec - minSec);
  sleep(duration);
}

/**
 * Inspect response headers and characteristics to determine Cache Status.
 * Checks standard CDN, Nginx, Varnish, Redis, and Cloudflare indicators.
 */
function extractCacheStatus(res) {
  const headers = res.headers;

  // Cloudflare
  const cfCache = headers['Cf-Cache-Status'] || headers['cf-cache-status'];
  if (cfCache) {
    const val = cfCache.toUpperCase();
    if (val === 'HIT') return 'HIT';
    if (val === 'MISS' || val === 'EXPIRED' || val === 'BYPASS' || val === 'DYNAMIC') return 'MISS';
  }

  // Generic reverse proxies (Nginx, Varnish, Fastly, AWS CloudFront, Squid)
  const xCache = headers['X-Cache'] || headers['x-cache'] ||
                 headers['X-Cache-Status'] || headers['x-cache-status'] ||
                 headers['X-Proxy-Cache'] || headers['x-proxy-cache'];
  if (xCache) {
    const val = xCache.toUpperCase();
    if (val.includes('HIT')) return 'HIT';
    if (val.includes('MISS') || val.includes('BYPASS')) return 'MISS';
  }

  // Application custom header (e.g., from Spring Boot / Redis service)
  const appCache = headers['X-App-Cache'] || headers['x-app-cache'];
  if (appCache) {
    return appCache.toUpperCase().includes('HIT') ? 'HIT' : 'MISS';
  }

  // Age header: HTTP standard; if Age > 0, proxy served cached response
  const age = headers['Age'] || headers['age'];
  if (age !== undefined && parseInt(age, 10) > 0) {
    return 'HIT';
  }

  // Application-level cache stamp (e.g., Parakh Redis/in-memory cached quote payload)
  if (res.body && typeof res.body === 'string' && res.body.includes('_softExpiresAt')) {
    return 'HIT';
  }

  // Fallback: If no cache headers are emitted by the proxy, infer from latency
  // In-memory/local Redis proxy hits generally resolve in < 25ms.
  return res.timings.duration < 25 ? 'HIT' : 'MISS';
}

function getStandardHeaders() {
  const headers = {
    'Accept': 'application/json',
    'User-Agent': 'k6-load-engine/2.0 (SRE Performance Suite)',
  };
  if (AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  }
  return headers;
}

// ----------------------------------------------------------------------------
// Persona 1: Hot-Cache Consumers (~65% of traffic)
// Queries frequent, high-volume entities that reside in L1/L2 cache.
// ----------------------------------------------------------------------------
function executeHotCachePersona() {
  const symbol = getRandomItem(HOT_SYMBOLS);
  const endpointType = Math.random();

  let res;
  if (endpointType < 0.60) {
    // 60% of hot traffic: Live quote endpoint
    res = http.get(`${BASE_URL}/api/market/quote/${symbol}`, {
      headers: getStandardHeaders(),
      tags: { persona: 'hot_consumer', type: 'quote' },
    });
  } else {
    // 40% of hot traffic: Standard daily candles (cached timeframe)
    res = http.get(`${BASE_URL}/api/market/candles/${symbol}?resolution=D`, {
      headers: getStandardHeaders(),
      tags: { persona: 'hot_consumer', type: 'candles_daily' },
    });
  }

  const isSuccess = check(res, {
    'hot cache request status 200': (r) => r.status === 200,
  });

  if (!isSuccess) {
    backendErrorRate.add(1);
  } else {
    backendErrorRate.add(0);
    const status = extractCacheStatus(res);
    if (status === 'HIT') {
      cacheHitsCount.add(1);
      cacheHitRate.add(1);
      cacheHitDuration.add(res.timings.duration, { cache_status: 'HIT', persona: 'hot_consumer' });
    } else {
      cacheMissesCount.add(1);
      cacheHitRate.add(0);
      cacheMissDuration.add(res.timings.duration, { cache_status: 'MISS', persona: 'hot_consumer' });
    }
  }

  // Dynamic user pacing
  dynamicThinkTime(0.3, 1.2);
}

// ----------------------------------------------------------------------------
// Persona 2: Cold-Cache / Long-Tail Explorers (~25% of traffic)
// Queries wide historical intervals, deep pagination, and varied symbols to force DB I/O.
// ----------------------------------------------------------------------------
function executeColdCachePersona() {
  const symbol = getRandomItem(COLD_SYMBOLS);
  const actionType = Math.random();

  let res;
  if (actionType < 0.50) {
    // Wide time-series historical query forcing origin DB (TimescaleDB / Postgres) scan
    const now = Math.floor(Date.now() / 1000);
    const daysBack = getRandomInt(180, 720); // 6 months to 2 years back
    const from = now - daysBack * 86400;
    const to = from + getRandomInt(30, 90) * 86400;
    const resolution = getRandomItem(['1', '5', '15', '60']); // intraday resolutions

    res = http.get(`${BASE_URL}/api/market/candles/${symbol}?resolution=${resolution}&from=${from}&to=${to}`, {
      headers: getStandardHeaders(),
      tags: { persona: 'cold_explorer', type: 'candles_historical_range' },
    });
  } else if (actionType < 0.80) {
    // Dynamic query search with high entropy / randomized query term
    const queryTerm = symbol.substring(0, 3) + '_' + getRandomInt(10, 99);
    res = http.get(`${BASE_URL}/api/market/search?q=${queryTerm}`, {
      headers: getStandardHeaders(),
      tags: { persona: 'cold_explorer', type: 'symbol_search' },
    });
  } else {
    // Technical Indicator computation with dynamic period forcing backend re-eval
    const period = getRandomInt(10, 50);
    res = http.get(`${BASE_URL}/api/indicators/${symbol}?indicator=RSI&period=${period}&resolution=5`, {
      headers: getStandardHeaders(),
      tags: { persona: 'cold_explorer', type: 'indicator_calc' },
    });
  }

  const isSuccess = check(res, {
    'cold request completed without server crash': (r) => r.status < 500,
  });

  if (!isSuccess || res.status >= 400) {
    backendErrorRate.add(1);
  } else {
    backendErrorRate.add(0);
    const status = extractCacheStatus(res);
    if (status === 'HIT') {
      cacheHitsCount.add(1);
      cacheHitRate.add(1);
      cacheHitDuration.add(res.timings.duration, { cache_status: 'HIT', persona: 'cold_explorer' });
    } else {
      cacheMissesCount.add(1);
      cacheHitRate.add(0);
      cacheMissDuration.add(res.timings.duration, { cache_status: 'MISS', persona: 'cold_explorer' });
    }
  }

  // Think time reflecting longer analysis of charts
  dynamicThinkTime(1.0, 3.0);
}

// ----------------------------------------------------------------------------
// Persona 3: Dynamic State Changers & Analytical Mutators (~10% of traffic)
// Executes POST/PUT operations, cache invalidation, and heavy CPU workloads.
// ----------------------------------------------------------------------------
function executeMutationPersona() {
  const actionType = Math.random();
  let res;

  if (actionType < 0.40) {
    // Analytical workload: Run or enqueue backtest simulation against verified setup
    const payload = JSON.stringify({
      setupId: getRandomItem(VALID_SETUP_IDS),
      symbol: getRandomItem(HOT_SYMBOLS),
      resolution: 'D',
      startDate: '2024-01-01T00:00:00Z',
      endDate: '2024-06-01T00:00:00Z',
      initialCapital: 100000,
    });

    res = http.post(`${BASE_URL}/api/backtests`, payload, {
      headers: Object.assign(getStandardHeaders(), { 'Content-Type': 'application/json' }),
      tags: { persona: 'state_changer', type: 'backtest_trigger' },
    });
  } else if (actionType < 0.75) {
    // Dynamic entity mutation: Subscribe symbol
    const symbol = getRandomItem(COLD_SYMBOLS);
    res = http.post(`${BASE_URL}/api/market/subscribe/${symbol}`, null, {
      headers: getStandardHeaders(),
      tags: { persona: 'state_changer', type: 'subscribe_symbol' },
    });
  } else {
    // Dynamic entity mutation: Unsubscribe symbol
    const symbol = getRandomItem(COLD_SYMBOLS);
    res = http.del(`${BASE_URL}/api/market/subscribe/${symbol}`, null, {
      headers: getStandardHeaders(),
      tags: { persona: 'state_changer', type: 'unsubscribe_symbol' },
    });
  }

  const isSuccess = check(res, {
    'mutation completed without 5xx error': (r) => r.status < 500,
  });

  if (!isSuccess) {
    backendErrorRate.add(1);
  } else {
    backendErrorRate.add(0);
    mutationDuration.add(res.timings.duration, { persona: 'state_changer' });
  }

  // Think time between state changes
  dynamicThinkTime(1.5, 4.0);
}

// ----------------------------------------------------------------------------
// Main Execution Entrypoint (Weighted Cumulative Distribution)
// ----------------------------------------------------------------------------
export default function () {
  const rand = Math.random();

  if (rand < 0.65) {
    // 65% Probability: Hot-Cache Consumer
    executeHotCachePersona();
  } else if (rand < 0.90) {
    // 25% Probability: Cold-Cache / Long-Tail Explorer
    executeColdCachePersona();
  } else {
    // 10% Probability: Dynamic State Changer / Compute Mutator
    executeMutationPersona();
  }
}

// ----------------------------------------------------------------------------
// Comprehensive CLI & Dashboard Summary Reporter
// ----------------------------------------------------------------------------
export function handleSummary(data) {
  const metrics = data.metrics;
  const totalReqs = metrics.http_reqs ? metrics.http_reqs.values.count : 0;
  const rps = metrics.http_reqs ? metrics.http_reqs.values.rate.toFixed(2) : 0;
  const failureRate = metrics.http_req_failed ? (metrics.http_req_failed.values.rate * 100).toFixed(2) : 0;
  
  const hitP95 = metrics.cache_hit_duration && metrics.cache_hit_duration.values['p(95)'] 
    ? metrics.cache_hit_duration.values['p(95)'].toFixed(2) : 'N/A';
  const missP95 = metrics.cache_miss_duration && metrics.cache_miss_duration.values['p(95)'] 
    ? metrics.cache_miss_duration.values['p(95)'].toFixed(2) : 'N/A';
  const mutP95 = metrics.mutation_duration && metrics.mutation_duration.values['p(95)'] 
    ? metrics.mutation_duration.values['p(95)'].toFixed(2) : 'N/A';
    
  const hitRatio = metrics.cache_hit_ratio 
    ? (metrics.cache_hit_ratio.values.rate * 100).toFixed(2) : 'N/A';

  const dataReceived = metrics.data_received ? (metrics.data_received.values.count / (1024 * 1024)).toFixed(2) : 0;
  const dataSent = metrics.data_sent ? (metrics.data_sent.values.count / (1024 * 1024)).toFixed(2) : 0;

  const summary = `
================================================================================
                    SRE PERFORMANCE & LOAD TEST SUMMARY REPORT
================================================================================
Throughput & Volume:
  - Total HTTP Requests      : ${totalReqs}
  - Throughput (Avg RPS)     : ${rps} req/sec
  - Network Data Transferred : ${dataReceived} MB down / ${dataSent} MB up
  - Failure Rate (5xx/4xx)   : ${failureRate}%

Cache Efficiency:
  - Measured Cache Hit Ratio : ${hitRatio}% (Expected: ~60-70%)

Latency Breakdown (p95):
  - Cache Hit p95 Latency    : ${hitP95} ms (Target: < 35 ms)
  - Cache Miss p95 Latency   : ${missP95} ms (Target: < 500 ms)
  - Mutation p95 Latency     : ${mutP95} ms (Target: < 750 ms)
================================================================================
`;

  return {
    'stdout': summary,
    'loadtests/summary_report.json': JSON.stringify(data, null, 2),
  };
}
