package com.parakh.common.domain;

import jakarta.persistence.*;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;

@Entity
@Table(name = "company_fundamentals")
public class CompanyFundamentals {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(nullable = false, unique = true, length = 50)
    private String symbol;

    @Column(name = "pe_ratio")
    private Double peRatio;

    private Double eps;

    private Double roe;

    @Column(name = "debt_to_equity")
    private Double debtToEquity;

    @Column(name = "market_cap")
    private Double marketCap;

    @Column(length = 100)
    private String sector;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private Instant updatedAt;

    public CompanyFundamentals() {}

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getSymbol() { return symbol; }
    public void setSymbol(String symbol) { this.symbol = symbol; }

    public Double getPeRatio() { return peRatio; }
    public void setPeRatio(Double peRatio) { this.peRatio = peRatio; }

    public Double getEps() { return eps; }
    public void setEps(Double eps) { this.eps = eps; }

    public Double getRoe() { return roe; }
    public void setRoe(Double roe) { this.roe = roe; }

    public Double getDebtToEquity() { return debtToEquity; }
    public void setDebtToEquity(Double debtToEquity) { this.debtToEquity = debtToEquity; }

    public Double getMarketCap() { return marketCap; }
    public void setMarketCap(Double marketCap) { this.marketCap = marketCap; }

    public String getSector() { return sector; }
    public void setSector(String sector) { this.sector = sector; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
