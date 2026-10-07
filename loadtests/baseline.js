import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics to strictly separate 200 vs 429 vs error responses
export const successRate = new Rate('successful_requests');
export const rate429 = new Rate('rate_429');
export const latency200 = new Trend('duration_successful_200', true);
export const latency429 = new Trend('duration_429', true);

export const options = {
  vus: 20,
  duration: '1m',
  thresholds: {
    // Hard rule: evaluate failure and duration on expected responses only
    'http_req_failed': ['rate<0.01'],
    'http_req_duration{expected_response:true}': ['p(95)<200'],
  },
};

const BASE_URL = __ENV.TARGET_URL || 'http://localhost/api';
const TOKEN = __ENV.TOKEN;

export default function () {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (TOKEN) {
    headers['Authorization'] = `Bearer ${TOKEN}`;
  }

  // Real DB-touching endpoint: /api/watchlist queries Postgres via Prisma & updates Redis rate-limiter
  const res = http.get(`${BASE_URL}/watchlist`, { headers });

  const is200 = res.status === 200;
  const is429 = res.status === 429;

  successRate.add(is200);
  rate429.add(is429);

  if (is200) {
    latency200.add(res.timings.duration);
  } else if (is429) {
    latency429.add(res.timings.duration);
  }

  check(res, {
    'status is 200': (r) => r.status === 200,
  });
}
