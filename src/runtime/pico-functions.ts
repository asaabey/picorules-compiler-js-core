/**
 * Null-safe JavaScript equivalents of all SQL functions used across the
 * picorules ruleblock corpus (168 .prb files audited).
 *
 * Every function follows SQL null-propagation semantics:
 *   - Arithmetic with null produces null
 *   - Comparisons with null produce false (matching SQL WHERE behaviour)
 */

// ---------------------------------------------------------------------------
// Math functions (null-safe)
// ---------------------------------------------------------------------------

export function round(x: number | null, n: number): number | null {
  if (x == null) return null;
  // Use "round half away from zero" to match SQL ROUND behaviour.
  // Math.round uses "round half to +∞" which differs for negative numbers.
  const factor = Math.pow(10, n);
  const sign = x < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(x) * factor) / factor;
}

export function ln(x: number | null): number | null {
  if (x == null) return null;
  return Math.log(x);
}

export function exp(x: number | null): number | null {
  if (x == null) return null;
  return Math.exp(x);
}

export function power(x: number | null, n: number | null): number | null {
  if (x == null || n == null) return null;
  return Math.pow(x, n);
}

export function abs(x: number | null): number | null {
  if (x == null) return null;
  return Math.abs(x);
}

export function ceil(x: number | null): number | null {
  if (x == null) return null;
  return Math.ceil(x);
}

export function log(base: number, x: number | null): number | null {
  if (x == null) return null;
  return Math.log(x) / Math.log(base);
}

export function sqrt(x: number | null): number | null {
  if (x == null) return null;
  return Math.sqrt(x);
}

// ---------------------------------------------------------------------------
// Null-handling functions
// ---------------------------------------------------------------------------

export function nvl<T>(x: T | null | undefined, defaultValue: T): T {
  return x != null ? x : defaultValue;
}

export function coalesce<T>(...args: (T | null | undefined)[]): T | null {
  for (const a of args) {
    if (a != null) return a;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Comparison functions (null-propagating — matches Oracle semantics)
// ---------------------------------------------------------------------------

export function greatest(...args: (number | null)[]): number | null {
  if (args.some(a => a == null)) return null;
  return Math.max(...(args as number[]));
}

export function least(...args: (number | null)[]): number | null {
  if (args.some(a => a == null)) return null;
  return Math.min(...(args as number[]));
}

// ---------------------------------------------------------------------------
// Date comparison functions (null-filtering — skips nulls, returns null only
// if ALL inputs are null)
// ---------------------------------------------------------------------------

export function greatest_date(...dates: (Date | string | number | null | undefined)[]): Date | null {
  const valid = dates
    .map(d => d == null ? null : (d instanceof Date ? d : new Date(d as any)))
    .filter((d): d is Date => d != null && !isNaN(d.getTime()));
  if (valid.length === 0) return null;
  return new Date(Math.max(...valid.map(d => d.getTime())));
}

export function least_date(...dates: (Date | string | number | null | undefined)[]): Date | null {
  const valid = dates
    .map(d => d == null ? null : (d instanceof Date ? d : new Date(d as any)))
    .filter((d): d is Date => d != null && !isNaN(d.getTime()));
  if (valid.length === 0) return null;
  return new Date(Math.min(...valid.map(d => d.getTime())));
}

// ---------------------------------------------------------------------------
// String functions
// ---------------------------------------------------------------------------

/**
 * SQL-compatible substr. 1-based indexing; negative start counts from end.
 *
 *   substr('ABCDEF', 2, 3)  => 'BCD'   (start at pos 2, length 3)
 *   substr('ABCDEF', -2)    => 'EF'    (last 2 chars)
 *   substr('ABCDEF', -3, 1) => 'D'     (1 char starting 3 from end)
 */
export function substr(
  str: string | null,
  start: number,
  length?: number
): string | null {
  if (str == null) return null;
  str = String(str);
  let idx: number;
  if (start < 0) {
    idx = str.length + start;
  } else {
    idx = start - 1; // SQL is 1-based
  }
  if (idx < 0) idx = 0;
  if (length !== undefined) {
    return str.substring(idx, idx + length);
  }
  return str.substring(idx);
}

export function to_number(x: unknown): number | null {
  if (x == null) return null;
  const n = Number(x);
  return isNaN(n) ? null : n;
}

/**
 * SQL-compatible to_char. Supports simple value-to-string and basic date
 * format strings used in the ruleblock corpus: 'YYYY', 'YYYYMMDD'.
 */
export function to_char(x: unknown, fmt?: string): string | null {
  if (x == null) return null;
  if (x instanceof Date) {
    if (!fmt) return x.toISOString();
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const d = String(x.getDate()).padStart(2, '0');
    switch (fmt.toUpperCase()) {
      case 'YYYY':
        return String(y);
      case 'YYYYMMDD':
        return `${y}${m}${d}`;
      case 'YYYY-MM-DD':
        return `${y}-${m}-${d}`;
      default:
        return `${y}-${m}-${d}`;
    }
  }
  return String(x);
}

/**
 * SQL-compatible to_date. Parses a string into a Date using a format mask.
 * Supports common Oracle format strings used in the ruleblock corpus.
 */
export function to_date(str: string | null, fmt?: string): Date | null {
  if (str == null) return null;
  if (!fmt) return new Date(str);
  const upper = fmt.toUpperCase();
  if (upper === 'YYYYMMDD' && str.length === 8) {
    const y = parseInt(str.substring(0, 4), 10);
    const m = parseInt(str.substring(4, 6), 10) - 1;
    const d = parseInt(str.substring(6, 8), 10);
    return new Date(y, m, d);
  }
  if (upper === 'YYYY-MM-DD' && str.length === 10) {
    return new Date(str);
  }
  // Fallback: let Date constructor try
  const result = new Date(str);
  return isNaN(result.getTime()) ? null : result;
}

// ---------------------------------------------------------------------------
// Date functions
// ---------------------------------------------------------------------------

/** Returns the current date (time portion zeroed for consistent day arithmetic). */
export function sysdate(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

/** Returns difference in days between two dates (d1 - d2), matching SQL date subtraction. */
export function daysBetween(d1: Date | null, d2: Date | null): number | null {
  if (d1 == null || d2 == null) return null;
  return (d1.getTime() - d2.getTime()) / 86400000;
}

/** Add days to a date, returning a new Date. Matches SQL: date + N. */
export function dateAdd(d: Date | null, days: number | null): Date | null {
  if (d == null || days == null) return null;
  return new Date(d.getTime() + days * 86400000);
}

// ---------------------------------------------------------------------------
// Collection helpers (for conditional `in` operator)
// ---------------------------------------------------------------------------

export function isIn(val: unknown, list: unknown[]): boolean {
  if (val == null) return false;
  return list.includes(val);
}

export function isNotIn(val: unknown, list: unknown[]): boolean {
  if (val == null) return false;
  return !list.includes(val);
}

export function between(val: number | null, low: number, high: number): boolean {
  if (val == null) return false;
  return val >= low && val <= high;
}

// ---------------------------------------------------------------------------
// Null-safe arithmetic helpers (for expression evaluator)
// ---------------------------------------------------------------------------

export function add(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  return a + b;
}

export function subtract(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  return a - b;
}

export function multiply(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  return a * b;
}

export function divide(a: number | null, b: number | null): number | null {
  if (a == null || b == null || b === 0) return null;
  return a / b;
}
