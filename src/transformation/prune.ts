import type { ParsedRuleblock } from '../models/types';
import { RuleType } from '../models/constants';

/**
 * Build a map of dependencies for each ruleblock
 * Returns: ruleblock name -> list of ruleblock names it depends on
 */
function buildDependencyMap(ruleblocks: ParsedRuleblock[]): Map<string, Set<string>> {
  const depMap = new Map<string, Set<string>>();

  for (const rb of ruleblocks) {
    const deps = new Set<string>();

    // Find all bind statements and extract source ruleblocks
    for (const rule of rb.rules) {
      if (rule.ruleType === RuleType.BIND_STATEMENT) {
        const bindRule = rule as any; // ParsedBindStatement
        deps.add(bindRule.sourceRuleblock.toLowerCase());
      }
    }

    depMap.set(rb.name.toLowerCase(), deps);
  }

  return depMap;
}

/**
 * Find all ancestors of the given ruleblocks (ruleblocks they depend on, transitively)
 *
 * @param ruleblockNames - Starting ruleblock names
 * @param depMap - Dependency map
 * @returns Set of all ancestor ruleblock names (including the starting ones)
 */
function findAncestors(ruleblockNames: string[], depMap: Map<string, Set<string>>): Set<string> {
  const ancestors = new Set<string>();
  const queue = [...ruleblockNames.map(n => n.toLowerCase())];

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (ancestors.has(current)) {
      continue; // Already processed
    }

    ancestors.add(current);

    // Add all dependencies to the queue
    const deps = depMap.get(current);
    if (deps) {
      for (const dep of deps) {
        if (!ancestors.has(dep)) {
          queue.push(dep);
        }
      }
    }
  }

  return ancestors;
}

/**
 * Find all descendants of the given ruleblocks (ruleblocks that depend on them, transitively)
 *
 * @param ruleblockNames - Starting ruleblock names
 * @param depMap - Dependency map
 * @returns Set of all descendant ruleblock names (including the starting ones)
 */
function findDescendants(ruleblockNames: string[], depMap: Map<string, Set<string>>): Set<string> {
  const descendants = new Set<string>(ruleblockNames.map(n => n.toLowerCase()));

  // Build reverse dependency map (who depends on me?)
  const reverseDeps = new Map<string, Set<string>>();
  for (const [rbName, deps] of depMap.entries()) {
    for (const dep of deps) {
      if (!reverseDeps.has(dep)) {
        reverseDeps.set(dep, new Set());
      }
      reverseDeps.get(dep)!.add(rbName);
    }
  }

  // BFS to find all descendants
  const queue = [...ruleblockNames.map(n => n.toLowerCase())];
  while (queue.length > 0) {
    const current = queue.shift()!;

    // Add all ruleblocks that depend on current
    const dependents = reverseDeps.get(current);
    if (dependents) {
      for (const dependent of dependents) {
        if (!descendants.has(dependent)) {
          descendants.add(dependent);
          queue.push(dependent);
        }
      }
    }
  }

  return descendants;
}

/**
 * Prune ruleblocks based on inputs and outputs
 *
 * @param ruleblocks - All ruleblocks
 * @param pruneInputs - Keep only descendants of these ruleblocks
 * @param pruneOutputs - Keep only ancestors of these ruleblocks
 * @returns Pruned ruleblocks
 */
export function pruneRuleblocks(
  ruleblocks: ParsedRuleblock[],
  pruneInputs?: string[],
  pruneOutputs?: string[]
): ParsedRuleblock[] {
  // If no pruning specified, return all ruleblocks
  if ((!pruneInputs || pruneInputs.length === 0) && (!pruneOutputs || pruneOutputs.length === 0)) {
    return ruleblocks;
  }

  const depMap = buildDependencyMap(ruleblocks);
  let toKeep = new Set<string>();

  // If pruneOutputs specified, keep only ancestors
  if (pruneOutputs && pruneOutputs.length > 0) {
    toKeep = findAncestors(pruneOutputs, depMap);
  }

  // If pruneInputs specified, keep only descendants
  if (pruneInputs && pruneInputs.length > 0) {
    const descendants = findDescendants(pruneInputs, depMap);

    if (toKeep.size > 0) {
      // Intersection: keep ruleblocks that are both ancestors and descendants
      toKeep = new Set([...toKeep].filter(name => descendants.has(name)));
    } else {
      toKeep = descendants;
    }
  }

  // Filter ruleblocks
  return ruleblocks.filter(rb => toKeep.has(rb.name.toLowerCase()));
}
