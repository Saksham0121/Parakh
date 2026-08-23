import { useState, useEffect } from 'react';
import { api } from '../lib/api';

export default function BacktestDashboard({ activeSymbol }: { activeSymbol: string }) {
  const [setups, setSetups] = useState<any[]>([]);
  const [selectedSetup, setSelectedSetup] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [runId, setRunId] = useState('');
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    api.getSetups().then(setSetups).catch(console.error);
    // Set default dates
    const end = new Date();
    const start = new Date();
    start.setFullYear(start.getFullYear() - 1);
    setEndDate(end.toISOString().split('T')[0]);
    setStartDate(start.toISOString().split('T')[0]);
  }, []);

  const handleRun = async () => {
    try {
      const res = await api.runBacktest({
        setupId: selectedSetup,
        symbol: activeSymbol,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString()
      });
      setRunId(res.runId);
      pollResult(res.runId);
    } catch (err) {
      console.error(err);
    }
  };

  const pollResult = async (id: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await api.getBacktestRun(id);
        if (res.status === 'completed' || res.status === 'failed') {
          setResult(res);
          clearInterval(interval);
        }
      } catch (err) {
        console.error(err);
        clearInterval(interval);
      }
    }, 2000);
  };

  return (
    <div className="backtest-dashboard p-6 text-white h-full overflow-y-auto">
      <h2 className="text-2xl mb-6">Backtest Engine</h2>
      
      <div className="card bg-gray-800 p-6 rounded-lg mb-6">
        <h3 className="text-xl mb-4 text-accent">Run New Backtest on {activeSymbol}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block mb-2 text-sm text-gray-400">Setup</label>
            <select 
              className="w-full bg-gray-700 p-2 rounded text-white border border-gray-600 focus:border-accent"
              value={selectedSetup} 
              onChange={e => setSelectedSetup(e.target.value)}
            >
              <option value="">Select a Setup</option>
              {setups.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block mb-2 text-sm text-gray-400">Start Date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-gray-700 p-2 rounded text-white" />
          </div>
          <div>
            <label className="block mb-2 text-sm text-gray-400">End Date</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-gray-700 p-2 rounded text-white" />
          </div>
        </div>
        <button 
          className="bg-accent text-white px-6 py-2 rounded hover:bg-opacity-90 font-bold disabled:opacity-50"
          onClick={handleRun}
          disabled={!selectedSetup || !!(runId && !result)}
        >
          {runId && !result ? 'Running Simulation...' : 'Run Backtest'}
        </button>
      </div>

      {result && result.result && (
        <div className="card bg-gray-800 p-6 rounded-lg animate-fade-in">
          <h3 className="text-xl mb-4 text-green-400">Results</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center mb-6">
            <div className="bg-gray-700 p-4 rounded"><div className="text-sm text-gray-400">Win Rate</div><div className="text-2xl font-bold">{result.result.winRate.toFixed(1)}%</div></div>
            <div className="bg-gray-700 p-4 rounded"><div className="text-sm text-gray-400">Total Trades</div><div className="text-2xl font-bold">{result.result.totalTrades}</div></div>
            <div className="bg-gray-700 p-4 rounded"><div className="text-sm text-gray-400">Avg Return</div><div className="text-2xl font-bold">{result.result.avgReturnPct.toFixed(2)}%</div></div>
            <div className="bg-gray-700 p-4 rounded"><div className="text-sm text-gray-400">Max Drawdown</div><div className="text-2xl font-bold">{result.result.maxDrawdownPct.toFixed(2)}%</div></div>
          </div>
          <h4 className="text-lg mb-2">Trade History</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-gray-600 text-gray-400"><th className="p-2">Entry Date</th><th className="p-2">Entry Price</th><th className="p-2">Exit Date</th><th className="p-2">Exit Price</th><th className="p-2">Return</th></tr></thead>
              <tbody>
                {result.trades.map((t: any) => (
                  <tr key={t.id} className="border-b border-gray-700">
                    <td className="p-2">{new Date(t.entryDate).toLocaleDateString()}</td>
                    <td className="p-2">${t.entryPrice.toFixed(2)}</td>
                    <td className="p-2">{new Date(t.exitDate).toLocaleDateString()}</td>
                    <td className="p-2">${t.exitPrice.toFixed(2)}</td>
                    <td className={`p-2 font-bold ${t.returnPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>{t.returnPct.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
