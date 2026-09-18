package com.parakh.common.dto.order;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class OrderRuleDto {
    private Double stopLossPct;
    private Double stopLimitPrice;
    private Double takeProfitPct;
    private Double trailingStopPct;
    private String timeInForce;

    public OrderRuleDto() {}

    public OrderRuleDto(Double stopLossPct, Double stopLimitPrice, Double takeProfitPct, Double trailingStopPct, String timeInForce) {
        this.stopLossPct = stopLossPct;
        this.stopLimitPrice = stopLimitPrice;
        this.takeProfitPct = takeProfitPct;
        this.trailingStopPct = trailingStopPct;
        this.timeInForce = timeInForce;
    }

    public Double getStopLossPct() { return stopLossPct; }
    public void setStopLossPct(Double stopLossPct) { this.stopLossPct = stopLossPct; }

    public Double getStopLimitPrice() { return stopLimitPrice; }
    public void setStopLimitPrice(Double stopLimitPrice) { this.stopLimitPrice = stopLimitPrice; }

    public Double getTakeProfitPct() { return takeProfitPct; }
    public void setTakeProfitPct(Double takeProfitPct) { this.takeProfitPct = takeProfitPct; }

    public Double getTrailingStopPct() { return trailingStopPct; }
    public void setTrailingStopPct(Double trailingStopPct) { this.trailingStopPct = trailingStopPct; }

    public String getTimeInForce() { return timeInForce; }
    public void setTimeInForce(String timeInForce) { this.timeInForce = timeInForce; }
}
