import type { ParsedRuleblock, CompilationManifest, ManifestEntry } from '../models/types';
import type { DependencyGraph } from '../linking/dependency-graph';
import { Dialect } from '../models/constants';

const MANIFEST_VERSION = '1.0.0';

/**
 * Get the output table name for a ruleblock based on dialect
 * Must match the table name used in SQL templates
 */
function getTargetTableName(ruleblockName: string, dialect: Dialect): string {
  switch (dialect) {
    case Dialect.MSSQL:
      return `SROUT_${ruleblockName}`;
    case Dialect.ORACLE:
      return `ROUT_${ruleblockName.toUpperCase()}`;
    case Dialect.POSTGRESQL:
      // PostgreSQL templates use: CREATE TABLE ROUT_${name.toUpperCase()} AS
      return `rout_${ruleblockName.toLowerCase()}`;
    default:
      return `rout_${ruleblockName}`;
  }
}

/**
 * Extract output variables from a parsed ruleblock
 * Returns all variables that are assigned in the ruleblock
 */
function extractOutputVariables(ruleblock: ParsedRuleblock): string[] {
  const variables: string[] = [];

  for (const rule of ruleblock.rules) {
    if ('assignedVariable' in rule && rule.assignedVariable) {
      variables.push(rule.assignedVariable);
    }
  }

  return variables;
}

/**
 * Convert DependencyGraph edges to a plain object for JSON serialization
 */
function graphToAdjacencyList(graph: DependencyGraph): Record<string, string[]> {
  const adjacencyList: Record<string, string[]> = {};

  for (const [node, deps] of graph.edges) {
    adjacencyList[node] = Array.from(deps);
  }

  return adjacencyList;
}

/**
 * Generate a compilation manifest from ordered ruleblocks
 *
 * @param orderedRuleblocks - Ruleblocks already sorted by topological order (dependencies first)
 * @param dependencyGraph - The dependency graph used for sorting
 * @param dialect - SQL dialect being used
 * @returns CompilationManifest with execution order and metadata
 */
export function generateManifest(
  orderedRuleblocks: ParsedRuleblock[],
  dependencyGraph: DependencyGraph,
  dialect: Dialect
): CompilationManifest {
  const entries: ManifestEntry[] = orderedRuleblocks.map((rb, index) => {
    const deps = dependencyGraph.edges.get(rb.name) || new Set();

    return {
      ruleblockId: rb.name,
      executionOrder: index,
      targetTable: getTargetTableName(rb.name, dialect),
      dependencies: Array.from(deps),
      outputVariables: extractOutputVariables(rb),
      sqlIndex: index,
    };
  });

  return {
    version: MANIFEST_VERSION,
    dialect: dialect,
    compiledAt: new Date().toISOString(),
    totalRuleblocks: orderedRuleblocks.length,
    entries,
    dependencyGraph: graphToAdjacencyList(dependencyGraph),
  };
}
