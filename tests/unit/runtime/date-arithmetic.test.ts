import { describe, it, expect } from 'vitest';
import { evaluateExpression, evaluatePredicate, EvalContext } from '../../../src/runtime/expression-evaluator';
import { to_date } from '../../../src/runtime/pico-functions';

// ---------------------------------------------------------------------------
// Date - Date → days
// ---------------------------------------------------------------------------

describe('date subtraction (Date - Date → days)', () => {
  it('computes age: round((sysdate-dob)/365.25, 0)', () => {
    const dob = new Date('1957-05-20');
    const today = new Date('2025-01-10');
    today.setHours(0, 0, 0, 0);
    const ctx: EvalContext = { sysdate: today, dob };

    // sysdate-dob should return days, then /365.25 gives years
    const age = evaluateExpression('round((sysdate - dob) / 365.25, 0)', ctx);
    expect(age).toBe(68); // Born 1957, evaluated in 2025
  });

  it('computes vintage in years: round((sysdate-htn_fd)/365, 0)', () => {
    const ctx: EvalContext = {
      sysdate: new Date('2025-01-10'),
      htn_fd: new Date('2020-03-15'),
    };
    const vintage = evaluateExpression('round((sysdate - htn_fd) / 365, 0)', ctx);
    expect(vintage).toBe(5); // ~5 years
  });

  it('computes date span in days', () => {
    const ctx: EvalContext = {
      egfr_l_dt: new Date('2025-01-10'),
      egfr_f_dt: new Date('2023-01-15'),
    };
    const days = evaluateExpression('egfr_l_dt - egfr_f_dt', ctx);
    expect(days).toBeCloseTo(726, 0); // ~2 years in days
  });

  it('returns null when either date is null', () => {
    const ctx: EvalContext = { d1: new Date('2025-01-01'), d2: null };
    expect(evaluateExpression('d1 - d2', ctx)).toBeNull();
    expect(evaluateExpression('d2 - d1', ctx)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Date - Number → new Date
// ---------------------------------------------------------------------------

describe('date minus number (Date - N → Date N days earlier)', () => {
  it('computes sysdate - 365 as a date', () => {
    const ctx: EvalContext = { sysdate: new Date('2025-01-10') };
    const result = evaluateExpression('sysdate - 365', ctx);
    expect(result).toBeInstanceOf(Date);
    expect((result as Date).toISOString().slice(0, 10)).toBe('2024-01-11');
  });

  it('works in predicates: dm_fd > sysdate - 365', () => {
    const ctx: EvalContext = {
      dm_fd: new Date('2024-06-01'),
      sysdate: new Date('2025-01-10'),
    };
    // 2024-06-01 > 2024-01-11 → true
    expect(evaluatePredicate('dm_fd > sysdate - 365', ctx)).toBe(true);

    // Old date should fail
    const ctx2: EvalContext = {
      dm_fd: new Date('2020-01-01'),
      sysdate: new Date('2025-01-10'),
    };
    expect(evaluatePredicate('dm_fd > sysdate - 365', ctx2)).toBe(false);
  });

  it('works in outdated checks: sysdate - egfr_l_dt > 730', () => {
    const ctx: EvalContext = {
      sysdate: new Date('2025-01-10'),
      egfr_l_dt: new Date('2022-01-01'), // ~3 years ago
    };
    // sysdate - egfr_l_dt = days (~1105), > 730 → true
    expect(evaluatePredicate('sysdate - egfr_l_dt > 730', ctx)).toBe(true);

    const ctxRecent: EvalContext = {
      sysdate: new Date('2025-01-10'),
      egfr_l_dt: new Date('2024-06-01'), // ~7 months ago
    };
    expect(evaluatePredicate('sysdate - egfr_l_dt > 730', ctxRecent)).toBe(false);
  });

  it('handles recency checks: (sysdate - hd_ld) < 14', () => {
    const ctx: EvalContext = {
      sysdate: new Date('2025-01-10'),
      hd_ld: new Date('2025-01-05'), // 5 days ago
    };
    expect(evaluatePredicate('(sysdate - hd_ld) < 14', ctx)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Date + Number → new Date
// ---------------------------------------------------------------------------

describe('date plus number (Date + N → Date N days later)', () => {
  it('computes date + days', () => {
    const ctx: EvalContext = { egfr_rn_dt: new Date('2025-01-10'), est_esrd_d: 365 };
    const result = evaluateExpression('egfr_rn_dt + est_esrd_d', ctx);
    expect(result).toBeInstanceOf(Date);
    expect((result as Date).toISOString().slice(0, 10)).toBe('2026-01-10');
  });

  it('works in predicates: tx_dt_ld > tx_dt_fd + 365', () => {
    const ctx: EvalContext = {
      tx_dt_ld: new Date('2025-01-10'),
      tx_dt_fd: new Date('2023-01-01'),
    };
    // tx_dt_fd + 365 = 2024-01-01, tx_dt_ld (2025-01-10) > that → true
    expect(evaluatePredicate('tx_dt_ld > tx_dt_fd + 365', ctx)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// extract(year/month/day from date)
// ---------------------------------------------------------------------------

describe('extract()', () => {
  it('extracts year from date', () => {
    const ctx: EvalContext = { dm_fd: new Date('2020-03-15') };
    expect(evaluateExpression('extract(year from dm_fd)', ctx)).toBe(2020);
  });

  it('extracts month from date', () => {
    const ctx: EvalContext = { d: new Date('2024-07-20') };
    expect(evaluateExpression('extract(month from d)', ctx)).toBe(7);
  });

  it('extracts day from date', () => {
    const ctx: EvalContext = { d: new Date('2024-07-20') };
    expect(evaluateExpression('extract(day from d)', ctx)).toBe(20);
  });

  it('returns null for null date', () => {
    const ctx: EvalContext = { d: null };
    expect(evaluateExpression('extract(year from d)', ctx)).toBeNull();
  });

  it('matches cd_dm_dx.prb pattern', () => {
    const ctx: EvalContext = { dm_fd: new Date('2018-11-20') };
    const result = evaluateExpression('extract(year from dm_fd)', ctx);
    expect(result).toBe(2018);
  });
});

// ---------------------------------------------------------------------------
// to_date(string, format)
// ---------------------------------------------------------------------------

describe('to_date()', () => {
  it('parses YYYYMMDD format', () => {
    const result = to_date('29991231', 'YYYYMMDD');
    expect(result).toBeInstanceOf(Date);
    expect(result!.getFullYear()).toBe(2999);
    expect(result!.getMonth()).toBe(11); // December
    expect(result!.getDate()).toBe(31);
  });

  it('works in expression evaluator', () => {
    const ctx: EvalContext = {};
    const result = evaluateExpression("to_date('20240315', 'YYYYMMDD')", ctx);
    expect(result).toBeInstanceOf(Date);
    expect((result as Date).getFullYear()).toBe(2024);
  });

  it('matches at_risk_dense.prb sentinel pattern', () => {
    const ctx: EvalContext = {
      ihd_fd: new Date('2020-06-01'),
      cva_fd: null,
      pvd_fd: null,
    };
    // least(ihd_fd, cva_fd, pvd_fd) < to_date('29991231','YYYYMMDD')
    // least with nulls returns null in Oracle, so this predicate would be false
    // But this tests that to_date parses correctly
    const sentinel = evaluateExpression("to_date('29991231', 'YYYYMMDD')", ctx);
    expect(sentinel).toBeInstanceOf(Date);
    expect((sentinel as Date).getFullYear()).toBe(2999);
  });

  it('returns null for null input', () => {
    expect(to_date(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// String concatenation via +
// ---------------------------------------------------------------------------

describe('string concatenation with +', () => {
  it('concatenates strings', () => {
    const ctx: EvalContext = {};
    expect(evaluateExpression("`hello` + `world`", ctx)).toBe('helloworld');
  });

  it('matches dmg_hrn.prb zero-padding pattern', () => {
    const ctx: EvalContext = { hrn_last_val_: 12345 };
    // substr('00000000' + to_char(hrn_last_val_), -7)
    const result = evaluateExpression("substr(`00000000` + to_char(hrn_last_val_), -7)", ctx);
    expect(result).toBe('0012345');
  });

  it('concatenates number to string', () => {
    const ctx: EvalContext = { x: 42 };
    expect(evaluateExpression("`val:` + to_char(x)", ctx)).toBe('val:42');
  });
});

// ---------------------------------------------------------------------------
// Full formula tests with date arithmetic
// ---------------------------------------------------------------------------

describe('full formulas with date arithmetic', () => {
  it('cd_htn.prb: htn_vintage_yr_', () => {
    const ctx: EvalContext = {
      htn_fd: new Date('2020-03-15'),
      sysdate: new Date('2025-01-10'),
    };
    // htn_vintage_yr_ : { htn_fd is not null => round((sysdate-htn_fd)/365,0)}
    expect(evaluatePredicate('htn_fd is not null', ctx)).toBe(true);
    const vintage = evaluateExpression('round((sysdate - htn_fd) / 365, 0)', ctx);
    expect(vintage).toBe(5);
  });

  it('cvra.prb: age from dob', () => {
    const ctx: EvalContext = {
      dob: new Date('1957-05-20'),
      sysdate: new Date('2025-03-31'),
    };
    const age = evaluateExpression('round(((sysdate - dob) / 365.25), 0)', ctx);
    expect(age).toBe(68);
  });

  it('tg4100.prb: days since creatinine', () => {
    const ctx: EvalContext = {
      sysdate: new Date('2025-01-10'),
      cr_ld: new Date('2024-12-01'),
    };
    const days = evaluateExpression('round(sysdate - cr_ld, 0)', ctx);
    expect(days).toBe(40);
  });

  it('egfr_metrics.prb: estimated ESRD date', () => {
    const ctx: EvalContext = {
      est_esrd_d: 500, // days until ESRD
      egfr_rn_dt: new Date('2025-01-10'),
    };
    const result = evaluateExpression('egfr_rn_dt + est_esrd_d', ctx);
    expect(result).toBeInstanceOf(Date);
    // 500 days from 2025-01-10 ≈ 2026-05-25
    expect((result as Date).getFullYear()).toBe(2026);
  });

  it('cd_dm_dx.prb: dm_fd_year', () => {
    const ctx: EvalContext = { dm_fd: new Date('2018-11-20') };
    const year = evaluateExpression('extract(year from dm_fd)', ctx);
    expect(year).toBe(2018);
  });

  it('ckd_egfr_metrics.prb: rate of decline per year', () => {
    const ctx: EvalContext = {
      egfr_l_dt: new Date('2025-01-10'),
      egfr_max_dt: new Date('2023-06-01'),
      egfr_rn_val: 39,
      egfr60_last_val: 52,
    };
    // slope = (egfr_rn_val - egfr60_last_val) / ((egfr_l_dt - egfr_max_dt) / 365)
    const slope = evaluateExpression(
      'round((egfr_rn_val - egfr60_last_val) / ((egfr_l_dt - egfr_max_dt) / 365), 3)',
      ctx
    );
    expect(slope).not.toBeNull();
    expect(slope as number).toBeLessThan(0); // declining
    // -13 / (588/365) ≈ -8.07 per year
    expect(slope as number).toBeCloseTo(-8.07, 0);
  });
});
