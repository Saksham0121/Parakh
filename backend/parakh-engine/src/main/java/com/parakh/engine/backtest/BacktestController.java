package com.parakh.engine.backtest;

import com.parakh.common.domain.BacktestResult;
import com.parakh.common.domain.BacktestRun;
import com.parakh.common.domain.Setup;
import com.parakh.engine.backtest.BacktestDtos.BacktestJob;
import com.parakh.engine.backtest.BacktestDtos.CreateBacktestRequest;
import com.parakh.engine.cache.TieredCache;
import com.parakh.engine.repository.BacktestResultRepository;
import com.parakh.engine.repository.BacktestRunRepository;
import com.parakh.engine.repository.SetupEngineRepository;
import com.parakh.engine.security.JwtAuthFilter;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.*;

@RestController
@RequestMapping("/api/backtests")
public class BacktestController {

    private final BacktestRunRepository runRepository;
    private final BacktestResultRepository resultRepository;
    private final SetupEngineRepository setupRepository;
    private final BacktestSimulatorService simulator;
    private final TieredCache cache;

    public BacktestController(BacktestRunRepository runRepository, BacktestResultRepository resultRepository,
                              SetupEngineRepository setupRepository, BacktestSimulatorService simulator, TieredCache cache) {
        this.runRepository = runRepository;
        this.resultRepository = resultRepository;
        this.setupRepository = setupRepository;
        this.simulator = simulator;
        this.cache = cache;
    }

    @PostMapping
    public Map<String, Object> createRun(@RequestAttribute(JwtAuthFilter.USER_ID) String userId,
                                         @Valid @RequestBody CreateBacktestRequest request) {
        Setup setup = setupRepository.findByIdAndUserId(request.setupId(), userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Setup not found"));

        Instant end = parse(request.endDate(), Instant.now());
        Instant start = parse(request.startDate(), end.minus(Duration.ofDays(730)));
        if (!start.isBefore(end)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Start date must be before end date");

        BacktestRun run = new BacktestRun();
        run.setSetupId(setup.getId());
        run.setSymbol(request.symbol().trim().toUpperCase());
        run.setDateRangeStart(start);
        run.setDateRangeEnd(end);
        run.setStatus("pending");
        run = runRepository.save(run);

        String tf = request.timeframe() != null && !request.timeframe().isBlank() ? request.timeframe() : setup.getTimeframe();
        simulator.submit(new BacktestJob(run.getId(), setup.getId(), run.getSymbol(), start.getEpochSecond(), end.getEpochSecond(),
                tf, positiveOr(request.initialCapital(), 100_000), nonNegativeOr(request.commissionPct(), 0.05),
                positiveOr(request.positionSizePct(), 100), Boolean.TRUE.equals(request.applyFundamentals())));
        return Map.of("runId", run.getId(), "status", "pending");
    }

    @GetMapping("/{runId}/status")
    public Map<String, Object> getStatus(@RequestAttribute(JwtAuthFilter.USER_ID) String userId, @PathVariable String runId) {
        BacktestRun run = owned(userId, runId);
        Map<String, Object> cached = cache.peek("backtest:status:" + runId);
        if (cached == null) cached = cache.get("backtest:status:" + runId, Duration.ofDays(1), Duration.ofSeconds(1), () -> null);
        if (cached != null) return cached;
        return Map.of("runId", runId, "status", run.getStatus(), "progress", "completed".equals(run.getStatus()) ? 100 : 10);
    }

    @GetMapping("/{runId}/playback")
    public Map<String, Object> getPlayback(@RequestAttribute(JwtAuthFilter.USER_ID) String userId, @PathVariable String runId) {
        BacktestRun run = owned(userId, runId);
        Map<String, Object> playback = cache.get("backtest:playback:" + runId, Duration.ofDays(7), Duration.ofSeconds(1), () -> null);
        if (playback != null) return playback;
        throw new ResponseStatusException(HttpStatus.GONE,
                "Detailed playback for this run has expired. Re-run the backtest on " + run.getSymbol() + " to view it.");
    }

    /** Recent runs across all of the caller's setups, with headline results — powers the run history list. */
    @GetMapping("/mine")
    public List<Map<String, Object>> myRuns(@RequestAttribute(JwtAuthFilter.USER_ID) String userId) {
        List<String> setupIds = setupRepository.findIdsByUserId(userId);
        if (setupIds.isEmpty()) return List.of();
        List<Map<String, Object>> out = new ArrayList<>();
        for (BacktestRun r : runRepository.findTop50BySetupIdInOrderByRequestedAtDesc(setupIds)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("runId", r.getId());
            m.put("setupId", r.getSetupId());
            m.put("symbol", r.getSymbol());
            m.put("status", r.getStatus());
            m.put("requestedAt", r.getRequestedAt());
            m.put("dateRangeStart", r.getDateRangeStart());
            m.put("dateRangeEnd", r.getDateRangeEnd());
            resultRepository.findByBacktestRunId(r.getId()).ifPresent(res -> m.put("result", summary(res)));
            out.add(m);
        }
        return out;
    }

    private static Map<String, Object> summary(BacktestResult r) {
        return Map.of("totalTrades", r.getTotalTrades(), "winRate", r.getWinRate(), "avgReturnPct", r.getAvgReturnPct(),
                "maxDrawdownPct", r.getMaxDrawdownPct());
    }

    private BacktestRun owned(String userId, String runId) {
        BacktestRun run = runRepository.findById(runId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Backtest run not found"));
        setupRepository.findByIdAndUserId(run.getSetupId(), userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Backtest run not found"));
        return run;
    }

    private static Instant parse(String s, Instant fallback) {
        if (s == null || s.isBlank()) return fallback;
        try {
            return s.length() == 10 ? Instant.parse(s + "T00:00:00Z") : Instant.parse(s);
        } catch (DateTimeParseException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid date: " + s);
        }
    }

    private static double positiveOr(Double v, double fallback) {
        return v != null && v > 0 ? v : fallback;
    }

    private static double nonNegativeOr(Double v, double fallback) {
        return v != null && v >= 0 ? v : fallback;
    }
}
