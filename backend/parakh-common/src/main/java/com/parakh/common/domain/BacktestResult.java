package com.parakh.common.domain;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;

@Entity
@Table(name = "backtest_results")
public class BacktestResult {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @JsonIgnore
    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "backtest_run_id", nullable = false, unique = true)
    private BacktestRun backtestRun;

    @Column(name = "total_trades", nullable = false)
    private int totalTrades;

    @Column(nullable = false)
    private int wins;

    @Column(nullable = false)
    private int losses;

    @Column(name = "win_rate", nullable = false)
    private double winRate;

    @Column(name = "avg_return_pct", nullable = false)
    private double avgReturnPct;

    @Column(name = "max_drawdown_pct", nullable = false)
    private double maxDrawdownPct;

    @Column(name = "best_trade_pct", nullable = false)
    private double bestTradePct;

    @Column(name = "worst_trade_pct", nullable = false)
    private double worstTradePct;

    public BacktestResult() {}

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public BacktestRun getBacktestRun() { return backtestRun; }
    public void setBacktestRun(BacktestRun backtestRun) { this.backtestRun = backtestRun; }

    public int getTotalTrades() { return totalTrades; }
    public void setTotalTrades(int totalTrades) { this.totalTrades = totalTrades; }

    public int getWins() { return wins; }
    public void setWins(int wins) { this.wins = wins; }

    public int getLosses() { return losses; }
    public void setLosses(int losses) { this.losses = losses; }

    public double getWinRate() { return winRate; }
    public void setWinRate(double winRate) { this.winRate = winRate; }

    public double getAvgReturnPct() { return avgReturnPct; }
    public void setAvgReturnPct(double avgReturnPct) { this.avgReturnPct = avgReturnPct; }

    public double getMaxDrawdownPct() { return maxDrawdownPct; }
    public void setMaxDrawdownPct(double maxDrawdownPct) { this.maxDrawdownPct = maxDrawdownPct; }

    public double getBestTradePct() { return bestTradePct; }
    public void setBestTradePct(double bestTradePct) { this.bestTradePct = bestTradePct; }

    public double getWorstTradePct() { return worstTradePct; }
    public void setWorstTradePct(double worstTradePct) { this.worstTradePct = worstTradePct; }
}
