import { create } from 'zustand';
import { api } from '../lib/api';

export interface WatchlistItem {
  id?: string;
  userId?: string;
  symbol: string;
}

const STORAGE_KEY = 'parakh_watchlist';

const DEFAULT_WATCHLIST: WatchlistItem[] = [
  { symbol: 'RELIANCE.NS' },
  { symbol: 'TCS.NS' },
  { symbol: 'HDFCBANK.NS' },
  { symbol: 'INFY.NS' },
  { symbol: 'ICICIBANK.NS' },
];

function loadFromStorage(): WatchlistItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      return JSON.parse(raw);
    }
    saveToStorage(DEFAULT_WATCHLIST);
    return DEFAULT_WATCHLIST;
  } catch {
    return DEFAULT_WATCHLIST;
  }
}

function saveToStorage(items: WatchlistItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore quota errors
  }
}

interface WatchlistState {
  watchlist: WatchlistItem[];
  /** Load from DB — falls back to in-memory (localStorage) list if request fails */
  fetchWatchlist: () => Promise<void>;
  /** Add symbol — instant local update, async backend persist */
  addSymbol: (symbol: string) => Promise<void>;
  /** Remove symbol — instant local update, async backend delete */
  removeSymbol: (symbol: string) => Promise<void>;
}

export const useWatchlistStore = create<WatchlistState>((set) => ({
  // Hydrate from localStorage immediately so the list is available before any API call
  watchlist: loadFromStorage(),

  fetchWatchlist: async () => {
    try {
      const data: WatchlistItem[] = await api.getWatchlist();
      // Only replace local list if DB returned something — never clear with an empty response
      if (Array.isArray(data) && data.length > 0) {
        saveToStorage(data);
        set({ watchlist: data });
      }
    } catch {
      // Backend unreachable / 401 — keep the already-hydrated localStorage list as-is
    }
  },

  addSymbol: async (symbol: string) => {
    const sym = symbol.toUpperCase().trim();
    // 1. Instant local update (skip if already present)
    set((state) => {
      if (state.watchlist.some((w) => w.symbol === sym)) return state;
      const updated = [...state.watchlist, { symbol: sym }];
      saveToStorage(updated);
      return { watchlist: updated };
    });

    // 2. Persist to DB in the background; sync real IDs back if it succeeds
    try {
      await api.addToWatchlist(sym);
      const latest: WatchlistItem[] = await api.getWatchlist();
      if (Array.isArray(latest) && latest.length > 0) {
        saveToStorage(latest);
        set({ watchlist: latest });
      }
    } catch {
      // Local state already persisted — silently ignore backend error
    }
  },

  removeSymbol: async (symbol: string) => {
    const sym = symbol.toUpperCase().trim();
    // 1. Instant local remove
    set((state) => {
      const updated = state.watchlist.filter((w) => w.symbol !== sym);
      saveToStorage(updated);
      return { watchlist: updated };
    });
    // 2. Background DB delete
    api.removeFromWatchlist(sym).catch(() => {});
  },
}));
