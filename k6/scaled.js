import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 }, // Ramp up to 50 users over 30s
    { duration: '1m', target: 100 },  // Increase to 100 users for 1m
    { duration: '10s', target: 0 },   // Ramp down to 0 users over 10s
  ],
};

const BASE_URL = 'http://localhost:80/api';

export default function () {
  const res = http.get(`${BASE_URL}/health`);
  check(res, {
    'status is 200': (r) => r.status === 200,
  });
  sleep(0.5);
}
