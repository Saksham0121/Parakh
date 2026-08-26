import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from './authStore';

export interface PriceTick {
  symbol: string;
  price: number;
  volume?: number;
  timestamp: number;
}

interface SocketState {
  socket: Socket | null;
  prices: Record<string, PriceTick>;
  indicators: Record<string, Record<string, any>>; // symbol -> { indicatorType_params -> data }
  connect: () => void;
  disconnect: () => void;
  subscribeSymbol: (symbol: string) => void;
  unsubscribeSymbol: (symbol: string) => void;
  setPrice: (tick: PriceTick) => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  prices: {},
  indicators: {},

  connect: () => {
    if (get().socket) return;
    const token = useAuthStore.getState().token;
    
    // Connect to WS Gateway (proxy handles /socket.io to gateway)
    const socket = io('/', {
      auth: { token },
      transports: ['websocket'],
    });

    socket.on('connect', () => console.log('WebSocket connected'));
    
    socket.on('price:update', (tick: PriceTick) => {
      set((state) => ({
        prices: { ...state.prices, [tick.symbol]: tick },
      }));
    });

    socket.on('indicator:update', (data: any) => {
      const key = `${data.indicatorType}_${JSON.stringify(data.params)}`;
      set((state) => ({
        indicators: {
          ...state.indicators,
          [data.symbol]: {
            ...(state.indicators[data.symbol] || {}),
            [key]: data,
          },
        },
      }));
    });

    set({ socket });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null });
    }
  },

  subscribeSymbol: (symbol: string) => {
    get().socket?.emit('subscribe:symbol', { symbol });
  },

  unsubscribeSymbol: (symbol: string) => {
    get().socket?.emit('unsubscribe:symbol', { symbol });
  },

  setPrice: (tick: PriceTick) => {
    set((state) => ({
      prices: { ...state.prices, [tick.symbol]: tick },
    }));
  },
}));
