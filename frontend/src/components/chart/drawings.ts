/** Per-symbol drawing persistence (a per-viewer convenience, so browser storage is the right home). */
export interface SavedDrawing {
  name: string;
  /** `future` = bars after the last candle, for points drawn into empty space (e.g. a position's right edge). */
  points: Array<{ timestamp?: number; future?: number; value: number }>;
  extendData?: { color?: string; text?: string };
}

const key = (symbol: string) => `parakh:drawings:${symbol.toUpperCase()}`;

export function loadDrawings(symbol: string): SavedDrawing[] {
  try {
    const raw = localStorage.getItem(key(symbol));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveDrawings(symbol: string, drawings: SavedDrawing[]) {
  try {
    if (drawings.length) localStorage.setItem(key(symbol), JSON.stringify(drawings));
    else localStorage.removeItem(key(symbol));
  } catch {
    /* storage full or blocked: drawings stay for this session only */
  }
}
