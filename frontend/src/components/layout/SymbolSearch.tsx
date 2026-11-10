import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus, Search } from 'lucide-react';
import { useUiStore } from '../../store/uiStore';
import { useWatchlistStore } from '../../store/watchlistStore';
import { api } from '../../lib/api';
import { Spinner } from '../ui/primitives';

const POPULAR = [
  ['RELIANCE.NS', 'Reliance Industries'], ['TCS.NS', 'Tata Consultancy Services'], ['HDFCBANK.NS', 'HDFC Bank'],
  ['INFY.NS', 'Infosys'], ['ICICIBANK.NS', 'ICICI Bank'], ['SBIN.NS', 'State Bank of India'], ['BHARTIARTL.NS', 'Bharti Airtel'],
  ['ITC.NS', 'ITC'], ['^NSEI', 'NIFTY 50'], ['AAPL', 'Apple'], ['NVDA', 'NVIDIA'], ['BTC-USD', 'Bitcoin'],
].map(([symbol, description]) => ({ symbol, description, exchange: '', type: '' }));

export default function SymbolSearch() {
  const { searchOpen, setSearchOpen, setSymbol, view, setView } = useUiStore();
  const { watchlist, addSymbol } = useWatchlistStore();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<typeof POPULAR>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) { setQ(''); setResults([]); setCursor(0); window.setTimeout(() => inputRef.current?.focus(), 10); }
  }, [searchOpen]);

  // Debounced so typing "RELIANCE" costs one request, not eight.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 1) { setResults([]); setLoading(false); return; }
    setLoading(true);
    let live = true;
    const id = window.setTimeout(() => {
      api.searchSymbol(term).then((r) => { if (live) { setResults(r.result ?? []); setCursor(0); } })
        .catch(() => live && setResults([]))
        .finally(() => live && setLoading(false));
    }, 220);
    return () => { live = false; window.clearTimeout(id); };
  }, [q]);

  const list = q.trim() ? results : POPULAR;
  const inList = useMemo(() => new Set(watchlist.map((w) => w.symbol)), [watchlist]);

  if (!searchOpen) return null;
  const close = () => setSearchOpen(false);
  const open = (sym: string) => { setSymbol(sym); if (view !== 'chart') setView('chart'); close(); };
  const typed = q.trim().toUpperCase();

  return (
    <>
      <div className="scrim" onClick={close} />
      <div className="modal-wrap">
        <div className="modal" role="dialog" aria-label="Search symbols">
          <div className="search-box">
            <Search size={16} />
            <input ref={inputRef} className="input" placeholder="Search stocks, indices, crypto — e.g. RELIANCE, TCS, AAPL"
              value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') close();
                if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, list.length - 1)); }
                if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
                if (e.key === 'Enter') { const pickSym = list[cursor]?.symbol ?? typed; if (pickSym) open(pickSym); }
              }} />
          </div>
          <div className="search-results">
            <div className="menu-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{q.trim() ? 'Results' : 'Popular'}</span>{loading && <Spinner size={12} />}
            </div>
            {list.map((r, i) => (
              <div key={r.symbol} className={`search-item ${i === cursor ? 'on' : ''}`} role="button" tabIndex={-1} onMouseEnter={() => setCursor(i)} onClick={() => open(r.symbol)}>
                <span className="sym">{r.symbol}</span>
                <span className="desc">{r.description}</span>
                {r.exchange && <span className="badge hide-sm">{r.exchange}</span>}
                <button className={`btn btn-sm btn-icon ${inList.has(r.symbol) ? 'is-active' : 'btn-ghost'}`} aria-label={inList.has(r.symbol) ? 'In watchlist' : 'Add to watchlist'}
                  onClick={(e) => { e.stopPropagation(); addSymbol(r.symbol); }}>
                  {inList.has(r.symbol) ? <Check size={14} /> : <Plus size={14} />}
                </button>
              </div>
            ))}
            {q.trim() && !loading && results.length === 0 && (
              <div className="empty" style={{ padding: 24 }}>
                <p>No matches. Press Enter to open <span className="mono">{typed}</span> directly (add .NS for NSE, .BO for BSE).</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
