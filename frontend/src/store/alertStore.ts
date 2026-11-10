import { create } from 'zustand';
import { api } from '../lib/api';
import type { Alert } from '../lib/types';
import { useToastStore } from './toastStore';

interface AlertState {
  alerts: Alert[];
  unread: number;
  loaded: boolean;
  load: () => Promise<void>;
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
