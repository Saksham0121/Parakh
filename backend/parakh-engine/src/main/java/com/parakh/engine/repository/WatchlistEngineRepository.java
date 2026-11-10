package com.parakh.engine.repository;

import com.parakh.common.domain.Watchlist;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface WatchlistEngineRepository extends JpaRepository<Watchlist, String> {
    @Query("SELECT w.symbol FROM Watchlist w WHERE w.user.id = :userId")
    List<String> findSymbolsByUserId(String userId);
}
