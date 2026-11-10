import { create } from 'zustand';
import { api } from '../lib/api';
import type { Setup } from '../lib/types';

interface SetupState {
  setups: Setup[];
  loaded: boolean;
  error: string | null;
  load: () => Promise<void>;
  upsert: (s: Setup) => void;
  remove: (id: string) => void;
}

/** Older rows may have nulls where the UI expects lists; normalise once at the boundary. */
const normalize = (s: Setup): Setup => ({
  ...s,
  technicalConditions: s.technicalConditions ?? [],
  fundamentalConditions: s.fundamentalConditions ?? [],
  universe: s.universe ?? [],
  orderRule: s.orderRule ?? {},
  timeframe: s.timeframe || 'D',
  fundamentalMode: s.fundamentalMode === 'required_for_signal' ? 'required_for_signal' : 'display_only',
});

export const useSetupStore = create<SetupState>((set) => ({
  setups: [],
  loaded: false,
  error: null,
  load: async () => {
    try {
      const setups = await api.getSetups();
      set({ setups: setups.map(normalize), loaded: true, error: null });
    } catch (e) {
      set({ loaded: true, error: (e as Error).message });
    }
  },
  upsert: (raw) => set((st) => { const s = normalize(raw); return { setups: st.setups.some((x) => x.id === s.id) ? st.setups.map((x) => (x.id === s.id ? s : x)) : [s, ...st.setups] }; }),
  remove: (id) => set((st) => ({ setups: st.setups.filter((x) => x.id !== id) })),
}));
