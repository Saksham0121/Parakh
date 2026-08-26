import { useEffect, useState } from 'react';
import { Play, RotateCw } from 'lucide-react';
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
    const end = new Date(); const start = new Date(); start.setFullYear(start.getFullYear() - 1);
    setEndDate(end.toISOString().split('T')[0]); setStartDate(start.toISOString().split('T')[0]);
  }, []);
  const pollResult = (id: string) => {
    const interval = window.setInterval(async () => {
      try { const response = await api.getBacktestRun(id); if (response.status === 'completed' || response.status === 'failed') { setResult(response); window.clearInterval(interval); } }
      catch (error) { console.error(error); window.clearInterval(interval); }
    }, 2000);
  };
  const handleRun = async () => {
    try { const response = await api.runBacktest({ setupId: selectedSetup, symbol: activeSymbol, startDate: new Date(startDate).toISOString(), endDate: new Date(endDate).toISOString() }); setRunId(response.runId); setResult(null); pollResult(response.runId); }
    catch (error) { console.error(error); }
  };
  const isRunning = Boolean(runId && !result);

  return <div className="workspace-scroll backtest-dashboard">
    <header className="workspace-heading"><span className="workspace-kicker">Simulation desk</span><h2>Backtest a setup</h2><p>See how your rules would have handled {activeSymbol.replace('BINANCE:', '')}.</p></header>
    <section className="workspace-card backtest-form-card">
      <div className="card-heading"><span>Run parameters</span><small>Daily candles</small></div>
      <div className="backtest-form">
        <label className="form-field"><span>Saved setup</span><select value={selectedSetup} onChange={(event) => setSelectedSetup(event.target.value)}><option value="">Choose a setup</option>{setups.map((setup) => <option key={setup.id} value={setup.id}>{setup.name}</option>)}</select></label>
        <label className="form-field"><span>From</span><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
        <label className="form-field"><span>To</span><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
        <button className="primary-action run-action" onClick={handleRun} disabled={!selectedSetup || isRunning}>{isRunning ? <><RotateCw className="spin" size={16} />Running</> : <><Play size={16} />Run backtest</>}</button>
      </div>
    </section>
    {result?.result && <section className="workspace-card backtest-result"><div className="card-heading"><span>Simulation result</span><small className="result-status">Completed</small></div>
      <div className="metric-grid"><Metric label="Win rate" value={`${result.result.winRate.toFixed(1)}%`} /><Metric label="Total trades" value={result.result.totalTrades} /><Metric label="Avg. return" value={`${result.result.avgReturnPct.toFixed(2)}%`} positive /><Metric label="Max drawdown" value={`${result.result.maxDrawdownPct.toFixed(2)}%`} /></div>
      <div className="table-wrap"><table className="data-table trade-table"><thead><tr><th>Entry date</th><th>Entry price</th><th>Exit date</th><th>Exit price</th><th>Return</th></tr></thead><tbody>{result.trades.map((trade: any) => <tr key={trade.id}><td>{new Date(trade.entryDate).toLocaleDateString()}</td><td>${trade.entryPrice.toFixed(2)}</td><td>{new Date(trade.exitDate).toLocaleDateString()}</td><td>${trade.exitPrice.toFixed(2)}</td><td className={trade.returnPct >= 0 ? 'positive' : 'negative'}>{trade.returnPct.toFixed(2)}%</td></tr>)}</tbody></table></div>
    </section>}
  </div>;
}

function Metric({ label, value, positive = false }: { label: string; value: string | number; positive?: boolean }) { return <div className="metric"><span>{label}</span><strong className={positive ? 'positive' : ''}>{value}</strong></div>; }
