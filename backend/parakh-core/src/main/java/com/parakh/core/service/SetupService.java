package com.parakh.core.service;

import com.parakh.common.domain.Setup;
import com.parakh.common.domain.User;
import com.parakh.core.dto.SetupDtos.*;
import com.parakh.core.repository.SetupMatchRepository;
import com.parakh.core.repository.SetupRepository;
import com.parakh.core.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;

@Service
public class SetupService {

    private final SetupRepository setupRepository;
    private final SetupMatchRepository setupMatchRepository;
    private final UserRepository userRepository;

    public SetupService(SetupRepository setupRepository,
                        SetupMatchRepository setupMatchRepository,
                        UserRepository userRepository) {
        this.setupRepository = setupRepository;
        this.setupMatchRepository = setupMatchRepository;
        this.userRepository = userRepository;
    }

    @Transactional
    public SetupResponse createSetup(String userId, CreateSetupRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        Setup setup = new Setup();
        setup.setUser(user);
        setup.setName(request.name());
        setup.setActive(false); // Deliberate activation required
        setup.setTechnicalConditions(request.technicalConditions() != null ? request.technicalConditions() : new ArrayList<>());
        setup.setFundamentalConditions(request.fundamentalConditions());
        setup.setFundamentalMode(request.fundamentalMode() != null ? request.fundamentalMode() : "display_only");
        setup.setOrderRule(request.orderRule());

        setup = setupRepository.save(setup);
        return mapToResponse(setup, List.of());
    }

    public List<SetupResponse> getUserSetups(String userId) {
        return setupRepository.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .map(s -> mapToResponse(s, List.of()))
                .toList();
    }

    public SetupResponse getSetup(String userId, String id) {
        Setup setup = setupRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Setup not found"));

        var matches = setupMatchRepository.findTop20BySetupIdOrderByMatchedAtDesc(setup.getId()).stream()
                .map(m -> new SetupMatchResponse(
                        m.getId(),
                        m.getSymbol(),
                        m.getMatchedAt(),
                        m.getTechnicalSnapshot(),
                        m.getFundamentalsSnapshot(),
                        m.isFundamentalsPassed(),
                        m.isAlertFired()
                ))
                .toList();

        return mapToResponse(setup, matches);
    }

    @Transactional
    public SetupResponse updateSetup(String userId, String id, UpdateSetupRequest request) {
        Setup setup = setupRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Setup not found"));

        if (request.name() != null) setup.setName(request.name());
        if (request.technicalConditions() != null) setup.setTechnicalConditions(request.technicalConditions());
        if (request.fundamentalConditions() != null) setup.setFundamentalConditions(request.fundamentalConditions());
        if (request.fundamentalMode() != null) setup.setFundamentalMode(request.fundamentalMode());
        if (request.orderRule() != null) setup.setOrderRule(request.orderRule());

        setup = setupRepository.save(setup);
        return mapToResponse(setup, List.of());
    }

    @Transactional
    public SetupResponse toggleActive(String userId, String id) {
        Setup setup = setupRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Setup not found"));

        setup.setActive(!setup.isActive());
        setup = setupRepository.save(setup);
        return mapToResponse(setup, List.of());
    }

    @Transactional
    public SetupResponse duplicateSetup(String userId, String id) {
        Setup original = setupRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Setup not found"));

        Setup duplicate = new Setup();
        duplicate.setUser(original.getUser());
        duplicate.setName(original.getName() + " (Copy)");
        duplicate.setActive(false);
        duplicate.setTechnicalConditions(new ArrayList<>(original.getTechnicalConditions()));
        duplicate.setFundamentalConditions(original.getFundamentalConditions() != null ? new ArrayList<>(original.getFundamentalConditions()) : null);
        duplicate.setFundamentalMode(original.getFundamentalMode());
        duplicate.setOrderRule(original.getOrderRule());

        duplicate = setupRepository.save(duplicate);
        return mapToResponse(duplicate, List.of());
    }

    @Transactional
    public void deleteSetup(String userId, String id) {
        Setup setup = setupRepository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Setup not found"));

        setupRepository.delete(setup);
    }

    private SetupResponse mapToResponse(Setup setup, List<SetupMatchResponse> matches) {
        return new SetupResponse(
                setup.getId(),
                setup.getUser().getId(),
                setup.getName(),
                setup.isActive(),
                setup.getTechnicalConditions(),
                setup.getFundamentalConditions(),
                setup.getFundamentalMode(),
                setup.getOrderRule(),
                setup.getCreatedAt(),
                setup.getUpdatedAt(),
                matches
        );
    }
}
