import { useEffect, useState } from 'react';
import { CheckCircle2, FlaskConical, ListChecks, Plus, RefreshCw, X, XCircle } from 'lucide-react';
import { api } from '../../lib/api';
import type { Fundamentals, Quote, ScanRow } from '../../lib/types';
import { useSetupStore } from '../../store/setupStore';
import { useUiStore } from '../../store/uiStore';
import { displaySymbol, fmtCompact, fmtNum, fmtPct, fmtPrice } from '../../lib/format';
import { tfLabel } from '../../lib/catalog';
import { ConditionList, Spinner } from '../ui/primitives';

const KEY_METRICS: Array<[string, string, (v: number) => string]> = [
  ['pe_ratio', 'P/E', (v) => fmtNum(v)],
  ['forward_pe', 'Forward P/E', (v) => fmtNum(v)],
  ['pb_ratio', 'P/B', (v) => fmtNum(v)],
  ['peg_ratio', 'PEG', (v) => fmtNum(v)],
  ['roe', 'ROE', (v) => `${fmtNum(v)}%`],
  ['debt_to_equity', 'Debt / Equity', (v) => fmtNum(v)],
  ['profit_margin', 'Net margin', (v) => `${fmtNum(v)}%`],
  ['revenue_growth', 'Revenue growth', (v) => fmtPct(v)],
  ['earnings_growth', 'Earnings growth', (v) => fmtPct(v)],
  ['eps', 'EPS (TTM)', (v) => fmtNum(v)],
  ['dividend_yield', 'Dividend yield', (v) => `${fmtNum(v)}%`],
  ['beta', 'Beta', (v) => fmtNum(v)],
];

function Overview({ symbol, currency }: { symbol: string; currency: string }) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [fund, setFund] = useState<Fundamentals | null>(null);
  const [fundErr, setFundErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true); setQuote(null); setFund(null); setFundErr(null);
    api.getQuote(symbol).then((q) => live && setQuote(q)).catch(() => {});
    api.getFundamentals(symbol).then((f) => live && setFund(f)).catch((e: Error) => live && setFundErr(e.message)).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [symbol]);

  const m = fund?.metrics ?? {};
  const cap = currency === '₹' ? (m.market_cap_cr != null ? `₹${fmtNum(m.market_cap_cr, 0)} Cr` : '—') : (m.market_cap_bn != null ? `${currency}${fmtNum(m.market_cap_bn)} B` : '—');
  const pos52 = quote?.high52 && quote?.low52 && quote.high52 > quote.low52 ? ((quote.c - quote.low52) / (quote.high52 - quote.low52)) * 100 : null;

  return (
    <>
      <div>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{fund?.name || quote?.name || displaySymbol(symbol)}</div>
        <div className="hint">{[fund?.sector, fund?.industry].filter(Boolean).join(' · ') || quote?.exchange || ' '}</div>
      </div>

      {quote && (
        <div className="kv">
          <div><div className="k">Prev close</div><div className="v">{fmtPrice(quote.pc)}</div></div>
          <div><div className="k">Open</div><div className="v">{fmtPrice(quote.o)}</div></div>
          <div><div className="k">Day range</div><div className="v" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{fmtPrice(quote.l)}–{fmtPrice(quote.h)}</div></div>
          <div><div className="k">Volume</div><div className="v">{fmtCompact(quote.v)}</div></div>
        </div>
      )}
      {pos52 != null && quote && (
        <div>
          <div className="label">52-week range</div>
          <div className="range-bar"><span style={{ left: `calc(${Math.min(Math.max(pos52, 0), 100)}% - 1px)` }} /></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }} className="num hint"><span>{fmtPrice(quote.low52)}</span><span>{fmtPrice(quote.high52)}</span></div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="section-title">Fundamentals</span>
        <span className="hint" style={{ fontSize: 11 }}>{fund ? fund.source : ''}</span>
      </div>
      {loading && <div className="kv">{Array.from({ length: 6 }).map((_, i) => <div key={i}><div className="skeleton" style={{ height: 10, width: '50%' }} /><div className="skeleton" style={{ height: 14, width: '70%', marginTop: 6 }} /></div>)}</div>}
      {!loading && fund && (
        <div className="kv">
          <div style={{ gridColumn: 'span 2' }}><div className="k">Market cap</div><div className="v">{cap}</div></div>
          {KEY_METRICS.map(([k, label, f]) => (
            <div key={k}><div className="k">{label}</div><div className="v">{m[k] != null ? f(m[k]) : '—'}</div></div>
          ))}
        </div>
      )}
      {!loading && !fund && (
        <div className="notice">{fundErr ?? 'Fundamentals are not available for this symbol.'} Indices, crypto and some small caps don't report them.</div>
      )}
    </>
  );
}

function SetupCheck({ symbol, timeframe }: { symbol: string; timeframe: string }) {
  const { setups, loaded } = useSetupStore();
  const openSetup = useUiStore((s) => s.openSetup);
  const [setupId, setSetupId] = useState<string>('');
  const [row, setRow] = useState<ScanRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (!setupId && setups.length) setSetupId(setups[0].id); }, [setups, setupId]);
  const setup = setups.find((s) => s.id === setupId);

  const run = async () => {
    if (!setup) return;
    setBusy(true); setErr(null);
    try {
      const res = await api.runScan({ setupId: setup.id, symbols: [symbol] });
      setRow(res.results[0] ?? null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { setRow(null); if (setup) run(); /* auto-check on symbol/setup change */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, setupId]);

  if (loaded && !setups.length) {
    return (
      <div className="empty" style={{ padding: 20 }}>
        <ListChecks size={22} />
        <h3>No setups yet</h3>
        <p>Describe the trade you look for — say a breakout with P/E below 25 — and check any chart against it.</p>
        <button className="btn btn-primary btn-sm" onClick={() => openSetup('new', 'setups')}><Plus size={14} /> Create a setup</button>
      </div>
    );
  }

  return (
    <>
      <div className="field">
        <label htmlFor="sc-setup">Setup</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <select id="sc-setup" className="select" value={setupId} onChange={(e) => setSetupId(e.target.value)}>
            {setups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className="btn btn-icon" onClick={run} disabled={busy || !setup} aria-label="Re-check">{busy ? <Spinner size={14} /> : <RefreshCw size={15} />}</button>
        </div>
        {setup && <span className="hint">Evaluated on {tfLabel(setup.timeframe)} candles{setup.timeframe !== timeframe ? ` (chart shows ${tfLabel(timeframe)})` : ''}.</span>}
      </div>
      {err && <div className="notice notice-error">{err}</div>}
      {row && (
        <>
          <div className={`verdict ${row.matched ? 'verdict-yes' : 'verdict-no'}`}>
            {row.matched ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
            <div>
              {row.matched ? `${displaySymbol(symbol)} has this setup now` : row.error ?? (row.technicalPassed ? 'Technicals pass, fundamentals don’t' : 'Setup not present')}
              {row.matched && <div style={{ fontWeight: 400, fontSize: 12, opacity: .85 }}>Every condition is met on the latest bar.</div>}
            </div>
          </div>
          <div className="section-title">Technical</div>
          <ConditionList items={row.technical} />
          {setup && setup.fundamentalConditions.length > 0 && (
            <>
              <div className="section-title">Fundamental {setup.fundamentalMode === 'display_only' && <span className="badge" style={{ marginLeft: 6 }}>info only</span>}</div>
              <ConditionList items={row.fundamental} emptyText={row.fundamentalsChecked ? '' : 'Checked once the technical conditions pass.'} />
            </>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" onClick={() => openSetup(setup!.id, 'setups')}><ListChecks size={14} /> Edit setup</button>
            <button className="btn btn-sm" onClick={() => openSetup(setup!.id, 'backtest')}><FlaskConical size={14} /> Backtest</button>
          </div>
        </>
      )}
    </>
  );
}

export default function SidePanel({ symbol, timeframe, open, onClose, currency }: {
  symbol: string; timeframe: string; open: boolean; onClose: () => void; lastPrice?: number; currency: string;
}) {
  const [tab, setTab] = useState<'overview' | 'check'>(() => (localStorage.getItem('parakh:sideTab') as 'overview' | 'check') || 'overview');
  const pick = (t: typeof tab) => { setTab(t); try { localStorage.setItem('parakh:sideTab', t); } catch { /* ignore */ } };
  return (
    <aside className={`side ${open ? '' : 'closed'}`} aria-label="Analysis">
      <div className="side-tabs">
        <button className={tab === 'overview' ? 'on' : ''} onClick={() => pick('overview')}>Overview</button>
        <button className={tab === 'check' ? 'on' : ''} onClick={() => pick('check')}>Setup check</button>
        <button className="btn btn-ghost btn-sm btn-icon side-close" onClick={onClose} aria-label="Close panel" style={{ flex: 'none' }}><X size={15} /></button>
      </div>
      <div className="side-body">
        {tab === 'overview' ? <Overview symbol={symbol} currency={currency} /> : <SetupCheck symbol={symbol} timeframe={timeframe} />}
      </div>
    </aside>
  );
}
