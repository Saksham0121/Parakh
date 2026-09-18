package com.parakh.common.domain;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.parakh.common.dto.condition.FundamentalConditionDto;
import com.parakh.common.dto.condition.TechnicalConditionDto;
import com.parakh.common.dto.order.OrderRuleDto;
import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "setups")
public class Setup {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private boolean active = false;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "technical_conditions", columnDefinition = "jsonb", nullable = false)
    private List<TechnicalConditionDto> technicalConditions = new ArrayList<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "fundamental_conditions", columnDefinition = "jsonb")
    private List<FundamentalConditionDto> fundamentalConditions;

    @Column(name = "fundamental_mode", nullable = false)
    private String fundamentalMode = "display_only";

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "order_rule", columnDefinition = "jsonb")
    private OrderRuleDto orderRule;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private Instant updatedAt;

    @JsonIgnore
    @OneToMany(mappedBy = "setup", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<SetupMatch> setupMatches = new ArrayList<>();

    public Setup() {}

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }

    public List<TechnicalConditionDto> getTechnicalConditions() { return technicalConditions; }
    public void setTechnicalConditions(List<TechnicalConditionDto> technicalConditions) { this.technicalConditions = technicalConditions; }

    public List<FundamentalConditionDto> getFundamentalConditions() { return fundamentalConditions; }
    public void setFundamentalConditions(List<FundamentalConditionDto> fundamentalConditions) { this.fundamentalConditions = fundamentalConditions; }

    public String getFundamentalMode() { return fundamentalMode; }
    public void setFundamentalMode(String fundamentalMode) { this.fundamentalMode = fundamentalMode; }

    public OrderRuleDto getOrderRule() { return orderRule; }
    public void setOrderRule(OrderRuleDto orderRule) { this.orderRule = orderRule; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }

    public List<SetupMatch> getSetupMatches() { return setupMatches; }
    public void setSetupMatches(List<SetupMatch> setupMatches) { this.setupMatches = setupMatches; }
}
