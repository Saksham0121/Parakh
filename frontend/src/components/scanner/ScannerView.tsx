import { Fragment, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, CircleDashed, ListChecks, Plus, Radar, XCircle } from 'lucide-react';
import { api } from '../../lib/api';
import type { ScanResponse } from '../../lib/types';
import { useSetupStore } from '../../store/setupStore';
import { useUiStore } from '../../store/uiStore';
import { useWatchlistStore } from '../../store/watchlistStore';
import { tfLabel } from '../../lib/catalog';
import { displaySymbol, exchangeOf, fmtPct, fmtPrice, timeAgo, toneOf } from '../../lib/format';
import { ConditionList, Empty, Segmented, Spinner } from '../ui/primitives';

// NIFTY 50 constituents at the time of writing; index membership changes, so treat as a convenience list.
const NSE_LARGE = ['ADANIENT', 'ADANIPORTS', 'APOLLOHOSP', 'ASIANPAINT', 'AXISBANK', 'BAJAJ-AUTO', 'BAJFINANCE', 'BAJAJFINSV', 'BEL', 'BHARTIARTL',
  'CIPLA', 'COALINDIA', 'DRREDDY', 'EICHERMOT', 'GRASIM', 'HCLTECH', 'HDFCBANK', 'HDFCLIFE', 'HEROMOTOCO', 'HINDALCO', 'HINDUNILVR', 'ICICIBANK',
  'INDUSINDBK', 'INFY', 'ITC', 'JIOFIN', 'JSWSTEEL', 'KOTAKBANK', 'LT', 'M&M', 'MARUTI', 'NESTLEIND', 'NTPC', 'ONGC', 'POWERGRID', 'RELIANCE',
  'SBILIFE', 'SBIN', 'SHRIRAMFIN', 'SUNPHARMA', 'TATACONSUM', 'TATASTEEL', 'TCS', 'TECHM', 'TITAN', 'TRENT', 'ULTRACEMCO', 'WIPRO'].map((s) => `${s}.NS`);

type Universe = 'setup' | 'watchlist' | 'nse';

export default function ScannerView() {
  const { setups, loaded, load } = useSetupStore();
  const { focusSetupId, openSetup, setSymbol, setView } = useUiStore();
  const watchlist = useWatchlistStore((s) => s.watchlist);
  const [setupId, setSetupId] = useState('');
  const [universe, setUniverse] = useState<Universe>('setup');
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [ranAt, setRanAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [onlyMatches, setOnlyMatches] = useState(false);
  const [auto, setAuto] = useState(false);

  useEffect(() => { if (!loaded) load(); }, [loaded, load]);
  useEffect(() => {
    if (focusSetupId && setups.some((s) => s.id === focusSetupId)) { setSetupId(focusSetupId); openSetup(null); }
    else if (!setupId && setups.length) setSetupId(setups[0].id);
  }, [focusSetupId, setups, setupId, openSetup]);

  const setup = setups.find((s) => s.id === setupId);
  const symbols = useMemo(() => {
    if (universe === 'nse') return NSE_LARGE;
    if (universe === 'watchlist' || !setup?.universe?.length) return watchlist.map((w) => w.symbol);
    return setup.universe;
  }, [universe, setup, watchlist]);

  const run = async () => {
    if (!setup) return;
    setBusy(true); setErr(null);
    try {
      const r = await api.runScan({ setupId: setup.id, symbols });
      setResult(r); setRanAt(Date.now());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { setResult(null); }, [setupId, universe]);
  useEffect(() => {
    if (!auto) return;
    const id = window.setInterval(run, 60_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, setupId, universe, symbols]);

  const rows = (result?.results ?? []).filter((r) => !onlyMatches || r.matched);
  const toggle = (s: string) => setOpen((o) => { const n = new Set(o); if (n.has(s)) n.delete(s); else n.add(s); return n; });
  const openChart = (s: string) => { setSymbol(s); setView('chart'); };

  if (loaded && !setups.length) {
    return (
      <div className="view"><div className="view-inner">
        <div className="view-head"><div><h1>Scanner</h1><p>Find every stock that has your setup right now.</p></div></div>
        <div className="card"><Empty icon={<ListChecks size={26} className="muted" />} title="Create a setup to scan with"
          action={<button className="btn btn-primary" onClick={() => openSetup('new', 'setups')}><Plus size={15} /> New setup</button>}>
          The scanner checks a setup’s technical and fundamental rules against a list of symbols and shows which ones pass — and why.
        </Empty></div>
      </div></div>
    );
  }

  return (
    <div className="view">
      <div className="view-inner">
        <div className="view-head">
          <div><h1>Scanner</h1><p>Every symbol is checked on its latest bar. Fundamentals are fetched for symbols whose technicals pass.</p></div>
        </div>

        <section className="card" style={{ marginBottom: 14 }}>
          <div className="toolbar">
            <div className="field" style={{ flex: '1 1 220px' }}>
              <label htmlFor="sc-s">Setup</label>
              <select id="sc-s" className="select" value={setupId} onChange={(e) => setSetupId(e.target.value)}>
                {setups.map((s) => <option key={s.id} value={s.id}>{s.name} · {tfLabel(s.timeframe)}</option>)}
              </select>
            </div>
            <div className="field" style={{ flex: '0 0 auto' }}>
              <span className="label">Symbols</span>
              <Segmented value={universe} onChange={setUniverse} options={[
                { id: 'setup', label: setup?.universe?.length ? `Setup’s (${setup.universe.length})` : `Watchlist (${watchlist.length})` },
                ...(setup?.universe?.length ? [{ id: 'watchlist' as Universe, label: `Watchlist (${watchlist.length})` }] : []),
                { id: 'nse', label: `NSE large caps (${NSE_LARGE.length})` },
              ]} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
              <label className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Re-scan every minute
              </label>
              <button className="btn btn-primary" onClick={run} disabled={busy || !setup || !symbols.length}>
                {busy ? <Spinner size={14} /> : <Radar size={15} />} Scan {symbols.length}
              </button>
            </div>
          </div>
        </section>

        {err && <div className="notice notice-error" style={{ marginBottom: 14 }}>{err}</div>}

        {!result && !busy && (
          <div className="card"><Empty icon={<Radar size={26} className="muted" />} title="Ready to scan">Pick a setup and a list of symbols, then run the scan.</Empty></div>
        )}
        {busy && !result && <div className="card"><div className="empty"><Spinner /><p>Checking {symbols.length} symbols…</p></div></div>}

        {result && (
          <section className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', flexWrap: 'wrap' }}>
              <span className={`badge ${result.matched ? 'badge-up' : ''}`} style={{ height: 24, fontSize: 12 }}>{result.matched} match{result.matched === 1 ? '' : 'es'}</span>
              <span className="hint">{result.scanned} scanned · {(result.durationMs / 1000).toFixed(1)}s · {ranAt ? timeAgo(ranAt) : ''}{result.fundamentalsRequired ? ' · fundamentals must pass' : ''}</span>
              <span style={{ flex: 1 }} />
              <label className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={onlyMatches} onChange={(e) => setOnlyMatches(e.target.checked)} /> Matches only
              </label>
            </div>
            <div className="table-scroll">
              <table className="table">
                <thead><tr>
                  <th style={{ width: 28 }} /><th>Symbol</th><th>Status</th><th className="r">Last</th><th className="r">Chg</th>
                  <th className="hide-sm">Technical</th><th className="hide-sm">Fundamental</th>
                </tr></thead>
                <tbody>
                  {rows.map((r) => {
                    const isOpen = open.has(r.symbol);
                    const tPass = r.technical.filter((t) => t.passed).length;
                    const fPass = r.fundamental.filter((t) => t.passed).length;
                    return (
                      <Fragment key={r.symbol}>
                        <tr onClick={() => toggle(r.symbol)} style={{ cursor: 'pointer' }}>
                          <td>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} className="muted" />}</td>
                          <td>
                            <button className="mono" style={{ fontWeight: 600 }} onClick={(e) => { e.stopPropagation(); openChart(r.symbol); }}>{displaySymbol(r.symbol)}</button>
                            <span className="hint" style={{ marginLeft: 6, fontSize: 11 }}>{exchangeOf(r.symbol)}</span>
                          </td>
                          <td>
                            {r.matched ? <span className="badge badge-up"><CheckCircle2 size={12} /> Match</span>
                              : r.error ? <span className="badge"><CircleDashed size={12} /> {r.error}</span>
                              : r.technicalPassed ? <span className="badge badge-warn">Fundamentals fail</span>
                              : <span className="badge"><XCircle size={12} /> No</span>}
                          </td>
                          <td className="r num">{fmtPrice(r.close)}</td>
                          <td className={`r num ${toneOf(r.changePct)}`}>{fmtPct(r.changePct)}</td>
                          <td className="hide-sm num">{r.technical.length ? `${tPass}/${r.technical.length}` : '—'}</td>
                          <td className="hide-sm num">{r.fundamentalsChecked ? `${fPass}/${r.fundamental.length}` : <span className="muted">—</span>}</td>
                        </tr>
                        {isOpen && (
                          <tr className="result-row-detail"><td colSpan={7}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, padding: '4px 0' }}>
                              <div><div className="section-title" style={{ marginBottom: 6 }}>Technical</div><ConditionList items={r.technical} emptyText={r.error ?? ''} /></div>
                              {setup && setup.fundamentalConditions.length > 0 && (
                                <div><div className="section-title" style={{ marginBottom: 6 }}>Fundamental</div>
                                  <ConditionList items={r.fundamental} emptyText="Fetched only when the technicals pass (for scans over 30 symbols)." /></div>
                              )}
                            </div>
                            <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => openChart(r.symbol)}>Open chart</button>
                          </td></tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {!rows.length && <tr><td colSpan={7}><div className="empty" style={{ padding: 24 }}><p>No symbol has this setup right now.</p></div></td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
