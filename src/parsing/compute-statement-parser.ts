import { RuleType } from '../models/constants';
import type { ParsedComputeStatement } from '../models/types';

export function parseComputeStatement(text: string): ParsedComputeStatement {
  // Extract variable name
  const assignMatch = text.match(/^(\w+)\s*:/);
  if (!assignMatch) {
    throw new Error(`Invalid compute statement: ${text}`);
  }

  const assignedVariable = assignMatch[1];

  // Extract conditions: {predicate => value}, {predicate => value}, ...
  const conditionPattern = /\{([^}]*?)=>([^}]*?)\}/g;
  const conditions = [];
  let match;

  while ((match = conditionPattern.exec(text)) !== null) {
    const predicate = match[1].trim();
    const returnValue = match[2].trim();

    conditions.push({
      predicate: predicate || undefined, // Empty predicate = ELSE
      returnValue,
    });
  }

  if (conditions.length === 0) {
    throw new Error(`No conditions found in compute statement: ${text}`);
  }

  return {
    ruleType: RuleType.COMPUTE_STATEMENT,
    assignedVariable,
    conditions,
    references: [], // Will be populated later
  };
}
