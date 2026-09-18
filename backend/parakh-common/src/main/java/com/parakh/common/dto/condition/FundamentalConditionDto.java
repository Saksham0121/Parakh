package com.parakh.common.dto.condition;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class FundamentalConditionDto {
    private String metric;
    private String operator;
    private Double value;

    public FundamentalConditionDto() {}

    public FundamentalConditionDto(String metric, String operator, Double value) {
        this.metric = metric;
        this.operator = operator;
        this.value = value;
    }

    public String getMetric() { return metric; }
    public void setMetric(String metric) { this.metric = metric; }

    public String getOperator() { return operator; }
    public void setOperator(String operator) { this.operator = operator; }

    public Double getValue() { return value; }
    public void setValue(Double value) { this.value = value; }
}
