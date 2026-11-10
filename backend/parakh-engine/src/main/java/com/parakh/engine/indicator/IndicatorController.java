package com.parakh.engine.indicator;

import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/indicators")
public class IndicatorController {

    private final IndicatorEngineService indicatorEngineService;

    public IndicatorController(IndicatorEngineService indicatorEngineService) {
        this.indicatorEngineService = indicatorEngineService;
    }

    @GetMapping("/{symbol}")
    public Map<String, Object> snapshot(@PathVariable String symbol,
                                        @RequestParam(defaultValue = "D") String resolution) {
        return indicatorEngineService.snapshot(symbol, resolution);
    }
}
