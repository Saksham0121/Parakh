import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useSocketStore } from '../store/socketStore';
import { api } from '../lib/api';
import Chart from '../components/Chart';
import SetupBuilder from '../components/SetupBuilder';
import BacktestDashboard from '../components/BacktestDashboard';
import Leaderboard from '../components/Leaderboard';
import '../components/Workspace.css';
import { BarChart3, LogOut, Menu, PlayCircle, Plus, Settings2, Trophy, X } from 'lucide-react';
import './Dashboard.css';

type Tab = 'chart' | 'setup' | 'backtest' | 'leaderboard';

const tabs: Array<{ id: Tab; label: string; icon: typeof BarChart3 }> = [
  { id: 'chart', label: 'CHART', icon: BarChart3 },
  { id: 'setup', label: 'SETUPS', icon: Settings2 },
  { id: 'backtest', label: 'BACKTEST', icon: PlayCircle },
  { id: 'leaderboard', label: 'LEADERBOARD', icon: Trophy },
];

export default function Dashboard() {
  const { user, logout } = useAuthStore();
  const { connect, disconnect, subscribeSymbol, prices, setPrice } = useSocketStore();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [activeSymbol, setActiveSymbol] = useState('AAPL');
  const [activeTab, setActiveTab] = useState<Tab>('chart');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const liveTick = prices[activeSymbol];
  const displaySymbol = activeSymbol.replace('BINANCE:', '');
  
  // Data Flash effect
  const priceRef = useRef<HTMLSpanElement>(null);
  const prevPrice = useRef(liveTick?.price);
  
  useEffect(() => {
    if (liveTick?.price !== prevPrice.current && priceRef.current) {
      priceRef.current.classList.remove('data-flash');
      void priceRef.current.offsetWidth; // trigger reflow
      priceRef.current.classList.add('data-flash');
      prevPrice.current = liveTick?.price;
    }
  }, [liveTick?.price]);

  useEffect(() => {
    connect();
    fetchWatchlist();
    return () => disconnect();
  }, []);

  // Fetch initial quote & subscribe to live updates when activeSymbol changes
  useEffect(() => {
    if (!activeSymbol) return;
    subscribeSymbol(activeSymbol);

    // Immediate REST quote fetch so user doesn't wait for WebSocket tick
    const fetchInitialQuote = async () => {
      try {
        const cleanSym = activeSymbol.replace('BINANCE:', '');
        const quote = await api.getQuote(cleanSym);
        if (quote && (quote.c || quote.price)) {
          setPrice({
            symbol: activeSymbol,
            price: quote.c || quote.price,
            timestamp: quote.t || Math.floor(Date.now() / 1000),
          });
        }
      } catch (err) {
        console.error('Failed to fetch initial quote', err);
      }
    };

    fetchInitialQuote();
  }, [activeSymbol]);

  const fetchWatchlist = async () => {
    try {
      const result = await api.getWatchlist();
      setWatchlist(result);
      if (result.length > 0 && (activeSymbol === 'BINANCE:BTCUSDT' || activeSymbol === 'AAPL')) {
        setActiveSymbol(result[0].symbol);
      }

      // Fetch initial prices for all watchlist items
      for (const item of result) {
        if (!prices[item.symbol]) {
          const clean = item.symbol.replace('BINANCE:', '');
          api.getQuote(clean).then((quote) => {
            if (quote && (quote.c || quote.price)) {
              setPrice({
                symbol: item.symbol,
                price: quote.c || quote.price,
                timestamp: quote.t || Math.floor(Date.now() / 1000),
              });
            }
          }).catch(() => {});
        }
      }
    } catch (error) {
      console.error('Failed to fetch watchlist', error);
    }
  };

  const handleSearch = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const query = event.target.value;
    setSearchQuery(query);
    if (query.trim().length <= 2) {
      setSearchResults([]);
      return;
    }
    try {
      const result = await api.searchSymbol(query);
      setSearchResults(result.result || []);
    } catch (error) {
      console.error('Search error', error);
    }
  };

  const handleAddToWatchlist = async (symbol: string) => {
    try {
      await api.addToWatchlist(symbol);
      await fetchWatchlist();
      setSearchResults([]);
      setSearchQuery('');
      setActiveSymbol(symbol);
      setIsSidebarOpen(false);
    } catch (error) {
      console.error('Could not add symbol to watchlist', error);
    }
  };

  const selectSymbol = (symbol: string) => {
    setActiveSymbol(symbol);
    setIsSidebarOpen(false);
  };

  const selectTab = (tab: Tab) => {
    setActiveTab(tab);
    setIsSidebarOpen(false);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="blueprint-dashboard">
      <div className={`sidebar-overlay ${isSidebarOpen ? 'open' : ''}`} onClick={() => setIsSidebarOpen(false)} />
      
      <aside className={`blueprint-sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="blueprint-brand">
          <span>PARAKH</span>&nbsp;ENGINE
          <button className="mobile-menu-btn" style={{ marginLeft: 'auto', display: isSidebarOpen ? 'block' : 'none' }} onClick={() => setIsSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>
        
        <div className="blueprint-search">
          <input type="search" placeholder="SEARCH TICKER..." value={searchQuery} onChange={handleSearch} />
          {searchResults.length > 0 && (
            <div className="search-results" style={{ position: 'absolute', zIndex: 100, background: 'var(--bg-panel)', border: '1px solid var(--border-grid)', width: '240px', marginTop: '4px' }}>
              {searchResults.slice(0, 5).map((result) => (
                <div key={result.symbol} className="blueprint-list-item" onClick={() => handleAddToWatchlist(result.symbol)}>
                  <span className="blueprint-symbol">{result.symbol}</span>
                  <Plus size={16} color="var(--text-muted)" />
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="blueprint-list">
          {watchlist.map((item) => {
            const tick = prices[item.symbol];
            return (
              <div key={item.symbol} className={`blueprint-list-item ${activeSymbol === item.symbol ? 'active' : ''}`} onClick={() => selectSymbol(item.symbol)}>
                <span className="blueprint-symbol">{item.symbol.replace('BINANCE:', '')}</span>
                <span className="blueprint-price">{tick ? `$${tick.price.toFixed(2)}` : '—'}</span>
              </div>
            );
          })}
          {watchlist.length === 0 && (
            <div style={{ padding: '20px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No symbols in watchlist.
            </div>
          )}
        </div>
        
        <div className="blueprint-user">
          <div className="blueprint-user-info">
            <span className="blueprint-user-name">{user?.name || 'OPERATOR'}</span>
            <span className="blueprint-user-email">{user?.email || 'SYS.ADMIN'}</span>
          </div>
          <button className="blueprint-logout" onClick={handleLogout} aria-label="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      
      <main className="blueprint-main">
        <header className="blueprint-header">
          <div className="blueprint-ticker">
            <button className="mobile-menu-btn" onClick={() => setIsSidebarOpen(true)}>
              <Menu size={20} />
            </button>
            <h2>{displaySymbol}</h2>
            <span className="blueprint-live-price" ref={priceRef}>
              {liveTick ? `$${liveTick.price.toFixed(2)}` : 'CONNECTING...'}
            </span>
          </div>
          
          <nav className="blueprint-tabs">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button key={id} className={`blueprint-tab ${activeTab === id ? 'active' : ''}`} onClick={() => selectTab(id)}>
                <Icon size={16} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </header>
        
        <div className="blueprint-content">
          {activeTab === 'chart' && <Chart symbol={activeSymbol} />}
          {activeTab === 'setup' && <SetupBuilder />}
          {activeTab === 'backtest' && <BacktestDashboard activeSymbol={activeSymbol} />}
          {activeTab === 'leaderboard' && <Leaderboard />}
        </div>
      </main>
    </div>
  );
}
