package com.parakh.common.analysis;

import java.util.Arrays;
import java.util.Locale;
import java.util.Map;

/**
 * Allocation-light indicator maths over full candle series. Every function returns an array
 * aligned with the input, holding {@code NaN} until the indicator has enough history.
 * All computations are O(n), so a whole backtest costs a single pass per indicator.
 */
public final class IndicatorMath {
    private IndicatorMath() {}

    public static double[] sma(double[] src, int period) {
        double[] out = nanArray(src.length);
        if (period <= 0) return out;
        double sum = 0;
        for (int i = 0; i < src.length; i++) {
            sum += src[i];
            if (i >= period) sum -= src[i - period];
            if (i >= period - 1) out[i] = sum / period;
        }
        return out;
    }

    public static double[] ema(double[] src, int period) {
        double[] out = nanArray(src.length);
        if (period <= 0 || src.length < period) return out;
        double k = 2.0 / (period + 1);
        double seed = 0;
        for (int i = 0; i < period; i++) seed += src[i];
        double prev = seed / period;
        out[period - 1] = prev;
        for (int i = period; i < src.length; i++) {
            prev = src[i] * k + prev * (1 - k);
            out[i] = prev;
        }
        return out;
    }

    /** Wilder's RSI — the definition used by TradingView and most charting platforms. */
    public static double[] rsi(double[] close, int period) {
        double[] out = nanArray(close.length);
        if (period <= 0 || close.length <= period) return out;
        double gain = 0, loss = 0;
        for (int i = 1; i <= period; i++) {
            double d = close[i] - close[i - 1];
            if (d > 0) gain += d; else loss -= d;
        }
        double avgGain = gain / period, avgLoss = loss / period;
        out[period] = toRsi(avgGain, avgLoss);
        for (int i = period + 1; i < close.length; i++) {
            double d = close[i] - close[i - 1];
            avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
            avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
            out[i] = toRsi(avgGain, avgLoss);
        }
        return out;
    }

    private static double toRsi(double avgGain, double avgLoss) {
        if (avgLoss == 0) return avgGain == 0 ? 50 : 100;
        return 100 - 100 / (1 + avgGain / avgLoss);
    }

    /** Returns {macd, signal, histogram}. */
    public static double[][] macd(double[] close, int fast, int slow, int signal) {
        double[] f = ema(close, fast), s = ema(close, slow);
        double[] line = nanArray(close.length);
        int first = -1;
        for (int i = 0; i < close.length; i++) {
            if (!Double.isNaN(f[i]) && !Double.isNaN(s[i])) {
                line[i] = f[i] - s[i];
                if (first < 0) first = i;
            }
        }
        double[] sig = nanArray(close.length);
        if (first >= 0) {
            double[] tail = Arrays.copyOfRange(line, first, line.length);
            double[] tailSig = ema(tail, signal);
            System.arraycopy(tailSig, 0, sig, first, tailSig.length);
        }
        double[] hist = nanArray(close.length);
        for (int i = 0; i < close.length; i++) {
            if (!Double.isNaN(line[i]) && !Double.isNaN(sig[i])) hist[i] = line[i] - sig[i];
        }
        return new double[][]{line, sig, hist};
    }

    /** Returns {upper, middle, lower} using population standard deviation (TradingView convention). */
    public static double[][] bollinger(double[] close, int period, double mult) {
        double[] mid = sma(close, period);
        double[] up = nanArray(close.length), lo = nanArray(close.length);
        for (int i = period - 1; i < close.length; i++) {
            if (Double.isNaN(mid[i])) continue;
            double var = 0;
            for (int j = i - period + 1; j <= i; j++) var += (close[j] - mid[i]) * (close[j] - mid[i]);
            double sd = Math.sqrt(var / period);
            up[i] = mid[i] + mult * sd;
            lo[i] = mid[i] - mult * sd;
        }
        return new double[][]{up, mid, lo};
    }

    public static double[] atr(Candles c, int period) {
        int n = c.size();
        double[] tr = new double[n];
        for (int i = 0; i < n; i++) {
            double hl = c.high()[i] - c.low()[i];
            if (i == 0) { tr[i] = hl; continue; }
            double pc = c.close()[i - 1];
            tr[i] = Math.max(hl, Math.max(Math.abs(c.high()[i] - pc), Math.abs(c.low()[i] - pc)));
        }
        double[] out = nanArray(n);
        if (n < period || period <= 0) return out;
        double sum = 0;
        for (int i = 0; i < period; i++) sum += tr[i];
        double prev = sum / period;
        out[period - 1] = prev;
        for (int i = period; i < n; i++) {
            prev = (prev * (period - 1) + tr[i]) / period;
            out[i] = prev;
        }
        return out;
    }

    /** Returns {%K, %D}. */
    public static double[][] stochastic(Candles c, int kPeriod, int dPeriod) {
        int n = c.size();
        double[] k = nanArray(n);
        for (int i = kPeriod - 1; i < n; i++) {
            double hh = Double.NEGATIVE_INFINITY, ll = Double.POSITIVE_INFINITY;
            for (int j = i - kPeriod + 1; j <= i; j++) {
                hh = Math.max(hh, c.high()[j]);
                ll = Math.min(ll, c.low()[j]);
            }
            k[i] = hh == ll ? 50 : (c.close()[i] - ll) / (hh - ll) * 100;
        }
        double[] d = nanArray(n);
        for (int i = kPeriod - 1 + dPeriod - 1; i < n; i++) {
            double s = 0;
            for (int j = i - dPeriod + 1; j <= i; j++) s += k[j];
            d[i] = s / dPeriod;
        }
        return new double[][]{k, d};
    }

    /** Highest value over the {@code period} bars <em>before</em> each index (excludes the current bar). */
    public static double[] priorHighest(double[] src, int period) {
        double[] out = nanArray(src.length);
        for (int i = period; i < src.length; i++) {
            double m = Double.NEGATIVE_INFINITY;
            for (int j = i - period; j < i; j++) m = Math.max(m, src[j]);
            out[i] = m;
        }
        return out;
    }

    public static double[] priorLowest(double[] src, int period) {
        double[] out = nanArray(src.length);
        for (int i = period; i < src.length; i++) {
            double m = Double.POSITIVE_INFINITY;
            for (int j = i - period; j < i; j++) m = Math.min(m, src[j]);
            out[i] = m;
        }
        return out;
    }

    /** Average of the {@code period} bars before each index (excludes the current bar). */
    public static double[] priorAverage(double[] src, int period) {
        double[] out = nanArray(src.length);
        double sum = 0;
        for (int i = 0; i < src.length; i++) {
            if (i >= period) out[i] = sum / period;
            sum += src[i];
            if (i >= period) sum -= src[i - period];
        }
        return out;
    }

    public static double[] changePct(double[] close, int bars) {
        double[] out = nanArray(close.length);
        for (int i = bars; i < close.length; i++) {
            if (close[i - bars] != 0) out[i] = (close[i] - close[i - bars]) / close[i - bars] * 100;
        }
        return out;
    }

    public static double[] nanArray(int n) {
        double[] a = new double[n];
        Arrays.fill(a, Double.NaN);
        return a;
    }

    public static int intParam(Map<String, Object> params, String key, int fallback) {
        if (params == null) return fallback;
        Object v = params.get(key);
        if (v instanceof Number n) return Math.max(1, n.intValue());
        if (v instanceof String s) {
            try { return Math.max(1, (int) Double.parseDouble(s)); } catch (NumberFormatException ignored) {}
        }
        return fallback;
    }

    public static double doubleParam(Map<String, Object> params, String key, double fallback) {
        if (params == null) return fallback;
        Object v = params.get(key);
        if (v instanceof Number n) return n.doubleValue();
        if (v instanceof String s && !s.isBlank()) {
            try { return Double.parseDouble(s); } catch (NumberFormatException ignored) {}
        }
        return fallback;
    }

    public static String upper(String s) {
        return s == null ? "" : s.trim().toUpperCase(Locale.ROOT);
    }
}
