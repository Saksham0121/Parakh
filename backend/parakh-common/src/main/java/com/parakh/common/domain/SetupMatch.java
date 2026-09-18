package com.parakh.common.domain;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;

@Entity
@Table(name = "setup_matches")
public class SetupMatch {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "setup_id", nullable = false)
    private Setup setup;

    @Column(nullable = false, length = 50)
    private String symbol;

    @Column(name = "matched_at", nullable = false)
    private Instant matchedAt;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "technical_snapshot", columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> technicalSnapshot;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "fundamentals_snapshot", columnDefinition = "jsonb")
    private Map<String, Object> fundamentalsSnapshot;

    @Column(name = "fundamentals_passed", nullable = false)
    private boolean fundamentalsPassed;

    @Column(name = "alert_fired", nullable = false)
    private boolean alertFired;

    public SetupMatch() {}

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public Setup getSetup() { return setup; }
    public void setSetup(Setup setup) { this.setup = setup; }

    public String getSymbol() { return symbol; }
    public void setSymbol(String symbol) { this.symbol = symbol; }

    public Instant getMatchedAt() { return matchedAt; }
    public void setMatchedAt(Instant matchedAt) { this.matchedAt = matchedAt; }

    public Map<String, Object> getTechnicalSnapshot() { return technicalSnapshot; }
    public void setTechnicalSnapshot(Map<String, Object> technicalSnapshot) { this.technicalSnapshot = technicalSnapshot; }

    public Map<String, Object> getFundamentalsSnapshot() { return fundamentalsSnapshot; }
    public void setFundamentalsSnapshot(Map<String, Object> fundamentalsSnapshot) { this.fundamentalsSnapshot = fundamentalsSnapshot; }

    public boolean isFundamentalsPassed() { return fundamentalsPassed; }
    public void setFundamentalsPassed(boolean fundamentalsPassed) { this.fundamentalsPassed = fundamentalsPassed; }

    public boolean isAlertFired() { return alertFired; }
    public void setAlertFired(boolean alertFired) { this.alertFired = alertFired; }
}
