import { create } from 'zustand';
import { api } from '../lib/api';
import type { Alert } from '../lib/types';
import { useToastStore } from './toastStore';

interface AlertState {
  alerts: Alert[];
  unread: number;
  loaded: boolean;
  load: () => Promise<void>;
  /** Fetches alerts and toasts any that are new since the last fetch (used when there is no socket). */
  poll: () => Promise<void>;
  markRead: () => void;
  pushLive: (raw: Record<string, unknown>) => void;
}

export const useAlertStore = create<AlertState>((set, get) => ({
  alerts: [],
  unread: 0,
  loaded: false,
  load: async () => {
    try {
      const alerts = await api.getAlerts();
      set({ alerts, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  poll: async () => {
    try {
      const latest = await api.getAlerts();
      const known = new Set(get().alerts.map((a) => a.id));
      const fresh = get().loaded ? latest.filter((a) => !known.has(a.id)) : [];
      set((s) => ({ alerts: latest, loaded: true, unread: s.unread + fresh.length }));
      if (fresh.length === 1) {
        useToastStore.getState().push({ title: `${fresh[0].setupName} matched`, body: `${fresh[0].symbol} met every condition of your setup.`, tone: 'up' });
      } else if (fresh.length > 1) {
        useToastStore.getState().push({ title: `${fresh.length} new setup matches`, body: 'Open Alerts to see which stocks matched.', tone: 'up' });
      }
    } catch {
      /* offline or asleep: try again next tick */
    }
  },
  markRead: () => set({ unread: 0 }),
  pushLive: (raw) => {
    const alert: Alert = {
      id: String(raw.id ?? Date.now()),
      setupId: String(raw.setupId ?? ''),
      setupName: String(raw.setupName ?? 'Setup'),
      symbol: String(raw.symbol ?? ''),
      matchedAt: String(raw.matchedAt ?? new Date().toISOString()),
      technicalSnapshot: { close: raw.close as number, changePct: raw.changePct as number, timeframe: raw.timeframe as string, conditions: raw.technical as never },
      fundamentalsSnapshot: { conditions: raw.fundamental as never },
      fundamentalsPassed: Boolean(raw.fundamentalsPassed),
    };
    if (get().alerts.some((a) => a.id === alert.id)) return;
    set((s) => ({ alerts: [alert, ...s.alerts].slice(0, 100), unread: s.unread + 1 }));
    useToastStore.getState().push({ title: `${alert.setupName} matched`, body: `${alert.symbol} met every condition of your setup.`, tone: 'up' });
  },
}));
