package com.parakh.core.repository;

import com.parakh.common.domain.SetupMatch;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface SetupMatchRepository extends JpaRepository<SetupMatch, String> {
    List<SetupMatch> findTop20BySetupIdOrderByMatchedAtDesc(String setupId);

    @Query("SELECT sm FROM SetupMatch sm JOIN FETCH sm.setup s WHERE s.user.id = :userId ORDER BY sm.matchedAt DESC")
    List<SetupMatch> findTop50ByUserIdOrderByMatchedAtDesc(@Param("userId") String userId);
}
