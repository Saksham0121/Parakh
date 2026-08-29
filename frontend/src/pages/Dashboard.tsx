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
import {
  BarChart3,
  LogOut,
  Menu,
  PlayCircle,
  Plus,
  Settings2,
  Trophy,
  X,
  Trash2,
  Search,
  Sparkles,
  TrendingUp,
  Check,
} from 'lucide-react';
import './Dashboard.css';

type Tab = 'chart' | 'setup' | 'backtest' | 'leaderboard';

const tabs: Array<{ id: Tab; label: string; icon: typeof BarChart3 }> = [
  { id: 'chart', label: 'CHART', icon: BarChart3 },
  { id: 'setup', label: 'SETUPS', icon: Settings2 },
  { id: 'backtest', label: 'BACKTEST', icon: PlayCircle },
  { id: 'leaderboard', label: 'LEADERBOARD', icon: Trophy },
];

const POPULAR_INDIAN_STOCKS = [
  { symbol: 'RELIANCE.NS', name: 'Reliance Industries', exchange: 'NSE 🇮🇳' },
  { symbol: 'TCS.NS', name: 'Tata Consultancy Services', exchange: 'NSE 🇮🇳' },
  { symbol: 'HDFCBANK.NS', name: 'HDFC Bank Ltd', exchange: 'NSE 🇮🇳' },
  { symbol: 'INFY.NS', name: 'Infosys Ltd', exchange: 'NSE 🇮🇳' },
  { symbol: 'TATAMOTORS.NS', name: 'Tata Motors Ltd', exchange: 'NSE 🇮🇳' },
  { symbol: 'ICICIBANK.NS', name: 'ICICI Bank Ltd', exchange: 'NSE 🇮🇳' },
  { symbol: 'SBIN.NS', name: 'State Bank of India', exchange: 'NSE 🇮🇳' },
  { symbol: 'ITC.NS', name: 'ITC Limited', exchange: 'NSE 🇮🇳' },
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
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const liveTick = prices[activeSymbol];
  const isIndian = activeSymbol.endsWith('.NS') || activeSymbol.endsWith('.BO');
  const displaySymbol = activeSymbol.replace(/^BINANCE:/i, '');

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
        const cleanSym = activeSymbol.replace(/^BINANCE:/i, '');
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
      const data = await api.getWatchlist();
      setWatchlist(data);

      if (data.length > 0) {
        // Automatically select first symbol if activeSymbol not present
        if (!data.some((item: any) => item.symbol === activeSymbol)) {
          setActiveSymbol(data[0].symbol);
        }
        // Subscribe to all watchlist items
        for (const item of data) {
          subscribeSymbol(item.symbol);
          api.getQuote(item.symbol.replace(/^BINANCE:/i, '')).then((q) => {
            if (q && (q.c || q.price)) {
              setPrice({
                symbol: item.symbol,
                price: q.c || q.price,
                timestamp: q.t || Math.floor(Date.now() / 1000),
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
    if (query.trim().length <= 1) {
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

  // Close search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.blueprint-search')) {
        setIsSearchFocused(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAddToWatchlistOnly = async (e: React.MouseEvent, symbol: string) => {
    e.stopPropagation();
    // 1. Optimistic update
    setWatchlist((prev) => (prev.some((item) => item.symbol === symbol) ? prev : [...prev, { symbol }]));
    subscribeSymbol(symbol);

    api.getQuote(symbol.replace(/^BINANCE:/i, '')).then((q) => {
      if (q && (q.c || q.price)) {
        setPrice({
          symbol,
          price: q.c || q.price,
          timestamp: q.t || Math.floor(Date.now() / 1000),
        });
      }
    }).catch(() => {});

    // 2. Persist to backend and sync
    try {
      await api.addToWatchlist(symbol);
      const latest = await api.getWatchlist();
      setWatchlist(latest);
    } catch (error) {
      console.warn('Could not add symbol to watchlist', error);
    }
  };

  const handleSelectFromSearch = async (symbol: string) => {
    // 1. Immediately switch active chart & close search UI
    setActiveSymbol(symbol);
    setSearchResults([]);
    setSearchQuery('');
    setIsSearchFocused(false);
    setIsSidebarOpen(false);

    // 2. Optimistic update
    setWatchlist((prev) => (prev.some((item) => item.symbol === symbol) ? prev : [...prev, { symbol }]));
    subscribeSymbol(symbol);

    // 3. Persist to backend and refresh
    try {
      await api.addToWatchlist(symbol);
      const latest = await api.getWatchlist();
      setWatchlist(latest);
    } catch (error) {
      console.warn('Watchlist sync warning', error);
    }
  };

  const handleRemoveFromWatchlist = async (e: React.MouseEvent, symbol: string) => {
    e.stopPropagation();
    try {
      await api.removeFromWatchlist(symbol);
      const updated = watchlist.filter((item) => item.symbol !== symbol);
      setWatchlist(updated);

      if (activeSymbol === symbol) {
        if (updated.length > 0) {
          setActiveSymbol(updated[0].symbol);
        } else {
          setActiveSymbol('RELIANCE.NS');
        }
      }
    } catch (error) {
      console.error('Could not remove symbol from watchlist', error);
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
        <div className="blueprint-brand flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[#2962FF] font-bold">PARAKH</span>
            <span className="text-xs text-[#787B86] font-mono tracking-widest">ENGINE</span>
          </div>
          <button
            className="mobile-menu-btn"
            style={{ display: isSidebarOpen ? 'block' : 'none' }}
            onClick={() => setIsSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        {/* Search with Indian Stock Recommendation System */}
        <div className="blueprint-search relative">
          <div className="relative flex items-center">
            <Search size={14} className="absolute left-3 text-[#787B86]" />
            <input
              type="search"
              placeholder="Search "
              value={searchQuery}
              onChange={handleSearch}
              onFocus={() => setIsSearchFocused(true)}
              className="w-full bg-[#0B0E14] border border-[#1E2433] rounded-md pl-8 pr-8 py-2 text-xs font-mono text-[#F0F4F8] focus:border-[#2962FF]"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                className="absolute right-2.5 text-[#787B86] hover:text-white"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Autocomplete / Recommendations Dropdown */}
          {(searchResults.length > 0 || (isSearchFocused && searchQuery.length === 0)) && (
            <div className="absolute left-3 right-3 top-14 bg-[#121721] border border-[#242C3D] shadow-2xl rounded-lg p-2 z-50 animate-dropdown max-h-80 overflow-y-auto backdrop-blur-2xl">
              {searchResults.length > 0 ? (
                <>
                  <div className="px-2 py-1 text-[10px] text-[#787B86] uppercase font-mono font-bold tracking-wider flex items-center justify-between">
                    <span>Search Results</span>
                    <span className="text-[9px] text-[#2962FF]">Indian stocks prioritized</span>
                  </div>
                  {searchResults.slice(0, 8).map((result) => {
                    const isNSE = result.symbol.endsWith('.NS');
                    const isBSE = result.symbol.endsWith('.BO');
                    const inWatchlist = watchlist.some((w) => w.symbol === result.symbol);

                    return (
                      <div
                        key={result.symbol}
                        onClick={() => handleSelectFromSearch(result.symbol)}
                        className="p-2 rounded-md cursor-pointer flex items-center justify-between hover:bg-[#1A2230] transition-colors group"
                      >
                        <div className="flex flex-col min-w-0 pr-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs text-[#F0F4F8] font-mono">{result.symbol}</span>
                            {(isNSE || result.exchange === 'NSI') && (
                              <span className="text-[9px] px-1.5 py-0.2 bg-[#089981]/20 text-[#089981] rounded font-mono font-semibold">
                                NSE 🇮🇳
                              </span>
                            )}
                            {(isBSE || result.exchange === 'BSE') && (
                              <span className="text-[9px] px-1.5 py-0.2 bg-[#FF9800]/20 text-[#FF9800] rounded font-mono font-semibold">
                                BSE 🇮🇳
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-[#787B86] truncate">{result.description}</span>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => handleAddToWatchlistOnly(e, result.symbol)}
                          title={inWatchlist ? 'Already in Watchlist' : 'Add to Watchlist'}
                          className={`p-1.5 rounded transition-all flex items-center justify-center ${
                            inWatchlist
                              ? 'text-[#089981] bg-[#089981]/15 font-bold'
                              : 'text-[#787B86] hover:text-white hover:bg-[#2962FF] bg-[#1E2536]'
                          }`}
                        >
                          {inWatchlist ? <Check size={13} className="text-[#089981]" /> : <Plus size={13} />}
                        </button>
                      </div>
                    );
                  })}
                </>
              ) : (
                <>
                  <div className="px-2 py-1 text-[10px] text-[#787B86] uppercase font-mono font-bold tracking-wider flex items-center gap-1">
                    <Sparkles size={11} className="text-[#A855F7]" />
                    <span>Popular Indian Stocks (NSE)</span>
                  </div>
                  {POPULAR_INDIAN_STOCKS.map((item) => {
                    const inWatchlist = watchlist.some((w) => w.symbol === item.symbol);
                    return (
                      <div
                        key={item.symbol}
                        onClick={() => handleSelectFromSearch(item.symbol)}
                        className="p-2 rounded-md cursor-pointer flex items-center justify-between hover:bg-[#1A2230] transition-colors group"
                      >
                        <div className="flex flex-col min-w-0 pr-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs text-[#F0F4F8] font-mono">{item.symbol}</span>
                            <span className="text-[9px] px-1.5 py-0.2 bg-[#089981]/20 text-[#089981] rounded font-mono font-semibold">
                              {item.exchange}
                            </span>
                          </div>
                          <span className="text-[11px] text-[#787B86] truncate">{item.name}</span>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => handleAddToWatchlistOnly(e, item.symbol)}
                          title={inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
                          className={`p-1.5 rounded transition-all flex items-center justify-center ${
                            inWatchlist
                              ? 'text-[#089981] bg-[#089981]/15 font-bold'
                              : 'text-[#787B86] hover:text-white hover:bg-[#2962FF] bg-[#1E2536]'
                          }`}
                        >
                          {inWatchlist ? <Check size={13} className="text-[#089981]" /> : <Plus size={13} />}
                        </button>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>

        {/* Watchlist Section Header */}
        <div className="px-4 py-2 flex items-center justify-between border-b border-[#1E2433] bg-[#0E121B]">
          <span className="text-[11px] font-mono font-bold text-[#787B86] uppercase tracking-wider">
            WATCHLIST ({watchlist.length})
          </span>
          <span className="text-[10px] font-mono text-[#089981] flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#089981] animate-pulse" />
            LIVE
          </span>
        </div>

        {/* Watchlist List with Quick Remove Buttons */}
        <div className="blueprint-list flex-1 overflow-y-auto">
          {watchlist.map((item) => {
            const tick = prices[item.symbol];
            const isSymIndian = item.symbol.endsWith('.NS') || item.symbol.endsWith('.BO');
            const currencySymbol = isSymIndian ? '₹' : '$';
            const isActive = activeSymbol === item.symbol;

            return (
              <div
                key={item.symbol}
                className={`group flex items-center justify-between px-4 py-3 border-b border-[#1E2433] cursor-pointer transition-all ${
                  isActive
                    ? 'bg-[#161B26] border-l-2 border-l-[#2962FF] pl-3.5'
                    : 'hover:bg-[#121721] border-l-2 border-l-transparent'
                }`}
                onClick={() => selectSymbol(item.symbol)}
              >
                <div className="flex flex-col min-w-0 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className={`font-mono text-xs font-bold ${isActive ? 'text-[#2962FF]' : 'text-[#F0F4F8]'}`}>
                      {item.symbol.replace(/^BINANCE:/i, '')}
                    </span>
                    {isSymIndian && (
                      <span className="text-[9px] px-1 py-0.2 bg-[#089981]/15 text-[#089981] rounded font-mono font-bold">
                        NSE 🇮🇳
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-[#F0F4F8] font-semibold">
                    {tick ? `${currencySymbol}${tick.price.toFixed(2)}` : '—'}
                  </span>

                  {/* Remove from Watchlist Button */}
                  <button
                    onClick={(e) => handleRemoveFromWatchlist(e, item.symbol)}
                    title="Remove from watchlist"
                    className="opacity-0 group-hover:opacity-100 text-[#787B86] hover:text-[#F23645] hover:bg-[#F23645]/15 p-1 rounded transition-all ml-1"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}

          {watchlist.length === 0 && (
            <div className="p-6 text-center text-xs text-[#787B86] font-mono flex flex-col items-center gap-2">
              <TrendingUp size={24} className="text-[#2962FF]/40" />
              <span>No symbols in watchlist.</span>
              <span className="text-[11px] text-[#787B86]/70">Search above to add Indian (.NS) or Global stocks.</span>
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
            <div className="flex items-center gap-2">
              <h2>{displaySymbol}</h2>
              {isIndian && (
                <span className="text-[10px] px-2 py-0.5 bg-[#089981]/20 text-[#089981] font-mono rounded font-bold">
                  NSE 🇮🇳
                </span>
              )}
            </div>
            <span className="blueprint-live-price" ref={priceRef}>
              {liveTick ? `${isIndian ? '₹' : '$'}${liveTick.price.toFixed(2)}` : 'CONNECTING...'}
            </span>
          </div>

          <nav className="blueprint-tabs">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={`blueprint-tab ${activeTab === id ? 'active' : ''}`}
                onClick={() => selectTab(id)}
              >
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
