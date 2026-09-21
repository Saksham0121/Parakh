package com.parakh.engine.repository;

import com.parakh.common.domain.BacktestResult;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface BacktestResultRepository extends JpaRepository<BacktestResult, String> {
    Optional<BacktestResult> findByBacktestRunId(String backtestRunId);
}
