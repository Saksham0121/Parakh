package com.parakh.engine.scanner;

import com.parakh.common.analysis.Candles;
import com.parakh.common.analysis.SetupEvaluator;
import com.parakh.common.analysis.SetupEvaluator.FundamentalResult;
import com.parakh.common.analysis.SetupEvaluator.TechnicalResult;
import com.parakh.common.constants.FundamentalModes;
import com.parakh.common.dto.condition.FundamentalConditionDto;
import com.parakh.common.dto.condition.TechnicalConditionDto;
import com.parakh.engine.market.MarketService;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.*;

/**
 * Evaluates a setup against many symbols in parallel. Candles and fundamentals come from the shared
 * market cache, so scanning the same universe for several setups costs one upstream fetch per symbol.
 */
@Service
public class ScannerService {

    public static final int MAX_SYMBOLS = 200;

    private final MarketService market;
    private final ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor();

    public ScannerService(MarketService market) {
        this.market = market;
    }

    public record SetupSpec(List<TechnicalConditionDto> technical,
                            List<FundamentalConditionDto> fundamental,
                            String fundamentalMode,
                            String timeframe) {

        public boolean fundamentalsRequired() {
            // Unless explicitly marked display-only, fundamentals gate the signal: "breakout AND sane valuation".
            return !FundamentalModes.DISPLAY_ONLY.equalsIgnoreCase(fundamentalMode);
        }

        public boolean hasFundamentals() {
            return fundamental != null && !fundamental.isEmpty();
        }
    }

    public record SymbolResult(String symbol, boolean matched, boolean technicalPassed, boolean fundamentalsPassed,
                               boolean fundamentalsChecked, Double close, Double changePct, Long barTime,
                               List<SetupEvaluator.ConditionResult> technical,
                               List<SetupEvaluator.ConditionResult> fundamental,
                               String error) {}

    /**
     * @param fetchAllFundamentals when false, fundamentals are only fetched for symbols whose technicals passed
     *                             (keeps large scans cheap); when true they're shown for every row.
     */
    public SymbolResult evaluate(String symbol, SetupSpec spec, boolean fetchAllFundamentals) {
        String sym = symbol.trim().toUpperCase();
        Candles candles = market.getCandleSeries(sym, spec.timeframe());
        if (candles.size() < 2) {
            return new SymbolResult(sym, false, false, false, false, null, null, null, List.of(), List.of(),
                    market.isUpstreamRateLimited() ? "Data provider is rate limiting; retrying shortly" : "No price data");
        }
        SetupEvaluator ev = new SetupEvaluator(candles);
        int i = candles.size() - 1;
        TechnicalResult tech = ev.evaluate(spec.technical(), i);

        FundamentalResult fund = null;
        if (spec.hasFundamentals() && (tech.passed() || fetchAllFundamentals)) {
            fund = SetupEvaluator.evaluateFundamentals(spec.fundamental(), market.getFundamentalMetrics(sym));
        }
        boolean fundOk = !spec.hasFundamentals() || (fund != null && fund.passed());
        boolean matched = tech.passed() && (fundOk || !spec.fundamentalsRequired());

        double close = candles.close()[i];
        double prev = candles.close()[i - 1];
        Double change = prev != 0 ? SetupEvaluator.round((close - prev) / prev * 100) : null;
        return new SymbolResult(sym, matched, tech.passed(), fundOk, fund != null, SetupEvaluator.round(close), change,
                candles.time()[i], tech.conditions(), fund != null ? fund.conditions() : List.of(), null);
    }

    public List<SymbolResult> scan(Collection<String> symbols, SetupSpec spec) {
        List<String> unique = symbols.stream().filter(Objects::nonNull).map(s -> s.trim().toUpperCase())
                .filter(s -> !s.isEmpty()).distinct().limit(MAX_SYMBOLS).toList();
        boolean showAllFundamentals = unique.size() <= 30;
        Map<String, Future<SymbolResult>> futures = new LinkedHashMap<>();
        for (String s : unique) futures.put(s, pool.submit(() -> evaluate(s, spec, showAllFundamentals)));

        List<SymbolResult> out = new ArrayList<>();
        futures.forEach((sym, f) -> {
            try {
                out.add(f.get(45, TimeUnit.SECONDS));
            } catch (Exception e) {
                f.cancel(true);
                out.add(new SymbolResult(sym, false, false, false, false, null, null, null, List.of(), List.of(), "Timed out"));
            }
        });
        out.sort(Comparator.comparing((SymbolResult r) -> !r.matched())
                .thenComparing(r -> !r.technicalPassed())
                .thenComparing(r -> r.error() != null)
                .thenComparing(SymbolResult::symbol));
        return out;
    }
}
