import { registerOverlay, type OverlayFigure, type Coordinate } from 'klinecharts';

/**
 * Custom drawing tools registered once with klinecharts. Each overlay reads its colour (and text, where
 * relevant) from `extendData`, so a drawing's appearance survives save/restore and can be recoloured later.
 */

export interface DrawingExtend { color?: string; text?: string }

const UP = '#22b07d';
const DOWN = '#ef4f5f';
const ext = (o: { extendData: unknown }): DrawingExtend => (o.extendData && typeof o.extendData === 'object' ? o.extendData as DrawingExtend : {});
const alpha = (hex: string, a: number) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
const fmt = (v: number) => (Math.abs(v) >= 1000 ? v.toFixed(1) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(4));

function label(x: number, y: number, text: string, bg: string, align: CanvasTextAlign = 'center', baseline: CanvasTextBaseline = 'middle'): OverlayFigure {
  return {
    type: 'text',
    ignoreEvent: true,
    attrs: { x, y, text, align, baseline },
    styles: { color: '#fff', size: 11, family: 'IBM Plex Mono, monospace', weight: 500, backgroundColor: bg, borderRadius: 3, paddingLeft: 5, paddingRight: 5, paddingTop: 3, paddingBottom: 3, borderSize: 0 },
  };
}

let registered = false;

export function registerOverlays() {
  if (registered) return;
  registered = true;

  // ── Rectangle (zones, supply/demand) ──
  registerOverlay({
    name: 'rectZone',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) return [];
      const c = ext(overlay).color ?? '#9b7bff';
      const [a, b] = coordinates;
      return [{
        type: 'polygon',
        attrs: { coordinates: [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }] },
        styles: { style: 'stroke_fill', color: alpha(c, 0.16), borderColor: c, borderSize: 1 },
      }];
    },
  });

  // ── Circle ──
  registerOverlay({
    name: 'circleShape',
    totalStep: 3,
    needDefaultPointFigure: true,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) return [];
      const c = ext(overlay).color ?? '#5b8cff';
      const [a, b] = coordinates;
      const r = Math.hypot(b.x - a.x, b.y - a.y);
      return [{ type: 'circle', attrs: { x: a.x, y: a.y, r }, styles: { style: 'stroke_fill', color: alpha(c, 0.12), borderColor: c, borderSize: 1 } }];
    },
  });

  // ── Triangle ──
  registerOverlay({
    name: 'triangleShape',
    totalStep: 4,
    needDefaultPointFigure: true,
    createPointFigures: ({ coordinates, overlay }) => {
      const c = ext(overlay).color ?? '#f2a93b';
      if (coordinates.length < 2) return [];
      if (coordinates.length === 2) return [{ type: 'line', attrs: { coordinates }, styles: { color: c } }];
      return [{ type: 'polygon', attrs: { coordinates }, styles: { style: 'stroke_fill', color: alpha(c, 0.14), borderColor: c, borderSize: 1 } }];
    },
  });

  // ── Price range / measure: Δ price, Δ %, bars ──
  registerOverlay({
    name: 'measure',
    totalStep: 3,
    needDefaultPointFigure: true,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) return [];
      const [a, b] = coordinates;
      const [pa, pb] = overlay.points;
      if (pa?.value == null || pb?.value == null) return [];
      const diff = pb.value - pa.value;
      const pct = pa.value !== 0 ? (diff / pa.value) * 100 : 0;
      const bars = pa.dataIndex != null && pb.dataIndex != null ? pb.dataIndex - pa.dataIndex : 0;
      const c = diff >= 0 ? UP : DOWN;
      const midX = (a.x + b.x) / 2;
      const top = Math.min(a.y, b.y);
      const bottom = Math.max(a.y, b.y);
      const textY = diff >= 0 ? top - 14 : bottom + 14;
      return [
        { type: 'rect', attrs: { x: Math.min(a.x, b.x), y: top, width: Math.abs(b.x - a.x), height: bottom - top }, styles: { style: 'fill', color: alpha(c, 0.14) } },
        { type: 'line', attrs: { coordinates: [{ x: midX, y: a.y }, { x: midX, y: b.y }] }, styles: { color: c, size: 1 } },
        { type: 'line', attrs: { coordinates: [{ x: a.x, y: (a.y + b.y) / 2 }, { x: b.x, y: (a.y + b.y) / 2 }] }, styles: { color: c, size: 1, style: 'dashed', dashedValue: [3, 3] } },
        label(midX, textY, `${diff >= 0 ? '+' : ''}${fmt(diff)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%) · ${bars} bars`, c),
      ];
    },
  });

  // ── Long / short position: entry, target and stop are three independently draggable points ──
  const position = (isLong: boolean) => registerOverlay({
    name: isLong ? 'longPosition' : 'shortPosition',
    totalStep: 4,
    needDefaultPointFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, overlay, bounding }) => {
      if (coordinates.length < 3) return [];
      const [e, t, s] = coordinates;
      const [pe, pt, ps] = overlay.points;
      if (pe?.value == null || pt?.value == null || ps?.value == null) return [];
      const left = Math.min(e.x, t.x, s.x);
      const right = Math.max(e.x, t.x, s.x, left + 40);
      const w = Math.min(right, bounding.width) - left;
      const reward = Math.abs(pt.value - pe.value);
      const risk = Math.abs(pe.value - ps.value);
      const rr = risk > 0 ? reward / risk : 0;
      const tPct = (reward / pe.value) * 100;
      const sPct = (risk / pe.value) * 100;
      const mid = left + w / 2;
      const zone = (y1: number, y2: number, color: string): OverlayFigure => ({
        type: 'rect', attrs: { x: left, y: Math.min(y1, y2), width: w, height: Math.abs(y2 - y1) }, styles: { style: 'fill', color: alpha(color, 0.18) },
      });
      const targetAbove = t.y < e.y;
      return [
        zone(e.y, t.y, UP),
        zone(e.y, s.y, DOWN),
        { type: 'line', attrs: { coordinates: [{ x: left, y: e.y }, { x: left + w, y: e.y }] }, styles: { color: '#c9ced8', size: 1 } },
        label(mid, t.y + (targetAbove ? -12 : 12), `Target ${fmt(pt.value)} (${tPct.toFixed(2)}%)`, UP),
        label(mid, s.y + (targetAbove ? 12 : -12), `Stop ${fmt(ps.value)} (${sPct.toFixed(2)}%)`, DOWN),
        label(mid, e.y, `${isLong ? 'Long' : 'Short'} ${fmt(pe.value)} · R:R ${rr.toFixed(2)}`, '#3a4152'),
      ];
    },
    // Dragging a zone (not a handle) moves all three points together, keeping risk/reward intact.
  });
  position(true);
  position(false);

  // ── Arrow markers ──
  const arrow = (up: boolean) => registerOverlay({
    name: up ? 'arrowUp' : 'arrowDown',
    totalStep: 2,
    needDefaultPointFigure: false,
    createPointFigures: ({ coordinates, overlay }) => {
      const p = coordinates[0];
      if (!p) return [];
      const c = ext(overlay).color ?? (up ? UP : DOWN);
      const d = up ? 1 : -1;
      const pts: Coordinate[] = [
        { x: p.x, y: p.y }, { x: p.x - 9, y: p.y + 11 * d }, { x: p.x - 4, y: p.y + 11 * d },
        { x: p.x - 4, y: p.y + 22 * d }, { x: p.x + 4, y: p.y + 22 * d }, { x: p.x + 4, y: p.y + 11 * d }, { x: p.x + 9, y: p.y + 11 * d },
      ];
      return [{ type: 'polygon', attrs: { coordinates: pts }, styles: { style: 'fill', color: c } }];
    },
  });
  arrow(true);
  arrow(false);

  // ── Text note ──
  registerOverlay({
    name: 'note',
    totalStep: 2,
    needDefaultPointFigure: true,
    createPointFigures: ({ coordinates, overlay }) => {
      const p = coordinates[0];
      if (!p) return [];
      const { color = '#5b8cff', text = 'Note' } = ext(overlay);
      return [{
        type: 'text',
        attrs: { x: p.x, y: p.y, text, align: 'left', baseline: 'bottom' },
        styles: { color: '#fff', size: 12, family: 'IBM Plex Sans, sans-serif', weight: 500, backgroundColor: color, borderRadius: 4, paddingLeft: 7, paddingRight: 7, paddingTop: 4, paddingBottom: 4, borderSize: 0 },
      }];
    },
  });

  // ── Backtest trade marker: entry→exit segment coloured by outcome (non-interactive) ──
  registerOverlay({
    name: 'tradeMarker',
    totalStep: 3,
    needDefaultPointFigure: false,
    createPointFigures: ({ coordinates, overlay }) => {
      if (coordinates.length < 2) return [];
      const { win, side } = (overlay.extendData ?? {}) as { win?: boolean; side?: string };
      const c = win ? UP : DOWN;
      const [a, b] = coordinates;
      const isLong = side !== 'SHORT';
      return [
        { type: 'line', ignoreEvent: true, attrs: { coordinates: [a, b] }, styles: { color: c, size: 1.5, style: 'dashed', dashedValue: [4, 3] } },
        { type: 'circle', ignoreEvent: true, attrs: { x: a.x, y: a.y, r: 4 }, styles: { style: 'fill', color: isLong ? UP : DOWN } },
        { type: 'circle', ignoreEvent: true, attrs: { x: b.x, y: b.y, r: 4 }, styles: { style: 'stroke_fill', color: '#0b0d12', borderColor: c, borderSize: 2 } },
      ];
    },
  });
}
