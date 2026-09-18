package com.parakh.common.matcher;

import com.parakh.common.constants.Operators;
import com.parakh.common.dto.condition.FundamentalConditionDto;

import java.util.List;
import java.util.Map;

/**
 * Single source of truth for condition evaluation across live alerts and backtesting.
 */
public final class ConditionMatcher {
    private ConditionMatcher() {}

    public static boolean evaluate(String operator, double currentValue, double targetValue) {
        if (operator == null) return false;
        return switch (operator.toLowerCase().trim()) {
            case Operators.GREATER_THAN, ">", "is above" -> currentValue > targetValue;
            case Operators.LESS_THAN, "<", "is below" -> currentValue < targetValue;
            case Operators.GREATER_EQUAL, ">=" -> currentValue >= targetValue;
            case Operators.LESS_EQUAL, "<=" -> currentValue <= targetValue;
            case Operators.EQUALS, "=", "==", "equals" -> Math.abs(currentValue - targetValue) < 0.0001;
            default -> false;
        };
    }

    public static boolean evaluateCrossing(String operator, double currentValue, Double previousValue, double targetValue) {
        if (previousValue == null) {
            return evaluate(operator, currentValue, targetValue);
        }
        if (operator == null) return false;
        return switch (operator.toLowerCase().trim()) {
            case Operators.CROSSES_ABOVE, "crosses above" -> previousValue <= targetValue && currentValue > targetValue;
            case Operators.CROSSES_BELOW, "crosses below" -> previousValue >= targetValue && currentValue < targetValue;
            default -> evaluate(operator, currentValue, targetValue);
        };
    }

    public static boolean evaluateFundamentalConditions(List<FundamentalConditionDto> conditions, Map<String, Double> fundamentals) {
        if (conditions == null || conditions.isEmpty()) return true;
        if (fundamentals == null || fundamentals.isEmpty()) return false;

        for (FundamentalConditionDto condition : conditions) {
            Double val = fundamentals.get(condition.getMetric());
            if (val == null || condition.getValue() == null) {
                return false;
            }
            if (!evaluate(condition.getOperator(), val, condition.getValue())) {
                return false;
            }
        }
        return true;
    }
}
