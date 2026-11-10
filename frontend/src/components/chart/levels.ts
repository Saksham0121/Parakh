import type { KLineData } from 'klinecharts';

export interface Level { price: number; touches: number; kind: 'support' | 'resistance' }

/**
 * Support/resistance from swing pivots: a pivot high is a bar whose high is the highest of `w` bars on
 * either side. Nearby pivots (within `tolerance`) are merged, and levels touched most often rank first.
 */
export function detectLevels(data: KLineData[], w = 5, tolerance = 0.012, perSide = 3): Level[] {
  if (data.length < w * 2 + 5) return [];
  const pivots: number[] = [];
  const start = Math.max(w, data.length - 300);
  for (let i = start; i < data.length - w; i++) {
    let isHigh = true, isLow = true;
    for (let j = i - w; j <= i + w; j++) {
      if (j === i) continue;
      if (data[j].high >= data[i].high) isHigh = false;
      if (data[j].low <= data[i].low) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) pivots.push(data[i].high);
    if (isLow) pivots.push(data[i].low);
  }
  const clusters: Array<{ sum: number; n: number }> = [];
  for (const p of pivots.sort((a, b) => a - b)) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(p - last.sum / last.n) / p <= tolerance) { last.sum += p; last.n++; }
    else clusters.push({ sum: p, n: 1 });
  }
  const close = data[data.length - 1].close;
  const levels = clusters.map((c) => ({ price: c.sum / c.n, touches: c.n }));
  const pick = (side: Array<{ price: number; touches: number }>, kind: Level['kind']) => side
    .sort((a, b) => b.touches - a.touches || Math.abs(a.price - close) - Math.abs(b.price - close))
    .slice(0, perSide).map((l) => ({ ...l, kind }));
  return [...pick(levels.filter((l) => l.price > close), 'resistance'), ...pick(levels.filter((l) => l.price <= close), 'support')];
}
