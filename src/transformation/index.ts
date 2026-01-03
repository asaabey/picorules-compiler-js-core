import type { ParsedRuleblock, CompilerOptions } from '../models/types';
import { selectSubset } from './subset';
import { pruneRuleblocks } from './prune';

/**
 * Apply transformations to ruleblocks
 *
 * Transformations are applied in this order:
 * 1. Subset selection (filter by name)
 * 2. Pruning (keep ancestors/descendants)
 *
 * Note: Dependency ordering is handled in the linking stage (topological sort)
 *
 * @param ruleblocks - Linked ruleblocks (with dependencies resolved)
 * @param options - Compiler options (contains transformation settings)
 * @returns Transformed ruleblocks
 */
export function transform(
  ruleblocks: ParsedRuleblock[],
  options: CompilerOptions
): ParsedRuleblock[] {
  let result = ruleblocks;

  // 1. Apply subset selection
  if (options.subset) {
    result = selectSubset(result, options.subset);
  }

  // 2. Apply pruning
  if (options.pruneInputs || options.pruneOutputs) {
    result = pruneRuleblocks(result, options.pruneInputs, options.pruneOutputs);
  }

  // Note: Dependency ordering (topological sort) is already done in linking stage
  // See src/linking/dependency-graph.ts -> topologicalSort()

  return result;
}

// Export sub-modules for testing
export { selectSubset } from './subset';
export { pruneRuleblocks } from './prune';
