package com.parakh.engine.indicator;

import com.parakh.common.analysis.Candles;
import com.parakh.common.analysis.SetupEvaluator;
import com.parakh.engine.market.MarketService;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Latest indicator readings computed from real candles (not from 5-second price ticks, which made
 * "SMA(20)" mean "average of the last 100 seconds"). Values match what the chart and the scanner use.
 */
@Service
public class IndicatorEngineService {

    private final MarketService marketService;

    public IndicatorEngineService(MarketService marketService) {
        this.marketService = marketService;
    }

    public Map<String, Object> snapshot(String symbol, String resolution) {
        Candles candles = marketService.getCandleSeries(symbol, resolution);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("symbol", symbol.toUpperCase());
        out.put("resolution", resolution);
        if (candles.isEmpty()) {
            out.put("available", false);
            return out;
        }
        SetupEvaluator ev = new SetupEvaluator(candles);
        int i = candles.size() - 1;
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("close", last(ev, "PRICE", Map.of(), i));
        values.put("sma20", last(ev, "SMA", Map.of("period", 20), i));
        values.put("sma50", last(ev, "SMA", Map.of("period", 50), i));
        values.put("sma200", last(ev, "SMA", Map.of("period", 200), i));
        values.put("ema20", last(ev, "EMA", Map.of("period", 20), i));
        values.put("rsi14", last(ev, "RSI", Map.of("period", 14), i));
        values.put("macd", last(ev, "MACD", Map.of(), i));
        values.put("macdSignal", last(ev, "MACD_SIGNAL", Map.of(), i));
        values.put("bbUpper", last(ev, "BB_UPPER", Map.of(), i));
        values.put("bbLower", last(ev, "BB_LOWER", Map.of(), i));
        values.put("atr14", last(ev, "ATR", Map.of("period", 14), i));
        values.put("volume", last(ev, "VOLUME", Map.of(), i));
        values.put("avgVolume20", last(ev, "AVG_VOLUME", Map.of("period", 20), i));
        values.put("high20", last(ev, "PRIOR_HIGH", Map.of("period", 20), i));
        values.put("low20", last(ev, "PRIOR_LOW", Map.of("period", 20), i));
        values.values().removeIf(v -> v == null);
        out.put("available", true);
        out.put("barTime", candles.time()[i]);
        out.put("values", values);
        return out;
    }

    private static Double last(SetupEvaluator ev, String ind, Map<String, Object> p, int i) {
        double v = ev.series(ind, p)[i];
        return Double.isNaN(v) ? null : SetupEvaluator.round(v);
    }
}
