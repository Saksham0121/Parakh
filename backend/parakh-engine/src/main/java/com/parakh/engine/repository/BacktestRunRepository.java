package com.parakh.engine.repository;

import com.parakh.common.domain.BacktestRun;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface BacktestRunRepository extends JpaRepository<BacktestRun, String> {
    List<BacktestRun> findBySetupIdOrderByRequestedAtDesc(String setupId);
}
