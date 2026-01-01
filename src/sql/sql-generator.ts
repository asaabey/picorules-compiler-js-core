import { getTemplates } from './templates';
import type { ParsedRuleblock, ParsedFetchStatement, ParsedComputeStatement, ParsedBindStatement } from '../models/types';
import { RuleType, Dialect } from '../models/constants';

export function generateSqlForRuleblock(ruleblock: ParsedRuleblock, dialect: Dialect): string {
  const templates = getTemplates(dialect);
  const ctes: string[] = [];
  const variables: string[] = [];

  for (const rule of ruleblock.rules) {
    if (rule.ruleType === RuleType.FETCH_STATEMENT) {
      const fetch = rule as ParsedFetchStatement;
      const ctx = {
        assignedVariable: fetch.assignedVariable,
        table: fetch.table,
        attribute: fetch.attributeList[0], // Single attribute for now
        property: fetch.property,
        functionName: fetch.functionName,
        functionParams: fetch.functionParams,
        predicate: fetch.predicate,
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
        // String
        'serialize': templates.fetchSerialize,
        'serializedv': templates.fetchSerializedv,
        // Statistical
        'regr_slope': templates.fetchRegrSlope,
        'regr_intercept': templates.fetchRegrIntercept,
        'regr_r2': templates.fetchRegrR2,
        // Existence
        'exists': templates.fetchExists,
      };

      const templateFunc = functionMap[funcName];
      if (templateFunc) {
        cte = templateFunc(ctx);
      } else {
        throw new Error(`Unsupported function: ${fetch.functionName}`);
      }

      ctes.push(cte);
      variables.push(fetch.assignedVariable);
    } else if (rule.ruleType === RuleType.COMPUTE_STATEMENT) {
      const compute = rule as ParsedComputeStatement;
      const cte = templates.compute({
        assignedVariable: compute.assignedVariable,
        conditions: compute.conditions,
      });

      ctes.push(cte);
      variables.push(compute.assignedVariable);
    } else if (rule.ruleType === RuleType.BIND_STATEMENT) {
      const bind = rule as ParsedBindStatement;
      const cte = templates.bind({
        assignedVariable: bind.assignedVariable,
        sourceRuleblock: bind.sourceRuleblock,
        sourceVariable: bind.sourceVariable,
        property: bind.property,
      });

      ctes.push(cte);
      variables.push(bind.assignedVariable);
    }
  }

  return templates.ruleblock(ruleblock.name, ctes, variables);
}
