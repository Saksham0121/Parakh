import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dispose, init, OverlayMode, LineType, type Chart, type KLineData, type OverlayCreate, type Point } from 'klinecharts';
import {
  Activity, ChartCandlestick, ChartLine, ChartArea, Eye, EyeOff, Lock, LockOpen, Magnet, Maximize2, Minimize2,
  PanelRightOpen, RotateCcw, Sparkles, Trash2, Undo2, Type as TypeIcon, Check,
} from 'lucide-react';
import { api, peekCandles } from '../../lib/api';
import type { Candles } from '../../lib/types';
import { useSocketStore } from '../../store/socketStore';
import { TIMEFRAMES } from '../../lib/catalog';
import { currencySign, displaySymbol, exchangeOf, fmtCompact, fmtPct, fmtPrice, toneOf } from '../../lib/format';
import { Popover, Spinner } from '../ui/primitives';
import { registerOverlays } from './overlays';
import { CHART_STYLES, INDICATORS } from './chartStyles';
import { PALETTE, TOOL_GROUPS, toolDef, type ToolId } from './tools';
import { loadDrawings, saveDrawings, type SavedDrawing } from './drawings';
import { detectLevels } from './levels';
import SidePanel from './SidePanel';

const CHART_TYPES = [
  { id: 'candle_solid', label: 'Candles', icon: ChartCandlestick },
  { id: 'candle_stroke', label: 'Hollow candles', icon: ChartCandlestick },
  { id: 'ohlc', label: 'Bars (OHLC)', icon: Activity },
  { id: 'area', label: 'Area', icon: ChartArea },
] as const;

const BUILTIN_LINES = new Set(['segment', 'rayLine', 'straightLine', 'horizontalStraightLine', 'horizontalRayLine', 'verticalStraightLine', 'priceLine', 'parallelStraightLine', 'priceChannelLine', 'fibonacciLine']);
const POSITION_TOOLS = new Set<ToolId>(['longPosition', 'shortPosition']);

function usePersisted<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : initial; } catch { return initial; }
  });
  const set = useCallback((next: T) => { setV(next); try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ } }, [key]);
  return [v, set];
}

const toKLine = (c: Candles): KLineData[] => c.t.map((t, i) => ({ timestamp: t * 1000, open: c.o[i], high: c.h[i], low: c.l[i], close: c.c[i], volume: c.v[i] }));

export default function ChartView({ symbol }: { symbol: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const dataRef = useRef<KLineData[]>([]);
  const drawIds = useRef<Set<string>>(new Set());
  const history = useRef<string[]>([]);
  const pendingId = useRef<string | null>(null);
  const symbolRef = useRef(symbol);
  const panes = useRef<Record<string, string>>({});

  const [tf, setTf] = usePersisted('parakh:tf', 'D');
  const [chartType, setChartType] = usePersisted<string>('parakh:chartType', 'candle_solid');
  const [indicators, setIndicators] = usePersisted<string[]>('parakh:indicators', ['VOL', 'EMA']);
  const [sideOpen, setSideOpen] = usePersisted('parakh:sideOpen', window.innerWidth >= 1280);
  const [tool, setTool] = useState<ToolId>('cursor');
  const [groupPick, setGroupPick] = usePersisted<Record<string, ToolId>>('parakh:toolPicks', {});
  const [magnet, setMagnet] = useState(false);
  const [locked, setLocked] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [menu, setMenu] = useState<{ group: string; x: number; y: number } | null>(null);
  const [openMenu, setOpenMenu] = useState<'type' | 'ind' | null>(null);
  const [noteText, setNoteText] = useState('');
  const [editingText, setEditingText] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: 'loading' | 'ready' | 'error'; msg?: string }>({ kind: 'loading' });
  const [legend, setLegend] = useState<KLineData | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [reload, setReload] = useState(0);
  const [levelsOn, setLevelsOn] = useState(false);
  const tick = useSocketStore((s) => s.prices[symbol]);

  symbolRef.current = symbol;

  // ── Persistence ─────────────────────────────────────────────────────────────
  const persist = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const data = dataRef.current;
    const lastIdx = data.length - 1;
    const out: SavedDrawing[] = [];
    for (const id of drawIds.current) {
      const o = chart.getOverlayById(id);
      if (!o || o.currentStep !== -1 && o.points.length < o.totalStep - 1) continue;
      out.push({
        name: o.name,
        extendData: o.extendData,
        points: o.points.filter((p) => p.value != null).map((p) => {
          const idx = p.dataIndex ?? (p.timestamp != null ? data.findIndex((d) => d.timestamp >= p.timestamp!) : lastIdx);
          return idx > lastIdx ? { future: idx - lastIdx, value: p.value! } : { timestamp: p.timestamp ?? data[Math.max(0, idx)]?.timestamp, value: p.value! };
        }),
      });
    }
    saveDrawings(symbolRef.current, out);
  }, []);

  const overlayBase = useCallback((name: string, color?: string): OverlayCreate => ({
    name,
    lock: locked,
    visible: !hidden,
    mode: magnet ? OverlayMode.StrongMagnet : OverlayMode.Normal,
    extendData: { color: color ?? (name === 'fibonacciLine' ? '#f2a93b' : PALETTE[0]) },
    styles: BUILTIN_LINES.has(name) ? { line: { color: color ?? (name === 'fibonacciLine' ? '#f2a93b' : PALETTE[0]), size: 1.5 }, text: { color: color ?? '#c9ced8' } } : undefined,
    onDrawEnd: (e) => {
      drawIds.current.add(e.overlay.id);
      history.current.push(e.overlay.id);
      pendingId.current = null;
      setTool('cursor');
      persist();
      return false;
    },
    onPressedMoveEnd: () => { persist(); return false; },
    onSelected: (e) => { setSelected({ id: e.overlay.id, name: e.overlay.name }); return false; },
    onDeselected: () => { setSelected(null); setEditingText(null); return false; },
    onRemoved: (e) => {
      drawIds.current.delete(e.overlay.id);
      setSelected((s) => (s?.id === e.overlay.id ? null : s));
      persist();
      return false;
    },
  }), [hidden, locked, magnet, persist]);

  const restoreDrawings = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const data = dataRef.current;
    const lastIdx = data.length - 1;
    for (const d of loadDrawings(symbolRef.current)) {
      const points: Array<Partial<Point>> = d.points.map((p) => (p.future != null ? { dataIndex: lastIdx + p.future, value: p.value } : { timestamp: p.timestamp, value: p.value }));
      const id = chart.createOverlay({ ...overlayBase(d.name, d.extendData?.color), extendData: d.extendData, points });
      if (typeof id === 'string') drawIds.current.add(id);
    }
  }, [overlayBase]);

  // ── Chart lifecycle (created once; data swaps in place for fast symbol switching) ──
  useEffect(() => {
    registerOverlays();
    const el = elRef.current!;
    const chart = init(el, { styles: CHART_STYLES as never })!;
    chartRef.current = chart;
    chart.setOffsetRightDistance(60);
    chart.subscribeAction('onCrosshairChange' as never, (d?: { kLineData?: KLineData }) => {
      if (d?.kLineData) setLegend(d.kLineData);
      else if (dataRef.current.length) setLegend(dataRef.current[dataRef.current.length - 1]);
    });
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
    return () => { ro.disconnect(); dispose(el); chartRef.current = null; panes.current = {}; };
  }, []);

  useEffect(() => { chartRef.current?.setStyles({ candle: { type: chartType as never } }); }, [chartType]);

  // Indicators: diff against what's on the chart so toggling one doesn't rebuild the rest.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const [id, paneId] of Object.entries(panes.current)) {
      if (!indicators.includes(id)) { chart.removeIndicator(paneId, id); delete panes.current[id]; }
    }
    for (const id of indicators) {
      if (panes.current[id]) continue;
      const def = INDICATORS.find((i) => i.id === id);
      if (!def) continue;
      const paneId = def.pane
        ? chart.createIndicator(id, false, { id: `pane_${id}`, height: id === 'VOL' ? 80 : 110, minHeight: 50 })
        : chart.createIndicator(id, true, { id: 'candle_pane' });
      if (paneId) panes.current[id] = paneId;
    }
  }, [indicators]);

  // ── Data ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    let live = true;
    chart.removeOverlay();
    drawIds.current.clear();
    history.current = [];
    pendingId.current = null;
    setSelected(null);
    setTool('cursor');
    setLevelsOn(false);

    const apply = (c: Candles, first: boolean) => {
      if (!live) return;
      const data = toKLine(c);
      dataRef.current = data;
      const last = data[data.length - 1];
      const precision = last && last.close < 1 ? 4 : 2;
      chart.setPriceVolumePrecision(precision, 0);
      chart.applyNewData(data);
      setLegend(last ?? null);
      setStatus(data.length ? { kind: 'ready' } : { kind: 'error', msg: `No price history for ${displaySymbol(symbol)} on this timeframe.` });
      if (first) restoreDrawings();
    };

    const warm = peekCandles(symbol, tf);
    if (warm) apply(warm, true); else setStatus({ kind: 'loading' });
    api.getCandles(symbol, tf, (fresh) => apply(fresh, false))
      .then((c) => { if (!warm) apply(c, true); })
      .catch((e: Error) => { if (live && !warm) { dataRef.current = []; chart.applyNewData([]); setStatus({ kind: 'error', msg: e.message }); } });
    return () => { live = false; };
    // restoreDrawings intentionally excluded: it changes with lock/magnet toggles, which must not reload data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tf, reload]);

  // Live tick → update (or roll) the last bar.
  useEffect(() => {
    const chart = chartRef.current;
    const data = dataRef.current;
    if (!chart || !tick || !data.length) return;
    const last = data[data.length - 1];
    const ts = tick.timestamp * 1000;
    const intraday = !['D', 'W', 'M'].includes(tf);
    const period = intraday ? Number(tf) * 60e3 : 0;
    if (intraday && ts >= last.timestamp + period) {
      const start = last.timestamp + Math.floor((ts - last.timestamp) / period) * period;
      const bar = { timestamp: start, open: tick.price, high: tick.price, low: tick.price, close: tick.price, volume: 0 };
      data.push(bar);
      chart.updateData(bar);
    } else if (ts >= last.timestamp) {
      const bar = { ...last, close: tick.price, high: Math.max(last.high, tick.price), low: Math.min(last.low, tick.price) };
      data[data.length - 1] = bar;
      chart.updateData(bar);
    }
  }, [tick, tf]);

  // ── Drawing tools ───────────────────────────────────────────────────────────
  const cancelPending = useCallback(() => {
    if (pendingId.current) chartRef.current?.removeOverlay({ id: pendingId.current });
    pendingId.current = null;
  }, []);

  const startTool = useCallback((id: ToolId) => {
    const chart = chartRef.current;
    setMenu(null);
    cancelPending();
    if (id === 'cursor' || !chart) { setTool('cursor'); return; }
    setTool(id);
    if (POSITION_TOOLS.has(id)) return; // placed with a single click, handled below
    const created = chart.createOverlay({
      ...overlayBase(id),
      ...(id === 'note' ? { extendData: { color: PALETTE[0], text: noteText.trim() || 'Note' } } : {}),
    });
    if (typeof created === 'string') pendingId.current = created;
  }, [cancelPending, noteText, overlayBase]);

  const placePosition = (e: React.PointerEvent) => {
    const chart = chartRef.current;
    const data = dataRef.current;
    if (!chart || !POSITION_TOOLS.has(tool) || !data.length || !elRef.current) return;
    const r = elRef.current.getBoundingClientRect();
    const pt = chart.convertFromPixel([{ x: e.clientX - r.left, y: e.clientY - r.top }], { paneId: 'candle_pane' }) as Array<Partial<Point>>;
    const p = pt[0];
    if (p?.value == null) return;
    const idx = Math.min(p.dataIndex ?? data.length - 1, data.length - 1);
    const recent = data.slice(-14);
    const avgRange = recent.reduce((s, d) => s + (d.high - d.low), 0) / recent.length;
    const risk = Math.min(Math.max((avgRange * 1.5) / p.value, 0.005), 0.08);
    const isLong = tool === 'longPosition';
    const end = idx + 20;
    const endPoint = (value: number): Partial<Point> => (end <= data.length - 1 ? { timestamp: data[end].timestamp, value } : { dataIndex: end, value });
    const id = chart.createOverlay({
      ...overlayBase(tool),
      points: [
        { timestamp: data[idx].timestamp, value: p.value },
        endPoint(p.value * (isLong ? 1 + 2 * risk : 1 - 2 * risk)),
        endPoint(p.value * (isLong ? 1 - risk : 1 + risk)),
      ],
    });
    if (typeof id === 'string') {
      drawIds.current.add(id);
      history.current.push(id);
      persist();
    }
    setTool('cursor');
    e.stopPropagation();
  };

  const removeSelected = useCallback(() => {
    if (selected) chartRef.current?.removeOverlay({ id: selected.id });
    setSelected(null);
  }, [selected]);

  const clearAll = () => {
    if (!drawIds.current.size) return;
    if (!window.confirm(`Remove all ${drawIds.current.size} drawings on ${displaySymbol(symbol)}?`)) return;
    for (const id of Array.from(drawIds.current)) chartRef.current?.removeOverlay({ id });
    drawIds.current.clear();
    persist();
  };

  const undo = useCallback(() => {
    const id = history.current.pop();
    if (id) chartRef.current?.removeOverlay({ id });
  }, []);

  const recolor = (color: string) => {
    const chart = chartRef.current;
    if (!chart || !selected) return;
    const o = chart.getOverlayById(selected.id);
    chart.overrideOverlay({
      id: selected.id,
      extendData: { ...(o?.extendData ?? {}), color },
      ...(BUILTIN_LINES.has(selected.name) ? { styles: { line: { color, size: 1.5 }, text: { color } } } : {}),
    });
    persist();
  };

  const applyText = () => {
    const chart = chartRef.current;
    if (!chart || !selected || editingText == null) return;
    const o = chart.getOverlayById(selected.id);
    chart.overrideOverlay({ id: selected.id, extendData: { ...(o?.extendData ?? {}), text: editingText.trim() || 'Note' } });
    setEditingText(null);
    persist();
  };

  useEffect(() => { chartRef.current?.overrideOverlay({ lock: locked }); }, [locked]);
  useEffect(() => { chartRef.current?.overrideOverlay({ visible: !hidden }); }, [hidden]);
  useEffect(() => { chartRef.current?.overrideOverlay({ mode: magnet ? OverlayMode.StrongMagnet : OverlayMode.Normal }); }, [magnet]);

  const toggleLevels = () => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.removeOverlay({ groupId: 'auto-levels' });
    if (levelsOn) { setLevelsOn(false); return; }
    const levels = detectLevels(dataRef.current);
    const last = dataRef.current[dataRef.current.length - 1];
    for (const l of levels) {
      chart.createOverlay({
        name: 'horizontalStraightLine', groupId: 'auto-levels', lock: true,
        points: [{ timestamp: last.timestamp, value: l.price }],
        styles: { line: { color: l.kind === 'support' ? 'rgba(34,176,125,0.8)' : 'rgba(239,79,95,0.8)', size: Math.min(1 + l.touches * 0.4, 3), style: LineType.Dashed, dashedValue: [6, 4] } },
      });
    }
    setLevelsOn(true);
  };

  // Keyboard shortcuts (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === 'Escape') { cancelPending(); setTool('cursor'); setMenu(null); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) { e.preventDefault(); removeSelected(); }
      else if (e.key === 'z' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); undo(); }
      else if (e.altKey) {
        const map: Record<string, ToolId> = { t: 'segment', h: 'horizontalStraightLine', v: 'verticalStraightLine', f: 'fibonacciLine', r: 'rectZone', l: 'longPosition', s: 'shortPosition', m: 'measure' };
        const id = map[e.code.replace('Key', '').toLowerCase()];
        if (id) { e.preventDefault(); startTool(id); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancelPending, removeSelected, selected, startTool, undo]);

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement === wrapRef.current);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else wrapRef.current?.requestFullscreen?.().catch(() => {});
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  const activeDef = toolDef(tool);
  const chg = legend ? legend.close - legend.open : 0;
  const prevClose = useMemo(() => {
    const d = dataRef.current;
    const i = legend ? d.findIndex((x) => x.timestamp === legend.timestamp) : -1;
    return i > 0 ? d[i - 1].close : legend?.open;
  }, [legend]);
  const chgPct = legend && prevClose ? ((legend.close - prevClose) / prevClose) * 100 : 0;
  const cur = currencySign(symbol);
  const typeDef = CHART_TYPES.find((t) => t.id === chartType) ?? CHART_TYPES[0];
  const selectedText = selected?.name === 'note' ? (chartRef.current?.getOverlayById(selected.id)?.extendData?.text as string | undefined) : undefined;

  return (
    <div className="chart-view" ref={wrapRef} style={{ background: 'var(--bg)' }}>
      <div className="chart-bar" role="toolbar" aria-label="Chart settings">
        {TIMEFRAMES.map((t) => (
          <button key={t.id} className={`tf-btn ${tf === t.id ? 'on' : ''}`} onClick={() => setTf(t.id)} title={t.long}>{t.label}</button>
        ))}
        <span className="sep" />
        <div style={{ position: 'relative' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setOpenMenu(openMenu === 'type' ? null : 'type')} aria-haspopup="menu">
            <typeDef.icon size={15} /> <span className="hide-sm">{typeDef.label}</span>
          </button>
          <Popover open={openMenu === 'type'} onClose={() => setOpenMenu(null)} style={{ top: 34, left: 0 }}>
            {CHART_TYPES.map((t) => (
              <button key={t.id} className={`menu-item ${chartType === t.id ? 'on' : ''}`} onClick={() => { setChartType(t.id); setOpenMenu(null); }}>
                <t.icon size={15} /> {t.label} {chartType === t.id && <Check size={14} style={{ marginLeft: 'auto' }} />}
              </button>
            ))}
          </Popover>
        </div>
        <div style={{ position: 'relative' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setOpenMenu(openMenu === 'ind' ? null : 'ind')} aria-haspopup="menu">
            <ChartLine size={15} /> Indicators <span className="badge">{indicators.length}</span>
          </button>
          <Popover open={openMenu === 'ind'} onClose={() => setOpenMenu(null)} style={{ top: 34, left: 0, width: 260, maxHeight: 380, overflowY: 'auto' }}>
            <div className="menu-label">On price</div>
            {INDICATORS.filter((i) => !i.pane).map((i) => (
              <button key={i.id} className={`menu-item ${indicators.includes(i.id) ? 'on' : ''}`} onClick={() => setIndicators(indicators.includes(i.id) ? indicators.filter((x) => x !== i.id) : [...indicators, i.id])}>
                {i.label} {indicators.includes(i.id) && <Check size={14} style={{ marginLeft: 'auto' }} />}
              </button>
            ))}
            <div className="menu-label">Separate pane</div>
            {INDICATORS.filter((i) => i.pane).map((i) => (
              <button key={i.id} className={`menu-item ${indicators.includes(i.id) ? 'on' : ''}`} onClick={() => setIndicators(indicators.includes(i.id) ? indicators.filter((x) => x !== i.id) : [...indicators, i.id])}>
                {i.label} {indicators.includes(i.id) && <Check size={14} style={{ marginLeft: 'auto' }} />}
              </button>
            ))}
          </Popover>
        </div>
        <button className={`btn btn-ghost btn-sm ${levelsOn ? 'is-active' : ''}`} onClick={toggleLevels} title="Detect support and resistance from swing pivots">
          <Sparkles size={15} /> <span className="hide-sm">Key levels</span>
        </button>
        <span style={{ flex: 1 }} />
        {status.kind === 'loading' && <Spinner size={14} />}
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setReload((n) => n + 1)} title="Reload data" aria-label="Reload data"><RotateCcw size={15} /></button>
        <button className="btn btn-ghost btn-sm btn-icon hide-sm" onClick={toggleFullscreen} title="Fullscreen" aria-label="Fullscreen">{fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>
        <button className={`btn btn-ghost btn-sm ${sideOpen ? 'is-active' : ''}`} onClick={() => setSideOpen(!sideOpen)} title="Fundamentals & setup check">
          <PanelRightOpen size={15} /> <span className="hide-sm">Analysis</span>
        </button>
      </div>

      <div className="tools" role="toolbar" aria-label="Drawing tools">
        {TOOL_GROUPS.map((g) => {
          const pick = g.tools.find((t) => t.id === groupPick[g.id]) ?? g.tools[0];
          const on = g.tools.some((t) => t.id === tool) || (g.id === 'cursor' && tool === 'cursor');
          const shown = g.tools.find((t) => t.id === tool) ?? pick;
          const Icon = shown.icon;
          return (
            <button key={g.id} className={`tool ${on ? 'on' : ''}`} title={`${shown.label}${shown.key ? ` (${shown.key})` : ''}`} aria-label={shown.label}
              onClick={() => startTool(shown.id)}
              onContextMenu={(e) => { if (g.tools.length > 1) { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setMenu({ group: g.id, x: r.right + 6, y: r.top }); } }}>
              <Icon size={18} strokeWidth={1.7} />
              {g.tools.length > 1 && (
                <span className="caret" role="button" aria-label={`More ${g.label}`}
                  onClick={(e) => { e.stopPropagation(); const r = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect(); setMenu(menu?.group === g.id ? null : { group: g.id, x: window.innerWidth < 768 ? Math.min(r.left, window.innerWidth - 230) : r.right + 6, y: window.innerWidth < 768 ? r.bottom + 6 : r.top }); }}
                  style={{ width: 10, height: 10, borderLeft: '4px solid transparent', borderBottom: '4px solid var(--faint)' }} />
              )}
            </button>
          );
        })}
        <span className="sep" />
        <button className={`tool ${magnet ? 'on' : ''}`} onClick={() => setMagnet(!magnet)} title="Magnet: snap to OHLC" aria-pressed={magnet}><Magnet size={17} strokeWidth={1.7} /></button>
        <button className={`tool ${locked ? 'on' : ''}`} onClick={() => setLocked(!locked)} title={locked ? 'Unlock drawings' : 'Lock drawings'} aria-pressed={locked}>{locked ? <Lock size={17} strokeWidth={1.7} /> : <LockOpen size={17} strokeWidth={1.7} />}</button>
        <button className={`tool ${hidden ? 'on' : ''}`} onClick={() => setHidden(!hidden)} title={hidden ? 'Show drawings' : 'Hide drawings'} aria-pressed={hidden}>{hidden ? <EyeOff size={17} strokeWidth={1.7} /> : <Eye size={17} strokeWidth={1.7} />}</button>
        <button className="tool" onClick={undo} title="Undo last drawing (Ctrl/⌘+Z)"><Undo2 size={17} strokeWidth={1.7} /></button>
        <button className="tool" onClick={clearAll} title="Remove all drawings"><Trash2 size={17} strokeWidth={1.7} /></button>
      </div>

      {menu && (
        <div className="tool-menu" style={{ left: menu.x, top: menu.y }}>
          <Popover open onClose={() => setMenu(null)} style={{ position: 'static', width: 220 }}>
            <div className="menu-label">{TOOL_GROUPS.find((g) => g.id === menu.group)?.label}</div>
            {TOOL_GROUPS.find((g) => g.id === menu.group)?.tools.map((t) => (
              <button key={t.id} className={`menu-item ${tool === t.id ? 'on' : ''}`} onClick={() => { setGroupPick({ ...groupPick, [menu.group]: t.id }); startTool(t.id); }}>
                <t.icon size={16} strokeWidth={1.7} /> {t.label} {t.key && <span className="kbd">{t.key}</span>}
              </button>
            ))}
          </Popover>
        </div>
      )}

      <div className="canvas-wrap" onPointerDownCapture={POSITION_TOOLS.has(tool) ? placePosition : undefined}>
        <div ref={elRef} className={`canvas ${tool !== 'cursor' ? 'drawing' : ''}`} />
        {legend && (
          <div className="legend">
            <span className="name">{displaySymbol(symbol)} <span className="muted" style={{ fontWeight: 400 }}>· {TIMEFRAMES.find((t) => t.id === tf)?.label} · {exchangeOf(symbol)}</span></span>
            <span className="num"><span className="k">O</span>{fmtPrice(legend.open)}</span>
            <span className="num"><span className="k">H</span>{fmtPrice(legend.high)}</span>
            <span className="num"><span className="k">L</span>{fmtPrice(legend.low)}</span>
            <span className="num"><span className="k">C</span><span className={toneOf(chg)}>{fmtPrice(legend.close)}</span></span>
            <span className={`num ${toneOf(chgPct)}`}>{fmtPct(chgPct)}</span>
            <span className="num ohlc-extra"><span className="k">Vol</span>{fmtCompact(legend.volume)}</span>
          </div>
        )}
        {tool !== 'cursor' && activeDef && (
          <div className="draw-hint" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <activeDef.icon size={14} /> {activeDef.label}: {activeDef.hint}
            {tool === 'note' && (
              <input className="input input-sm" style={{ width: 140 }} placeholder="Note text" value={noteText} autoFocus
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') startTool('note'); }} />
            )}
            <span className="muted">· Esc to cancel</span>
          </div>
        )}
        {selected && !locked && (
          <div className="sel-bar" role="toolbar" aria-label="Selected drawing">
            {PALETTE.map((c) => <button key={c} className="swatch" style={{ background: c }} onClick={() => recolor(c)} aria-label={`Colour ${c}`} />)}
            {selected.name === 'note' && (editingText == null
              ? <button className="btn btn-ghost btn-sm" onClick={() => setEditingText(selectedText ?? '')}><TypeIcon size={14} /> Text</button>
              : <input className="input input-sm" style={{ width: 150 }} autoFocus value={editingText} onChange={(e) => setEditingText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') applyText(); if (e.key === 'Escape') setEditingText(null); }} onBlur={applyText} />)}
            <button className="btn btn-ghost btn-sm btn-icon btn-danger" onClick={removeSelected} aria-label="Delete drawing" title="Delete (Del)"><Trash2 size={14} /></button>
          </div>
        )}
        {status.kind === 'error' && (
          <div className="chart-msg">
            <div className="card card-pad" style={{ maxWidth: 360, textAlign: 'center' }}>
              <h3 style={{ fontSize: 15, marginBottom: 6 }}>Chart data unavailable</h3>
              <p className="hint" style={{ marginBottom: 12 }}>{status.msg}</p>
              <button className="btn btn-sm" onClick={() => setReload((n) => n + 1)}><RotateCcw size={14} /> Try again</button>
            </div>
          </div>
        )}
        {status.kind === 'loading' && !dataRef.current.length && (
          <div className="chart-msg"><div className="muted" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Spinner /> Loading {displaySymbol(symbol)}…</div></div>
        )}
      </div>

      {sideOpen && <div className="scrim show-below-lg" onClick={() => setSideOpen(false)} />}
      <SidePanel symbol={symbol} timeframe={tf} open={sideOpen} onClose={() => setSideOpen(false)} lastPrice={tick?.price ?? legend?.close} currency={cur} />
    </div>
  );
}
