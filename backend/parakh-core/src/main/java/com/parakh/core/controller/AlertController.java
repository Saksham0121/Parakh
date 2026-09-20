package com.parakh.core.controller;

import com.parakh.common.domain.SetupMatch;
import com.parakh.core.repository.SetupMatchRepository;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/alerts")
public class AlertController {

    private final SetupMatchRepository setupMatchRepository;

    public AlertController(SetupMatchRepository setupMatchRepository) {
        this.setupMatchRepository = setupMatchRepository;
    }

    @GetMapping
    public List<Map<String, Object>> getUserAlerts(@AuthenticationPrincipal String userId) {
        List<SetupMatch> matches = setupMatchRepository.findTop50ByUserIdOrderByMatchedAtDesc(userId);
        return matches.stream()
                .map(m -> Map.of(
                        "id", m.getId(),
                        "setupId", m.getSetup().getId(),
                        "setupName", m.getSetup().getName(),
                        "symbol", m.getSymbol(),
                        "matchedAt", m.getMatchedAt(),
                        "technicalSnapshot", m.getTechnicalSnapshot(),
                        "fundamentalsSnapshot", m.getFundamentalsSnapshot() != null ? m.getFundamentalsSnapshot() : Map.of(),
                        "fundamentalsPassed", m.isFundamentalsPassed(),
                        "alertFired", m.isAlertFired()
                ))
                .toList();
    }
}
