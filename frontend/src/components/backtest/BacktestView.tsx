import { useEffect, useMemo, useRef, useState } from 'react';
import { dispose, init, type Chart } from 'klinecharts';
import { FlaskConical, History, ListChecks, Play, Plus } from 'lucide-react';
import { api } from '../../lib/api';
import type { BacktestPlayback, BacktestRunSummary } from '../../lib/types';
import { useSetupStore } from '../../store/setupStore';
import { useUiStore } from '../../store/uiStore';
import { TIMEFRAMES, tfLabel } from '../../lib/catalog';
import { displaySymbol, fmtDate, fmtNum, fmtPct, fmtPrice, timeAgo, toneOf } from '../../lib/format';
import { Empty, Segmented, Spinner } from '../ui/primitives';
import { CHART_STYLES } from '../chart/chartStyles';
import { registerOverlays } from '../chart/overlays';

const RANGES = [{ id: '1', label: '1Y' }, { id: '2', label: '2Y' }, { id: '5', label: '5Y' }, { id: '10', label: '10Y' }] as const;
const REASONS: Record<string, string> = { stop_loss: 'Stop loss', take_profit: 'Take profit', trailing_stop: 'Trailing stop', time_exit: 'Max bars', end_of_test: 'End of test', target_price: 'Target price' };

function EquityCurve({ pb }: { pb: BacktestPlayback }) {
  const { path, hold, min, max, zeroY } = useMemo(() => {
    const eq = pb.equityCurve;
    const first = pb.bars[0]?.open ?? 1;
    const holdVals = pb.bars.map((b) => (pb.initialCapital * b.close) / first);
    const all = [...eq.map((e) => e.value), ...holdVals, pb.initialCapital];
    const lo = Math.min(...all), hi = Math.max(...all);
    const W = 1000, H = 180, pad = 6;
    const x = (i: number) => (i / Math.max(eq.length - 1, 1)) * W;
    const y = (v: number) => H - pad - ((v - lo) / (hi - lo || 1)) * (H - pad * 2);
    return {
      path: eq.map((e, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(e.value).toFixed(1)}`).join(''),
      hold: holdVals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(''),
      min: lo, max: hi, zeroY: y(pb.initialCapital),
    };
  }, [pb]);
  const end = pb.equityCurve[pb.equityCurve.length - 1]?.value ?? pb.initialCapital;
  const color = end >= pb.initialCapital ? 'var(--up)' : 'var(--down)';
  return (
    <div className="equity">
      <svg viewBox="0 0 1000 180" preserveAspectRatio="none" role="img" aria-label="Equity curve versus buy and hold">
        <line x1="0" x2="1000" y1={zeroY} y2={zeroY} stroke="var(--border-strong)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <path d={hold} fill="none" stroke="var(--faint)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        <path d={path} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div style={{ display: 'flex', gap: 16, fontSize: 12, marginTop: 6 }} className="hint">
        <span><span style={{ display: 'inline-block', width: 10, height: 2, background: color, verticalAlign: 'middle', marginRight: 6 }} />Strategy</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 2, background: 'var(--faint)', verticalAlign: 'middle', marginRight: 6 }} />Buy & hold</span>
        <span style={{ marginLeft: 'auto' }} className="num">{fmtNum(min, 0)} – {fmtNum(max, 0)}</span>
      </div>
    </div>
  );
}

function TradeChart({ pb }: { pb: BacktestPlayback }) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<Chart | null>(null);
  useEffect(() => {
    registerOverlays();
    const el = ref.current!;
    const c = init(el, { styles: CHART_STYLES as never })!;
    chart.current = c;
    c.createIndicator('VOL', false, { id: 'pane_vol', height: 60 });
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(el);
    return () => { ro.disconnect(); dispose(el); };
  }, []);
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    c.removeOverlay();
    c.applyNewData(pb.bars.map((b) => ({ timestamp: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume })));
    for (const t of pb.trades) {
      c.createOverlay({
        name: 'tradeMarker', lock: true,
        extendData: { win: t.result === 'win', side: t.side },
        points: [{ timestamp: t.entryTime, value: t.entryPrice }, { timestamp: t.exitTime, value: t.exitPrice }],
      });
    }
  }, [pb]);
  return <div ref={ref} style={{ position: 'absolute', inset: 0 }} />;
}

export default function BacktestView() {
  const { setups, loaded, load } = useSetupStore();
  const { focusSetupId, openSetup, symbol: activeSymbol } = useUiStore();
  const [setupId, setSetupId] = useState('');
  const [symbol, setSymbol] = useState(activeSymbol);
  const [tf, setTf] = useState<string>('');
  const [years, setYears] = useState<string>('2');
  const [capital, setCapital] = useState(100000);
  const [commission, setCommission] = useState(0.05);
  const [size, setSize] = useState(100);
  const [applyFund, setApplyFund] = useState(false);
  const [progress, setProgress] = useState<{ status: string; progress: number } | null>(null);
  const [pb, setPb] = useState<BacktestPlayback | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [history, setHistory] = useState<BacktestRunSummary[]>([]);
  const poll = useRef<number | null>(null);

  useEffect(() => { if (!loaded) load(); }, [loaded, load]);
  useEffect(() => {
    if (focusSetupId && setups.some((s) => s.id === focusSetupId)) { setSetupId(focusSetupId); openSetup(null); }
    else if (!setupId && setups.length) setSetupId(setups[0].id);
  }, [focusSetupId, setups, setupId, openSetup]);
  useEffect(() => { api.getMyBacktests().then(setHistory).catch(() => {}); }, [pb]);
  useEffect(() => () => { if (poll.current) window.clearTimeout(poll.current); }, []);

  const setup = setups.find((s) => s.id === setupId);
  const timeframe = tf || setup?.timeframe || 'D';

  const openRun = async (runId: string) => {
    setErr(null);
    try { setPb(await api.getBacktestPlayback(runId)); } catch (e) { setErr((e as Error).message); }
  };

  const run = async () => {
    if (!setup || !symbol.trim()) return;
    setErr(null); setPb(null); setProgress({ status: 'pending', progress: 5 });
    const end = new Date();
    const start = new Date(end);
    start.setFullYear(end.getFullYear() - Number(years));
    try {
      const { runId } = await api.runBacktest({
        setupId: setup.id, symbol: symbol.trim().toUpperCase(), startDate: start.toISOString(), endDate: end.toISOString(),
        timeframe, initialCapital: capital, commissionPct: commission, positionSizePct: size, applyFundamentals: applyFund,
      });
      const tickStatus = async () => {
        try {
          const s = await api.getBacktestStatus(runId);
          setProgress(s);
          if (s.status === 'completed') { setPb(await api.getBacktestPlayback(runId)); setProgress(null); return; }
          if (s.status === 'failed') { setErr(s.error || 'Backtest failed'); setProgress(null); return; }
        } catch (e) { setErr((e as Error).message); setProgress(null); return; }
        poll.current = window.setTimeout(tickStatus, 600);
      };
      tickStatus();
    } catch (e) {
      setErr((e as Error).message); setProgress(null);
    }
  };

  if (loaded && !setups.length) {
    return (
      <div className="view"><div className="view-inner">
        <div className="view-head"><div><h1>Backtest</h1><p>See how a setup would have traded on past data.</p></div></div>
        <div className="card"><Empty icon={<ListChecks size={26} className="muted" />} title="Create a setup to backtest"
          action={<button className="btn btn-primary" onClick={() => openSetup('new', 'setups')}><Plus size={15} /> New setup</button>}>
          The backtester replays history bar by bar, enters on the next open after your setup appears and manages the trade with your stop, target and trailing rules.
        </Empty></div>
      </div></div>
    );
  }

  const r = pb?.result;
  const setupName = (id: string) => setups.find((s) => s.id === id)?.name ?? 'Deleted setup';

  return (
    <div className="view">
      <div className="view-inner">
        <div className="view-head">
          <div><h1>Backtest</h1><p>Signals on each bar’s close, entries at the next open — no look-ahead. Costs are charged on entry and exit.</p></div>
        </div>
        <div className="bt-layout">
          <div className="builder-col">
            <section className="card">
              <div className="block-body">
                <div className="field"><label htmlFor="bt-s">Setup</label>
                  <select id="bt-s" className="select" value={setupId} onChange={(e) => { setSetupId(e.target.value); setTf(''); }}>
                    {setups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="grid-2">
                  <div className="field"><label htmlFor="bt-sym">Symbol</label>
                    <input id="bt-sym" className="input mono" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="TCS.NS" /></div>
                  <div className="field"><label htmlFor="bt-tf">Timeframe</label>
                    <select id="bt-tf" className="select" value={timeframe} onChange={(e) => setTf(e.target.value)}>
                      {TIMEFRAMES.filter((t) => ['60', 'D', 'W'].includes(t.id)).map((t) => <option key={t.id} value={t.id}>{t.long}</option>)}
                    </select></div>
                </div>
                <div className="field"><span className="label">Period</span>
                  <Segmented value={years} onChange={setYears} options={RANGES.map((x) => ({ id: x.id, label: x.label }))} />
                  {timeframe === '60' && <span className="hint">Hourly history is limited to about 2 years.</span>}
                </div>
                <div className="grid-3">
                  <div className="field"><label htmlFor="bt-c">Capital</label><input id="bt-c" className="input input-sm num" type="number" value={capital} onChange={(e) => setCapital(Number(e.target.value))} /></div>
                  <div className="field"><label htmlFor="bt-f">Cost % / side</label><input id="bt-f" className="input input-sm num" type="number" step="0.01" value={commission} onChange={(e) => setCommission(Number(e.target.value))} /></div>
                  <div className="field"><label htmlFor="bt-z">Size % equity</label><input id="bt-z" className="input input-sm num" type="number" value={size} onChange={(e) => setSize(Number(e.target.value))} /></div>
                </div>
                {setup && setup.fundamentalConditions.length > 0 && (
                  <label className="hint" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
                    <input type="checkbox" checked={applyFund} onChange={(e) => setApplyFund(e.target.checked)} style={{ marginTop: 3 }} />
                    Only trade if today’s fundamentals pass (historical fundamentals aren’t available)
                  </label>
                )}
                <button className="btn btn-primary" onClick={run} disabled={!!progress || !setup || !symbol.trim()}>
                  {progress ? <Spinner size={14} /> : <Play size={15} />} Run backtest
                </button>
                {progress && <div className="progress" aria-label="Progress"><span style={{ width: `${progress.progress}%` }} /></div>}
                {setup && (
                  <p className="hint">{setup.orderRule?.side === 'SHORT' ? 'Short' : 'Long'} · stop {setup.orderRule?.stopLossPct ?? '—'}% · target {setup.orderRule?.takeProfitPct ?? '—'}%{setup.orderRule?.trailingStopPct ? ` · trail ${setup.orderRule.trailingStopPct}%` : ''}{setup.orderRule?.maxHoldBars ? ` · max ${setup.orderRule.maxHoldBars} bars` : ''}
                    {' '}<button className="btn btn-ghost btn-sm" style={{ height: 22 }} onClick={() => openSetup(setup.id, 'setups')}>Edit</button></p>
                )}
              </div>
            </section>

            {history.length > 0 && (
              <section className="card">
                <div className="block-head"><h2><History size={15} className="muted" /> Recent runs</h2></div>
                <div className="block-body" style={{ gap: 4, maxHeight: 340, overflowY: 'auto' }}>
                  {history.slice(0, 20).map((h) => (
                    <button key={h.runId} className="menu-item" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 2 }} onClick={() => openRun(h.runId)} disabled={h.status !== 'completed'}>
                      <span><span className="mono" style={{ fontWeight: 600, color: 'var(--text)' }}>{displaySymbol(h.symbol)}</span> <span className="hint">{setupName(h.setupId)}</span></span>
                      <span className={`num ${toneOf(h.result?.avgReturnPct)}`} style={{ fontSize: 12 }}>{h.status === 'completed' && h.result ? `${h.result.totalTrades} trades · ${h.result.winRate}%` : h.status}</span>
                      <span className="hint" style={{ fontSize: 11 }}>{timeAgo(h.requestedAt)}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>

          <div className="builder-col">
            {err && <div className="notice notice-error">{err}</div>}
            {!pb && !progress && !err && <div className="card"><Empty icon={<FlaskConical size={26} className="muted" />} title="No results yet">Choose a setup and symbol, then run a backtest.</Empty></div>}
            {progress && !pb && <div className="card"><div className="empty"><Spinner /><p>Simulating {displaySymbol(symbol)} on {tfLabel(timeframe)} bars…</p></div></div>}
            {pb && r && (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <h2 style={{ fontSize: 16, fontWeight: 600 }}>{pb.setupName} on <span className="mono">{displaySymbol(pb.symbol)}</span></h2>
                  <span className="hint">{tfLabel(pb.timeframe)} · {fmtDate(Date.parse(pb.dateRangeStart))} – {fmtDate(Date.parse(pb.dateRangeEnd))} · {pb.side === 'SHORT' ? 'Short' : 'Long'}</span>
                </div>
                <div className="stats">
                  <div className="card stat"><div className="k">Total return</div><div className={`v ${toneOf(r.totalReturnPct)}`}>{fmtPct(r.totalReturnPct)}</div><div className="s">Buy & hold {fmtPct(r.buyHoldReturnPct)}</div></div>
                  <div className="card stat"><div className="k">Win rate</div><div className="v">{r.winRate}%</div><div className="s">{r.wins}W / {r.losses}L of {r.totalTrades}</div></div>
                  <div className="card stat"><div className="k">Profit factor</div><div className="v">{r.profitFactor == null ? '∞' : fmtNum(r.profitFactor)}</div><div className="s">Gross win ÷ gross loss</div></div>
                  <div className="card stat"><div className="k">Max drawdown</div><div className="v down">{r.maxDrawdownPct ? `-${fmtNum(r.maxDrawdownPct)}%` : '0%'}</div><div className="s">Peak to trough</div></div>
                  <div className="card stat"><div className="k">Avg trade</div><div className={`v ${toneOf(r.avgReturnPct)}`}>{fmtPct(r.avgReturnPct)}</div><div className="s">Win {fmtPct(r.avgWinPct)} · loss {fmtPct(r.avgLossPct)}</div></div>
                  <div className="card stat"><div className="k">Sharpe</div><div className="v">{fmtNum(r.sharpe)}</div><div className="s">Exposure {fmtNum(r.exposurePct, 0)}% · {fmtNum(r.avgBarsHeld, 1)} bars avg</div></div>
                </div>
                {pb.fundamentals && (
                  <div className={`notice ${pb.fundamentals.passed ? '' : 'notice-warn'}`}>
                    Today’s fundamentals {pb.fundamentals.passed ? 'pass' : 'do not pass'} this setup’s filters{pb.fundamentals.applied ? ' and were applied as a gate' : ' (not applied to this run)'}. {pb.fundamentals.note}
                  </div>
                )}
                {r.totalTrades === 0 && <div className="notice notice-warn">The setup never triggered in this period. Try a longer period, a different symbol, or looser conditions.</div>}
                <section className="card bt-chart"><TradeChart pb={pb} /></section>
                <section className="card card-pad"><div className="section-title" style={{ marginBottom: 8 }}>Equity</div><EquityCurve pb={pb} /></section>
                {pb.trades.length > 0 && (
                  <section className="card">
                    <div className="table-scroll" style={{ maxHeight: 420, overflowY: 'auto' }}>
                      <table className="table">
                        <thead><tr><th>#</th><th>Entry</th><th className="r">Price</th><th>Exit</th><th className="r">Price</th><th className="hide-sm">Reason</th><th className="r hide-sm">Bars</th><th className="r">Return</th></tr></thead>
                        <tbody>
                          {pb.trades.map((t, i) => (
                            <tr key={i}>
                              <td className="muted num">{i + 1}</td>
                              <td className="num">{fmtDate(t.entryTime)}</td><td className="r num">{fmtPrice(t.entryPrice)}</td>
                              <td className="num">{fmtDate(t.exitTime)}</td><td className="r num">{fmtPrice(t.exitPrice)}</td>
                              <td className="hide-sm"><span className="badge">{REASONS[t.exitReason] ?? t.exitReason}</span></td>
                              <td className="r num hide-sm">{t.barsHeld}</td>
                              <td className={`r num ${toneOf(t.returnPct)}`}>{fmtPct(t.returnPct)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
