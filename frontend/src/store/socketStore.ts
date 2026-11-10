import { create } from 'zustand';
import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from './authStore';
import { useAlertStore } from './alertStore';
import type { Quote } from '../lib/types';

export interface PriceTick {
  symbol: string;
  price: number;
  volume?: number;
  timestamp: number;
  changePct?: number;
  prevClose?: number;
}

interface SocketState {
  connected: boolean;
  prices: Record<string, PriceTick>;
  connect: () => void;
  disconnect: () => void;
  subscribeSymbol: (symbol: string) => void;
  unsubscribeSymbol: (symbol: string) => void;
  applyQuotes: (quotes: Record<string, Quote>) => void;
}

let socket: Socket | null = null;
const rooms = new Set<string>();

// Ticks are coalesced and flushed once per animation frame: 50 symbols ticking at once cause one render, not 50.
let pending: Record<string, PriceTick> = {};
let flushScheduled = false;

export const useSocketStore = create<SocketState>((set, get) => {
  const flush = () => {
    flushScheduled = false;
    const batch = pending;
    pending = {};
    set((s) => {
      const next = { ...s.prices };
      for (const [sym, tick] of Object.entries(batch)) {
        const prev = next[sym];
        const prevClose = tick.prevClose ?? prev?.prevClose;
        next[sym] = {
          ...prev,
          ...tick,
          prevClose,
          changePct: tick.changePct ?? (prevClose ? ((tick.price - prevClose) / prevClose) * 100 : prev?.changePct),
        };
      }
      return { prices: next };
    });
  };
  const queue = (tick: PriceTick) => {
    pending[tick.symbol] = { ...pending[tick.symbol], ...tick };
    if (!flushScheduled) {
      flushScheduled = true;
      requestAnimationFrame(flush);
    }
  };

  return {
    connected: false,
    prices: {},

    connect: () => {
      if (socket) return;
      const token = useAuthStore.getState().token;
      // netty-socketio reads the token from the handshake query, not from the socket.io v4 `auth` payload.
      socket = io('/', { query: token ? { token } : {}, transports: ['websocket'], reconnectionDelayMax: 10_000 });
      socket.on('connect', () => {
        set({ connected: true });
        for (const symbol of rooms) socket?.emit('subscribe:symbol', { symbol });
      });
      socket.on('disconnect', () => set({ connected: false }));
      socket.on('price:update', (tick: PriceTick) => {
        if (tick?.symbol && Number.isFinite(tick.price)) queue({ symbol: tick.symbol, price: tick.price, volume: tick.volume, timestamp: tick.timestamp });
      });
      socket.on('alert:fired', (alert) => useAlertStore.getState().pushLive(alert));
    },

    disconnect: () => {
      socket?.disconnect();
      socket = null;
      set({ connected: false });
    },

    subscribeSymbol: (symbol) => {
      const s = symbol.toUpperCase();
      if (rooms.has(s)) return;
      rooms.add(s);
      socket?.emit('subscribe:symbol', { symbol: s });
    },

    unsubscribeSymbol: (symbol) => {
      const s = symbol.toUpperCase();
      rooms.delete(s);
      socket?.emit('unsubscribe:symbol', { symbol: s });
    },

    applyQuotes: (quotes) => {
      for (const [sym, q] of Object.entries(quotes)) {
        if (q && Number.isFinite(q.c)) queue({ symbol: sym, price: q.c, timestamp: q.t, changePct: q.dp, prevClose: q.pc, volume: q.v });
      }
      void get;
    },
  };
});
