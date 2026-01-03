import type { ParsedRuleblock } from '../models/types';

export interface DependencyNode {
  ruleblockName: string;
  dependencies: Set<string>; // Other ruleblocks this one depends on
}

export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  edges: Map<string, Set<string>>; // ruleblock -> set of ruleblocks it depends on
}

/**
 * Build dependency graph from parsed ruleblocks
 */
export function buildDependencyGraph(ruleblocks: ParsedRuleblock[]): DependencyGraph {
  const nodes = new Map<string, DependencyNode>();
  const edges = new Map<string, Set<string>>();

  // Initialize nodes
  for (const rb of ruleblocks) {
    nodes.set(rb.name, {
      ruleblockName: rb.name,
      dependencies: new Set(),
    });
    edges.set(rb.name, new Set());
  }

  // Build edges by analyzing bind statements
  for (const rb of ruleblocks) {
    const deps = new Set<string>();

    for (const rule of rb.rules) {
      if (rule.ruleType === 'BIND_STATEMENT') {
        // Bind statement creates a dependency on another ruleblock
        const bindRule = rule as any; // Type assertion needed
        const sourceRuleblock = bindRule.sourceRuleblock;
        deps.add(sourceRuleblock);
      }
    }

    if (deps.size > 0) {
      edges.set(rb.name, deps);
      const node = nodes.get(rb.name)!;
      node.dependencies = deps;
    }
  }

  return { nodes, edges };
}

/**
 * Detect circular dependencies in the graph
 */
export function detectCircularDependencies(graph: DependencyGraph): string[] | null {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const cycles: string[] = [];

  function dfs(node: string, path: string[]): boolean {
    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    const deps = graph.edges.get(node) || new Set();
    for (const dep of deps) {
      if (!visited.has(dep)) {
        if (dfs(dep, path)) {
          return true;
        }
      } else if (recursionStack.has(dep)) {
        // Found a cycle
        const cycleStart = path.indexOf(dep);
        cycles.push(...path.slice(cycleStart), dep);
        return true;
      }
    }

    recursionStack.delete(node);
    path.pop();
    return false;
  }

  for (const node of graph.nodes.keys()) {
    if (!visited.has(node)) {
      if (dfs(node, [])) {
        return cycles;
      }
    }
  }

  return null; // No cycles
}

/**
 * Topological sort of ruleblocks based on dependencies
 * Returns ruleblocks in dependency order (dependencies first)
 */
export function topologicalSort(ruleblocks: ParsedRuleblock[]): ParsedRuleblock[] {
  const graph = buildDependencyGraph(ruleblocks);

  // Check for circular dependencies
  const cycles = detectCircularDependencies(graph);
  if (cycles) {
    throw new Error(`Circular dependency detected: ${cycles.join(' -> ')}`);
  }

  const sorted: ParsedRuleblock[] = [];
  const visited = new Set<string>();
  const rbMap = new Map(ruleblocks.map(rb => [rb.name, rb]));

  function visit(name: string) {
    if (visited.has(name)) {
      return;
    }

    visited.add(name);

    const deps = graph.edges.get(name) || new Set();
    for (const dep of deps) {
      visit(dep);
    }

    const rb = rbMap.get(name);
    if (rb) {
      sorted.push(rb);
    }
  }

  for (const rb of ruleblocks) {
    visit(rb.name);
  }

  return sorted;
}
