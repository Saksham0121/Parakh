package com.parakh.core.repository;

import com.parakh.common.domain.Setup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SetupRepository extends JpaRepository<Setup, String> {
    List<Setup> findByUserIdOrderByCreatedAtDesc(String userId);
    Optional<Setup> findByIdAndUserId(String id, String userId);
    List<Setup> findByActiveTrue();
}
