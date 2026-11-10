package com.parakh.engine.repository;

import com.parakh.common.domain.Setup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SetupEngineRepository extends JpaRepository<Setup, String> {
    Optional<Setup> findByIdAndUserId(String id, String userId);

    @Query("SELECT s FROM Setup s JOIN FETCH s.user WHERE s.active = true")
    List<Setup> findActiveWithUser();

    @Query("SELECT s.id FROM Setup s WHERE s.user.id = :userId")
    List<String> findIdsByUserId(String userId);
}
