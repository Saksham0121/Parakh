package com.parakh.engine.backtest;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.parakh.common.constants.KafkaTopics;
import com.parakh.common.domain.*;
import com.parakh.common.dto.condition.TechnicalConditionDto;
import com.parakh.common.dto.event.BacktestJobEvent;
import com.parakh.common.dto.order.OrderRuleDto;
import com.parakh.common.matcher.ConditionMatcher;
import com.parakh.engine.market.YahooFinanceClient;
import com.parakh.engine.repository.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.*;

@Service
public class BacktestSimulatorService {

    private static final Logger log = LoggerFactory.getLogger(BacktestSimulatorService.class);

    private final BacktestRunRepository runRepository;
    private final BacktestTradeRepository tradeRepository;
    private final BacktestResultRepository resultRepository;
    private final SetupRankingRepository rankingRepository;
    private final SetupEngineRepository setupRepository;
    private final YahooFinanceClient yahooClient;
    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    public BacktestSimulatorService(BacktestRunRepository runRepository,
                                  BacktestTradeRepository tradeRepository,
                                  BacktestResultRepository resultRepository,
                                  SetupRankingRepository rankingRepository,
                                  SetupEngineRepository setupRepository,
                                  YahooFinanceClient yahooClient,
                                  StringRedisTemplate redisTemplate,
                                  ObjectMapper objectMapper) {
        this.runRepository = runRepository;
        this.tradeRepository = tradeRepository;
        this.resultRepository = resultRepository;
        this.rankingRepository = rankingRepository;
        this.setupRepository = setupRepository;
        this.yahooClient = yahooClient;
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
    }

    @KafkaListener(topics = KafkaTopics.BACKTEST_JOBS, groupId = "backtest-worker-group")
    public void onBacktestJob(String message) {
        try {
            BacktestJobEvent job = objectMapper.readValue(message, BacktestJobEvent.class);
            executeSimulation(job);
        } catch (Exception e) {
            log.error("Error executing backtest job: {}", e.getMessage(), e);
        }
    }

    @Transactional
    public void executeSimulation(BacktestJobEvent job) {
        String runId = job.runId();
        try {
            updateStatus(runId, "running", 10, null);

            Setup setup = setupRepository.findById(job.setupId())
                    .orElseThrow(() -> new IllegalStateException("Setup " + job.setupId() + " not found"));

            long from = job.startDate() / 1000L;
            long to = job.endDate() / 1000L;

            Map<String, Object> candleData = yahooClient.getCandles(job.symbol(), "D", from, to);
            List<Long> t = (List<Long>) candleData.get("t");
            List<Double> o = (List<Double>) candleData.get("o");
            List<Double> h = (List<Double>) candleData.get("h");
            List<Double> l = (List<Double>) candleData.get("l");
            List<Double> c = (List<Double>) candleData.get("c");
            List<Long> v = (List<Long>) candleData.get("v");

            int n = (t != null) ? t.size() : 0;
            if (n < 5) {
                throw new IllegalStateException("Insufficient historical candles for backtesting");
            }

            updateStatus(runId, "running", 30, null);

            List<TechnicalConditionDto> technicalConditions = setup.getTechnicalConditions();
            OrderRuleDto orderRule = setup.getOrderRule();
            Double stopLossPct = orderRule != null ? orderRule.getStopLossPct() : null;
            Double takeProfitPct = orderRule != null ? orderRule.getTakeProfitPct() : null;
            Double trailingStopPct = orderRule != null ? orderRule.getTrailingStopPct() : null;
            Double stopLimitPrice = orderRule != null ? orderRule.getStopLimitPrice() : null;

            double currentEquity = 100000.0;
            boolean inTrade = false;
            double entryPrice = 0.0;
            long entryTime = 0L;
            double peakPrice = 0.0;

            List<BacktestTrade> recordedTrades = new ArrayList<>();
            List<Map<String, Object>> equityCurve = new ArrayList<>();
            List<Map<String, Object>> playbackBars = new ArrayList<>();

            BacktestRun run = runRepository.findById(runId).orElseThrow();

            for (int i = 0; i < n; i++) {
                long timeMs = t.get(i) * 1000L;
                double curOpen = o.get(i);
                double curHigh = h.get(i);
                double curLow = l.get(i);
                double curClose = c.get(i);
                long curVol = v.get(i);

                playbackBars.add(Map.of(
                        "time", timeMs,
                        "open", curOpen,
                        "high", curHigh,
                        "low", curLow,
                        "close", curClose,
                        "volume", curVol
                ));

                // ─── Trade Exit Evaluation ───
                if (inTrade) {
                    peakPrice = Math.max(peakPrice, curHigh);
                    Double exitPrice = null;
                    String exitReason = null;

                    // 1. Stop Loss
                    if (stopLossPct != null) {
                        double slPrice = entryPrice * (1.0 - stopLossPct / 100.0);
                        if (curLow <= slPrice) {
                            exitPrice = curOpen < slPrice ? curOpen : slPrice;
                            exitReason = "stop_loss";
                        }
                    }

                    // 2. Take Profit
                    if (exitReason == null && takeProfitPct != null) {
                        double tpPrice = entryPrice * (1.0 + takeProfitPct / 100.0);
                        if (curHigh >= tpPrice) {
                            exitPrice = curOpen > tpPrice ? curOpen : tpPrice;
                            exitReason = "take_profit";
                        }
                    }

                    // 3. Trailing Stop
                    if (exitReason == null && trailingStopPct != null) {
                        double tsPrice = peakPrice * (1.0 - trailingStopPct / 100.0);
                        if (curLow <= tsPrice) {
                            exitPrice = curOpen < tsPrice ? curOpen : tsPrice;
                            exitReason = "trailing_stop";
                        }
                    }

                    // 4. Limit Exit
                    if (exitReason == null && stopLimitPrice != null && curHigh >= stopLimitPrice) {
                        exitPrice = stopLimitPrice;
                        exitReason = "limit_exit";
                    }

                    // 5. Time Exit at last bar
                    if (exitReason == null && i == n - 1) {
                        exitPrice = curClose;
                        exitReason = "time_exit";
                    }

                    if (exitReason != null && exitPrice != null) {
                        double retPct = ((exitPrice - entryPrice) / entryPrice) * 100.0;
                        currentEquity = currentEquity * (1.0 + retPct / 100.0);

                        BacktestTrade trade = new BacktestTrade();
                        trade.setBacktestRun(run);
                        trade.setEntryDate(Instant.ofEpochMilli(entryTime));
                        trade.setEntryPrice(Math.round(entryPrice * 100.0) / 100.0);
                        trade.setExitDate(Instant.ofEpochMilli(timeMs));
                        trade.setExitPrice(Math.round(exitPrice * 100.0) / 100.0);
                        trade.setExitReason(exitReason);
                        trade.setReturnPct(Math.round(retPct * 100.0) / 100.0);
                        trade.setResult(retPct >= 0 ? "win" : "loss");

                        recordedTrades.add(trade);
                        inTrade = false;
                    }
                }

                // ─── Entry Evaluation (Zero Lookahead) ───
                if (!inTrade && i + 1 < n && technicalConditions != null && !technicalConditions.isEmpty()) {
                    boolean allMatch = true;
                    for (TechnicalConditionDto cond : technicalConditions) {
                        double target = cond.getNumericTarget(0.0);
                        String op = cond.getOperator() != null ? cond.getOperator() : "gt";

                        // Evaluate against close price for simple indicators
                        if (!ConditionMatcher.evaluate(op, curClose, target)) {
                            allMatch = false;
                            break;
                        }
                    }

                    if (allMatch) {
                        // Enter at next bar's open
                        inTrade = true;
                        entryPrice = o.get(i + 1);
                        entryTime = t.get(i + 1) * 1000L;
                        peakPrice = entryPrice;
                    }
                }

                equityCurve.add(Map.of("time", timeMs, "value", Math.round(currentEquity * 100.0) / 100.0));
            }

            updateStatus(runId, "running", 80, null);

            // ─── Aggregate Results ───
            int totalTrades = recordedTrades.size();
            int wins = (int) recordedTrades.stream().filter(tr -> "win".equals(tr.getResult())).count();
            int losses = totalTrades - wins;
            double winRate = totalTrades > 0 ? (wins * 100.0) / totalTrades : 0.0;
            double avgReturn = totalTrades > 0 ? recordedTrades.stream().mapToDouble(BacktestTrade::getReturnPct).average().orElse(0.0) : 0.0;
            double bestTrade = recordedTrades.stream().mapToDouble(BacktestTrade::getReturnPct).max().orElse(0.0);
            double worstTrade = recordedTrades.stream().mapToDouble(BacktestTrade::getReturnPct).min().orElse(0.0);

            // Max Drawdown over equity curve
            double peakEq = 100000.0;
            double maxDd = 0.0;
            for (var pt : equityCurve) {
                double val = ((Number) pt.get("value")).doubleValue();
                if (val > peakEq) peakEq = val;
                double dd = peakEq > 0 ? ((peakEq - val) / peakEq) * 100.0 : 0.0;
                if (dd > maxDd) maxDd = dd;
            }

            // Save trades
            tradeRepository.saveAll(recordedTrades);

            // Save result
            BacktestResult result = new BacktestResult();
            result.setBacktestRun(run);
            result.setTotalTrades(totalTrades);
            result.setWins(wins);
            result.setLosses(losses);
            result.setWinRate(Math.round(winRate * 10.0) / 10.0);
            result.setAvgReturnPct(Math.round(avgReturn * 100.0) / 100.0);
            result.setMaxDrawdownPct(Math.round(maxDd * 100.0) / 100.0);
            result.setBestTradePct(Math.round(bestTrade * 100.0) / 100.0);
            result.setWorstTradePct(Math.round(worstTrade * 100.0) / 100.0);
            resultRepository.save(result);

            run.setStatus("completed");
            run.setCompletedAt(Instant.now());
            runRepository.save(run);

            // Cache playback payload in Redis (TTL 7 days)
            Map<String, Object> playback = Map.of(
                    "runId", runId,
                    "symbol", job.symbol(),
                    "setupName", setup.getName(),
                    "dateRangeStart", Instant.ofEpochMilli(job.startDate()).toString(),
                    "dateRangeEnd", Instant.ofEpochMilli(job.endDate()).toString(),
                    "bars", playbackBars,
                    "trades", recordedTrades.stream().map(tr -> Map.of(
                            "entryDate", tr.getEntryDate(),
                            "entryPrice", tr.getEntryPrice(),
                            "exitDate", tr.getExitDate(),
                            "exitPrice", tr.getExitPrice(),
                            "exitReason", tr.getExitReason(),
                            "returnPct", tr.getReturnPct(),
                            "result", tr.getResult()
                    )).toList(),
                    "equityCurve", equityCurve,
                    "result", Map.of(
                            "totalTrades", totalTrades,
                            "wins", wins,
                            "losses", losses,
                            "winRate", result.getWinRate(),
                            "avgReturnPct", result.getAvgReturnPct(),
                            "maxDrawdownPct", result.getMaxDrawdownPct(),
                            "bestTradePct", result.getBestTradePct(),
                            "worstTradePct", result.getWorstTradePct()
                    )
            );
            redisTemplate.opsForValue().set("backtest:playback:" + runId, objectMapper.writeValueAsString(playback), Duration.ofDays(7));
            updateStatus(runId, "completed", 100, null);

            // Update setup rankings
            updateSetupRanking(job.setupId());

            log.info("Backtest simulation {} completed successfully. Total trades: {}, Win rate: {}%", runId, totalTrades, result.getWinRate());
        } catch (Exception e) {
            log.error("Backtest {} failed: {}", runId, e.getMessage(), e);
            updateStatus(runId, "failed", 0, e.getMessage());
            runRepository.findById(runId).ifPresent(r -> {
                r.setStatus("failed");
                r.setCompletedAt(Instant.now());
                runRepository.save(r);
            });
        }
    }

    private void updateSetupRanking(String setupId) {
        List<BacktestRun> runs = runRepository.findBySetupIdOrderByRequestedAtDesc(setupId);
        List<BacktestResult> results = new ArrayList<>();
        for (BacktestRun r : runs) {
            resultRepository.findByBacktestRunId(r.getId()).ifPresent(results::add);
        }

        if (results.isEmpty()) return;

        int totalRuns = results.size();
        double aggWinRate = results.stream().mapToDouble(BacktestResult::getWinRate).average().orElse(0.0);
        double aggAvgReturn = results.stream().mapToDouble(BacktestResult::getAvgReturnPct).average().orElse(0.0);
        double score = Math.round(((aggWinRate * 0.6) + (aggAvgReturn * 0.4)) * 100.0) / 100.0;

        SetupRanking ranking = rankingRepository.findBySetupId(setupId)
                .orElseGet(() -> {
                    SetupRanking sr = new SetupRanking();
                    sr.setSetupId(setupId);
                    return sr;
                });

        ranking.setTotalBacktestRuns(totalRuns);
        ranking.setAggregateWinRate(Math.round(aggWinRate * 10.0) / 10.0);
        ranking.setAggregateAvgReturnPct(Math.round(aggAvgReturn * 100.0) / 100.0);
        ranking.setRankScore(score);
        ranking.setLastRankedAt(Instant.now());

        rankingRepository.save(ranking);
    }

    private void updateStatus(String runId, String status, int progress, String error) {
        try {
            Map<String, Object> map = new HashMap<>();
            map.put("status", status);
            map.put("progress", progress);
            if (error != null) map.put("error", error);

            redisTemplate.opsForValue().set("backtest:status:" + runId, objectMapper.writeValueAsString(map), Duration.ofDays(1));
        } catch (Exception ignored) {}
    }
}
