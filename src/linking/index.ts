// Linking and cross-reference resolution
export { buildDependencyGraph, detectCircularDependencies, topologicalSort } from './dependency-graph';
export { resolveReferences, validateReferences, extractVariableReferences } from './reference-resolver';

import { topologicalSort } from './dependency-graph';
import { resolveReferences } from './reference-resolver';
import type { ParsedRuleblock } from '../models/types';

/**
 * Main linking function
 * - Resolves variable references
 * - Orders ruleblocks by dependencies
 * - Validates cross-references
 */
export function link(ruleblocks: ParsedRuleblock[]): ParsedRuleblock[] {
  // Step 1: Resolve references in each ruleblock
  const withReferences = ruleblocks.map(rb => resolveReferences(rb));

  // Step 2: Topological sort based on dependencies
  const ordered = topologicalSort(withReferences);

  return ordered;
}
