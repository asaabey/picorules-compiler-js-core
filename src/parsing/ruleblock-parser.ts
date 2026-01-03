import { parseFetchStatement } from './fetch-statement-parser';
import { parseComputeStatement } from './compute-statement-parser';
import { parseBindStatement } from './bind-statement-parser';
import type { ParsedRuleblock, RuleblockInput } from '../models/types';

/**
 * Strip comments from Picorules source text.
 * Handles block comments and line comments.
 */
function stripComments(text: string): string {
  // Remove block comments (including multi-line)
  let result = text.replace(/\/\*[\s\S]*?\*\//g, '');

  // Remove line comments (to end of line)
  result = result.replace(/\/\/.*$/gm, '');

  return result;
}

/**
 * Replace [[rb_id]] placeholder with the actual ruleblock name.
 * This is a Picorules convention for self-referencing the ruleblock.
 */
function replaceRbIdPlaceholder(text: string, ruleblockName: string): string {
  return text.replace(/\[\[rb_id\]\]/g, ruleblockName);
}

export function parseRuleblock(input: RuleblockInput): ParsedRuleblock {
  const { name, text, isActive } = input;

  // Replace [[rb_id]] placeholder with actual ruleblock name
  const textWithRbId = replaceRbIdPlaceholder(text, name);

  // Strip comments
  const textWithoutComments = stripComments(textWithRbId);

  // Normalize multi-line attribute lists: collapse [...] blocks to single line
  // This handles cases like:
  //   eadv.[
  //     enc_op_ren_rnt,
  //     enc_op_ren_rtc
  //   ].dt.min()
  // And converts them to: eadv.[enc_op_ren_rnt,enc_op_ren_rtc].dt.min()
  let normalizedText = textWithoutComments.replace(/\[\s*([^\]]+?)\s*\]/gs, (_match, inner) => {
    const normalized = inner.replace(/\s+/g, '').trim();
    return `[${normalized}]`;
  });

  // Normalize multi-line statements: collapse all whitespace to single spaces
  // This handles cases where .where() is on a continuation line:
  //   loc_ca_gap_1m_n => eadv.[caresys_1310000].dt.distinct_count()
  //                           .where(loc=111711800010132 and dt >= sysdate-30);
  // Becomes: loc_ca_gap_1m_n => eadv.[caresys_1310000].dt.distinct_count().where(loc=111711800010132 and dt >= sysdate-30);
  normalizedText = normalizedText.replace(/\s+/g, ' ');

  // Split by semicolon (statement terminator)
  const statements = normalizedText
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
