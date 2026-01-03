import type { ParsedRuleblock, ParsedComputeStatement, ParsedFetchStatement } from '../models/types';
import { RuleType } from '../models/constants';

/**
 * Extract variable references from predicates and expressions
 */
export function extractVariableReferences(expression: string): string[] {
  // Match variable names (alphanumeric + underscore, not starting with digit)
  const variablePattern = /\b[a-z_][a-z0-9_]*\b/gi;
  const matches = expression.match(variablePattern) || [];

  // Filter out SQL keywords and operators
  const sqlKeywords = new Set([
    'and', 'or', 'not', 'null', 'true', 'false', 'case', 'when', 'then',
    'else', 'end', 'between', 'in', 'like', 'is', 'exists', 'select',
    'from', 'where', 'having', 'group', 'by', 'order', 'asc', 'desc',
    'join', 'left', 'right', 'inner', 'outer', 'on', 'using', 'coalesce',
    'least', 'greatest', 'sysdate', 'count', 'sum', 'avg', 'min', 'max',
  ]);

  return matches.filter(m => !sqlKeywords.has(m.toLowerCase()));
}

/**
 * Resolve variable references in compute and fetch statements
 */
export function resolveReferences(ruleblock: ParsedRuleblock): ParsedRuleblock {
  const resolvedRules = ruleblock.rules.map(rule => {
    if (rule.ruleType === RuleType.COMPUTE_STATEMENT) {
      const compute = rule as ParsedComputeStatement;
      const allReferences = new Set<string>();

      // Extract references from all predicates and return values
      for (const condition of compute.conditions) {
        if (condition.predicate) {
          const refs = extractVariableReferences(condition.predicate);
          refs.forEach(ref => allReferences.add(ref));
        }
        const returnRefs = extractVariableReferences(condition.returnValue);
        returnRefs.forEach(ref => allReferences.add(ref));
      }

      return {
        ...compute,
        references: Array.from(allReferences),
      };
    }

    // Also extract variable references from fetch statement predicates
    if (rule.ruleType === RuleType.FETCH_STATEMENT) {
      const fetch = rule as ParsedFetchStatement;
      if (fetch.predicate) {
        const refs = extractVariableReferences(fetch.predicate);
        // Filter out 'dt', 'val', 'att', 'eid', 'loc' which are EADV column names, not variable references
        const eadvColumns = new Set(['dt', 'val', 'att', 'eid', 'loc']);
        const variableRefs = refs.filter(ref => !eadvColumns.has(ref.toLowerCase()));

        if (variableRefs.length > 0) {
          return {
            ...fetch,
            references: variableRefs,
          };
        }
      }
    }

    return rule;
  });

  return {
    ...ruleblock,
    rules: resolvedRules,
  };
}

/**
 * Validate that all referenced variables exist
 */
export function validateReferences(ruleblocks: ParsedRuleblock[]): string[] {
  const errors: string[] = [];
  const allVariables = new Map<string, Set<string>>(); // ruleblock -> variables

  // First pass: collect all defined variables per ruleblock
  for (const rb of ruleblocks) {
    const vars = new Set<string>();
    for (const rule of rb.rules) {
      if ('assignedVariable' in rule) {
        vars.add(rule.assignedVariable);
      }
    }
    allVariables.set(rb.name, vars);
  }

  // Second pass: validate references
  for (const rb of ruleblocks) {
    const localVars = allVariables.get(rb.name) || new Set();

    for (const rule of rb.rules) {
      if ('references' in rule && rule.references) {
        for (const ref of rule.references) {
          // Check if reference exists in local scope
          if (!localVars.has(ref)) {
            // Check if it might be from another ruleblock (bind statement will handle)
            errors.push(
              `Ruleblock '${rb.name}': Reference to undefined variable '${ref}'`
            );
          }
        }
      }
    }
  }

  return errors;
}
