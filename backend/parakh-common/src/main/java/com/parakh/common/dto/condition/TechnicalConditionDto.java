package com.parakh.common.dto.condition;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.Map;

@JsonIgnoreProperties(ignoreUnknown = true)
public class TechnicalConditionDto {
    private String indicator;
    private Map<String, Object> params;
    private String operator;
    private Double value;
    private Double threshold;
    private String logic;

    public TechnicalConditionDto() {}

    public TechnicalConditionDto(String indicator, Map<String, Object> params, String operator, Double value, Double threshold, String logic) {
        this.indicator = indicator;
        this.params = params;
        this.operator = operator;
        this.value = value;
        this.threshold = threshold;
        this.logic = logic;
    }

    public String getIndicator() { return indicator; }
    public void setIndicator(String indicator) { this.indicator = indicator; }

    public Map<String, Object> getParams() { return params; }
    public void setParams(Map<String, Object> params) { this.params = params; }

    public String getOperator() { return operator; }
    public void setOperator(String operator) { this.operator = operator; }

    public Double getValue() { return value; }
    public void setValue(Double value) { this.value = value; }

    public Double getThreshold() { return threshold; }
    public void setThreshold(Double threshold) { this.threshold = threshold; }

    public String getLogic() { return logic; }
    public void setLogic(String logic) { this.logic = logic; }
}
