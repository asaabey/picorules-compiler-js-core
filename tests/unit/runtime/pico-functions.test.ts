import { describe, it, expect } from 'vitest';
import {
  round, ln, exp, power, abs, ceil, log, sqrt,
  nvl, coalesce,
  greatest, least, greatest_date, least_date,
  substr, to_number, to_char,
  sysdate, daysBetween, dateAdd,
  isIn, isNotIn, between,
  add, subtract, multiply, divide,
} from '../../../src/runtime/pico-functions';

// -------------------------------------------------------------------------
// Math functions
// -------------------------------------------------------------------------

describe('round', () => {
  it('rounds to specified decimals', () => {
    expect(round(12.345, 2)).toBe(12.35);
    expect(round(12.344, 2)).toBe(12.34);
    expect(round(12.345, 0)).toBe(12);
    expect(round(12.345, 1)).toBe(12.3);
  });
  it('handles negative numbers', () => {
    expect(round(-12.345, 2)).toBe(-12.35);
  });
  it('returns null for null input', () => {
    expect(round(null, 2)).toBeNull();
  });
});

describe('ln', () => {
  it('computes natural log', () => {
    expect(ln(1)).toBe(0);
    expect(ln(Math.E)).toBeCloseTo(1, 10);
  });
  it('returns null for null', () => {
    expect(ln(null)).toBeNull();
  });
});

describe('exp', () => {
  it('computes e^x', () => {
    expect(exp(0)).toBe(1);
    expect(exp(1)).toBeCloseTo(Math.E, 10);
  });
  it('returns null for null', () => {
    expect(exp(null)).toBeNull();
  });
  it('ln and exp are inverse', () => {
    expect(exp(ln(5)!)).toBeCloseTo(5, 10);
  });
});

describe('power', () => {
  it('computes x^n', () => {
    expect(power(2, 3)).toBe(8);
    expect(power(10, 0)).toBe(1);
    expect(power(0.5, 2)).toBe(0.25);
  });
  it('returns null if either arg is null', () => {
    expect(power(null, 2)).toBeNull();
    expect(power(2, null)).toBeNull();
  });
});

describe('abs', () => {
  it('returns absolute value', () => {
    expect(abs(-5)).toBe(5);
    expect(abs(5)).toBe(5);
    expect(abs(0)).toBe(0);
  });
  it('returns null for null', () => {
    expect(abs(null)).toBeNull();
  });
});

describe('ceil', () => {
  it('rounds up', () => {
    expect(ceil(1.1)).toBe(2);
    expect(ceil(1.9)).toBe(2);
    expect(ceil(2.0)).toBe(2);
    expect(ceil(-1.1)).toBe(-1);
  });
  it('returns null for null', () => {
    expect(ceil(null)).toBeNull();
  });
});

describe('log', () => {
  it('computes log with specified base', () => {
    expect(log(10, 100)).toBeCloseTo(2, 10);
    expect(log(2, 8)).toBeCloseTo(3, 10);
    expect(log(10, 1)).toBe(0);
  });
  it('returns null for null value', () => {
    expect(log(10, null)).toBeNull();
  });
});

describe('sqrt', () => {
  it('computes square root', () => {
    expect(sqrt(4)).toBe(2);
    expect(sqrt(9)).toBe(3);
    expect(sqrt(0)).toBe(0);
  });
  it('returns null for null', () => {
    expect(sqrt(null)).toBeNull();
  });
});

// -------------------------------------------------------------------------
// Complex formula: Framingham risk (validates that functions compose correctly)
// -------------------------------------------------------------------------

describe('Framingham formula composition', () => {
  it('computes CVR risk using the same function chain as cvra.prb', () => {
    // Sample patient: 65yo male, SBP 140, TC 6.0, HDL 1.2, non-smoker
    const age = 65;
    const male = 1;
    const sbp = 140;
    const tc = 6.0;
    const hdl = 1.2;
    const smoke = 0;

    // Framingham CHD formula from cvra.prb lines 105-110
    const L = 15.5305 + (28.4441 * (1 - male)) + (-1.4792 * ln(age)!) +
      (0 * ln(age)! * ln(age)!) +
      (-14.4588 * ln(age)! * (1 - male)) + (1.8515 * ln(age)! * ln(age)! * (1 - male)) +
      (-0.9119 * ln(sbp)!) + (-0.2767 * smoke) + (-0.7181 * ln(tc / hdl)!) +
      (-0.1759 * 1) + (-0.1999 * 1 * (1 - male)) + (-0.5865 * 0) + (0 * 0 * male);

    const scale = exp(0.9145)! * exp(-0.2784 * L)!;
    const risk_5_chd = round(100 * (1 - exp(-exp((ln(5)! - L) / scale)!)!), 2);

    expect(risk_5_chd).not.toBeNull();
    expect(typeof risk_5_chd).toBe('number');
    expect(risk_5_chd!).toBeGreaterThan(0);
    expect(risk_5_chd!).toBeLessThan(100);
  });

  it('returns null when any input is null (matching SQL null propagation)', () => {
    // If age is null, ln(null) = null, entire formula should collapse
    const result = ln(null);
    expect(result).toBeNull();

    // Arithmetic with null propagates
    const sum = add(5, result);
    expect(sum).toBeNull();
  });
});

// -------------------------------------------------------------------------
// BMI calculation (from cd_obesity.prb)
// -------------------------------------------------------------------------

describe('BMI formula', () => {
  it('computes BMI = wt / power(ht/100, 2)', () => {
    const bmi = round(divide(80, power(divide(175, 100), 2))!, 1);
    expect(bmi).toBeCloseTo(26.1, 1);
  });
});

// -------------------------------------------------------------------------
// Null-handling functions
// -------------------------------------------------------------------------

describe('nvl', () => {
  it('returns value when not null', () => {
    expect(nvl(5, 0)).toBe(5);
    expect(nvl('hello', 'default')).toBe('hello');
  });
  it('returns default when null or undefined', () => {
    expect(nvl(null, 0)).toBe(0);
    expect(nvl(undefined, 'default')).toBe('default');
  });
  it('treats 0 and empty string as non-null', () => {
    expect(nvl(0, 99)).toBe(0);
    expect(nvl('', 'default')).toBe('');
  });
});

describe('coalesce', () => {
  it('returns first non-null value', () => {
    expect(coalesce(null, null, 3, 4)).toBe(3);
    expect(coalesce(1, 2, 3)).toBe(1);
    expect(coalesce(null, 'a', 'b')).toBe('a');
  });
  it('returns null when all args are null', () => {
    expect(coalesce(null, null, null)).toBeNull();
  });
  it('treats 0 and empty string as non-null', () => {
    expect(coalesce(null, 0, 5)).toBe(0);
    expect(coalesce(null, '', 'x')).toBe('');
  });
});

// -------------------------------------------------------------------------
// Comparison functions
// -------------------------------------------------------------------------

describe('greatest', () => {
  it('returns max value', () => {
    expect(greatest(1, 5, 3)).toBe(5);
    expect(greatest(-1, -5, -3)).toBe(-1);
    expect(greatest(7)).toBe(7);
  });
  it('returns null if ANY argument is null (Oracle semantics)', () => {
    expect(greatest(1, null, 3)).toBeNull();
    expect(greatest(null)).toBeNull();
  });
});

describe('least', () => {
  it('returns min value', () => {
    expect(least(1, 5, 3)).toBe(1);
    expect(least(-1, -5, -3)).toBe(-5);
  });
  it('returns null if ANY argument is null (Oracle semantics)', () => {
    expect(least(1, null, 3)).toBeNull();
  });
});

// -------------------------------------------------------------------------
// Date comparison functions
// -------------------------------------------------------------------------

describe('greatest_date', () => {
  const d1 = new Date('2024-01-15');
  const d2 = new Date('2024-06-20');
  const d3 = new Date('2024-03-10');

  it('returns the latest date', () => {
    const result = greatest_date(d1, d2, d3);
    expect(result!.getTime()).toBe(d2.getTime());
  });
  it('skips nulls (unlike greatest for numbers)', () => {
    const result = greatest_date(d1, null, d3);
    expect(result!.getTime()).toBe(d3.getTime());
  });
  it('returns null when ALL dates are null', () => {
    expect(greatest_date(null, null)).toBeNull();
  });
  it('works with single date', () => {
    expect(greatest_date(d1)!.getTime()).toBe(d1.getTime());
  });
});

describe('least_date', () => {
  const d1 = new Date('2024-01-15');
  const d2 = new Date('2024-06-20');
  const d3 = new Date('2024-03-10');

  it('returns the earliest date', () => {
    const result = least_date(d1, d2, d3);
    expect(result!.getTime()).toBe(d1.getTime());
  });
  it('skips nulls', () => {
    const result = least_date(null, d2, d3);
    expect(result!.getTime()).toBe(d3.getTime());
  });
  it('returns null when ALL dates are null', () => {
    expect(least_date(null, null)).toBeNull();
  });
});

// -------------------------------------------------------------------------
// String functions
// -------------------------------------------------------------------------

describe('substr', () => {
  it('extracts with positive 1-based index', () => {
    expect(substr('ABCDEF', 2, 3)).toBe('BCD');
    expect(substr('ABCDEF', 1, 1)).toBe('A');
    expect(substr('ABCDEF', 1)).toBe('ABCDEF');
    expect(substr('ABCDEF', 4)).toBe('DEF');
  });
  it('extracts with negative index (from end)', () => {
    expect(substr('ABCDEF', -2)).toBe('EF');
    expect(substr('ABCDEF', -1)).toBe('F');
    expect(substr('ABCDEF', -3, 1)).toBe('D');
  });
  it('handles zero-padding pattern from dmg_hrn.prb', () => {
    // substr('00000000' + to_char(val), -7)
    const val = 12345;
    const padded = '00000000' + String(val);
    expect(substr(padded, -7)).toBe('0012345');
  });
  it('handles digit extraction pattern from cd_careplan.prb', () => {
    // to_number(substr(to_char(cp_l_val), -5, 1))
    const cp_l_val = 1234567;
    const digit = to_number(substr(to_char(cp_l_val)!, -5, 1));
    expect(digit).toBe(3); // 5th from end of '1234567' is '3'
  });
  it('returns null for null input', () => {
    expect(substr(null, 1, 3)).toBeNull();
  });
});

describe('to_number', () => {
  it('converts strings to numbers', () => {
    expect(to_number('42')).toBe(42);
    expect(to_number('3.14')).toBe(3.14);
    expect(to_number('-7')).toBe(-7);
  });
  it('returns number unchanged', () => {
    expect(to_number(42)).toBe(42);
  });
  it('returns null for non-numeric strings', () => {
    expect(to_number('abc')).toBeNull();
  });
  it('returns null for null/undefined', () => {
    expect(to_number(null)).toBeNull();
    expect(to_number(undefined)).toBeNull();
  });
});

describe('to_char', () => {
  it('converts numbers to strings', () => {
    expect(to_char(42)).toBe('42');
    expect(to_char(3.14)).toBe('3.14');
  });
  it('formats dates with YYYY', () => {
    expect(to_char(new Date('2024-03-15'), 'YYYY')).toBe('2024');
  });
  it('formats dates with YYYYMMDD', () => {
    expect(to_char(new Date('2024-03-15'), 'YYYYMMDD')).toBe('20240315');
  });
  it('returns null for null', () => {
    expect(to_char(null)).toBeNull();
    expect(to_char(null, 'YYYY')).toBeNull();
  });
});

// -------------------------------------------------------------------------
// Date functions
// -------------------------------------------------------------------------

describe('sysdate', () => {
  it('returns today with time zeroed', () => {
    const d = sysdate();
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
  });
  it('returns a Date for today', () => {
    const d = sysdate();
    const now = new Date();
    expect(d.getFullYear()).toBe(now.getFullYear());
    expect(d.getMonth()).toBe(now.getMonth());
    expect(d.getDate()).toBe(now.getDate());
  });
});

describe('daysBetween', () => {
  it('computes positive difference', () => {
    const d1 = new Date('2024-06-20');
    const d2 = new Date('2024-01-01');
    expect(daysBetween(d1, d2)).toBeCloseTo(171, 0); // 171 days
  });
  it('computes negative difference', () => {
    const d1 = new Date('2024-01-01');
    const d2 = new Date('2024-06-20');
    expect(daysBetween(d1, d2)).toBeCloseTo(-171, 0);
  });
  it('returns 0 for same date', () => {
    const d = new Date('2024-03-15');
    expect(daysBetween(d, d)).toBe(0);
  });
  it('returns null if either date is null', () => {
    expect(daysBetween(null, new Date())).toBeNull();
    expect(daysBetween(new Date(), null)).toBeNull();
  });
  it('age calculation matches SQL pattern: round((sysdate-dob)/365.25, 0)', () => {
    // A person born on 1960-01-01 should be ~64-66 years old
    const dob = new Date('1960-01-01');
    const today = sysdate();
    const age = round(daysBetween(today, dob)! / 365.25, 0);
    expect(age).not.toBeNull();
    expect(age!).toBeGreaterThanOrEqual(64);
    expect(age!).toBeLessThanOrEqual(67);
  });
});

describe('dateAdd', () => {
  it('adds days to a date', () => {
    const d = new Date('2024-01-01');
    const result = dateAdd(d, 30)!;
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(0); // January
    expect(result.getDate()).toBe(31);
  });
  it('subtracts days with negative value', () => {
    const d = new Date('2024-06-15');
    const result = dateAdd(d, -365)!;
    expect(result.getFullYear()).toBe(2023);
  });
  it('returns null if date is null', () => {
    expect(dateAdd(null, 30)).toBeNull();
  });
  it('returns null if days is null', () => {
    expect(dateAdd(new Date(), null)).toBeNull();
  });
});

// -------------------------------------------------------------------------
// Collection helpers
// -------------------------------------------------------------------------

describe('isIn', () => {
  it('returns true when value is in list', () => {
    expect(isIn(2, [1, 2, 3])).toBe(true);
    expect(isIn('a', ['a', 'b', 'c'])).toBe(true);
  });
  it('returns false when value is not in list', () => {
    expect(isIn(5, [1, 2, 3])).toBe(false);
  });
  it('returns false for null value', () => {
    expect(isIn(null, [1, 2, 3])).toBe(false);
  });
  it('matches rrt.prb pattern: rrt in (1,2,4)', () => {
    expect(isIn(1, [1, 2, 4])).toBe(true);
    expect(isIn(3, [1, 2, 4])).toBe(false);
  });
});

describe('isNotIn', () => {
  it('returns true when value is not in list', () => {
    expect(isNotIn(5, [1, 2, 3])).toBe(true);
  });
  it('returns false when value is in list', () => {
    expect(isNotIn(2, [1, 2, 3])).toBe(false);
  });
  it('returns false for null value', () => {
    expect(isNotIn(null, [1, 2, 3])).toBe(false);
  });
});

describe('between', () => {
  it('returns true when value is in range', () => {
    expect(between(5, 1, 10)).toBe(true);
    expect(between(1, 1, 10)).toBe(true);   // inclusive lower
    expect(between(10, 1, 10)).toBe(true);  // inclusive upper
  });
  it('returns false when value is out of range', () => {
    expect(between(0, 1, 10)).toBe(false);
    expect(between(11, 1, 10)).toBe(false);
  });
  it('returns false for null value', () => {
    expect(between(null, 1, 10)).toBe(false);
  });
  it('matches periop_nsqip.prb pattern: age between 65 and 70', () => {
    expect(between(65, 65, 70)).toBe(true);
    expect(between(67, 65, 70)).toBe(true);
    expect(between(64, 65, 70)).toBe(false);
  });
});

// -------------------------------------------------------------------------
// Null-safe arithmetic
// -------------------------------------------------------------------------

describe('null-safe arithmetic', () => {
  it('add works with values', () => {
    expect(add(3, 4)).toBe(7);
  });
  it('add returns null when either operand is null', () => {
    expect(add(null, 4)).toBeNull();
    expect(add(3, null)).toBeNull();
  });
  it('subtract works with values', () => {
    expect(subtract(10, 3)).toBe(7);
  });
  it('subtract returns null when either operand is null', () => {
    expect(subtract(null, 3)).toBeNull();
  });
  it('multiply works with values', () => {
    expect(multiply(3, 4)).toBe(12);
  });
  it('multiply returns null when either operand is null', () => {
    expect(multiply(null, 4)).toBeNull();
  });
  it('divide works with values', () => {
    expect(divide(12, 4)).toBe(3);
  });
  it('divide returns null when either operand is null', () => {
    expect(divide(null, 4)).toBeNull();
    expect(divide(12, null)).toBeNull();
  });
  it('divide returns null for division by zero', () => {
    expect(divide(12, 0)).toBeNull();
  });
});

// -------------------------------------------------------------------------
// SQL null propagation: verify chain behaviour
// -------------------------------------------------------------------------

describe('null propagation through function chains', () => {
  it('null propagates through arithmetic chain', () => {
    // Simulates: round(ln(null) * 5 + 3, 2)
    const step1 = ln(null);         // null
    const step2 = multiply(step1, 5); // null
    const step3 = add(step2, 3);      // null
    const result = round(step3, 2);   // null
    expect(result).toBeNull();
  });

  it('coalesce breaks null propagation (as intended)', () => {
    const step1 = ln(null);           // null
    const step2 = coalesce(step1, 0); // 0
    const step3 = add(step2, 3);      // 3
    expect(step3).toBe(3);
  });

  it('nvl breaks null propagation (as intended)', () => {
    const step1: number | null = null;
    const step2 = nvl(step1, 0);   // 0
    const step3 = add(step2, 5);   // 5
    expect(step3).toBe(5);
  });
});

// -------------------------------------------------------------------------
// KFRE formula composition (from kfre.prb)
// -------------------------------------------------------------------------

describe('KFRE formula', () => {
  it('computes 2-year KFRE risk', () => {
    const egfr_val = 25;
    const male = 1;
    const uacr_val = 300;
    const age = 70;

    const kfre4v_exp = exp(
      (-0.5567 * (egfr_val / 5 - 7.222)) +
      (0.2467 * (male - 0.5642)) +
      (0.451 * (ln(uacr_val * 8.84)! - 5.137)) -
      (0.2201 * (age / 10 - 7.036))
    );

    const kfre4v_2yr = round(1 - power(0.9832, kfre4v_exp!)!, 2);

    expect(kfre4v_2yr).not.toBeNull();
    expect(kfre4v_2yr!).toBeGreaterThan(0);
    expect(kfre4v_2yr!).toBeLessThan(1);
  });
});
