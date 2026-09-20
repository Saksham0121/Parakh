package com.parakh.core.controller;

import com.parakh.core.dto.SetupDtos.*;
import com.parakh.core.service.SetupService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/setups")
public class SetupController {

    private final SetupService setupService;

    public SetupController(SetupService setupService) {
        this.setupService = setupService;
    }

    @PostMapping
    public SetupResponse create(@AuthenticationPrincipal String userId,
                                @Valid @RequestBody CreateSetupRequest request) {
        return setupService.createSetup(userId, request);
    }

    @GetMapping
    public List<SetupResponse> findAll(@AuthenticationPrincipal String userId) {
        return setupService.getUserSetups(userId);
    }

    @GetMapping("/{id}")
    public SetupResponse findOne(@AuthenticationPrincipal String userId,
                                 @PathVariable String id) {
        return setupService.getSetup(userId, id);
    }

    @PatchMapping("/{id}")
    public SetupResponse update(@AuthenticationPrincipal String userId,
                                @PathVariable String id,
                                @RequestBody UpdateSetupRequest request) {
        return setupService.updateSetup(userId, id, request);
    }

    @PatchMapping("/{id}/activate")
    public SetupResponse toggleActive(@AuthenticationPrincipal String userId,
                                      @PathVariable String id) {
        return setupService.toggleActive(userId, id);
    }

    @PostMapping("/{id}/duplicate")
    public SetupResponse duplicate(@AuthenticationPrincipal String userId,
                                   @PathVariable String id) {
        return setupService.duplicateSetup(userId, id);
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> remove(@AuthenticationPrincipal String userId,
                                      @PathVariable String id) {
        setupService.deleteSetup(userId, id);
        return Map.of("success", true, "id", id);
    }
}
