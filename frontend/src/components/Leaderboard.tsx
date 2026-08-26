import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { api } from '../lib/api';

export default function Leaderboard() {
  const [rankings, setRankings] = useState<any[]>([]);
  useEffect(() => { api.getLeaderboard().then(setRankings).catch(console.error); }, []);
  return <div className="workspace-scroll leaderboard">
    <header className="workspace-heading"><span className="workspace-kicker">Community signals</span><h2>Setup leaderboard</h2><p>Ranked by consistency across completed backtests.</p></header>
    <section className="workspace-card table-card">
      <div className="leaderboard-intro"><div className="leaderboard-icon"><Trophy size={18} /></div><span>Top performing rules</span><small>Updated after each run</small></div>
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Rank</th><th>Setup</th><th>Runs</th><th>Win rate</th><th>Avg. return</th><th>Score</th></tr></thead><tbody>
        {rankings.map((ranking, index) => <tr key={ranking.id}><td><b className="rank">{String(index + 1).padStart(2, '0')}</b></td><td><code>{ranking.setupId.slice(0, 8)}</code></td><td>{ranking.totalBacktestRuns}</td><td>{ranking.aggregateWinRate.toFixed(1)}%</td><td className="positive">{ranking.aggregateAvgReturnPct.toFixed(2)}%</td><td><strong>{ranking.rankScore.toFixed(2)}</strong></td></tr>)}
        {rankings.length === 0 && <tr><td colSpan={6}><div className="empty-table">No ranked setups yet. Run a backtest to put a rule on the board.</div></td></tr>}
      </tbody></table></div>
    </section>
  </div>;
}
