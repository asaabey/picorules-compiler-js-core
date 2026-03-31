import { describe, it, expect } from 'vitest';
import {
  DataRecord, DvResult,
  last, first, count, sum, avg, min, max, median, distinct_count,
  nth, lastdv, firstdv, maxldv, minldv, minfdv,
  exists,
  serialize, serializedv,
  regr_slope, regr_intercept, regr_r2,
  stats_mode,
  max_neg_delta_dv, temporal_regularity,
  DV_FUNCTIONS, dispatchAggregation,
} from '../../../src/runtime/aggregators';

// ---------------------------------------------------------------------------
// Test data fixtures
// ---------------------------------------------------------------------------

/** Haemoglobin values over time — typical lab pattern */
const hbRecords: DataRecord[] = [
  { val: 118, dt: new Date('2024-03-15') },
  { val: 121, dt: new Date('2024-06-20') },
  { val: 115, dt: new Date('2024-01-10') },
  { val: 125, dt: new Date('2024-09-01') },
  { val: 110, dt: new Date('2023-12-01') },
];

/** eGFR declining over time — CKD progression */
const egfrRecords: DataRecord[] = [
  { val: 55, dt: new Date('2023-01-01') },
  { val: 50, dt: new Date('2023-06-01') },
  { val: 47, dt: new Date('2024-01-01') },
  { val: 44, dt: new Date('2024-06-01') },
  { val: 42, dt: new Date('2024-12-01') },
];

/** ICD codes — presence/absence, val is always 1 */
const icdRecords: DataRecord[] = [
  { val: 1, dt: new Date('2022-05-10') },
  { val: 1, dt: new Date('2023-08-15') },
];

/** Empty dataset */
const emptyRecords: DataRecord[] = [];

/** Single record */
const singleRecord: DataRecord[] = [
  { val: 42, dt: new Date('2024-01-01') },
];

/** Records with nulls */
const withNulls: DataRecord[] = [
  { val: 10, dt: new Date('2024-01-01') },
  { val: null, dt: new Date('2024-02-01') },
  { val: 30, dt: new Date('2024-03-01') },
  { val: null, dt: null },
];

/** String values (e.g., location codes) */
const stringRecords: DataRecord[] = [
  { val: 'SITE_A', dt: new Date('2024-01-01') },
  { val: 'SITE_B', dt: new Date('2024-02-01') },
  { val: 'SITE_A', dt: new Date('2024-03-01') },
  { val: 'SITE_A', dt: new Date('2024-04-01') },
  { val: 'SITE_C', dt: new Date('2024-05-01') },
];

/** Regularly spaced records (for temporal_regularity) */
const regularRecords: DataRecord[] = [
  { val: 1, dt: new Date('2024-01-01') },
  { val: 1, dt: new Date('2024-02-01') },  // ~31 days
  { val: 1, dt: new Date('2024-03-01') },  // ~29 days
  { val: 1, dt: new Date('2024-04-01') },  // ~31 days
];

/** Irregularly spaced records */
const irregularRecords: DataRecord[] = [
  { val: 1, dt: new Date('2024-01-01') },
  { val: 1, dt: new Date('2024-01-05') },  // 4 days
  { val: 1, dt: new Date('2024-06-01') },  // ~148 days
  { val: 1, dt: new Date('2024-06-03') },  // 2 days
];

// ---------------------------------------------------------------------------
// Basic fetch functions
// ---------------------------------------------------------------------------

describe('last', () => {
  it('returns the most recent value', () => {
    expect(last(hbRecords)).toBe(125); // 2024-09-01
  });
  it('returns null for empty records', () => {
    expect(last(emptyRecords)).toBeNull();
  });
  it('works with single record', () => {
    expect(last(singleRecord)).toBe(42);
  });
});

describe('first', () => {
  it('returns the earliest value', () => {
    expect(first(hbRecords)).toBe(110); // 2023-12-01
  });
  it('returns null for empty records', () => {
    expect(first(emptyRecords)).toBeNull();
  });
});

describe('count', () => {
  it('counts all records', () => {
    expect(count(hbRecords)).toBe(5);
  });
  it('returns 0 for empty records', () => {
    expect(count(emptyRecords)).toBe(0);
  });
  it('counts records including those with null values', () => {
    expect(count(withNulls)).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Aggregation functions
// ---------------------------------------------------------------------------

describe('sum', () => {
  it('sums numeric values', () => {
    expect(sum(hbRecords)).toBe(118 + 121 + 115 + 125 + 110);
  });
  it('skips null values', () => {
    expect(sum(withNulls)).toBe(40); // 10 + 30
  });
  it('returns null for empty records', () => {
    expect(sum(emptyRecords)).toBeNull();
  });
});

describe('avg', () => {
  it('computes average of numeric values', () => {
    expect(avg(hbRecords)).toBeCloseTo((118 + 121 + 115 + 125 + 110) / 5, 10);
  });
  it('skips null values', () => {
    expect(avg(withNulls)).toBe(20); // (10 + 30) / 2
  });
  it('returns null for empty records', () => {
    expect(avg(emptyRecords)).toBeNull();
  });
});

describe('min', () => {
  it('returns minimum numeric value', () => {
    expect(min(hbRecords)).toBe(110);
  });
  it('returns null for empty records', () => {
    expect(min(emptyRecords)).toBeNull();
  });
});

describe('max', () => {
  it('returns maximum numeric value', () => {
    expect(max(hbRecords)).toBe(125);
  });
  it('returns null for empty records', () => {
    expect(max(emptyRecords)).toBeNull();
  });
});

describe('median', () => {
  it('returns median of odd-count dataset', () => {
    expect(median(hbRecords)).toBe(118); // sorted: 110,115,118,121,125 → middle
  });
  it('returns average of two middle values for even-count', () => {
    const even: DataRecord[] = [
      { val: 10, dt: null },
      { val: 20, dt: null },
      { val: 30, dt: null },
      { val: 40, dt: null },
    ];
    expect(median(even)).toBe(25); // (20+30)/2
  });
  it('returns null for empty records', () => {
    expect(median(emptyRecords)).toBeNull();
  });
  it('returns value for single record', () => {
    expect(median(singleRecord)).toBe(42);
  });
});

describe('distinct_count', () => {
  it('counts unique values', () => {
    expect(distinct_count(stringRecords)).toBe(3); // SITE_A, SITE_B, SITE_C
  });
  it('excludes nulls', () => {
    expect(distinct_count(withNulls)).toBe(2); // 10, 30
  });
  it('returns 0 for empty records', () => {
    expect(distinct_count(emptyRecords)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Window / positioning functions
// ---------------------------------------------------------------------------

describe('nth', () => {
  it('returns nth most recent value (1-based)', () => {
    // sorted by date desc: 125 (Sep), 121 (Jun), 118 (Mar), 115 (Jan), 110 (Dec)
    expect(nth(hbRecords, ['1'])).toBe(125);  // most recent
    expect(nth(hbRecords, ['2'])).toBe(121);  // second most recent
    expect(nth(hbRecords, ['5'])).toBe(110);  // oldest
  });
  it('returns null if n exceeds record count', () => {
    expect(nth(hbRecords, ['10'])).toBeNull();
  });
  it('defaults to n=1', () => {
    expect(nth(hbRecords)).toBe(125);
  });
  it('returns null for empty records', () => {
    expect(nth(emptyRecords, ['1'])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DV (Date-Value) pair functions
// ---------------------------------------------------------------------------

describe('lastdv', () => {
  it('returns most recent value and date', () => {
    const result = lastdv(hbRecords)!;
    expect(result.val).toBe(125);
    expect(result.dt!.toISOString().slice(0, 10)).toBe('2024-09-01');
  });
  it('returns null for empty records', () => {
    expect(lastdv(emptyRecords)).toBeNull();
  });
});

describe('firstdv', () => {
  it('returns earliest value and date', () => {
    const result = firstdv(hbRecords)!;
    expect(result.val).toBe(110);
    expect(result.dt!.toISOString().slice(0, 10)).toBe('2023-12-01');
  });
});

describe('maxldv', () => {
  it('returns max value and its most recent date', () => {
    const result = maxldv(hbRecords)!;
    expect(result.val).toBe(125);
    expect(result.dt!.toISOString().slice(0, 10)).toBe('2024-09-01');
  });
  it('breaks ties by most recent date', () => {
    const tied: DataRecord[] = [
      { val: 100, dt: new Date('2024-01-01') },
      { val: 100, dt: new Date('2024-06-01') },
      { val: 90,  dt: new Date('2024-03-01') },
    ];
    const result = maxldv(tied)!;
    expect(result.val).toBe(100);
    expect(result.dt!.toISOString().slice(0, 10)).toBe('2024-06-01'); // most recent of the maxes
  });
});

describe('minldv', () => {
  it('returns min value and its most recent date', () => {
    const result = minldv(hbRecords)!;
    expect(result.val).toBe(110);
    expect(result.dt!.toISOString().slice(0, 10)).toBe('2023-12-01');
  });
  it('breaks ties by most recent date', () => {
    const tied: DataRecord[] = [
      { val: 50, dt: new Date('2024-01-01') },
      { val: 50, dt: new Date('2024-06-01') },
      { val: 80, dt: new Date('2024-03-01') },
    ];
    const result = minldv(tied)!;
    expect(result.val).toBe(50);
    expect(result.dt!.toISOString().slice(0, 10)).toBe('2024-06-01');
  });
});

describe('minfdv', () => {
  it('returns min value and its earliest date', () => {
    const tied: DataRecord[] = [
      { val: 50, dt: new Date('2024-01-01') },
      { val: 50, dt: new Date('2024-06-01') },
      { val: 80, dt: new Date('2024-03-01') },
    ];
    const result = minfdv(tied)!;
    expect(result.val).toBe(50);
    expect(result.dt!.toISOString().slice(0, 10)).toBe('2024-01-01'); // earliest of the mins
  });
});

// ---------------------------------------------------------------------------
// Existence function
// ---------------------------------------------------------------------------

describe('exists', () => {
  it('returns 1 when records exist', () => {
    expect(exists(hbRecords)).toBe(1);
    expect(exists(icdRecords)).toBe(1);
  });
  it('returns 0 for empty records', () => {
    expect(exists(emptyRecords)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Serialization functions
// ---------------------------------------------------------------------------

describe('serialize', () => {
  it('concatenates values in date order', () => {
    const records: DataRecord[] = [
      { val: 'C', dt: new Date('2024-03-01') },
      { val: 'A', dt: new Date('2024-01-01') },
      { val: 'B', dt: new Date('2024-02-01') },
    ];
    expect(serialize(records)).toBe('A,B,C');
  });
  it('uses custom delimiter', () => {
    const records: DataRecord[] = [
      { val: 1, dt: new Date('2024-01-01') },
      { val: 2, dt: new Date('2024-02-01') },
    ];
    expect(serialize(records, ['|'])).toBe('1|2');
  });
  it('returns null for empty records', () => {
    expect(serialize(emptyRecords)).toBeNull();
  });
});

describe('serializedv', () => {
  it('concatenates value~date pairs in date order', () => {
    const records: DataRecord[] = [
      { val: 120, dt: new Date('2024-02-01') },
      { val: 110, dt: new Date('2024-01-01') },
    ];
    const result = serializedv(records);
    expect(result).toBe('110~2024-01-01,120~2024-02-01');
  });
  it('returns null for empty records', () => {
    expect(serializedv(emptyRecords)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Statistical regression functions
// ---------------------------------------------------------------------------

describe('regr_slope', () => {
  it('detects declining trend (negative slope)', () => {
    const slope = regr_slope(egfrRecords);
    expect(slope).not.toBeNull();
    expect(slope!).toBeLessThan(0); // eGFR declining
  });
  it('detects flat trend (zero slope)', () => {
    const flat: DataRecord[] = [
      { val: 50, dt: new Date('2024-01-01') },
      { val: 50, dt: new Date('2024-06-01') },
      { val: 50, dt: new Date('2024-12-01') },
    ];
    expect(regr_slope(flat)).toBeCloseTo(0, 10);
  });
  it('detects increasing trend (positive slope)', () => {
    const increasing: DataRecord[] = [
      { val: 10, dt: new Date('2024-01-01') },
      { val: 20, dt: new Date('2024-02-01') },
      { val: 30, dt: new Date('2024-03-01') },
    ];
    expect(regr_slope(increasing)!).toBeGreaterThan(0);
  });
  it('returns null for fewer than 2 records', () => {
    expect(regr_slope(singleRecord)).toBeNull();
    expect(regr_slope(emptyRecords)).toBeNull();
  });
});

describe('regr_intercept', () => {
  it('returns baseline value at time zero', () => {
    const intercept = regr_intercept(egfrRecords);
    expect(intercept).not.toBeNull();
    // Intercept should be close to the first eGFR value (55)
    expect(intercept!).toBeGreaterThan(50);
    expect(intercept!).toBeLessThan(60);
  });
  it('returns null for fewer than 2 records', () => {
    expect(regr_intercept(singleRecord)).toBeNull();
  });
});

describe('regr_r2', () => {
  it('returns high R² for linear data', () => {
    const linear: DataRecord[] = [
      { val: 10, dt: new Date('2024-01-01') },
      { val: 20, dt: new Date('2024-02-01') },
      { val: 30, dt: new Date('2024-03-01') },
      { val: 40, dt: new Date('2024-04-01') },
    ];
    const r2 = regr_r2(linear);
    expect(r2).not.toBeNull();
    expect(r2!).toBeGreaterThan(0.99); // Near-perfect linear relationship
  });
  it('returns value between 0 and 1', () => {
    const r2 = regr_r2(egfrRecords);
    expect(r2).not.toBeNull();
    expect(r2!).toBeGreaterThanOrEqual(0);
    expect(r2!).toBeLessThanOrEqual(1);
  });
  it('returns null for fewer than 2 records', () => {
    expect(regr_r2(singleRecord)).toBeNull();
  });
});

describe('regression consistency', () => {
  it('slope and intercept predict correctly', () => {
    // For perfectly linear data: y = 10 + 1/day * x
    // 30 days apart, values 10, 40, 70
    const data: DataRecord[] = [
      { val: 10, dt: new Date('2024-01-01') },
      { val: 40, dt: new Date('2024-01-31') }, // 30 days later
      { val: 70, dt: new Date('2024-03-01') }, // 60 days later
    ];
    const slope = regr_slope(data)!;
    const intercept = regr_intercept(data)!;
    // At x=0 (day 0), predicted y = intercept = 10
    expect(intercept).toBeCloseTo(10, 5);
    // At x=30, predicted y = 10 + slope*30 = 40
    expect(intercept + slope * 30).toBeCloseTo(40, 5);
  });
});

// ---------------------------------------------------------------------------
// Statistical mode
// ---------------------------------------------------------------------------

describe('stats_mode', () => {
  it('returns most frequent value', () => {
    expect(stats_mode(stringRecords)).toBe('SITE_A'); // 3 occurrences
  });
  it('works with numeric values', () => {
    const nums: DataRecord[] = [
      { val: 1, dt: null },
      { val: 2, dt: null },
      { val: 2, dt: null },
      { val: 3, dt: null },
    ];
    expect(stats_mode(nums)).toBe(2);
  });
  it('returns null for empty records', () => {
    expect(stats_mode(emptyRecords)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Advanced functions
// ---------------------------------------------------------------------------

describe('max_neg_delta_dv', () => {
  it('finds the largest single-step decrease', () => {
    // eGFR: 55 → 50 → 47 → 44 → 42
    // Deltas: -5, -3, -3, -2 → largest negative is -5
    const result = max_neg_delta_dv(egfrRecords)!;
    expect(result.val).toBe(-5);
    expect(result.dt!.toISOString().slice(0, 10)).toBe('2023-06-01');
  });
  it('returns null when no negative deltas exist', () => {
    const increasing: DataRecord[] = [
      { val: 10, dt: new Date('2024-01-01') },
      { val: 20, dt: new Date('2024-02-01') },
      { val: 30, dt: new Date('2024-03-01') },
    ];
    expect(max_neg_delta_dv(increasing)).toBeNull();
  });
  it('returns null for fewer than 2 records', () => {
    expect(max_neg_delta_dv(singleRecord)).toBeNull();
    expect(max_neg_delta_dv(emptyRecords)).toBeNull();
  });
});

describe('temporal_regularity', () => {
  it('returns low CV for regularly spaced records', () => {
    const cv = temporal_regularity(regularRecords);
    expect(cv).not.toBeNull();
    expect(cv!).toBeLessThan(0.1); // ~30 day intervals, low variation
  });
  it('returns higher CV for irregular spacing', () => {
    const cv = temporal_regularity(irregularRecords);
    expect(cv).not.toBeNull();
    expect(cv!).toBeGreaterThan(1); // Highly irregular
  });
  it('returns null for 0 or 1 records', () => {
    expect(temporal_regularity(emptyRecords)).toBeNull();
    expect(temporal_regularity(singleRecord)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DV_FUNCTIONS set
// ---------------------------------------------------------------------------

describe('DV_FUNCTIONS', () => {
  it('contains all date-value pair functions', () => {
    expect(DV_FUNCTIONS.has('lastdv')).toBe(true);
    expect(DV_FUNCTIONS.has('firstdv')).toBe(true);
    expect(DV_FUNCTIONS.has('maxldv')).toBe(true);
    expect(DV_FUNCTIONS.has('minldv')).toBe(true);
    expect(DV_FUNCTIONS.has('minfdv')).toBe(true);
    expect(DV_FUNCTIONS.has('max_neg_delta_dv')).toBe(true);
  });
  it('does not contain non-DV functions', () => {
    expect(DV_FUNCTIONS.has('last')).toBe(false);
    expect(DV_FUNCTIONS.has('count')).toBe(false);
    expect(DV_FUNCTIONS.has('avg')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// dispatchAggregation
// ---------------------------------------------------------------------------

describe('dispatchAggregation', () => {
  it('dispatches basic functions correctly', () => {
    expect(dispatchAggregation('last', hbRecords)).toBe(125);
    expect(dispatchAggregation('first', hbRecords)).toBe(110);
    expect(dispatchAggregation('count', hbRecords)).toBe(5);
    expect(dispatchAggregation('max', hbRecords)).toBe(125);
    expect(dispatchAggregation('min', hbRecords)).toBe(110);
    expect(dispatchAggregation('exists', hbRecords)).toBe(1);
    expect(dispatchAggregation('exists', emptyRecords)).toBe(0);
  });
  it('dispatches DV functions correctly', () => {
    const result = dispatchAggregation('lastdv', hbRecords) as DvResult;
    expect(result.val).toBe(125);
    expect(result.dt).not.toBeNull();
  });
  it('dispatches nth with params', () => {
    expect(dispatchAggregation('nth', hbRecords, ['2'])).toBe(121);
  });
  it('throws for unknown function', () => {
    expect(() => dispatchAggregation('unknown_func', hbRecords)).toThrow('Unknown aggregation function');
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('handles records with null dates gracefully', () => {
    const noDates: DataRecord[] = [
      { val: 10, dt: null },
      { val: 20, dt: null },
    ];
    // last/first should still return a value (null dates sort to end)
    expect(last(noDates)).not.toBeNull();
    expect(first(noDates)).not.toBeNull();
    // Aggregations should work
    expect(sum(noDates)).toBe(30);
    expect(avg(noDates)).toBe(15);
  });

  it('handles string values in numeric functions gracefully', () => {
    const strNums: DataRecord[] = [
      { val: '10', dt: new Date('2024-01-01') },
      { val: '20', dt: new Date('2024-02-01') },
    ];
    // Numeric functions should coerce strings to numbers
    expect(sum(strNums)).toBe(30);
    expect(avg(strNums)).toBe(15);
    expect(min(strNums)).toBe(10);
    expect(max(strNums)).toBe(20);
  });

  it('handles all-null-value records', () => {
    const allNull: DataRecord[] = [
      { val: null, dt: new Date('2024-01-01') },
      { val: null, dt: new Date('2024-02-01') },
    ];
    expect(sum(allNull)).toBeNull();
    expect(avg(allNull)).toBeNull();
    expect(min(allNull)).toBeNull();
    expect(max(allNull)).toBeNull();
    expect(median(allNull)).toBeNull();
    expect(count(allNull)).toBe(2); // count counts records, not values
    expect(exists(allNull)).toBe(1); // records exist
  });
});
