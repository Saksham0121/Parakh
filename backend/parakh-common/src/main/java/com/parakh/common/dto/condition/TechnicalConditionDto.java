package com.parakh.common.dto.condition;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.Map;

/**
 * One technical rule of a setup.
 *
 * <ul>
 *   <li>{@code indicator}: PRICE, SMA, EMA, RSI, MACD, MACD_SIGNAL, MACD_HIST, BB_UPPER, BB_MIDDLE, BB_LOWER,
 *       ATR, STOCH_K, STOCH_D, VOLUME, CHANGE_PCT, or a pattern: BREAKOUT, BREAKDOWN, VOLUME_SPIKE.</li>
 *   <li>{@code operator}: gt, lt, gte, lte, crosses_above, crosses_below (ignored for patterns).</li>
 *   <li>{@code compareTo}: "value" compares with {@code value}; "indicator" compares with
 *       {@code compareIndicator}/{@code compareParams} — e.g. SMA(20) crosses_above SMA(50).</li>
 *   <li>{@code logic}: AND/OR joining this rule with the result of the rules before it.</li>
 * </ul>
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class TechnicalConditionDto {
    private String indicator;
    private Map<String, Object> params;
    private String operator;
    private String comparator;
    private Object value;
    private Double threshold;
    private String logic;
    private String compareTo;
    private String compareIndicator;
    private Map<String, Object> compareParams;

    public TechnicalConditionDto() {}

    public TechnicalConditionDto(String indicator, Map<String, Object> params, String operator, Object value, Double threshold, String logic) {
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

    /** Normalised operator id; accepts legacy spellings such as LESS_THAN, CROSSES_ABOVE, ">" or "is above". */
    public String getOperator() {
        String raw = operator != null ? operator : (comparator != null ? comparator : "gt");
        return switch (raw.trim().toLowerCase().replace(' ', '_')) {
            case "greater_than", "above", "is_above", ">", "gt" -> "gt";
            case "less_than", "below", "is_below", "<", "lt" -> "lt";
            case "greater_equal", "greater_than_or_equal", ">=", "gte" -> "gte";
            case "less_equal", "less_than_or_equal", "<=", "lte" -> "lte";
            case "equals", "equal", "=", "==", "eq" -> "eq";
            case "crosses_above", "cross_above" -> "crosses_above";
            case "crosses_below", "cross_below" -> "crosses_below";
            default -> raw.trim().toLowerCase();
        };
    }
    public void setOperator(String operator) { this.operator = operator; }

    public String getComparator() { return comparator; }
    public void setComparator(String comparator) {
        this.comparator = comparator;
        if (this.operator == null) this.operator = comparator;
    }

    public Object getValue() { return value; }
    public void setValue(Object value) { this.value = value; }

    @JsonIgnore
    public Double getNumericTarget(double fallback) {
        if (value instanceof Number n) return n.doubleValue();
        if (value instanceof String s && !s.isBlank()) {
            try { return Double.parseDouble(s); } catch (NumberFormatException ignored) {}
        }
        if (threshold != null) return threshold;
        return fallback;
    }

    public Double getThreshold() { return threshold; }
    public void setThreshold(Double threshold) { this.threshold = threshold; }

    public String getLogic() { return logic; }
    public void setLogic(String logic) { this.logic = logic; }

    /** Legacy rows stored the right-hand indicator inside {@code value}: {"indicator":"EMA","params":{...}}. */
    public String getCompareTo() {
        if (compareTo == null && value instanceof Map<?, ?> m && m.get("indicator") != null) return "indicator";
        return compareTo;
    }
    public void setCompareTo(String compareTo) { this.compareTo = compareTo; }

    public String getCompareIndicator() {
        if (compareIndicator == null && value instanceof Map<?, ?> m && m.get("indicator") != null) return String.valueOf(m.get("indicator"));
        return compareIndicator;
    }
    public void setCompareIndicator(String compareIndicator) { this.compareIndicator = compareIndicator; }

    @SuppressWarnings("unchecked")
    public Map<String, Object> getCompareParams() {
        if (compareParams == null && value instanceof Map<?, ?> m && m.get("params") instanceof Map<?, ?> p) return (Map<String, Object>) p;
        return compareParams;
    }
    public void setCompareParams(Map<String, Object> compareParams) { this.compareParams = compareParams; }
}
