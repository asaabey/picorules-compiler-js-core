/**
 * Multi-ruleblock orchestrator.
 *
 * Handles evaluation of multiple ruleblocks with dependency resolution.
 * Evaluates in topological order so that bind statements can reference
 * results from previously evaluated ruleblocks.
 */

import type { DataAdapter } from './data-adapter';
import { evaluate, EvaluationResult, Bindings } from './evaluator';

interface ParsedRuleblock {
  name: string;
  rules: Array<{
    ruleType: string;
    sourceRuleblock?: string;
    [key: string]: any;
  }>;
}

/**
 * Evaluate multiple ruleblocks in dependency order.
 *
 * @param ruleblocks - Parsed ruleblocks (should already be topologically sorted
 *                     by the linker, but will be re-sorted if needed)
 * @param data - Data adapter providing clinical records
 * @returns Map of ruleblock name → evaluation results
 */
export function evaluateAll(
  ruleblocks: ParsedRuleblock[],
  data: DataAdapter
): Map<string, EvaluationResult> {
  // Build dependency graph and sort
  const ordered = topologicalSort(ruleblocks);

  const allResults: Bindings = new Map();

  for (const rb of ordered) {
    const result = evaluate(rb as any, data, allResults);
    allResults.set(rb.name, result);
  }

  return allResults;
}

// ---------------------------------------------------------------------------
// Dependency resolution
// ---------------------------------------------------------------------------

/**
 * Topological sort of ruleblocks based on bind statement dependencies.
 * Ruleblocks with no dependencies come first.
 */
function topologicalSort(ruleblocks: ParsedRuleblock[]): ParsedRuleblock[] {
  const byName = new Map<string, ParsedRuleblock>();
  const deps = new Map<string, Set<string>>();

  for (const rb of ruleblocks) {
    byName.set(rb.name, rb);
    const rbDeps = new Set<string>();
    for (const rule of rb.rules) {
      if (rule.ruleType === 'BIND_STATEMENT' && rule.sourceRuleblock) {
        rbDeps.add(rule.sourceRuleblock);
      }
    }
    deps.set(rb.name, rbDeps);
  }

  const sorted: ParsedRuleblock[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(name: string): void {
    if (visited.has(name)) return;
    if (visiting.has(name)) {
      throw new Error(`Circular dependency detected involving ruleblock: ${name}`);
    }

    visiting.add(name);

    for (const dep of deps.get(name) ?? []) {
      if (byName.has(dep)) {
        visit(dep);
      }
      // If dep is not in our set, it's an external dependency (already evaluated)
    }

    visiting.delete(name);
    visited.add(name);

    const rb = byName.get(name);
    if (rb) sorted.push(rb);
  }

  for (const rb of ruleblocks) {
    visit(rb.name);
  }

  return sorted;
}
