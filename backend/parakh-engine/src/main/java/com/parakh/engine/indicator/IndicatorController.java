package com.parakh.engine.indicator;

import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/indicators")
public class IndicatorController {

    private final IndicatorEngineService indicatorEngineService;

    public IndicatorController(IndicatorEngineService indicatorEngineService) {
        this.indicatorEngineService = indicatorEngineService;
    }

    @GetMapping("/{symbol}")
    public Map<String, Object> getAllIndicators(@PathVariable String symbol) {
        return indicatorEngineService.getAllIndicators(symbol);
    }

    @GetMapping("/{symbol}/{type}")
    public Map<String, Object> getIndicator(
            @PathVariable String symbol,
            @PathVariable String type,
            @RequestParam(required = false) Integer period) {
        Map<String, Object> params = new HashMap<>();
        if (period != null) params.put("period", period);
        return indicatorEngineService.getLatestIndicator(symbol, type, params);
    }
}
