/**
 * Context interfaces for SQL template generation
 */

export interface FetchContext {
  assignedVariable: string;
  table: string;
  attribute: string;
  property: string;
  functionName: string;
  functionParams?: string[];
  predicate?: string;
}

export interface ComputeContext {
  assignedVariable: string;
  conditions: Array<{
    predicate?: string;
    returnValue: string;
  }>;
}

export interface BindContext {
  assignedVariable: string;
  sourceRuleblock: string;
  sourceVariable: string;
  property: string;
}

/**
 * SQL Template interface
 * Each dialect must implement all these template functions
 */
export interface SqlTemplates {
  // Basic fetch statement templates
  fetchLast: (ctx: FetchContext) => string;
  fetchFirst: (ctx: FetchContext) => string;
  fetchCount: (ctx: FetchContext) => string;

  // Aggregation function templates
  fetchSum: (ctx: FetchContext) => string;
  fetchAvg: (ctx: FetchContext) => string;
  fetchMin: (ctx: FetchContext) => string;
  fetchMax: (ctx: FetchContext) => string;
  fetchMedian: (ctx: FetchContext) => string;
  fetchDistinctCount: (ctx: FetchContext) => string;

  // Window function templates
  fetchNth: (ctx: FetchContext) => string;
  fetchLastdv: (ctx: FetchContext) => string;
  fetchFirstdv: (ctx: FetchContext) => string;

  // String function templates
  fetchSerialize: (ctx: FetchContext) => string;
  fetchSerializedv: (ctx: FetchContext) => string;

  // Statistical function templates
  fetchRegrSlope: (ctx: FetchContext) => string;
  fetchRegrIntercept: (ctx: FetchContext) => string;
  fetchRegrR2: (ctx: FetchContext) => string;

  // Existence function template
  fetchExists: (ctx: FetchContext) => string;

  // Compute statement template
  compute: (ctx: ComputeContext) => string;

  // Bind statement template
  bind: (ctx: BindContext) => string;

  // Main ruleblock wrapper template
  ruleblock: (name: string, ctes: string[], variables: string[]) => string;

  // Dialect-specific helper functions
  helpers: {
    currentDate: () => string;
    dateAdd: (column: string, days: number) => string;
    dateDiff: (startCol: string, endCol: string, unit: 'DAY' | 'MONTH' | 'YEAR') => string;
    stringAgg: (column: string, delimiter: string, orderBy?: string) => string;
    coalesce: (...columns: string[]) => string;
    nullIf: (col1: string, col2: string) => string;
  };
}
