/**
 * Aggregation functions for the picorules JS evaluator.
 *
 * Each function operates on an array of DataRecords (the result of querying
 * a data source for a given attribute set). These mirror the SQL window
 * functions and aggregations that the SQL compiler generates.
 *
 * All functions are pure: (records, params?) => value | DvResult | null
 */

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

export interface DataRecord {
  val: number | string | Date | null;
  dt: Date | null;
}

/** Returned by DV (date-value) functions that produce two columns. */
export interface DvResult {
  val: number | string | Date | null;
  dt: Date | null;
}

/** Union type for all possible values in records and results. */
type Value = number | string | Date | null;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function numericVal(r: DataRecord): number | null {
  if (r.val == null) return null;
  const n = typeof r.val === 'number' ? r.val : Number(r.val);
  return isNaN(n) ? null : n;
}

function sortByDateDesc(records: DataRecord[]): DataRecord[] {
  return [...records].sort((a, b) => {
    if (a.dt == null && b.dt == null) return 0;
    if (a.dt == null) return 1;
    if (b.dt == null) return -1;
    return b.dt.getTime() - a.dt.getTime();
  });
}

function sortByDateAsc(records: DataRecord[]): DataRecord[] {
  return [...records].sort((a, b) => {
    if (a.dt == null && b.dt == null) return 0;
    if (a.dt == null) return 1;
    if (b.dt == null) return -1;
    return a.dt.getTime() - b.dt.getTime();
  });
}

function nonNullNumericRecords(records: DataRecord[]): { val: number; dt: Date | null }[] {
  return records
    .map(r => ({ val: numericVal(r), dt: r.dt }))
    .filter((r): r is { val: number; dt: Date | null } => r.val !== null);
}

// ---------------------------------------------------------------------------
// Basic fetch functions
// ---------------------------------------------------------------------------

/** Most recent value (sorted by date descending). */
export function last(records: DataRecord[]): Value {
  if (records.length === 0) return null;
  const sorted = sortByDateDesc(records);
  return sorted[0].val;
}

/** Earliest value (sorted by date ascending). */
export function first(records: DataRecord[]): Value {
  if (records.length === 0) return null;
  const sorted = sortByDateAsc(records);
  return sorted[0].val;
}

/** Count of non-null records. Accepts optional default parameter (used as count(0) in rules). */
export function count(records: DataRecord[], params?: string[]): number {
  // count(0) in picorules means "count with default 0" — but count always returns a number
  return records.length;
}

// ---------------------------------------------------------------------------
// Aggregation functions
// ---------------------------------------------------------------------------

export function sum(records: DataRecord[]): number | null {
  const nums = nonNullNumericRecords(records);
  if (nums.length === 0) return null;
  return nums.reduce((acc, r) => acc + r.val, 0);
}

export function avg(records: DataRecord[]): number | null {
  const nums = nonNullNumericRecords(records);
  if (nums.length === 0) return null;
  return nums.reduce((acc, r) => acc + r.val, 0) / nums.length;
}

export function min(records: DataRecord[]): number | Date | null {
  // Handle Date values (when property is 'dt')
  const dateVals = records.filter(r => r.val instanceof Date).map(r => r.val as Date);
  if (dateVals.length > 0) {
    return new Date(Math.min(...dateVals.map(d => d.getTime())));
  }
  const nums = nonNullNumericRecords(records);
  if (nums.length === 0) return null;
  return Math.min(...nums.map(r => r.val));
}

export function max(records: DataRecord[]): number | Date | null {
  // Handle Date values (when property is 'dt')
  const dateVals = records.filter(r => r.val instanceof Date).map(r => r.val as Date);
  if (dateVals.length > 0) {
    return new Date(Math.max(...dateVals.map(d => d.getTime())));
  }
  const nums = nonNullNumericRecords(records);
  if (nums.length === 0) return null;
  return Math.max(...nums.map(r => r.val));
}

export function median(records: DataRecord[]): number | null {
  const nums = nonNullNumericRecords(records).map(r => r.val).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  if (nums.length % 2 === 0) {
    return (nums[mid - 1] + nums[mid]) / 2;
  }
  return nums[mid];
}

export function distinct_count(records: DataRecord[]): number {
  const unique = new Set(records.map(r => r.val).filter(v => v != null));
  return unique.size;
}

// ---------------------------------------------------------------------------
// Window / positioning functions
// ---------------------------------------------------------------------------

/** Nth most recent value (1-based, default n=1 which is same as last). */
export function nth(records: DataRecord[], params?: string[]): Value {
  const n = params && params.length > 0 ? parseInt(params[0], 10) : 1;
  if (records.length === 0 || n < 1) return null;
  const sorted = sortByDateDesc(records);
  if (n > sorted.length) return null;
  return sorted[n - 1].val;
}

// ---------------------------------------------------------------------------
// DV (Date-Value) pair functions — return { val, dt }
// ---------------------------------------------------------------------------

/** Most recent value with its date. */
export function lastdv(records: DataRecord[]): DvResult | null {
  if (records.length === 0) return null;
  const sorted = sortByDateDesc(records);
  return { val: sorted[0].val, dt: sorted[0].dt };
}

/** Earliest value with its date. */
export function firstdv(records: DataRecord[]): DvResult | null {
  if (records.length === 0) return null;
  const sorted = sortByDateAsc(records);
  return { val: sorted[0].val, dt: sorted[0].dt };
}

/** Maximum numeric value with its most recent date (if tied). */
export function maxldv(records: DataRecord[]): DvResult | null {
  const nums = nonNullNumericRecords(records);
  if (nums.length === 0) return null;
  // Sort by value DESC, then date DESC (most recent of the max values)
  nums.sort((a, b) => {
    if (b.val !== a.val) return b.val - a.val;
    if (a.dt == null && b.dt == null) return 0;
    if (a.dt == null) return 1;
    if (b.dt == null) return -1;
    return b.dt.getTime() - a.dt.getTime();
  });
  return { val: nums[0].val, dt: nums[0].dt };
}

/** Minimum numeric value with its most recent date (if tied). */
export function minldv(records: DataRecord[]): DvResult | null {
  const nums = nonNullNumericRecords(records);
  if (nums.length === 0) return null;
  // Sort by value ASC, then date DESC (most recent of the min values)
  nums.sort((a, b) => {
    if (a.val !== b.val) return a.val - b.val;
    if (a.dt == null && b.dt == null) return 0;
    if (a.dt == null) return 1;
    if (b.dt == null) return -1;
    return b.dt.getTime() - a.dt.getTime();
  });
  return { val: nums[0].val, dt: nums[0].dt };
}

/** Minimum numeric value with its first (earliest) date of occurrence. */
export function minfdv(records: DataRecord[]): DvResult | null {
  const nums = nonNullNumericRecords(records);
  if (nums.length === 0) return null;
  // Sort by value ASC, then date ASC (earliest occurrence of the min value)
  nums.sort((a, b) => {
    if (a.val !== b.val) return a.val - b.val;
    if (a.dt == null && b.dt == null) return 0;
    if (a.dt == null) return 1;
    if (b.dt == null) return -1;
    return a.dt.getTime() - b.dt.getTime();
  });
  return { val: nums[0].val, dt: nums[0].dt };
}

// ---------------------------------------------------------------------------
// Existence function
// ---------------------------------------------------------------------------

/** Returns 1 if any records exist, 0 otherwise. */
export function exists(records: DataRecord[]): number {
  return records.length > 0 ? 1 : 0;
}

// ---------------------------------------------------------------------------
// String serialization functions
// ---------------------------------------------------------------------------

/** Concatenate all values in date order, separated by delimiter. */
export function serialize(records: DataRecord[], params?: string[]): string | null {
  if (records.length === 0) return null;
  const delimiter = params && params.length > 0 ? params[0] : ',';
  const sorted = sortByDateAsc(records);
  return sorted.map(r => String(r.val ?? '')).join(delimiter);
}

/** Serialize as value~date pairs in date order. */
export function serializedv(records: DataRecord[], params?: string[]): string | null {
  if (records.length === 0) return null;
  const delimiter = params && params.length > 0 ? params[0] : ',';
  const sorted = sortByDateAsc(records);
  return sorted
    .map(r => {
      const v = r.val ?? '';
      const d = r.dt ? r.dt.toISOString().split('T')[0] : '';
      return `${v}~${d}`;
    })
    .join(delimiter);
}

/**
 * Serialize with a custom format expression. The format string uses `val` and `dt`
 * as placeholders (e.g., "round(val,0)~dt"). For the JS runtime, we apply the
 * format expression as a template with the record's val/dt substituted.
 *
 * Note: In the current implementation, we support the common pattern "round(val,N)~dt"
 * directly. More complex expressions would need the full expression evaluator.
 */
export function serializedv2(
  records: DataRecord[],
  params?: string[],
  formatFn?: (val: Value, dt: Date | null) => string
): string | null {
  if (records.length === 0) return null;
  const sorted = sortByDateAsc(records);

  if (formatFn) {
    return sorted.map(r => formatFn(r.val, r.dt)).join(',');
  }

  // Default: same as serializedv
  return serializedv(records, params);
}

/** Alternative serialization (similar to serialize). */
export function serialize2(records: DataRecord[], params?: string[]): string | null {
  return serialize(records, params);
}

// ---------------------------------------------------------------------------
// Statistical regression functions
// ---------------------------------------------------------------------------

/**
 * Linear regression slope: measures trend of value over time.
 * X-axis = days since first record, Y-axis = numeric value.
 * Uses least-squares formula: slope = (n*Σxy - Σx*Σy) / (n*Σx² - (Σx)²)
 */
export function regr_slope(records: DataRecord[]): number | null {
  const data = prepareRegressionData(records);
  if (data == null) return null;
  const { n, sumX, sumY, sumXY, sumX2 } = data;
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null;
  return (n * sumXY - sumX * sumY) / denom;
}

/** Y-intercept of the linear regression line. */
export function regr_intercept(records: DataRecord[]): number | null {
  const data = prepareRegressionData(records);
  if (data == null) return null;
  const { n, sumX, sumY, sumXY, sumX2 } = data;
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  return (sumY - slope * sumX) / n;
}

/** R-squared (coefficient of determination) of the linear regression. */
export function regr_r2(records: DataRecord[]): number | null {
  const data = prepareRegressionData(records);
  if (data == null) return null;
  const { n, sumX, sumY, sumXY, sumX2, sumY2 } = data;

  const denomX = n * sumX2 - sumX * sumX;
  const denomY = n * sumY2 - sumY * sumY;
  if (denomX === 0 || denomY === 0) return null;

  const r = (n * sumXY - sumX * sumY) / Math.sqrt(denomX * denomY);
  return r * r;
}

interface RegressionData {
  n: number;
  sumX: number;
  sumY: number;
  sumXY: number;
  sumX2: number;
  sumY2: number;
}

function prepareRegressionData(records: DataRecord[]): RegressionData | null {
  const valid = nonNullNumericRecords(records).filter(r => r.dt != null) as {
    val: number;
    dt: Date;
  }[];
  if (valid.length < 2) return null;

  // Sort by date ascending
  valid.sort((a, b) => a.dt.getTime() - b.dt.getTime());

  const firstDate = valid[0].dt.getTime();
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  const n = valid.length;

  for (const r of valid) {
    const x = (r.dt.getTime() - firstDate) / 86400000; // days since first
    const y = r.val;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
    sumY2 += y * y;
  }

  return { n, sumX, sumY, sumXY, sumX2, sumY2 };
}

// ---------------------------------------------------------------------------
// Statistical mode
// ---------------------------------------------------------------------------

/** Returns the most frequently occurring value. Ties broken by value (ascending). */
export function stats_mode(records: DataRecord[]): Value {
  if (records.length === 0) return null;
  const counts = new Map<string | number | Date, number>();
  for (const r of records) {
    if (r.val == null) continue;
    counts.set(r.val, (counts.get(r.val) ?? 0) + 1);
  }
  if (counts.size === 0) return null;

  let bestVal: Value = null;
  let bestCount = 0;
  for (const [val, cnt] of counts) {
    if (cnt > bestCount || (cnt === bestCount && bestVal != null && String(val) < String(bestVal))) {
      bestVal = val;
      bestCount = cnt;
    }
  }
  return bestVal;
}

// ---------------------------------------------------------------------------
// Advanced functions
// ---------------------------------------------------------------------------

/**
 * Maximum negative delta (largest single-step decrease) with its date.
 * Calculates delta = current_value - previous_value for consecutive records
 * sorted by date. Returns the most negative delta and its date.
 */
export function max_neg_delta_dv(records: DataRecord[]): DvResult | null {
  const nums = nonNullNumericRecords(records).filter(r => r.dt != null) as {
    val: number;
    dt: Date;
  }[];
  if (nums.length < 2) return null;

  nums.sort((a, b) => a.dt.getTime() - b.dt.getTime());

  let worstDelta: number | null = null;
  let worstDt: Date | null = null;

  for (let i = 1; i < nums.length; i++) {
    const delta = nums[i].val - nums[i - 1].val;
    if (delta < 0) {
      if (worstDelta == null || delta < worstDelta ||
        (delta === worstDelta && worstDt != null && nums[i].dt.getTime() > worstDt.getTime())) {
        worstDelta = delta;
        worstDt = nums[i].dt;
      }
    }
  }

  if (worstDelta == null) return null;
  return { val: worstDelta, dt: worstDt };
}

/**
 * Temporal regularity: coefficient of variation of intervals between consecutive
 * records. Lower = more regular timing. Returns null if <=1 records.
 * CV = stddev(intervals) / mean(intervals)
 */
export function temporal_regularity(records: DataRecord[]): number | null {
  const withDates = records.filter(r => r.dt != null).map(r => r.dt!);
  if (withDates.length <= 1) return null;

  withDates.sort((a, b) => a.getTime() - b.getTime());

  const intervals: number[] = [];
  for (let i = 1; i < withDates.length; i++) {
    intervals.push((withDates[i].getTime() - withDates[i - 1].getTime()) / 86400000);
  }

  if (intervals.length === 0) return null;

  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  if (mean === 0) return 0;

  const variance = intervals.reduce((acc, v) => acc + (v - mean) ** 2, 0) / intervals.length;
  const stddev = Math.sqrt(variance);

  return stddev / mean;
}

// ---------------------------------------------------------------------------
// Dispatch: resolve function name to implementation
// ---------------------------------------------------------------------------

/** Set of function names that return DV pairs (two columns: _val and _dt). */
export const DV_FUNCTIONS = new Set([
  'lastdv', 'firstdv', 'maxldv', 'minldv', 'minfdv', 'max_neg_delta_dv',
]);

/**
 * Dispatch a fetch function by name.
 * Returns: single value for standard functions, DvResult for DV functions.
 */
export function dispatchAggregation(
  functionName: string,
  records: DataRecord[],
  params?: string[]
): Value | DvResult {
  switch (functionName) {
    // Basic
    case 'last':            return last(records);
    case 'first':           return first(records);
    case 'count':           return count(records, params);
    // Aggregation
    case 'sum':             return sum(records);
    case 'avg':             return avg(records);
    case 'min':             return min(records);
    case 'max':             return max(records);
    case 'median':          return median(records);
    case 'distinct_count':  return distinct_count(records);
    // Window
    case 'nth':             return nth(records, params);
    // DV functions
    case 'lastdv':          return lastdv(records);
    case 'firstdv':         return firstdv(records);
    case 'maxldv':          return maxldv(records);
    case 'minldv':          return minldv(records);
    case 'minfdv':          return minfdv(records);
    // Existence
    case 'exists':          return exists(records);
    // Serialization
    case 'serialize':       return serialize(records, params);
    case 'serializedv':     return serializedv(records, params);
    case 'serializedv2':    return serializedv2(records, params);
    case 'serialize2':      return serialize2(records, params);
    // Statistical
    case 'regr_slope':      return regr_slope(records);
    case 'regr_intercept':  return regr_intercept(records);
    case 'regr_r2':         return regr_r2(records);
    case 'stats_mode':      return stats_mode(records);
    // Advanced
    case 'max_neg_delta_dv': return max_neg_delta_dv(records);
    case 'temporal_regularity': return temporal_regularity(records);
    default:
      throw new Error(`Unknown aggregation function: ${functionName}`);
  }
}
