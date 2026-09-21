package com.parakh.engine.repository;

import com.parakh.common.domain.BacktestTrade;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface BacktestTradeRepository extends JpaRepository<BacktestTrade, String> {
    List<BacktestTrade> findByBacktestRunIdOrderByEntryDateAsc(String backtestRunId);
}
