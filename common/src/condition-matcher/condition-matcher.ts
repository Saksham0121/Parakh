import { OPERATORS } from '../constants';
import type { TechnicalConditionDto, FundamentalConditionDto } from '../dto';

/**
 * Evaluate a single condition against a current value.
 * Used by both live alert evaluation and backtesting — this is the single
 * source of truth for condition matching, so backtested results reflect
 * exactly how the setup behaves live.
 */
export function evaluateCondition(operator: string, currentValue: number, targetValue: number): boolean {
  switch (operator) {
    case OPERATORS.GREATER_THAN:
      return currentValue > targetValue;
    case OPERATORS.LESS_THAN:
      return currentValue < targetValue;
    case OPERATORS.GREATER_EQUAL:
      return currentValue >= targetValue;
    case OPERATORS.LESS_EQUAL:
      return currentValue <= targetValue;
    case OPERATORS.EQUALS:
      return Math.abs(currentValue - targetValue) < 0.0001; // float tolerance
    default:
      return false;
  }
}

/**
 * Evaluate a crossing condition (crosses_above / crosses_below).
 * Requires both current and previous values.
 */
export function evaluateCrossingCondition(
  operator: string,
  currentValue: number,
  previousValue: number,
  targetValue: number,
): boolean {
  switch (operator) {
    case OPERATORS.CROSSES_ABOVE:
      return previousValue <= targetValue && currentValue > targetValue;
    case OPERATORS.CROSSES_BELOW:
      return previousValue >= targetValue && currentValue < targetValue;
    default:
      return evaluateCondition(operator, currentValue, targetValue);
  }
}

/**
 * Check if all technical conditions in a setup are satisfied.
 * Returns true only if every condition passes (AND logic).
 */
export function evaluateTechnicalConditions(
  conditions: TechnicalConditionDto[],
  currentValues: Map<string, number>,
  previousValues?: Map<string, number>,
): boolean {
  return conditions.every((condition) => {
    const key = `${condition.indicator}_${JSON.stringify(condition.params)}`;
    const currentValue = currentValues.get(key);

    if (currentValue === undefined) return false;

    if (
      (condition.operator === OPERATORS.CROSSES_ABOVE || condition.operator === OPERATORS.CROSSES_BELOW) &&
      previousValues
    ) {
      const prevValue = previousValues.get(key);
      if (prevValue === undefined) return false;
      return evaluateCrossingCondition(condition.operator, currentValue, prevValue, condition.value);
    }

    return evaluateCondition(condition.operator, currentValue, condition.value);
  });
}

/**
 * Check if all fundamental conditions in a setup are satisfied.
 */
export function evaluateFundamentalConditions(
  conditions: FundamentalConditionDto[],
  fundamentals: Record<string, number | null>,
): boolean {
  return conditions.every((condition) => {
    const value = fundamentals[condition.metric];
    if (value === null || value === undefined) return false;
    return evaluateCondition(condition.operator, value, condition.value);
  });
}
