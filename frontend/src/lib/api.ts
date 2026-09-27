import { useAuthStore } from '../store/authStore';

const BASE_URL = '/api';

async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const token = useAuthStore.getState().token;
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    if (response.status === 401) useAuthStore.getState().logout();
    const err = await response.json().catch(() => ({ message: 'API Error' }));
    const message = Array.isArray(err.message) ? err.message[0] : err.message;
    throw new Error(message || response.statusText || 'API Error');
  }

  return response.json();
}

const post = (url: string, data?: unknown) =>
  fetchWithAuth(url, { method: 'POST', ...(data ? { body: JSON.stringify(data) } : {}) });

const patch = (url: string, data?: unknown) =>
  fetchWithAuth(url, { method: 'PATCH', ...(data ? { body: JSON.stringify(data) } : {}) });

const del = (url: string) => fetchWithAuth(url, { method: 'DELETE' });

export const api = {
  // Auth
  login: (data: unknown) => post('/auth/login', data),
  register: (data: unknown) => post('/auth/register', data),

  // Watchlist
  getWatchlist: () => fetchWithAuth('/watchlist'),
  addToWatchlist: (symbol: string) => post('/watchlist', { symbol }),
  removeFromWatchlist: (symbol: string) => del(`/watchlist/${symbol}`),

  // Market data
  getCandles: (symbol: string, resolution: string) =>
    fetchWithAuth(`/market/candles/${symbol}?resolution=${resolution}`),
  getQuote: (symbol: string) => fetchWithAuth(`/market/quote/${symbol}`),
  searchSymbol: (query: string) =>
    fetchWithAuth(`/market/search?q=${encodeURIComponent(query)}`),
  subscribeMarket: (symbol: string) => post(`/market/subscribe/${symbol}`),
  unsubscribeMarket: (symbol: string) => del(`/market/subscribe/${symbol}`),

  // Setups
  getSetups: () => fetchWithAuth('/setups'),
  getSetup: (id: string) => fetchWithAuth(`/setups/${id}`),
  createSetup: (data: unknown) => post('/setups', data),
  updateSetup: (id: string, data: unknown) => patch(`/setups/${id}`, data),
  toggleSetupActive: (id: string) => patch(`/setups/${id}/activate`),
  duplicateSetup: (id: string) => post(`/setups/${id}/duplicate`),
  deleteSetup: (id: string) => del(`/setups/${id}`),

  // Backtests
  runBacktest: (data: unknown) => post('/backtests', data),
  getBacktestStatus: (runId: string) => fetchWithAuth(`/backtests/${runId}/status`),
  getBacktestPlayback: (runId: string) => fetchWithAuth(`/backtests/${runId}/playback`),
  getBacktestRun: (runId: string) => fetchWithAuth(`/backtests/${runId}`),
  getSetupBacktests: (setupId: string) => fetchWithAuth(`/backtests/setup/${setupId}`),
  getLeaderboard: () => fetchWithAuth('/backtests/leaderboard/top'),
};
