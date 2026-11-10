import { create } from 'zustand';

export type View = 'chart' | 'scanner' | 'setups' | 'backtest' | 'alerts';

interface UiState {
  view: View;
  symbol: string;
  watchCollapsed: boolean;
  searchOpen: boolean;
  watchOpen: boolean;
  /** Setup to open in the editor / backtest when navigating from elsewhere. */
  focusSetupId: string | null;
  setView: (v: View) => void;
  setSymbol: (s: string) => void;
  toggleWatch: () => void;
  setSearchOpen: (o: boolean) => void;
  setWatchOpen: (o: boolean) => void;
  openSetup: (id: string | null, view?: View) => void;
}

const read = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } };

const VIEWS: View[] = ['chart', 'scanner', 'setups', 'backtest', 'alerts'];
const initialView = (() => { const v = read('parakh:view', 'chart') as View; return VIEWS.includes(v) ? v : 'chart'; })();

export const useUiStore = create<UiState>((set) => ({
  view: initialView,
  symbol: read('parakh:symbol', 'RELIANCE.NS'),
  watchCollapsed: read('parakh:watchCollapsed', '0') === '1',
  searchOpen: false,
  watchOpen: false,
  focusSetupId: null,
  setView: (view) => { write('parakh:view', view); set({ view, watchOpen: false }); },
  setSymbol: (symbol) => { const s = symbol.toUpperCase(); write('parakh:symbol', s); set({ symbol: s }); },
  toggleWatch: () => set((s) => { write('parakh:watchCollapsed', s.watchCollapsed ? '0' : '1'); return { watchCollapsed: !s.watchCollapsed }; }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setWatchOpen: (watchOpen) => set({ watchOpen }),
  openSetup: (focusSetupId, view) => set((s) => { if (view) write('parakh:view', view); return { focusSetupId, view: view ?? s.view }; }),
}));
