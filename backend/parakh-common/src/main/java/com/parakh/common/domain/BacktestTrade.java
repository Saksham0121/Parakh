package com.parakh.common.domain;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;

import java.time.Instant;

@Entity
@Table(name = "backtest_trades")
public class BacktestTrade {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "backtest_run_id", nullable = false)
    private BacktestRun backtestRun;

    @Column(name = "entry_date", nullable = false)
    private Instant entryDate;

    @Column(name = "entry_price", nullable = false)
    private double entryPrice;

    @Column(name = "exit_date", nullable = false)
    private Instant exitDate;

    @Column(name = "exit_price", nullable = false)
    private double exitPrice;

    @Column(name = "exit_reason", nullable = false, length = 50)
    private String exitReason;

    @Column(name = "return_pct", nullable = false)
    private double returnPct;

    @Column(nullable = false, length = 20)
    private String result;

    public BacktestTrade() {}

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public BacktestRun getBacktestRun() { return backtestRun; }
    public void setBacktestRun(BacktestRun backtestRun) { this.backtestRun = backtestRun; }

    public Instant getEntryDate() { return entryDate; }
    public void setEntryDate(Instant entryDate) { this.entryDate = entryDate; }

    public double getEntryPrice() { return entryPrice; }
    public void setEntryPrice(double entryPrice) { this.entryPrice = entryPrice; }

    public Instant getExitDate() { return exitDate; }
    public void setExitDate(Instant exitDate) { this.exitDate = exitDate; }

    public double getExitPrice() { return exitPrice; }
    public void setExitPrice(double exitPrice) { this.exitPrice = exitPrice; }

    public String getExitReason() { return exitReason; }
    public void setExitReason(String exitReason) { this.exitReason = exitReason; }

    public double getReturnPct() { return returnPct; }
    public void setReturnPct(double returnPct) { this.returnPct = returnPct; }

    public String getResult() { return result; }
    public void setResult(String result) { this.result = result; }
}
