/**
 * Context interfaces for SQL template generation
 */

/**
 * Metadata about a variable for final output generation
 */
export interface VariableMetadata {
  name: string;
  isDvFunction: boolean; // true for lastdv, firstdv, maxldv, minldv - generates _val and _dt columns
}

export interface FetchContext {
  assignedVariable: string;
  table: string;
  attribute: string; // Deprecated: use attributeList instead
  attributeList: string[]; // List of attributes (supports wildcards and multiple attributes)
  property: string;
  functionName: string;
  functionParams?: string[];
  predicate?: string;
  previousVariables?: string[]; // Variables defined before this fetch statement (needed when predicate references other variables)
}

export interface ComputeContext {
  assignedVariable: string;
  conditions: Array<{
    predicate?: string;
    returnValue: string;
  }>;
  previousVariables?: string[]; // Variables defined before this compute statement
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
  fetchMaxldv: (ctx: FetchContext) => string;
  fetchMinldv: (ctx: FetchContext) => string;

  // String function templates
  fetchSerialize: (ctx: FetchContext) => string;
  fetchSerializedv: (ctx: FetchContext) => string;
  fetchSerializedv2: (ctx: FetchContext) => string;

  // Statistical function templates
  fetchRegrSlope: (ctx: FetchContext) => string;
  fetchRegrIntercept: (ctx: FetchContext) => string;
  fetchRegrR2: (ctx: FetchContext) => string;

  // Existence function template
  fetchExists: (ctx: FetchContext) => string;

  // Statistical mode function (most frequent value)
  fetchStatsMode: (ctx: FetchContext) => string;

  // Minimum value with first date of occurrence
  fetchMinfdv: (ctx: FetchContext) => string;

  // Extended serialization (like serialize but with different format)
  fetchSerialize2: (ctx: FetchContext) => string;

  // Maximum negative delta with date (largest decrease between consecutive values)
  fetchMaxNegDeltaDv: (ctx: FetchContext) => string;

  // Temporal regularity metric (measures regularity of event intervals)
  fetchTemporalRegularity: (ctx: FetchContext) => string;

  // Compute statement template
  compute: (ctx: ComputeContext) => string;

  // Bind statement template
  bind: (ctx: BindContext) => string;

  // Main ruleblock wrapper template
  ruleblock: (name: string, ctes: string[], variables: VariableMetadata[]) => string;

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
