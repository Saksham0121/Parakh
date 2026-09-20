package com.parakh.core.repository;

import com.parakh.common.domain.CompanyFundamentals;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface CompanyFundamentalsRepository extends JpaRepository<CompanyFundamentals, String> {
    Optional<CompanyFundamentals> findBySymbol(String symbol);
}
