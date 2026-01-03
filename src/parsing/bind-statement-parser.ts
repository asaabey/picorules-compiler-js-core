import { RuleType } from '../models/constants';
import type { ParsedBindStatement } from '../models/types';

/**
 * Parse bind statement
 * Example: ckd => rout_ckd.ckd.val.bind();
 */
export function parseBindStatement(text: string): ParsedBindStatement {
  // Pattern: variable => rout_blockname.variable.property.bind();
  const pattern = /^(\w+)\s*=>\s*rout_(\w+)\.(\w+)\.(\w+)\.bind\(\)\s*;?$/;
  const match = text.match(pattern);

  if (!match) {
    throw new Error(`Invalid bind statement: ${text}`);
  }

  const [, assignedVariable, sourceRuleblock, sourceVariable, property] = match;

  return {
    ruleType: RuleType.BIND_STATEMENT,
    assignedVariable,
    sourceRuleblock,
    sourceVariable,
    property,
    references: [sourceVariable], // The variable we're binding to
  };
}
