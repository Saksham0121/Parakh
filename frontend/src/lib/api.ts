import { useAuthStore } from '../store/authStore';

const BASE_URL = '/api';

async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const token = useAuthStore.getState().token;
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    useAuthStore.getState().logout();
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'API Error' }));
    throw new Error(err.message || response.statusText);
  }

  return response.json();
}

export const api = {
  login: (data: any) => fetchWithAuth('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  register: (data: any) => fetchWithAuth('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  
  getWatchlist: () => fetchWithAuth('/watchlist'),
  addToWatchlist: (symbol: string) => fetchWithAuth('/watchlist', { method: 'POST', body: JSON.stringify({ symbol }) }),
  removeFromWatchlist: (symbol: string) => fetchWithAuth(`/watchlist/${symbol}`, { method: 'DELETE' }),
  
  getCandles: (symbol: string, resolution: string, from: number, to: number) => 
    fetchWithAuth(`/market/candles/${symbol}?resolution=${resolution}&from=${from}&to=${to}`),
  
  getQuote: (symbol: string) => fetchWithAuth(`/market/quote/${symbol}`),

  searchSymbol: (query: string) => fetchWithAuth(`/market/search?q=${query}`),

  getSetups: () => fetchWithAuth('/setups'),
  getSetup: (id: string) => fetchWithAuth(`/setups/${id}`),
  createSetup: (data: any) => fetchWithAuth('/setups', { method: 'POST', body: JSON.stringify(data) }),
  updateSetup: (id: string, data: any) => fetchWithAuth(`/setups/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  toggleSetupActive: (id: string) => fetchWithAuth(`/setups/${id}/activate`, { method: 'PATCH' }),
  duplicateSetup: (id: string) => fetchWithAuth(`/setups/${id}/duplicate`, { method: 'POST' }),
  deleteSetup: (id: string) => fetchWithAuth(`/setups/${id}`, { method: 'DELETE' }),

  runBacktest: (data: any) => fetchWithAuth('/backtests', { method: 'POST', body: JSON.stringify(data) }),
  getBacktestStatus: (runId: string) => fetchWithAuth(`/backtests/${runId}/status`),
  getBacktestPlayback: (runId: string) => fetchWithAuth(`/backtests/${runId}/playback`),
  getBacktestRun: (runId: string) => fetchWithAuth(`/backtests/${runId}`),
  getSetupBacktests: (setupId: string) => fetchWithAuth(`/backtests/setup/${setupId}`),
  getLeaderboard: () => fetchWithAuth('/backtests/leaderboard/top'),
};

