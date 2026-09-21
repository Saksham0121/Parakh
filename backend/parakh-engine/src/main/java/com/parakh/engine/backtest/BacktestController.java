package com.parakh.engine.backtest;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.parakh.common.constants.KafkaTopics;
import com.parakh.common.domain.BacktestRun;
import com.parakh.common.domain.Setup;
import com.parakh.common.domain.SetupRanking;
import com.parakh.common.dto.event.BacktestJobEvent;
import com.parakh.engine.backtest.BacktestDtos.*;
import com.parakh.engine.repository.BacktestResultRepository;
import com.parakh.engine.repository.BacktestRunRepository;
import com.parakh.engine.repository.SetupEngineRepository;
import com.parakh.engine.repository.SetupRankingRepository;
import jakarta.validation.Valid;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/backtests")
public class BacktestController {

    private final BacktestRunRepository runRepository;
    private final SetupEngineRepository setupRepository;
    private final SetupRankingRepository rankingRepository;
    private final KafkaTemplate<String, String> kafkaTemplate;
    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    public BacktestController(BacktestRunRepository runRepository,
                              SetupEngineRepository setupRepository,
                              SetupRankingRepository rankingRepository,
                              KafkaTemplate<String, String> kafkaTemplate,
                              StringRedisTemplate redisTemplate,
                              ObjectMapper objectMapper) {
        this.runRepository = runRepository;
        this.setupRepository = setupRepository;
        this.rankingRepository = rankingRepository;
        this.kafkaTemplate = kafkaTemplate;
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
    }

    @PostMapping
    public Map<String, Object> createRun(
            @RequestHeader(value = "x-user-id", required = false) String userId,
            @Valid @RequestBody CreateBacktestRequest request) {

        Setup setup = setupRepository.findById(request.setupId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Setup not found"));

        Instant start = Instant.parse(request.startDate());
        Instant end = Instant.parse(request.endDate());

        BacktestRun run = new BacktestRun();
        run.setSetupId(request.setupId());
        run.setSymbol(request.symbol());
        run.setDateRangeStart(start);
        run.setDateRangeEnd(end);
        run.setStatus("pending");

        run = runRepository.save(run);

        // Initialize status in Redis
        try {
            Map<String, Object> statusMap = Map.of("status", "pending", "progress", 5);
            redisTemplate.opsForValue().set("backtest:status:" + run.getId(), objectMapper.writeValueAsString(statusMap), Duration.ofDays(1));

            // Publish job to Kafka
            BacktestJobEvent job = new BacktestJobEvent(run.getId(), request.setupId(), request.symbol(), start.toEpochMilli(), end.toEpochMilli());
            kafkaTemplate.send(KafkaTopics.BACKTEST_JOBS, run.getId(), objectMapper.writeValueAsString(job));
        } catch (Exception ignored) {}

        return Map.of("runId", run.getId(), "status", "pending");
    }

    @GetMapping("/{runId}/status")
    public Map<String, Object> getStatus(@PathVariable String runId) {
        try {
            String cached = redisTemplate.opsForValue().get("backtest:status:" + runId);
            if (cached != null) {
                return objectMapper.readValue(cached, Map.class);
            }
        } catch (Exception ignored) {}

        BacktestRun run = runRepository.findById(runId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Backtest run not found"));

        return Map.of(
                "runId", run.getId(),
                "status", run.getStatus(),
                "progress", "completed".equals(run.getStatus()) ? 100 : 10
        );
    }

    @GetMapping("/{runId}/playback")
    public Map<String, Object> getPlayback(@PathVariable String runId) {
        try {
            String cached = redisTemplate.opsForValue().get("backtest:playback:" + runId);
            if (cached != null) {
                return objectMapper.readValue(cached, Map.class);
            }
        } catch (Exception ignored) {}

        BacktestRun run = runRepository.findById(runId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Backtest run not found"));

        return Map.of(
                "runId", run.getId(),
                "symbol", run.getSymbol(),
                "dateRangeStart", run.getDateRangeStart(),
                "dateRangeEnd", run.getDateRangeEnd(),
                "bars", List.of(),
                "trades", List.of(),
                "equityCurve", List.of()
        );
    }

    @GetMapping("/{runId}")
    public BacktestRun getRun(@PathVariable String runId) {
        return runRepository.findById(runId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Backtest run not found"));
    }

    @GetMapping("/setup/{setupId}")
    public List<BacktestRun> getSetupBacktests(@PathVariable String setupId) {
        return runRepository.findBySetupIdOrderByRequestedAtDesc(setupId);
    }

    @GetMapping("/leaderboard/top")
    public List<SetupRanking> getLeaderboard() {
        return rankingRepository.findTop100ByOrderByRankScoreDesc();
    }
}
