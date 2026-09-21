package com.parakh.engine.repository;

import com.parakh.common.domain.SetupRanking;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SetupRankingRepository extends JpaRepository<SetupRanking, String> {
    Optional<SetupRanking> findBySetupId(String setupId);
    List<SetupRanking> findTop100ByOrderByRankScoreDesc();
}
