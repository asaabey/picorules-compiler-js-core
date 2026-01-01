import { parseFetchStatement } from './fetch-statement-parser';
import { parseComputeStatement } from './compute-statement-parser';
import { parseBindStatement } from './bind-statement-parser';
import { RuleType } from '../models/constants';
import type { ParsedRuleblock, RuleblockInput } from '../models/types';

export function parseRuleblock(input: RuleblockInput): ParsedRuleblock {
  const { name, text, isActive } = input;

  // Split by semicolon (statement terminator)
  const statements = text
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  const rules = [];

  for (const stmt of statements) {
    // Skip compiler directives for now (Phase 5)
    if (stmt.startsWith('#')) {
      continue;
    }

    // Detect statement type
    if (stmt.includes('=>') && !stmt.includes(':')) {
      // Check if it's a bind statement (contains .bind())
      if (stmt.includes('.bind()')) {
        rules.push(parseBindStatement(stmt + ';'));
      } else {
        // Regular fetch statement
        rules.push(parseFetchStatement(stmt + ';'));
      }
    } else if (stmt.includes(':')) {
      // Compute statement
      rules.push(parseComputeStatement(stmt + ';'));
    }
    // Skip empty statements
  }

  return {
    name,
    text,
    isActive,
    rules,
  };
}
