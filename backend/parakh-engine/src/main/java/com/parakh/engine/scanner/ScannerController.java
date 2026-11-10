package com.parakh.engine.scanner;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.parakh.common.analysis.SetupEvaluator;
import com.parakh.common.domain.Setup;
import com.parakh.common.dto.condition.FundamentalConditionDto;
import com.parakh.common.dto.condition.TechnicalConditionDto;
import com.parakh.engine.repository.SetupEngineRepository;
import com.parakh.engine.repository.WatchlistEngineRepository;
import com.parakh.engine.security.JwtAuthFilter;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;

@RestController
@RequestMapping("/api/scanner")
public class ScannerController {

    private final ScannerService scanner;
    private final SetupEngineRepository setups;
    private final WatchlistEngineRepository watchlists;

    public ScannerController(ScannerService scanner, SetupEngineRepository setups, WatchlistEngineRepository watchlists) {
        this.scanner = scanner;
        this.setups = setups;
        this.watchlists = watchlists;
    }

    /**
     * Either reference a saved setup ({@code setupId}) or send the rules inline (to preview a setup while
     * building it). {@code symbols} empty means the setup's universe, falling back to the user's watchlist.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ScanRequest(String setupId,
                              List<TechnicalConditionDto> technicalConditions,
                              List<FundamentalConditionDto> fundamentalConditions,
                              String fundamentalMode,
                              String timeframe,
                              List<String> symbols) {}

    @PostMapping("/run")
    public Map<String, Object> run(@RequestAttribute(JwtAuthFilter.USER_ID) String userId, @RequestBody ScanRequest req) {
        long started = System.currentTimeMillis();
        ScannerService.SetupSpec spec;
        List<String> symbols = req.symbols() != null ? new ArrayList<>(req.symbols()) : new ArrayList<>();
        String setupName = null;

        if (req.setupId() != null && !req.setupId().isBlank()) {
            Setup s = setups.findByIdAndUserId(req.setupId(), userId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Setup not found"));
            spec = new ScannerService.SetupSpec(s.getTechnicalConditions(), s.getFundamentalConditions(),
                    s.getFundamentalMode(), req.timeframe() != null ? req.timeframe() : s.getTimeframe());
            setupName = s.getName();
            if (symbols.isEmpty() && s.getUniverse() != null) symbols.addAll(s.getUniverse());
        } else {
            spec = new ScannerService.SetupSpec(req.technicalConditions(), req.fundamentalConditions(),
                    req.fundamentalMode(), req.timeframe() != null ? req.timeframe() : "D");
        }

        if (spec.technical() == null || spec.technical().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Add at least one technical condition");
        }
        try {
            SetupEvaluator.validate(spec.technical());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        }
        if (symbols.isEmpty()) symbols.addAll(watchlists.findSymbolsByUserId(userId));
        if (symbols.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Add symbols to scan or to your watchlist");
        }

        List<ScannerService.SymbolResult> results = scanner.scan(symbols, spec);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("setupId", req.setupId());
        out.put("setupName", setupName);
        out.put("timeframe", spec.timeframe());
        out.put("fundamentalsRequired", spec.fundamentalsRequired() && spec.hasFundamentals());
        out.put("scanned", results.size());
        out.put("matched", results.stream().filter(ScannerService.SymbolResult::matched).count());
        out.put("durationMs", System.currentTimeMillis() - started);
        out.put("results", results);
        return out;
    }
}
