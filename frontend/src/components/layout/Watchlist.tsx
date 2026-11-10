import { memo, useEffect, useRef } from 'react';
import { Plus, X } from 'lucide-react';
import { useWatchlistStore } from '../../store/watchlistStore';
import { useSocketStore } from '../../store/socketStore';
import { useUiStore } from '../../store/uiStore';
import { api } from '../../lib/api';
import { displaySymbol, exchangeOf, fmtPct, fmtPrice, toneOf } from '../../lib/format';

const Row = memo(function Row({ symbol, active, onPick, onRemove }: { symbol: string; active: boolean; onPick: (s: string) => void; onRemove: (s: string) => void }) {
  const tick = useSocketStore((s) => s.prices[symbol]);
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef<number | undefined>(undefined);
  useEffect(() => {
    // Brief flash on price change so moving rows are easy to spot.
    if (tick?.price != null && last.current != null && tick.price !== last.current && ref.current) {
      const el = ref.current;
      const cls = tick.price > last.current ? 'flash-up' : 'flash-down';
      el.classList.remove('flash-up', 'flash-down');
      void el.offsetWidth;
      el.classList.add(cls);
    }
    last.current = tick?.price;
  }, [tick?.price]);

  return (
    <div ref={ref} className={`watch-row ${active ? 'on' : ''}`} role="button" tabIndex={0}
      onClick={() => onPick(symbol)} onKeyDown={(e) => { if (e.key === 'Enter') onPick(symbol); }}>
      <div style={{ minWidth: 0 }}>
        <div className="sym">{displaySymbol(symbol)}</div>
        <div className="ex">{exchangeOf(symbol)}</div>
      </div>
      <div className="px">{tick ? fmtPrice(tick.price) : <span className="skeleton" style={{ display: 'inline-block', width: 56, height: 12 }} />}</div>
      <div className={`chg ${toneOf(tick?.changePct)}`} style={{ background: tick?.changePct ? (tick.changePct > 0 ? 'var(--up-soft)' : 'var(--down-soft)') : undefined }}>
        {fmtPct(tick?.changePct)}
      </div>
      <button className="btn btn-ghost btn-sm btn-icon rm" aria-label={`Remove ${symbol}`} onClick={(e) => { e.stopPropagation(); onRemove(symbol); }}>
        <X size={14} />
      </button>
    </div>
  );
});

export default function Watchlist({ onPick }: { onPick?: () => void }) {
  const { watchlist, removeSymbol } = useWatchlistStore();
  const { symbol, setSymbol, setSearchOpen, view, setView } = useUiStore();
  const unsubscribe = useSocketStore((s) => s.unsubscribeSymbol);

  const pick = (s: string) => {
    setSymbol(s);
    if (view !== 'chart') setView('chart');
    onPick?.();
  };
  const remove = (s: string) => {
    unsubscribe(s);
    api.unsubscribeMarket(s).catch(() => {});
    removeSymbol(s);
  };

  return (
    <>
      <div className="watch-head">
        <h2>Watchlist <span className="muted" style={{ fontWeight: 400 }}>{watchlist.length}</span></h2>
        <button className="btn btn-ghost btn-sm" onClick={() => setSearchOpen(true)}><Plus size={14} /> Add</button>
      </div>
      <div className="watch-cols"><span>Symbol</span><span style={{ textAlign: 'right' }}>Last</span><span style={{ textAlign: 'right' }}>Chg%</span></div>
      <div className="watch-list">
        {watchlist.map((w) => <Row key={w.symbol} symbol={w.symbol} active={w.symbol === symbol} onPick={pick} onRemove={remove} />)}
        {watchlist.length === 0 && (
          <div className="empty"><h3>Your watchlist is empty</h3><p>Add stocks you follow. Setups with no symbol list scan your watchlist.</p>
            <button className="btn btn-primary btn-sm" onClick={() => setSearchOpen(true)}><Plus size={14} /> Add a symbol</button></div>
        )}
      </div>
    </>
  );
}
