package com.parakh.engine.repository;

import com.parakh.common.domain.Setup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface SetupEngineRepository extends JpaRepository<Setup, String> {
    Optional<Setup> findByIdAndUserId(String id, String userId);
}
