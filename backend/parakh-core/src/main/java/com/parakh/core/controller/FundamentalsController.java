package com.parakh.core.controller;

import com.parakh.common.domain.CompanyFundamentals;
import com.parakh.core.service.FundamentalsService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/fundamentals")
public class FundamentalsController {

    private final FundamentalsService fundamentalsService;

    public FundamentalsController(FundamentalsService fundamentalsService) {
        this.fundamentalsService = fundamentalsService;
    }

    @GetMapping("/{symbol}")
    public CompanyFundamentals getFundamentals(@PathVariable String symbol) {
        return fundamentalsService.getFundamentals(symbol);
    }
}
