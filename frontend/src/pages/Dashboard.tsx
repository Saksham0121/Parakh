import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useSocketStore } from '../store/socketStore';
import { api } from '../lib/api';
import Chart from '../components/Chart';
import SetupBuilder from '../components/SetupBuilder';
import BacktestDashboard from '../components/BacktestDashboard';
import Leaderboard from '../components/Leaderboard';
import { LogOut, Search, Activity, BarChart2, Settings, PlayCircle, Trophy } from 'lucide-react';
import './Dashboard.css';

export default function Dashboard() {
  const { user, logout } = useAuthStore();
  const { connect, disconnect, subscribeSymbol, prices } = useSocketStore();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [activeSymbol, setActiveSymbol] = useState('BINANCE:BTCUSDT');
  const [activeTab, setActiveTab] = useState<'chart' | 'setup' | 'backtest' | 'leaderboard'>('chart');

  useEffect(() => {
    connect();
    fetchWatchlist();
    subscribeSymbol(activeSymbol);
    
    return () => {
      disconnect();
    };
  }, []);

  useEffect(() => {
    if (activeSymbol) {
      subscribeSymbol(activeSymbol);
    }
  }, [activeSymbol]);

  const fetchWatchlist = async () => {
    try {
      const res = await api.getWatchlist();
      setWatchlist(res);
      if (res.length > 0 && activeSymbol === 'BINANCE:BTCUSDT') {
        setActiveSymbol(res[0].symbol);
      }
    } catch (err) {
      console.error('Failed to fetch watchlist', err);
    }
  };

  const handleSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (q.length > 2) {
      try {
        const res = await api.searchSymbol(q);
        setSearchResults(res.result || []);
      } catch (err) {
        console.error('Search error', err);
      }
    } else {
      setSearchResults([]);
    }
  };

  const handleAddToWatchlist = async (symbol: string) => {
    try {
      await api.addToWatchlist(symbol);
      fetchWatchlist();
      setSearchResults([]);
      setSearchQuery('');
      setActiveSymbol(symbol);
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="dashboard-layout">
      {/* Sidebar / Watchlist */}
      <aside className="sidebar flex flex-col">
        <div className="sidebar-header p-4 border-b">
          <div className="flex items-center gap-2 logo">
            <Activity className="text-accent" />
            <h2>Parakh</h2>
          </div>
        </div>
        
        <div className="search-container p-4 border-b">
          <div className="search-input-wrapper">
            <Search size={16} className="search-icon" />
            <input 
              type="text" 
              placeholder="Search symbols..." 
              value={searchQuery}
              onChange={handleSearch}
            />
          </div>
          {searchResults.length > 0 && (
            <div className="search-results">
              {searchResults.slice(0, 5).map(result => (
                <div 
                  key={result.symbol} 
                  className="search-item"
                  onClick={() => handleAddToWatchlist(result.symbol)}
                >
                  <span className="symbol">{result.symbol}</span>
                  <span className="name">{result.description}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="watchlist-container flex-1 overflow-y-auto">
          <h3 className="section-title p-4">Watchlist</h3>
          <div className="watchlist">
            {watchlist.map(item => {
              const tick = prices[item.symbol];
              return (
                <div 
                  key={item.symbol} 
                  className={`watchlist-item flex justify-between p-4 ${activeSymbol === item.symbol ? 'active' : ''}`}
                  onClick={() => setActiveSymbol(item.symbol)}
                >
                  <span className="symbol">{item.symbol}</span>
                  <span className={`price ${tick ? 'flash' : ''}`}>
                    {tick ? tick.price.toFixed(2) : '-'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="user-profile p-4 border-t flex justify-between items-center">
          <span className="truncate">{user?.name || user?.email}</span>
          <button onClick={handleLogout} className="icon-btn" title="Logout">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content flex flex-col">
        <header className="topbar p-4 border-b flex justify-between items-center bg-gray-900">
          <div className="active-symbol-info flex items-center gap-4">
            <h1 className="text-xl font-bold">{activeSymbol}</h1>
            {prices[activeSymbol] && (
              <span className="live-price text-accent font-mono">${prices[activeSymbol].price.toFixed(2)}</span>
            )}
          </div>
          <div className="tabs flex gap-2">
            <button className={`flex items-center gap-2 px-4 py-2 rounded transition ${activeTab === 'chart' ? 'bg-accent text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`} onClick={() => setActiveTab('chart')}><BarChart2 size={16}/> Chart</button>
            <button className={`flex items-center gap-2 px-4 py-2 rounded transition ${activeTab === 'setup' ? 'bg-accent text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`} onClick={() => setActiveTab('setup')}><Settings size={16}/> Setups</button>
            <button className={`flex items-center gap-2 px-4 py-2 rounded transition ${activeTab === 'backtest' ? 'bg-accent text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`} onClick={() => setActiveTab('backtest')}><PlayCircle size={16}/> Backtest</button>
            <button className={`flex items-center gap-2 px-4 py-2 rounded transition ${activeTab === 'leaderboard' ? 'bg-accent text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`} onClick={() => setActiveTab('leaderboard')}><Trophy size={16}/> Leaderboard</button>
          </div>
        </header>
        
        <div className="content-area flex-1 relative bg-gray-900 overflow-hidden">
           {activeTab === 'chart' && <Chart symbol={activeSymbol} />}
           {activeTab === 'setup' && <SetupBuilder />}
           {activeTab === 'backtest' && <BacktestDashboard activeSymbol={activeSymbol} />}
           {activeTab === 'leaderboard' && <Leaderboard />}
        </div>
      </main>
    </div>
  );
}
