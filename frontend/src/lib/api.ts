import { useAuthStore } from '../store/authStore';
import type { Alert, BacktestPlayback, BacktestRunSummary, Candles, Fundamentals, Quote, ScanResponse, Setup, SetupInput } from './types';

const BASE_URL = '/api';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
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
    const err = await response.json().catch(() => ({}));
    const message = Array.isArray(err.message) ? err.message[0] : err.message || err.error;
    throw new ApiError(message || response.statusText || 'Request failed', response.status);
  }
  return response.json();
}

const post = <T>(url: string, data?: unknown) =>
  request<T>(url, { method: 'POST', ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
const patch = <T>(url: string, data?: unknown) =>
  request<T>(url, { method: 'PATCH', ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
const del = <T>(url: string) => request<T>(url, { method: 'DELETE' });

/**
 * Small stale-while-revalidate cache for market reads: repeated views of the same chart are instant,
 * concurrent callers share one request, and stale entries are refreshed in the background.
 */
const memo = new Map<string, { at: number; value?: unknown; promise?: Promise<unknown> }>();

function cached<T>(key: string, ttlMs: number, load: () => Promise<T>, onRefresh?: (v: T) => void): Promise<T> {
  const hit = memo.get(key);
  const now = Date.now();
  if (hit?.promise) return hit.promise as Promise<T>;
  if (hit && 'value' in hit) {
    if (now - hit.at > ttlMs) {
      const p = load().then((v) => { memo.set(key, { at: Date.now(), value: v }); onRefresh?.(v); return v; })
        .catch(() => hit.value as T);
      memo.set(key, { ...hit, promise: p });
      p.finally(() => { const cur = memo.get(key); if (cur?.promise === p) memo.set(key, { at: cur.at, value: cur.value }); });
    }
    return Promise.resolve(hit.value as T);
  }
  const p = load().then((v) => { memo.set(key, { at: Date.now(), value: v }); return v; });
  memo.set(key, { at: now, promise: p });
  p.catch(() => memo.delete(key));
  return p;
}

export function peekCandles(symbol: string, resolution: string): Candles | undefined {
  return memo.get(`c:${symbol}:${resolution}`)?.value as Candles | undefined;
}

const CANDLE_TTL: Record<string, number> = { '1': 15e3, '5': 15e3, '15': 30e3, '30': 30e3, '60': 60e3, D: 120e3, W: 600e3, M: 600e3 };

export const api = {
  // Auth
  login: (data: { email: string; password: string }) => post<{ user: { id: string; email: string; name?: string }; accessToken: string }>('/auth/login', data),
  register: (data: { email: string; password: string; name?: string }) => post<{ user: { id: string; email: string; name?: string }; accessToken: string }>('/auth/register', data),

  // Watchlist
  getWatchlist: () => request<Array<{ id?: string; symbol: string }>>('/watchlist'),
  addToWatchlist: (symbol: string) => post('/watchlist', { symbol }),
  removeFromWatchlist: (symbol: string) => del(`/watchlist/${encodeURIComponent(symbol)}`),

  // Market data
  getCandles: (symbol: string, resolution: string, onRefresh?: (c: Candles) => void) =>
    cached(`c:${symbol}:${resolution}`, CANDLE_TTL[resolution] ?? 60e3,
      () => request<Candles>(`/market/candles/${encodeURIComponent(symbol)}?resolution=${resolution}`), onRefresh),
  getQuote: (symbol: string) => request<Quote>(`/market/quote/${encodeURIComponent(symbol)}`),
  getQuotes: (symbols: string[]) =>
    symbols.length ? request<Record<string, Quote>>(`/market/quotes?symbols=${symbols.map(encodeURIComponent).join(',')}`) : Promise.resolve({}),
  getFundamentals: (symbol: string) =>
    cached(`f:${symbol}`, 30 * 60e3, () => request<Fundamentals>(`/market/fundamentals/${encodeURIComponent(symbol)}`)),
  searchSymbol: (query: string) =>
    cached(`s:${query.toUpperCase()}`, 10 * 60e3,
      () => request<{ result: Array<{ symbol: string; description: string; exchange: string; type: string }> }>(`/market/search?q=${encodeURIComponent(query)}`)),
  subscribeMarket: (symbol: string) => post(`/market/subscribe/${encodeURIComponent(symbol)}`),
  unsubscribeMarket: (symbol: string) => del(`/market/subscribe/${encodeURIComponent(symbol)}`),

  // Setups
  getSetups: () => request<Setup[]>('/setups'),
  getSetup: (id: string) => request<Setup>(`/setups/${id}`),
  createSetup: (data: SetupInput) => post<Setup>('/setups', data),
  updateSetup: (id: string, data: SetupInput) => patch<Setup>(`/setups/${id}`, data),
  toggleSetupActive: (id: string) => patch<Setup>(`/setups/${id}/activate`),
  duplicateSetup: (id: string) => post<Setup>(`/setups/${id}/duplicate`),
  deleteSetup: (id: string) => del(`/setups/${id}`),

  // Scanner
  runScan: (data: Partial<SetupInput> & { setupId?: string; symbols?: string[] }) => post<ScanResponse>('/scanner/run', data),

  // Alerts
  getAlerts: () => request<Alert[]>('/alerts'),

  // Backtests
  runBacktest: (data: {
    setupId: string; symbol: string; startDate: string; endDate: string; timeframe?: string;
    initialCapital?: number; commissionPct?: number; positionSizePct?: number; applyFundamentals?: boolean;
  }) => post<{ runId: string; status: string }>('/backtests', data),
  getBacktestStatus: (runId: string) => request<{ status: string; progress: number; error?: string }>(`/backtests/${runId}/status`),
  getBacktestPlayback: (runId: string) => request<BacktestPlayback>(`/backtests/${runId}/playback`),
  getMyBacktests: () => request<BacktestRunSummary[]>('/backtests/mine'),
};
