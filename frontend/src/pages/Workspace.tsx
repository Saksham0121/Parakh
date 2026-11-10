import { lazy, Suspense, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ChartCandlestick, FlaskConical, ListChecks, LogOut, PanelRight, Radar, Search, Star } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useSocketStore } from '../store/socketStore';
import { useWatchlistStore } from '../store/watchlistStore';
import { useUiStore, type View } from '../store/uiStore';
import { useAlertStore } from '../store/alertStore';
import { useSetupStore } from '../store/setupStore';
import { api } from '../lib/api';
import { currencySign, displaySymbol, exchangeOf, fmtPct, fmtPrice, toneOf } from '../lib/format';
import Watchlist from '../components/layout/Watchlist';
import SymbolSearch from '../components/layout/SymbolSearch';
import Toasts from '../components/layout/Toasts';
import { Spinner } from '../components/ui/primitives';
import ErrorBoundary from '../components/ui/ErrorBoundary';

const ChartView = lazy(() => import('../components/chart/ChartView'));
const ScannerView = lazy(() => import('../components/scanner/ScannerView'));
const SetupsView = lazy(() => import('../components/setups/SetupsView'));
const BacktestView = lazy(() => import('../components/backtest/BacktestView'));
const AlertsView = lazy(() => import('../components/alerts/AlertsView'));

const NAV: Array<{ id: View; label: string; icon: typeof Bell }> = [
  { id: 'chart', label: 'Chart', icon: ChartCandlestick },
  { id: 'scanner', label: 'Scanner', icon: Radar },
  { id: 'setups', label: 'Setups', icon: ListChecks },
  { id: 'backtest', label: 'Backtest', icon: FlaskConical },
  { id: 'alerts', label: 'Alerts', icon: Bell },
];

const TITLES: Record<View, string> = { chart: 'Chart', scanner: 'Scanner', setups: 'Setups', backtest: 'Backtest', alerts: 'Alerts' };

export default function Workspace() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { connect, disconnect, subscribeSymbol, applyQuotes } = useSocketStore();
  const { watchlist, fetchWatchlist } = useWatchlistStore();
  const { view, setView, symbol, watchCollapsed, toggleWatch, setSearchOpen, watchOpen, setWatchOpen } = useUiStore();
  const tick = useSocketStore((s) => s.prices[symbol]);
  const unread = useAlertStore((s) => s.unread);

  useEffect(() => {
    connect();
    fetchWatchlist();
    useAlertStore.getState().load();
    useSetupStore.getState().load();
    return () => disconnect();
  }, [connect, disconnect, fetchWatchlist]);

  // One batched quote request for the whole watchlist + live room subscriptions; refreshed every 15s
  // as a safety net in case the socket is down.
  useEffect(() => {
    const symbols = Array.from(new Set([...watchlist.map((w) => w.symbol), symbol]));
    symbols.forEach((s) => { subscribeSymbol(s); api.subscribeMarket(s).catch(() => {}); });
    const refresh = () => api.getQuotes(symbols).then(applyQuotes).catch(() => {});
    refresh();
    const id = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(id);
  }, [watchlist, symbol, subscribeSymbol, applyQuotes]);

  // Keyboard: "/" or Cmd/Ctrl+K opens symbol search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName);
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setSearchOpen]);

  const go = (v: View) => {
    setView(v);
    if (v === 'alerts') useAlertStore.getState().markRead();
  };

  const navItems = (cls: string) => NAV.map(({ id, label, icon: Icon }) => (
    <button key={id} className={`nav-item ${view === id ? 'on' : ''} ${cls}`} onClick={() => go(id)} aria-current={view === id ? 'page' : undefined}>
      <Icon size={20} strokeWidth={1.8} />
      <span>{label}</span>
      {id === 'alerts' && unread > 0 && <span className="count">{unread > 9 ? '9+' : unread}</span>}
    </button>
  ));

  return (
    <div className={`shell ${watchCollapsed ? 'watch-collapsed' : ''}`}>
      <nav className="nav" aria-label="Main">
        <div className="nav-logo" aria-label="Parakh">P</div>
        {navItems('')}
        <div className="nav-spacer" />
        <button className="nav-item" onClick={() => { logout(); navigate('/login'); }} title={user?.email ? `Sign out ${user.email}` : 'Sign out'}>
          <LogOut size={18} strokeWidth={1.8} />
          <span>Sign out</span>
        </button>
      </nav>

      <header className="topbar">
        <span className="topbar-title">{TITLES[view]}</span>
        <button className="symbol-btn" onClick={() => setSearchOpen(true)} aria-label="Change symbol">
          <Search size={15} className="muted" />
          <span className="sym">{displaySymbol(symbol)}</span>
          <span className="badge">{exchangeOf(symbol)}</span>
          {tick && (
            <>
              <span className="px">{currencySign(symbol)}{fmtPrice(tick.price)}</span>
              <span className={`num ${toneOf(tick.changePct)}`} style={{ fontSize: 12 }}>{fmtPct(tick.changePct)}</span>
            </>
          )}
          <span className="kbd hide-sm muted mono" style={{ marginLeft: 'auto', fontSize: 11 }}>/</span>
        </button>
        <div className="topbar-spacer" />
        <button className="btn btn-ghost btn-icon show-sm" onClick={() => setWatchOpen(true)} aria-label="Watchlist"><Star size={18} /></button>
        <button className="btn btn-ghost btn-icon hide-sm" onClick={() => { if (window.innerWidth < 1280) setWatchOpen(true); else toggleWatch(); }} aria-label="Toggle watchlist" title="Watchlist">
          <PanelRight size={18} />
        </button>
      </header>

      <main className="main">
        <ErrorBoundary resetKey={view}>
        <Suspense fallback={<div className="empty" style={{ height: '100%' }}><Spinner /></div>}>
          {view === 'chart' && <ChartView symbol={symbol} />}
          {view === 'scanner' && <ScannerView />}
          {view === 'setups' && <SetupsView />}
          {view === 'backtest' && <BacktestView />}
          {view === 'alerts' && <AlertsView />}
        </Suspense>
        </ErrorBoundary>
      </main>

      <aside className="watch" aria-label="Watchlist"><Watchlist /></aside>
      {watchOpen && (
        <>
          <div className="scrim" onClick={() => setWatchOpen(false)} />
          <aside className="drawer" aria-label="Watchlist"><Watchlist onPick={() => setWatchOpen(false)} /></aside>
        </>
      )}

      <nav className="tabbar" aria-label="Main">{navItems('')}</nav>
      <SymbolSearch />
      <Toasts />
    </div>
  );
}
