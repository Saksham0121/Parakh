package com.parakh.common.analysis;

import com.parakh.common.dto.condition.FundamentalConditionDto;
import com.parakh.common.dto.condition.TechnicalConditionDto;
import com.parakh.common.matcher.ConditionMatcher;

import java.util.*;

import static com.parakh.common.analysis.IndicatorMath.*;

/**
 * Single source of truth for "does this stock have my setup?". The live scanner, the
 * on-chart setup check and the backtester all evaluate through this class, so a setup that
 * shows a match in the scanner behaves identically in a backtest.
 *
 * <p>An evaluator is bound to one candle series and memoises every indicator series it computes,
 * so evaluating every bar of a backtest stays O(bars × conditions).</p>
 */
public final class SetupEvaluator {

    public static final Set<String> PATTERNS = Set.of("BREAKOUT", "BREAKDOWN", "VOLUME_SPIKE");

    private final Candles candles;
    private final Map<String, double[]> cache = new HashMap<>();

    public SetupEvaluator(Candles candles) {
        this.candles = candles;
    }

    public Candles candles() {
        return candles;
    }

    // ─── Results ────────────────────────────────────────────────────────────────

    public record ConditionResult(String label, boolean passed, Double actual, Double target, String detail) {}

    public record TechnicalResult(boolean passed, List<ConditionResult> conditions) {}

    public record FundamentalResult(boolean passed, boolean dataAvailable, List<ConditionResult> conditions) {}

    // ─── Technical ──────────────────────────────────────────────────────────────

    /** Evaluates every condition at bar {@code i}; rules are combined left-to-right by their AND/OR logic. */
    public TechnicalResult evaluate(List<TechnicalConditionDto> conditions, int i) {
        List<ConditionResult> results = new ArrayList<>();
        if (conditions == null || conditions.isEmpty() || i < 0 || i >= candles.size()) {
            return new TechnicalResult(false, results);
        }
        Boolean combined = null;
        for (TechnicalConditionDto cond : conditions) {
            ConditionResult r = evaluateOne(cond, i);
            results.add(r);
            if (combined == null) combined = r.passed();
            else if ("OR".equalsIgnoreCase(cond.getLogic())) combined = combined || r.passed();
            else combined = combined && r.passed();
        }
        return new TechnicalResult(Boolean.TRUE.equals(combined), results);
    }

    /** Fast path for backtests: same semantics as {@link #evaluate} without building result objects. */
    public boolean matches(List<TechnicalConditionDto> conditions, int i) {
        if (conditions == null || conditions.isEmpty() || i < 0 || i >= candles.size()) return false;
        Boolean combined = null;
        for (TechnicalConditionDto cond : conditions) {
            boolean p = evaluateOne(cond, i).passed();
            if (combined == null) combined = p;
            else if ("OR".equalsIgnoreCase(cond.getLogic())) combined = combined || p;
            else combined = combined && p;
        }
        return Boolean.TRUE.equals(combined);
    }

    public ConditionResult evaluateOne(TechnicalConditionDto cond, int i) {
        String ind = canonical(cond.getIndicator());
        Map<String, Object> params = cond.getParams();
        if (PATTERNS.contains(ind)) return evaluatePattern(ind, params, i);

        double[] left = series(ind, params);
        String op = cond.getOperator() == null ? "gt" : cond.getOperator().toLowerCase(Locale.ROOT).trim();
        boolean vsIndicator = "indicator".equalsIgnoreCase(cond.getCompareTo())
                && cond.getCompareIndicator() != null && !cond.getCompareIndicator().isBlank();
        double[] right = vsIndicator ? series(canonical(cond.getCompareIndicator()), cond.getCompareParams()) : null;
        double target = vsIndicator ? right[i] : cond.getNumericTarget(0.0);
        double cur = left[i];
        String rhsLabel = vsIndicator ? label(canonical(cond.getCompareIndicator()), cond.getCompareParams()) : fmt(target);
        String lbl = label(ind, params) + " " + opLabel(op) + " " + rhsLabel;

        if (Double.isNaN(cur) || Double.isNaN(target)) {
            return new ConditionResult(lbl, false, nullable(cur), nullable(target), "Not enough history");
        }
        boolean passed;
        if (op.startsWith("crosses")) {
            if (i == 0) return new ConditionResult(lbl, false, cur, target, "Needs a previous bar");
            double prev = left[i - 1];
            double prevTarget = vsIndicator ? right[i - 1] : target;
            if (Double.isNaN(prev) || Double.isNaN(prevTarget)) {
                return new ConditionResult(lbl, false, cur, target, "Not enough history");
            }
            passed = op.equals("crosses_above")
                    ? prev <= prevTarget && cur > target
                    : prev >= prevTarget && cur < target;
        } else {
            passed = ConditionMatcher.evaluate(op, cur, target);
        }
        return new ConditionResult(lbl, passed, round(cur), round(target), null);
    }

    private ConditionResult evaluatePattern(String ind, Map<String, Object> params, int i) {
        int lookback = intParam(params, "lookback", intParam(params, "lookback_period", 20));
        double volMult = doubleParam(params, "volumeMultiplier", doubleParam(params, "volume_multiplier", 0));
        double close = candles.close()[i];
        double vol = candles.volume()[i];
        double avgVol = series("AVG_VOLUME", Map.of("period", lookback))[i];
        boolean volOk = volMult <= 0 || (!Double.isNaN(avgVol) && avgVol > 0 && vol >= volMult * avgVol);
        String volNote = volMult > 0 && !Double.isNaN(avgVol) && avgVol > 0
                ? String.format(Locale.ROOT, "volume %.1fx avg (need %.1fx)", vol / avgVol, volMult) : null;

        switch (ind) {
            case "BREAKOUT" -> {
                double level = series("PRIOR_HIGH", Map.of("period", lookback))[i];
                String lbl = "Breakout above " + lookback + "-bar high" + (volMult > 0 ? " on " + fmt(volMult) + "x volume" : "");
                if (Double.isNaN(level)) return new ConditionResult(lbl, false, close, null, "Not enough history");
                boolean passed = close > level && volOk;
                return new ConditionResult(lbl, passed, round(close), round(level), volNote);
            }
            case "BREAKDOWN" -> {
                double level = series("PRIOR_LOW", Map.of("period", lookback))[i];
                String lbl = "Breakdown below " + lookback + "-bar low" + (volMult > 0 ? " on " + fmt(volMult) + "x volume" : "");
                if (Double.isNaN(level)) return new ConditionResult(lbl, false, close, null, "Not enough history");
                boolean passed = close < level && volOk;
                return new ConditionResult(lbl, passed, round(close), round(level), volNote);
            }
            default -> { // VOLUME_SPIKE
                double mult = volMult > 0 ? volMult : 2.0;
                String lbl = "Volume ≥ " + fmt(mult) + "x " + lookback + "-bar average";
                if (Double.isNaN(avgVol) || avgVol <= 0) return new ConditionResult(lbl, false, vol, null, "Not enough history");
                return new ConditionResult(lbl, vol >= mult * avgVol, round(vol), round(mult * avgVol),
                        String.format(Locale.ROOT, "%.1fx average", vol / avgVol));
            }
        }
    }

    // ─── Indicator series ───────────────────────────────────────────────────────

    /** Returns the memoised series for an indicator, computing it on first use. */
    public double[] series(String indicator, Map<String, Object> params) {
        String ind = canonical(indicator);
        String key = ind + ":" + (params == null ? "" : new TreeMap<>(params));
        double[] cached = cache.get(key);
        if (cached != null) return cached;
        double[] s = compute(ind, params);
        cache.put(key, s);
        return s;
    }

    private double[] compute(String ind, Map<String, Object> p) {
        double[] close = candles.close();
        return switch (ind) {
            case "PRICE", "CLOSE" -> close;
            case "OPEN" -> candles.open();
            case "HIGH" -> candles.high();
            case "LOW" -> candles.low();
            case "VOLUME" -> candles.volume();
            case "SMA" -> sma(close, intParam(p, "period", 20));
            case "EMA" -> ema(close, intParam(p, "period", 20));
            case "RSI" -> rsi(close, intParam(p, "period", 14));
            case "MACD" -> macd(close, intParam(p, "fastPeriod", 12), intParam(p, "slowPeriod", 26), intParam(p, "signalPeriod", 9))[0];
            case "MACD_SIGNAL" -> macd(close, intParam(p, "fastPeriod", 12), intParam(p, "slowPeriod", 26), intParam(p, "signalPeriod", 9))[1];
            case "MACD_HIST" -> macd(close, intParam(p, "fastPeriod", 12), intParam(p, "slowPeriod", 26), intParam(p, "signalPeriod", 9))[2];
            case "BB_UPPER" -> bollinger(close, intParam(p, "period", 20), doubleParam(p, "stdDev", 2))[0];
            case "BB_MIDDLE" -> bollinger(close, intParam(p, "period", 20), doubleParam(p, "stdDev", 2))[1];
            case "BB_LOWER" -> bollinger(close, intParam(p, "period", 20), doubleParam(p, "stdDev", 2))[2];
            case "ATR" -> atr(candles, intParam(p, "period", 14));
            case "STOCH_K" -> stochastic(candles, intParam(p, "period", 14), intParam(p, "smooth", 3))[0];
            case "STOCH_D" -> stochastic(candles, intParam(p, "period", 14), intParam(p, "smooth", 3))[1];
            case "VOLUME_SMA" -> sma(candles.volume(), intParam(p, "period", 20));
            case "AVG_VOLUME" -> priorAverage(candles.volume(), intParam(p, "period", 20));
            case "PRIOR_HIGH" -> priorHighest(candles.high(), intParam(p, "period", 20));
            case "PRIOR_LOW" -> priorLowest(candles.low(), intParam(p, "period", 20));
            case "CHANGE_PCT" -> changePct(close, intParam(p, "period", 1));
            default -> throw new IllegalArgumentException("Unsupported indicator: " + ind);
        };
    }

    private static final Set<String> SERIES = Set.of("PRICE", "CLOSE", "OPEN", "HIGH", "LOW", "VOLUME", "SMA", "EMA", "RSI",
            "MACD", "MACD_SIGNAL", "MACD_HIST", "BB_UPPER", "BB_MIDDLE", "BB_LOWER", "ATR", "STOCH_K", "STOCH_D",
            "VOLUME_SMA", "CHANGE_PCT");

    /** Rejects setups that reference unknown indicators, so a typo fails on save rather than silently never matching. */
    public static void validate(List<TechnicalConditionDto> conditions) {
        if (conditions == null) return;
        for (TechnicalConditionDto c : conditions) {
            String ind = canonical(c.getIndicator());
            if (!SERIES.contains(ind) && !PATTERNS.contains(ind)) {
                throw new IllegalArgumentException("Unsupported indicator: " + c.getIndicator());
            }
            if ("indicator".equalsIgnoreCase(c.getCompareTo()) && !SERIES.contains(canonical(c.getCompareIndicator()))) {
                throw new IllegalArgumentException("Unsupported comparison indicator: " + c.getCompareIndicator());
            }
        }
    }

    /** Maps legacy and display names onto canonical indicator ids. */
    public static String canonical(String raw) {
        String s = upper(raw);
        return switch (s) {
            case "BOLLINGER_BANDS", "BB", "BOLL" -> "BB_MIDDLE";
            case "MA" -> "SMA";
            case "STOCHASTIC", "STOCH", "KDJ" -> "STOCH_K";
            case "VOL" -> "VOLUME";
            case "" -> "PRICE";
            default -> s;
        };
    }

    public static String label(String ind, Map<String, Object> p) {
        return switch (ind) {
            case "PRICE", "CLOSE" -> "Close";
            case "VOLUME" -> "Volume";
            case "SMA", "EMA", "RSI", "ATR", "VOLUME_SMA" -> ind.replace("_", " ") + "(" + intParam(p, "period", ind.equals("RSI") || ind.equals("ATR") ? 14 : 20) + ")";
            case "MACD" -> "MACD";
            case "MACD_SIGNAL" -> "MACD signal";
            case "MACD_HIST" -> "MACD histogram";
            case "BB_UPPER" -> "Upper Bollinger";
            case "BB_MIDDLE" -> "Middle Bollinger";
            case "BB_LOWER" -> "Lower Bollinger";
            case "STOCH_K" -> "Stoch %K";
            case "STOCH_D" -> "Stoch %D";
            case "CHANGE_PCT" -> "Change % (" + intParam(p, "period", 1) + " bars)";
            default -> ind;
        };
    }

    private static String opLabel(String op) {
        return switch (op) {
            case "gt", ">" -> ">";
            case "lt", "<" -> "<";
            case "gte", ">=" -> "≥";
            case "lte", "<=" -> "≤";
            case "crosses_above" -> "crosses above";
            case "crosses_below" -> "crosses below";
            case "eq" -> "=";
            default -> op;
        };
    }

    // ─── Fundamentals ───────────────────────────────────────────────────────────

    /**
     * Checks fundamental rules against a snapshot keyed by canonical metric (see {@link #canonicalMetric}).
     * A rule whose metric is missing for this company fails, so a "P/E below 25" filter never silently passes.
     */
    public static FundamentalResult evaluateFundamentals(List<FundamentalConditionDto> conditions, Map<String, Double> fundamentals) {
        List<ConditionResult> results = new ArrayList<>();
        if (conditions == null || conditions.isEmpty()) return new FundamentalResult(true, true, results);
        boolean available = fundamentals != null && !fundamentals.isEmpty();
        boolean all = true;
        for (FundamentalConditionDto c : conditions) {
            String metric = canonicalMetric(c.getMetric());
            String op = c.getOperator() == null ? "lt" : c.getOperator();
            String lbl = metricLabel(metric) + " " + opLabel(op.toLowerCase(Locale.ROOT)) + " " + fmt(c.getValue() == null ? 0 : c.getValue());
            Double val = available ? fundamentals.get(metric) : null;
            if (val == null || c.getValue() == null || val.isNaN()) {
                results.add(new ConditionResult(lbl, false, null, c.getValue(), "Not reported for this company"));
                all = false;
                continue;
            }
            boolean ok = ConditionMatcher.evaluate(op, val, c.getValue());
            results.add(new ConditionResult(lbl, ok, round(val), c.getValue(), null));
            all &= ok;
        }
        return new FundamentalResult(all, available, results);
    }

    public static String canonicalMetric(String raw) {
        if (raw == null) return "";
        String s = raw.replaceAll("([a-z])([A-Z])", "$1_$2").toLowerCase(Locale.ROOT).replace("/", "_").replace(" ", "_");
        return switch (s) {
            case "pe", "p_e", "pe_ratio", "trailing_pe" -> "pe_ratio";
            case "forward_pe", "forward_pe_ratio" -> "forward_pe";
            case "pb", "pb_ratio", "price_to_book" -> "pb_ratio";
            case "peg", "peg_ratio" -> "peg_ratio";
            case "de", "debt_equity", "debt_to_equity" -> "debt_to_equity";
            case "market_cap", "marketcap" -> "market_cap_cr";
            default -> s;
        };
    }

    public static String metricLabel(String metric) {
        return switch (metric) {
            case "pe_ratio" -> "P/E";
            case "forward_pe" -> "Forward P/E";
            case "pb_ratio" -> "P/B";
            case "peg_ratio" -> "PEG";
            case "eps" -> "EPS";
            case "roe" -> "ROE %";
            case "roa" -> "ROA %";
            case "debt_to_equity" -> "Debt/Equity";
            case "market_cap_cr" -> "Market cap (Cr)";
            case "market_cap_bn" -> "Market cap (Bn)";
            case "dividend_yield" -> "Dividend yield %";
            case "profit_margin" -> "Profit margin %";
            case "revenue_growth" -> "Revenue growth %";
            case "earnings_growth" -> "Earnings growth %";
            case "current_ratio" -> "Current ratio";
            case "beta" -> "Beta";
            case "avg_volume" -> "Avg volume";
            case "pct_from_52w_high" -> "% below 52W high";
            default -> metric;
        };
    }

    // ─── Helpers ────────────────────────────────────────────────────────────────

    private static Double nullable(double v) {
        return Double.isNaN(v) ? null : round(v);
    }

    public static double round(double v) {
        if (Double.isNaN(v) || Double.isInfinite(v)) return v;
        double abs = Math.abs(v);
        double scale = abs >= 1000 ? 1 : abs >= 1 ? 100 : 10000;
        return Math.round(v * scale) / scale;
    }

    private static String fmt(double v) {
        if (v == Math.rint(v) && Math.abs(v) < 1e15) return String.valueOf((long) v);
        return String.format(Locale.ROOT, "%.2f", v);
    }
}
