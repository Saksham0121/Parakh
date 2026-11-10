package com.parakh.engine.backtest;

import com.parakh.common.analysis.Candles;
import com.parakh.common.analysis.SetupEvaluator;
import com.parakh.common.domain.*;
import com.parakh.common.dto.condition.TechnicalConditionDto;
import com.parakh.common.dto.order.OrderRuleDto;
import com.parakh.engine.backtest.BacktestDtos.BacktestJob;
import com.parakh.engine.cache.TieredCache;
import com.parakh.engine.market.MarketService;
import com.parakh.engine.market.YahooFinanceClient;
import com.parakh.engine.repository.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Bar-by-bar strategy simulator. Signals use the same {@link SetupEvaluator} as the live scanner and
 * are evaluated on a bar's close; entries fill at the next bar's open, so there is no look-ahead bias.
 * Stops are checked before targets inside a bar (the conservative assumption when both are touched).
 */
@Service
public class BacktestSimulatorService {

    private static final Logger log = LoggerFactory.getLogger(BacktestSimulatorService.class);
    private static final int WARMUP_BARS = 250;
    private static final Duration RESULT_TTL = Duration.ofDays(7);

    private final BacktestRunRepository runRepository;
    private final BacktestTradeRepository tradeRepository;
    private final BacktestResultRepository resultRepository;
    private final SetupRankingRepository rankingRepository;
    private final SetupEngineRepository setupRepository;
    private final MarketService market;
    private final YahooFinanceClient yahoo;
    private final TieredCache cache;
    private final ExecutorService workers = Executors.newVirtualThreadPerTaskExecutor();

    public BacktestSimulatorService(BacktestRunRepository runRepository, BacktestTradeRepository tradeRepository,
                                    BacktestResultRepository resultRepository, SetupRankingRepository rankingRepository,
                                    SetupEngineRepository setupRepository, MarketService market,
                                    YahooFinanceClient yahoo, TieredCache cache) {
        this.runRepository = runRepository;
        this.tradeRepository = tradeRepository;
        this.resultRepository = resultRepository;
        this.rankingRepository = rankingRepository;
        this.setupRepository = setupRepository;
        this.market = market;
        this.yahoo = yahoo;
        this.cache = cache;
    }

    public void submit(BacktestJob job) {
        updateStatus(job.runId(), "pending", 5, null);
        workers.submit(() -> execute(job));
    }

    // ─── Simulation ─────────────────────────────────────────────────────────────

    private static final class Position {
        boolean isLong;
        double entry;
        long entryTime;
        int entryIndex;
        double peak;   // best price since entry (high for longs, low for shorts)
        int bars;
    }

    void execute(BacktestJob job) {
        String runId = job.runId();
        try {
            updateStatus(runId, "running", 15, null);
            Setup setup = setupRepository.findById(job.setupId())
                    .orElseThrow(() -> new IllegalStateException("Setup not found"));

            long warmup = (long) (barSeconds(job.timeframe()) * WARMUP_BARS * 1.6);
            Map<String, Object> raw = yahoo.getCandles(job.symbol(), job.timeframe(), job.startEpoch() - warmup, job.endEpoch());
            Candles candles = Candles.fromMap(raw);
            int first = -1, last = -1;
            for (int k = 0; k < candles.size(); k++) {
                long t = candles.time()[k];
                if (t >= job.startEpoch() && first < 0) first = k;
                if (t <= job.endEpoch()) last = k;
            }
            if (first < 0 || last - first < 5) {
                throw new IllegalStateException(market.isUpstreamRateLimited()
                        ? "Market data provider is rate limiting requests; try again in a minute"
                        : "Not enough price history for " + job.symbol() + " in the selected range");
            }
            updateStatus(runId, "running", 40, null);

            Map<String, Object> fundamentals = null;
            boolean fundamentalsGatePassed = true;
            if (setup.getFundamentalConditions() != null && !setup.getFundamentalConditions().isEmpty()) {
                var fr = SetupEvaluator.evaluateFundamentals(setup.getFundamentalConditions(), market.getFundamentalMetrics(job.symbol()));
                fundamentals = Map.of("passed", fr.passed(), "dataAvailable", fr.dataAvailable(), "conditions", fr.conditions(),
                        "applied", job.applyFundamentals(),
                        "note", "Fundamental filters use the latest reported values; historical fundamentals are not available.");
                fundamentalsGatePassed = !job.applyFundamentals() || fr.passed();
            }

            Simulation sim = simulate(candles, first, last, setup.getTechnicalConditions(),
                    setup.getOrderRule() != null ? setup.getOrderRule() : new OrderRuleDto(),
                    job, fundamentalsGatePassed);
            updateStatus(runId, "running", 80, null);

            BacktestRun run = runRepository.findById(runId).orElseThrow();
            List<BacktestTrade> entities = new ArrayList<>();
            for (Map<String, Object> t : sim.trades) {
                BacktestTrade e = new BacktestTrade();
                e.setBacktestRun(run);
                e.setEntryDate(Instant.ofEpochMilli((Long) t.get("entryTime")));
                e.setEntryPrice((Double) t.get("entryPrice"));
                e.setExitDate(Instant.ofEpochMilli((Long) t.get("exitTime")));
                e.setExitPrice((Double) t.get("exitPrice"));
                e.setExitReason((String) t.get("exitReason"));
                e.setReturnPct((Double) t.get("returnPct"));
                e.setResult((String) t.get("result"));
                entities.add(e);
            }
            tradeRepository.saveAll(entities);

            Map<String, Object> s = sim.stats;
            BacktestResult result = new BacktestResult();
            result.setBacktestRun(run);
            result.setTotalTrades((Integer) s.get("totalTrades"));
            result.setWins((Integer) s.get("wins"));
            result.setLosses((Integer) s.get("losses"));
            result.setWinRate((Double) s.get("winRate"));
            result.setAvgReturnPct((Double) s.get("avgReturnPct"));
            result.setMaxDrawdownPct((Double) s.get("maxDrawdownPct"));
            result.setBestTradePct((Double) s.get("bestTradePct"));
            result.setWorstTradePct((Double) s.get("worstTradePct"));
            resultRepository.save(result);

            run.setStatus("completed");
            run.setCompletedAt(Instant.now());
            runRepository.save(run);

            Map<String, Object> playback = new LinkedHashMap<>();
            playback.put("runId", runId);
            playback.put("setupId", setup.getId());
            playback.put("setupName", setup.getName());
            playback.put("symbol", job.symbol());
            playback.put("timeframe", job.timeframe());
            playback.put("side", (setup.getOrderRule() != null ? setup.getOrderRule() : new OrderRuleDto()).getSide());
            playback.put("dateRangeStart", Instant.ofEpochSecond(job.startEpoch()).toString());
            playback.put("dateRangeEnd", Instant.ofEpochSecond(job.endEpoch()).toString());
            playback.put("initialCapital", job.initialCapital());
            playback.put("commissionPct", job.commissionPct());
            playback.put("positionSizePct", job.positionSizePct());
            playback.put("bars", sim.bars);
            playback.put("trades", sim.trades);
            playback.put("equityCurve", sim.equity);
            playback.put("result", s);
            playback.put("fundamentals", fundamentals);
            cache.put("backtest:playback:" + runId, playback, RESULT_TTL);
            updateStatus(runId, "completed", 100, null);
            updateSetupRanking(job.setupId());
            log.info("Backtest {} on {} done: {} trades, {}% win rate", runId, job.symbol(), s.get("totalTrades"), s.get("winRate"));
        } catch (Exception e) {
            log.warn("Backtest {} failed: {}", runId, e.getMessage());
            updateStatus(runId, "failed", 0, e.getMessage());
            runRepository.findById(runId).ifPresent(r -> {
                r.setStatus("failed");
                r.setCompletedAt(Instant.now());
                runRepository.save(r);
            });
        }
    }

    record Simulation(List<Map<String, Object>> bars, List<Map<String, Object>> trades,
                      List<Map<String, Object>> equity, Map<String, Object> stats) {}

    /** Pure function of its inputs — unit-testable without Spring, a database or the network. */
    static Simulation simulate(Candles c, int first, int last, List<TechnicalConditionDto> conditions, OrderRuleDto rule,
                               BacktestJob job, boolean entriesAllowed) {
        SetupEvaluator ev = new SetupEvaluator(c);
        boolean isLong = !"SHORT".equals(rule.getSide());
        Double sl = positive(rule.getStopLossPct()), tp = positive(rule.getTakeProfitPct()), trail = positive(rule.getTrailingStopPct());
        Double limit = positive(rule.getStopLimitPrice());
        Integer maxHold = rule.getMaxHoldBars() != null && rule.getMaxHoldBars() > 0 ? rule.getMaxHoldBars() : null;
        double size = Math.min(Math.max(job.positionSizePct(), 1), 100) / 100.0;
        double cost = Math.max(job.commissionPct(), 0) / 100.0;

        double equity = job.initialCapital();
        Position pos = null;
        boolean pendingEntry = false;
        List<Map<String, Object>> bars = new ArrayList<>(), trades = new ArrayList<>(), curve = new ArrayList<>();
        List<Double> barReturns = new ArrayList<>();
        int barsInMarket = 0;
        double prevMtm = equity, peakMtm = equity, maxDd = 0;

        for (int k = first; k <= last; k++) {
            long tMs = c.time()[k] * 1000L;
            double o = c.open()[k], h = c.high()[k], l = c.low()[k], cl = c.close()[k];
            bars.add(Map.of("time", tMs, "open", o, "high", h, "low", l, "close", cl, "volume", c.volume()[k]));

            if (pendingEntry && pos == null) {
                pos = new Position();
                pos.isLong = isLong;
                pos.entry = o;
                pos.entryTime = tMs;
                pos.entryIndex = k - first;
                pos.peak = o;
                pendingEntry = false;
            }

            if (pos != null) {
                barsInMarket++;
                pos.bars++;
                Double exit = null;
                String reason = null;
                if (pos.isLong) {
                    double fixed = sl != null ? pos.entry * (1 - sl / 100) : Double.NEGATIVE_INFINITY;
                    double trailing = trail != null ? pos.peak * (1 - trail / 100) : Double.NEGATIVE_INFINITY;
                    double stop = Math.max(fixed, trailing);
                    if (l <= stop) { exit = Math.min(o, stop); reason = trailing > fixed ? "trailing_stop" : "stop_loss"; }
                    else if (tp != null && h >= pos.entry * (1 + tp / 100)) { exit = Math.max(o, pos.entry * (1 + tp / 100)); reason = "take_profit"; }
                    else if (limit != null && h >= limit) { exit = Math.max(o, limit); reason = "target_price"; }
                    pos.peak = Math.max(pos.peak, h);
                } else {
                    double fixed = sl != null ? pos.entry * (1 + sl / 100) : Double.POSITIVE_INFINITY;
                    double trailing = trail != null ? pos.peak * (1 + trail / 100) : Double.POSITIVE_INFINITY;
                    double stop = Math.min(fixed, trailing);
                    if (h >= stop) { exit = Math.max(o, stop); reason = trailing < fixed ? "trailing_stop" : "stop_loss"; }
                    else if (tp != null && l <= pos.entry * (1 - tp / 100)) { exit = Math.min(o, pos.entry * (1 - tp / 100)); reason = "take_profit"; }
                    else if (limit != null && l <= limit) { exit = Math.min(o, limit); reason = "target_price"; }
                    pos.peak = Math.min(pos.peak, l);
                }
                if (exit == null && maxHold != null && pos.bars >= maxHold) { exit = cl; reason = "time_exit"; }
                if (exit == null && k == last) { exit = cl; reason = "end_of_test"; }

                if (exit != null) {
                    double gross = pos.isLong ? (exit - pos.entry) / pos.entry : (pos.entry - exit) / pos.entry;
                    double net = gross - 2 * cost;
                    double pnl = equity * size * net;
                    equity += pnl;
                    Map<String, Object> t = new LinkedHashMap<>();
                    t.put("side", pos.isLong ? "LONG" : "SHORT");
                    t.put("entryTime", pos.entryTime);
                    t.put("entryPrice", SetupEvaluator.round(pos.entry));
                    t.put("exitTime", tMs);
                    t.put("exitPrice", SetupEvaluator.round(exit));
                    t.put("exitReason", reason);
                    t.put("returnPct", Math.round(net * 10000) / 100.0);
                    t.put("pnl", Math.round(pnl * 100) / 100.0);
                    t.put("barsHeld", pos.bars);
                    t.put("entryIndex", pos.entryIndex);
                    t.put("exitIndex", k - first);
                    t.put("result", net >= 0 ? "win" : "loss");
                    t.put("equityAfter", Math.round(equity * 100) / 100.0);
                    trades.add(t);
                    pos = null;
                }
            }

            // Signal on this bar's close -> fill at next bar's open (never on the final bar).
            if (pos == null && !pendingEntry && entriesAllowed && k < last && ev.matches(conditions, k)) {
                pendingEntry = true;
            }

            double mtm = equity;
            if (pos != null) {
                double unreal = pos.isLong ? (cl - pos.entry) / pos.entry : (pos.entry - cl) / pos.entry;
                mtm = equity * (1 + size * (unreal - cost));
            }
            barReturns.add(prevMtm > 0 ? mtm / prevMtm - 1 : 0);
            prevMtm = mtm;
            peakMtm = Math.max(peakMtm, mtm);
            maxDd = Math.max(maxDd, peakMtm > 0 ? (peakMtm - mtm) / peakMtm * 100 : 0);
            curve.add(Map.of("time", tMs, "value", Math.round(mtm * 100) / 100.0));
        }

        return new Simulation(bars, trades, curve, stats(trades, barReturns, job, equity, maxDd,
                c.open()[first], c.close()[last], barsInMarket, last - first + 1));
    }

    private static Map<String, Object> stats(List<Map<String, Object>> trades, List<Double> barReturns, BacktestJob job,
                                             double finalEquity, double maxDd, double firstOpen, double lastClose,
                                             int barsInMarket, int totalBars) {
        int n = trades.size();
        List<Double> rets = trades.stream().map(t -> (Double) t.get("returnPct")).toList();
        int wins = (int) rets.stream().filter(r -> r >= 0).count();
        double grossWin = trades.stream().mapToDouble(t -> (Double) t.get("pnl")).filter(p -> p > 0).sum();
        double grossLoss = -trades.stream().mapToDouble(t -> (Double) t.get("pnl")).filter(p -> p < 0).sum();
        double mean = barReturns.stream().mapToDouble(d -> d).average().orElse(0);
        double sd = Math.sqrt(barReturns.stream().mapToDouble(d -> (d - mean) * (d - mean)).average().orElse(0));

        Map<String, Object> s = new LinkedHashMap<>();
        s.put("totalTrades", n);
        s.put("wins", wins);
        s.put("losses", n - wins);
        s.put("winRate", n > 0 ? Math.round(wins * 1000.0 / n) / 10.0 : 0.0);
        s.put("avgReturnPct", r2(rets.stream().mapToDouble(d -> d).average().orElse(0)));
        s.put("avgWinPct", r2(rets.stream().filter(r -> r >= 0).mapToDouble(d -> d).average().orElse(0)));
        s.put("avgLossPct", r2(rets.stream().filter(r -> r < 0).mapToDouble(d -> d).average().orElse(0)));
        s.put("bestTradePct", r2(rets.stream().mapToDouble(d -> d).max().orElse(0)));
        s.put("worstTradePct", r2(rets.stream().mapToDouble(d -> d).min().orElse(0)));
        Double profitFactor = grossLoss > 0 ? Double.valueOf(r2(grossWin / grossLoss)) : grossWin > 0 ? null : Double.valueOf(0);
        s.put("profitFactor", profitFactor); // null = no losing trades (infinite)
        s.put("totalReturnPct", r2((finalEquity / job.initialCapital() - 1) * 100));
        s.put("buyHoldReturnPct", r2(firstOpen > 0 ? (lastClose / firstOpen - 1) * 100 : 0));
        s.put("maxDrawdownPct", r2(maxDd));
        s.put("sharpe", sd > 0 ? r2(mean / sd * Math.sqrt(barsPerYear(job.timeframe()))) : 0.0);
        s.put("avgBarsHeld", r2(trades.stream().mapToInt(t -> (Integer) t.get("barsHeld")).average().orElse(0)));
        s.put("exposurePct", r2(totalBars > 0 ? barsInMarket * 100.0 / totalBars : 0));
        s.put("finalEquity", r2(finalEquity));
        return s;
    }

    private static double r2(double v) {
        return Math.round(v * 100) / 100.0;
    }

    private static Double positive(Double v) {
        return v != null && v > 0 ? v : null;
    }

    static long barSeconds(String tf) {
        return switch (tf == null ? "D" : tf) {
            case "1" -> 60;
            case "5" -> 300;
            case "15" -> 900;
            case "30" -> 1800;
            case "60" -> 3600 * 3; // trading hours only: pad so warm-up still covers 250 bars
            case "W" -> 7 * 86400;
            case "M" -> 31 * 86400;
            default -> 86400;
        };
    }

    private static double barsPerYear(String tf) {
        return switch (tf == null ? "D" : tf) {
            case "5" -> 252 * 75;
            case "15" -> 252 * 25;
            case "30" -> 252 * 13;
            case "60" -> 252 * 7;
            case "W" -> 52;
            case "M" -> 12;
            default -> 252;
        };
    }

    private void updateSetupRanking(String setupId) {
        try {
            List<BacktestResult> results = new ArrayList<>();
            for (BacktestRun r : runRepository.findBySetupIdOrderByRequestedAtDesc(setupId)) {
                resultRepository.findByBacktestRunId(r.getId()).ifPresent(results::add);
            }
            if (results.isEmpty()) return;
            double winRate = results.stream().mapToDouble(BacktestResult::getWinRate).average().orElse(0);
            double avgRet = results.stream().mapToDouble(BacktestResult::getAvgReturnPct).average().orElse(0);
            SetupRanking ranking = rankingRepository.findBySetupId(setupId).orElseGet(() -> {
                SetupRanking sr = new SetupRanking();
                sr.setSetupId(setupId);
                return sr;
            });
            ranking.setTotalBacktestRuns(results.size());
            ranking.setAggregateWinRate(Math.round(winRate * 10) / 10.0);
            ranking.setAggregateAvgReturnPct(r2(avgRet));
            ranking.setRankScore(r2(winRate * 0.6 + avgRet * 0.4));
            ranking.setLastRankedAt(Instant.now());
            rankingRepository.save(ranking);
        } catch (Exception e) {
            log.debug("Ranking update failed for {}: {}", setupId, e.getMessage());
        }
    }

    void updateStatus(String runId, String status, int progress, String error) {
        Map<String, Object> map = new HashMap<>();
        map.put("runId", runId);
        map.put("status", status);
        map.put("progress", progress);
        if (error != null) map.put("error", error);
        cache.put("backtest:status:" + runId, map, Duration.ofDays(1));
    }
}
