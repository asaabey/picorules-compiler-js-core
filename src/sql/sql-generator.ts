import { getTemplates } from './templates';
import type { ParsedRuleblock, ParsedFetchStatement, ParsedComputeStatement, ParsedBindStatement } from '../models/types';
import type { VariableMetadata } from './templates/template-interface';
import { RuleType, Dialect } from '../models/constants';

// Functions that generate _val and _dt columns instead of a single column
const DV_FUNCTIONS = new Set(['lastdv', 'firstdv', 'maxldv', 'minldv', 'minfdv', 'max_neg_delta_dv']);

export function generateSqlForRuleblock(ruleblock: ParsedRuleblock, dialect: Dialect): string {
  const templates = getTemplates(dialect);
  const ctes: string[] = [];
  const variables: VariableMetadata[] = [];

  for (const rule of ruleblock.rules) {
    if (rule.ruleType === RuleType.FETCH_STATEMENT) {
      const fetch = rule as ParsedFetchStatement;
      // If fetch has variable references in predicate, pass the dependent variables
      const hasDependencies = fetch.references && fetch.references.length > 0;
      const ctx = {
        assignedVariable: fetch.assignedVariable,
        table: fetch.table,
        attribute: fetch.attributeList[0], // Deprecated: kept for backward compatibility
        attributeList: fetch.attributeList, // Full list of attributes (supports wildcards and multiple attributes)
        property: fetch.property,
        functionName: fetch.functionName,
        functionParams: fetch.functionParams,
        predicate: fetch.predicate,
        // Pass all previous variable names if this fetch has dependencies in its predicate
        previousVariables: hasDependencies ? variables.map(v => v.name) : undefined,
      };

      // Select template based on function
      let cte: string;
      const funcName = fetch.functionName.toLowerCase();

      // Map function names to template methods
      const functionMap: Record<string, (ctx: any) => string> = {
        // Basic
        'last': templates.fetchLast,
        'first': templates.fetchFirst,
        'count': templates.fetchCount,
        // Aggregation
        'sum': templates.fetchSum,
        'avg': templates.fetchAvg,
        'min': templates.fetchMin,
        'max': templates.fetchMax,
        'median': templates.fetchMedian,
        'distinct_count': templates.fetchDistinctCount,
        // Window
        'nth': templates.fetchNth,
        'lastdv': templates.fetchLastdv,
        'firstdv': templates.fetchFirstdv,
        'maxldv': templates.fetchMaxldv,
        'minldv': templates.fetchMinldv,
        // String
        'serialize': templates.fetchSerialize,
        'serializedv': templates.fetchSerializedv,
        'serializedv2': templates.fetchSerializedv2,
        // Statistical
        'regr_slope': templates.fetchRegrSlope,
        'regr_intercept': templates.fetchRegrIntercept,
        'regr_r2': templates.fetchRegrR2,
        // Existence
        'exists': templates.fetchExists,
        // New functions
        'stats_mode': templates.fetchStatsMode,
        'minfdv': templates.fetchMinfdv,
        'serialize2': templates.fetchSerialize2,
        'max_neg_delta_dv': templates.fetchMaxNegDeltaDv,
        'temporal_regularity': templates.fetchTemporalRegularity,
      };

      const templateFunc = functionMap[funcName];
      if (templateFunc) {
        cte = templateFunc(ctx);
      } else {
        throw new Error(`Unsupported function: ${fetch.functionName}`);
      }

      ctes.push(cte);
      variables.push({
        name: fetch.assignedVariable,
        isDvFunction: DV_FUNCTIONS.has(funcName),
      });
    } else if (rule.ruleType === RuleType.COMPUTE_STATEMENT) {
      const compute = rule as ParsedComputeStatement;
      const cte = templates.compute({
        assignedVariable: compute.assignedVariable,
        conditions: compute.conditions,
        previousVariables: variables.map(v => v.name), // Pass all previously defined variable names
      });

      ctes.push(cte);
      variables.push({
        name: compute.assignedVariable,
        isDvFunction: false,
      });
    } else if (rule.ruleType === RuleType.BIND_STATEMENT) {
      const bind = rule as ParsedBindStatement;
      const cte = templates.bind({
        assignedVariable: bind.assignedVariable,
        sourceRuleblock: bind.sourceRuleblock,
        sourceVariable: bind.sourceVariable,
        property: bind.property,
      });

      ctes.push(cte);
      variables.push({
        name: bind.assignedVariable,
        isDvFunction: false,
      });
    }
  }

  return templates.ruleblock(ruleblock.name, ctes, variables);
}
