import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

export const rate200 = new Rate('rate_200');
export const rate429 = new Rate('rate_429');
export const latency200 = new Trend('duration_200', true);
export const latency429 = new Trend('duration_429', true);
export const limitResetSuccess = new Rate('limit_reset_recovered');

export const options = {
  vus: 1,
  iterations: 1,
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

  // 1. Send an unthrottled burst of 120 requests from a single identity
  // The normal bucket size is 60 tokens, refill 1/s.
  for (let i = 0; i < 120; i++) {
    const res = http.get(`${BASE_URL}/watchlist`, { headers });
    const is200 = res.status === 200;
    const is429 = res.status === 429;

    rate200.add(is200);
    rate429.add(is429);

    if (is200) {
      latency200.add(res.timings.duration);
    } else if (is429) {
      latency429.add(res.timings.duration);
    }
  }

  // 2. Wait for refill window (3 seconds gives at least 3 fresh tokens at 1 token/s)
  sleep(3);

  // 3. Verify rate limit recovery after window
  const recoveryRes = http.get(`${BASE_URL}/watchlist`, { headers });
  const recovered = recoveryRes.status === 200;
  limitResetSuccess.add(recovered);

  check(recoveryRes, {
    'recovered after window (status 200)': (r) => r.status === 200,
  });
}
