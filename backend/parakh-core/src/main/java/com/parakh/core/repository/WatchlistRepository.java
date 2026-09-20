package com.parakh.core.repository;

import com.parakh.common.domain.Watchlist;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface WatchlistRepository extends JpaRepository<Watchlist, String> {
    List<Watchlist> findByUserIdOrderBySymbolAsc(String userId);
    Optional<Watchlist> findByUserIdAndSymbol(String userId, String symbol);
    void deleteByUserIdAndSymbol(String userId, String symbol);
    boolean existsByUserIdAndSymbol(String userId, String symbol);
}
