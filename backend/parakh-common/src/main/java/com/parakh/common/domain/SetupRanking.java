package com.parakh.common.domain;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "setup_rankings")
public class SetupRanking {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(name = "setup_id", nullable = false, unique = true)
    private String setupId;

    @Column(name = "total_backtest_runs", nullable = false)
    private int totalBacktestRuns;

    @Column(name = "aggregate_win_rate", nullable = false)
    private double aggregateWinRate;

    @Column(name = "aggregate_avg_return_pct", nullable = false)
    private double aggregateAvgReturnPct;

    @Column(name = "rank_score", nullable = false)
    private double rankScore;

    @Column(name = "last_ranked_at", nullable = false)
    private Instant lastRankedAt;

    public SetupRanking() {}

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getSetupId() { return setupId; }
    public void setSetupId(String setupId) { this.setupId = setupId; }

    public int getTotalBacktestRuns() { return totalBacktestRuns; }
    public void setTotalBacktestRuns(int totalBacktestRuns) { this.totalBacktestRuns = totalBacktestRuns; }

    public double getAggregateWinRate() { return aggregateWinRate; }
    public void setAggregateWinRate(double aggregateWinRate) { this.aggregateWinRate = aggregateWinRate; }

    public double getAggregateAvgReturnPct() { return aggregateAvgReturnPct; }
    public void setAggregateAvgReturnPct(double aggregateAvgReturnPct) { this.aggregateAvgReturnPct = aggregateAvgReturnPct; }

    public double getRankScore() { return rankScore; }
    public void setRankScore(double rankScore) { this.rankScore = rankScore; }

    public Instant getLastRankedAt() { return lastRankedAt; }
    public void setLastRankedAt(Instant lastRankedAt) { this.lastRankedAt = lastRankedAt; }
}
