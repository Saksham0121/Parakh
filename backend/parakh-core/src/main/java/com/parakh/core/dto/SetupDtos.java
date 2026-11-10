package com.parakh.core.dto;

import com.parakh.common.dto.condition.FundamentalConditionDto;
import com.parakh.common.dto.condition.TechnicalConditionDto;
import com.parakh.common.dto.order.OrderRuleDto;
import jakarta.validation.constraints.NotBlank;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public class SetupDtos {

    public record CreateSetupRequest(
        @NotBlank String name,
        List<TechnicalConditionDto> technicalConditions,
        List<FundamentalConditionDto> fundamentalConditions,
        String fundamentalMode,
        OrderRuleDto orderRule,
        String timeframe,
        List<String> universe
    ) {}

    public record UpdateSetupRequest(
        String name,
        List<TechnicalConditionDto> technicalConditions,
        List<FundamentalConditionDto> fundamentalConditions,
        String fundamentalMode,
        OrderRuleDto orderRule,
        String timeframe,
        List<String> universe
    ) {}

    public record SetupMatchResponse(
        String id,
        String symbol,
        Instant matchedAt,
        Map<String, Object> technicalSnapshot,
        Map<String, Object> fundamentalsSnapshot,
        boolean fundamentalsPassed,
        boolean alertFired
    ) {}

    public record SetupResponse(
        String id,
        String userId,
        String name,
        boolean active,
        List<TechnicalConditionDto> technicalConditions,
        List<FundamentalConditionDto> fundamentalConditions,
        String fundamentalMode,
        OrderRuleDto orderRule,
        String timeframe,
        List<String> universe,
        Instant createdAt,
        Instant updatedAt,
        List<SetupMatchResponse> setupMatches
    ) {}
}
