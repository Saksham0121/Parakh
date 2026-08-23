import { useState, useEffect } from 'react';
import { api } from '../lib/api';

export default function Leaderboard() {
  const [rankings, setRankings] = useState<any[]>([]);

  useEffect(() => {
    api.getLeaderboard().then(setRankings).catch(console.error);
  }, []);

  return (
    <div className="leaderboard p-6 text-white h-full overflow-y-auto">
      <h2 className="text-2xl mb-6">Setup Leaderboard</h2>
      <div className="card bg-gray-800 rounded-lg overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-900 text-gray-400 uppercase text-xs">
            <tr>
              <th className="p-4">Rank</th>
              <th className="p-4">Setup ID</th>
              <th className="p-4">Backtests Run</th>
              <th className="p-4">Avg Win Rate</th>
              <th className="p-4">Avg Return</th>
              <th className="p-4 text-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {rankings.map((r, index) => (
              <tr key={r.id} className="border-b border-gray-700 hover:bg-gray-750 transition">
                <td className="p-4 font-bold text-accent">#{index + 1}</td>
                <td className="p-4 font-mono text-sm">{r.setupId.slice(0, 8)}</td>
                <td className="p-4">{r.totalBacktestRuns}</td>
                <td className="p-4">{r.aggregateWinRate.toFixed(1)}%</td>
                <td className="p-4">{r.aggregateAvgReturnPct.toFixed(2)}%</td>
                <td className="p-4 text-right font-bold text-green-400">{r.rankScore.toFixed(2)}</td>
              </tr>
            ))}
            {rankings.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-gray-400">No ranked setups yet. Run a backtest first!</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
