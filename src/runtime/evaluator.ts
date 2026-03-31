/**
 * Picorules ruleblock evaluator.
 *
 * Walks a ParsedRuleblock AST and evaluates it against data provided by
 * a DataAdapter, producing a { variable: value } result map.
 *
 * This replaces the SQL execution engine for single-patient evaluation.
 */

import { RuleType } from '../models/constants';
import type { DataAdapter } from './data-adapter';
import type { DataRecord, DvResult } from './aggregators';
import { DV_FUNCTIONS, dispatchAggregation } from './aggregators';
import { evaluateExpression, evaluatePredicate, EvalContext } from './expression-evaluator';
import * as pico from './pico-functions';

// ---------------------------------------------------------------------------
// Types (inferred from schemas to avoid tight coupling)
// ---------------------------------------------------------------------------

interface ParsedFetchStatement {
  ruleType: typeof RuleType.FETCH_STATEMENT;
  assignedVariable: string;
  table: string;
  attributeList: string[];
  property: string;
  functionName: string;
  functionParams?: string[];
  predicate?: string;
  references: string[];
}

interface ParsedComputeStatement {
  ruleType: typeof RuleType.COMPUTE_STATEMENT;
  assignedVariable: string;
  conditions: Array<{ predicate?: string; returnValue: string }>;
  references: string[];
}

interface ParsedBindStatement {
  ruleType: typeof RuleType.BIND_STATEMENT;
  assignedVariable: string;
  sourceRuleblock: string;
  sourceVariable: string;
  property: string;
  references: string[];
}

type ParsedRule = ParsedFetchStatement | ParsedComputeStatement | ParsedBindStatement;

interface ParsedRuleblock {
  name: string;
  rules: ParsedRule[];
}

/** Result of evaluating a ruleblock: variable name → value. */
export type EvaluationResult = Record<string, number | string | Date | null>;

/** Results from previously evaluated ruleblocks, keyed by ruleblock name. */
export type Bindings = Map<string, EvaluationResult>;

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluate a single ruleblock against a data source.
 *
 * @param ruleblock - Parsed ruleblock AST (from the existing parser)
 * @param data - Data adapter providing clinical records
 * @param bindings - Results from previously evaluated ruleblocks (for bind statements)
 * @returns Map of variable names to their computed values
 */
export function evaluate(
  ruleblock: ParsedRuleblock,
  data: DataAdapter,
  bindings?: Bindings
): EvaluationResult {
  const context: EvalContext = {};

  for (const rule of ruleblock.rules) {
    switch (rule.ruleType) {
      case RuleType.FETCH_STATEMENT:
        evaluateFetch(rule as ParsedFetchStatement, data, context);
        break;
      case RuleType.COMPUTE_STATEMENT:
        evaluateCompute(rule as ParsedComputeStatement, context, ruleblock.name);
        break;
      case RuleType.BIND_STATEMENT:
        evaluateBind(rule as ParsedBindStatement, context, bindings);
        break;
    }
  }

  return context as EvaluationResult;
}

// ---------------------------------------------------------------------------
// Statement evaluators
// ---------------------------------------------------------------------------

function evaluateFetch(
  stmt: ParsedFetchStatement,
  data: DataAdapter,
  context: EvalContext
): void {
  // Get records from data source matching the attribute list
  let records = data.getRecords(stmt.attributeList);

  // Apply .where() predicate filter if present
  if (stmt.predicate) {
    records = applyWherePredicate(records, stmt.predicate, context);
  }

  // When property is 'dt', the rule wants to aggregate dates not values.
  // Map records so that .val contains the date for non-DV functions.
  // For DV functions (property '_'), both val and dt are returned as-is.
  let effectiveRecords = records;
  if (stmt.property === 'dt' && !DV_FUNCTIONS.has(stmt.functionName)) {
    effectiveRecords = records.map(r => {
      // Ensure dt is a proper Date object for date-returning functions
      const dt = r.dt instanceof Date ? r.dt : (r.dt != null ? new Date(r.dt as any) : null);
      return { val: dt as any, dt };
    });
  }

  // Apply aggregation function
  const result = dispatchAggregation(stmt.functionName, effectiveRecords, stmt.functionParams);

  // Store result(s) in context
  if (DV_FUNCTIONS.has(stmt.functionName) && result != null && typeof result === 'object' && 'val' in result) {
    // DV functions produce two variables: {name}_val and {name}_dt
    const dv = result as DvResult;
    context[`${stmt.assignedVariable}_val`] = dv.val;
    context[`${stmt.assignedVariable}_dt`] = dv.dt;
  } else {
    // Single-value functions
    context[stmt.assignedVariable] = result as number | string | null;
  }
}

function evaluateCompute(
  stmt: ParsedComputeStatement,
  context: EvalContext,
  ruleblockName: string
): void {
  // Resolve [[rb_id]] — the ruleblock's own output variable
  const varName = stmt.assignedVariable === '[[rb_id]]' ? ruleblockName : stmt.assignedVariable;

  // Evaluate conditions left-to-right; first matching predicate wins
  for (const condition of stmt.conditions) {
    if (!condition.predicate || condition.predicate.trim() === '.') {
      // Default/else branch or dot shorthand — always matches
      // In picorules, { . => expr } means "always evaluate this expression"
      context[varName] = evaluateReturnValue(condition.returnValue, context, varName);
      return;
    }

    if (evaluatePredicate(condition.predicate, context)) {
      context[varName] = evaluateReturnValue(condition.returnValue, context, varName);
      return;
    }
  }

  // No condition matched and no default — variable is null
  context[varName] = null;
}

function evaluateBind(
  stmt: ParsedBindStatement,
  context: EvalContext,
  bindings?: Bindings
): void {
  if (!bindings) {
    context[stmt.assignedVariable] = null;
    return;
  }

  const sourceResults = bindings.get(stmt.sourceRuleblock);
  if (!sourceResults) {
    context[stmt.assignedVariable] = null;
    return;
  }

  // Resolve the variable from the source ruleblock
  if (stmt.property === '_') {
    // DV binding: import both _val and _dt
    context[`${stmt.assignedVariable}_val`] = sourceResults[`${stmt.sourceVariable}_val`] ?? null;
    context[`${stmt.assignedVariable}_dt`] = sourceResults[`${stmt.sourceVariable}_dt`] ?? null;
  } else {
    // Single property binding
    const value = sourceResults[stmt.sourceVariable] ?? null;
    context[stmt.assignedVariable] = value;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Evaluate a return value expression. This can be a simple literal ("1", "`G1`")
 * or a complex expression ("round(100*(1-EXP(...)),2)").
 */
function evaluateReturnValue(
  returnValue: string,
  context: EvalContext,
  currentVariable: string
): number | string | Date | null {
  return evaluateExpression(returnValue, context, currentVariable);
}

/**
 * Apply a .where() predicate to filter records.
 *
 * The predicate can reference EADV columns (dt, val) and previously
 * computed variables from the context.
 *
 * Examples:
 *   "dt > sysdate-365"
 *   "val > 3"
 *   "dt > acr_l_dt-90 and val >= 3"
 *   "substr(loc,2,2) in (37,38,39)"
 */
function applyWherePredicate(
  records: DataRecord[],
  predicate: string,
  context: EvalContext
): DataRecord[] {
  return records.filter(record => {
    // Create a local context that includes the record's own columns
    const localContext: EvalContext = {
      ...context,
      dt: record.dt,
      val: record.val,
      sysdate: pico.sysdate(),
    };

    try {
      return evaluatePredicate(predicate, localContext);
    } catch {
      // If predicate evaluation fails for a record, exclude it
      return false;
    }
  });
}
