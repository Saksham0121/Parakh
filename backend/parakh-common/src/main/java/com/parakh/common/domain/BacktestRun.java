package com.parakh.common.domain;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "backtest_runs")
public class BacktestRun {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(name = "setup_id", nullable = false)
    private String setupId;

    @Column(nullable = false, length = 50)
    private String symbol;

    @Column(name = "date_range_start", nullable = false)
    private Instant dateRangeStart;

    @Column(name = "date_range_end", nullable = false)
    private Instant dateRangeEnd;

    @Column(nullable = false, length = 50)
    private String status = "pending";

    @CreationTimestamp
    @Column(name = "requested_at", updatable = false)
    private Instant requestedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @JsonIgnore
    @OneToMany(mappedBy = "backtestRun", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<BacktestTrade> trades = new ArrayList<>();

    @OneToOne(mappedBy = "backtestRun", cascade = CascadeType.ALL, orphanRemoval = true)
    private BacktestResult result;

    public BacktestRun() {}

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getSetupId() { return setupId; }
    public void setSetupId(String setupId) { this.setupId = setupId; }

    public String getSymbol() { return symbol; }
    public void setSymbol(String symbol) { this.symbol = symbol; }

    public Instant getDateRangeStart() { return dateRangeStart; }
    public void setDateRangeStart(Instant dateRangeStart) { this.dateRangeStart = dateRangeStart; }

    public Instant getDateRangeEnd() { return dateRangeEnd; }
    public void setDateRangeEnd(Instant dateRangeEnd) { this.dateRangeEnd = dateRangeEnd; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Instant getRequestedAt() { return requestedAt; }
    public void setRequestedAt(Instant requestedAt) { this.requestedAt = requestedAt; }

    public Instant getCompletedAt() { return completedAt; }
    public void setCompletedAt(Instant completedAt) { this.completedAt = completedAt; }

    public List<BacktestTrade> getTrades() { return trades; }
    public void setTrades(List<BacktestTrade> trades) { this.trades = trades; }

    public BacktestResult getResult() { return result; }
    public void setResult(BacktestResult result) { this.result = result; }
}
