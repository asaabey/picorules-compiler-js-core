import { PATTERNS, RuleType } from '../models/constants';
import type { ParsedFetchStatement } from '../models/types';

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

  // Parse function parameters
  const functionParams = params ? params.split(',').map(p => p.trim()) : [];

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
