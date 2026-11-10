package com.parakh.common.dto.order;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * Trade-management rules used when a setup is backtested. Parakh is an analysis tool: these rules
 * describe how a hypothetical trade is managed in simulation; nothing is ever sent to a broker.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class OrderRuleDto {
    /** LONG or SHORT. */
    private String side;
    private Double stopLossPct;
    private Double stopLimitPrice;
    private Double takeProfitPct;
    private Double trailingStopPct;
    /** Close the simulated trade after this many bars if no other exit hit. */
    private Integer maxHoldBars;
    private String timeInForce;

    public OrderRuleDto() {}

    public OrderRuleDto(Double stopLossPct, Double stopLimitPrice, Double takeProfitPct, Double trailingStopPct, String timeInForce) {
        this.stopLossPct = stopLossPct;
        this.stopLimitPrice = stopLimitPrice;
        this.takeProfitPct = takeProfitPct;
        this.trailingStopPct = trailingStopPct;
        this.timeInForce = timeInForce;
    }

    public String getSide() { return side == null || side.isBlank() ? "LONG" : side.toUpperCase(); }
    public void setSide(String side) { this.side = side; }

    public Double getStopLossPct() { return stopLossPct; }
    public void setStopLossPct(Double stopLossPct) { this.stopLossPct = stopLossPct; }

    public Double getStopLimitPrice() { return stopLimitPrice; }
    public void setStopLimitPrice(Double stopLimitPrice) { this.stopLimitPrice = stopLimitPrice; }

    public Double getTakeProfitPct() { return takeProfitPct; }
    public void setTakeProfitPct(Double takeProfitPct) { this.takeProfitPct = takeProfitPct; }

    public Double getTrailingStopPct() { return trailingStopPct; }
    public void setTrailingStopPct(Double trailingStopPct) { this.trailingStopPct = trailingStopPct; }

    public Integer getMaxHoldBars() { return maxHoldBars; }
    public void setMaxHoldBars(Integer maxHoldBars) { this.maxHoldBars = maxHoldBars; }

    public String getTimeInForce() { return timeInForce; }
    public void setTimeInForce(String timeInForce) { this.timeInForce = timeInForce; }
}
