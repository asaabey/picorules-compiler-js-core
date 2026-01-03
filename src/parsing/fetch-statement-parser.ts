import { PATTERNS, RuleType } from '../models/constants';
import type { ParsedFetchStatement } from '../models/types';

/**
 * Split function arguments by comma, respecting nested parentheses
 * E.g., "round(val,0)~dt" should NOT be split, but "arg1, arg2" should become ["arg1", "arg2"]
 */
function splitFunctionParams(params: string): string[] {
  if (!params) return [];

  const result: string[] = [];
  let current = '';
  let depth = 0;

  for (const char of params) {
    if (char === '(') {
      depth++;
      current += char;
    } else if (char === ')') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    result.push(current.trim());
  }

  return result;
}

export function parseFetchStatement(text: string): ParsedFetchStatement {
  const match = text.match(PATTERNS.FETCH_STATEMENT);

  if (!match) {
    throw new Error(`Invalid fetch statement: ${text}`);
  }

  const [, assignedVariable, table, attributes, property, functionName, params, predicate] = match;

  // Parse attribute list (handle multi-attribute: [att1,att2])
  const attributeList = attributes.startsWith('[')
    ? attributes.slice(1, -1).split(',').map(a => a.trim())
    : [attributes];

  // Parse function parameters - use balanced parenthesis-aware splitting
  const functionParams = splitFunctionParams(params);

  return {
    ruleType: RuleType.FETCH_STATEMENT,
    assignedVariable,
    table,
    attributeList,
    property,
    functionName,
    functionParams: functionParams.length > 0 ? functionParams : undefined,
    predicate: predicate || undefined,
    references: [], // Will be populated in linking stage
  };
}
