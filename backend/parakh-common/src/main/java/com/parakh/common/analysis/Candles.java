package com.parakh.common.analysis;

import java.util.List;
import java.util.Map;

/**
 * Immutable, column-oriented OHLCV series. Arrays keep indicator maths cache friendly
 * (no boxing), which matters when the scanner evaluates hundreds of symbols per pass.
 */
public record Candles(long[] time, double[] open, double[] high, double[] low, double[] close, double[] volume) {

    public int size() {
        return time.length;
    }

    public boolean isEmpty() {
        return time.length == 0;
    }

    /** Builds a series from the {t,o,h,l,c,v} map shape returned by the market data client. */
    @SuppressWarnings("unchecked")
    public static Candles fromMap(Map<String, Object> data) {
        if (data == null || !(data.get("t") instanceof List<?> t) || t.isEmpty()) {
            return new Candles(new long[0], new double[0], new double[0], new double[0], new double[0], new double[0]);
        }
        List<Object> o = (List<Object>) data.get("o");
        List<Object> h = (List<Object>) data.get("h");
        List<Object> l = (List<Object>) data.get("l");
        List<Object> c = (List<Object>) data.get("c");
        List<Object> v = (List<Object>) data.get("v");
        int n = t.size();
        long[] time = new long[n];
        double[] open = new double[n], high = new double[n], low = new double[n], close = new double[n], vol = new double[n];
        for (int i = 0; i < n; i++) {
            time[i] = ((Number) t.get(i)).longValue();
            open[i] = num(o, i);
            high[i] = num(h, i);
            low[i] = num(l, i);
            close[i] = num(c, i);
            vol[i] = v != null ? num(v, i) : 0;
        }
        return new Candles(time, open, high, low, close, vol);
    }

    private static double num(List<Object> list, int i) {
        Object val = list != null && i < list.size() ? list.get(i) : null;
        return val instanceof Number n ? n.doubleValue() : Double.NaN;
    }
}
