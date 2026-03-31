import { describe, it, expect } from 'vitest';
import { evaluateExpression, evaluatePredicate, EvalContext } from '../../../src/runtime/expression-evaluator';

// ---------------------------------------------------------------------------
// Arithmetic expressions
// ---------------------------------------------------------------------------

describe('arithmetic', () => {
  const ctx: EvalContext = {};

  it('evaluates number literals', () => {
    expect(evaluateExpression('42', ctx)).toBe(42);
    expect(evaluateExpression('3.14', ctx)).toBe(3.14);
  });

  it('evaluates addition and subtraction', () => {
    expect(evaluateExpression('3 + 4', ctx)).toBe(7);
    expect(evaluateExpression('10 - 3', ctx)).toBe(7);
    expect(evaluateExpression('1 + 2 + 3', ctx)).toBe(6);
  });

  it('evaluates multiplication and division', () => {
    expect(evaluateExpression('3 * 4', ctx)).toBe(12);
    expect(evaluateExpression('12 / 4', ctx)).toBe(3);
  });

  it('respects operator precedence', () => {
    expect(evaluateExpression('2 + 3 * 4', ctx)).toBe(14);    // not 20
    expect(evaluateExpression('10 - 2 * 3', ctx)).toBe(4);    // not 24
    expect(evaluateExpression('12 / 3 + 1', ctx)).toBe(5);
  });

  it('handles parentheses', () => {
    expect(evaluateExpression('(2 + 3) * 4', ctx)).toBe(20);
    expect(evaluateExpression('((1 + 2) * (3 + 4))', ctx)).toBe(21);
  });

  it('handles unary minus', () => {
    expect(evaluateExpression('-5', ctx)).toBe(-5);
    expect(evaluateExpression('-5 + 3', ctx)).toBe(-2);
    expect(evaluateExpression('3 * -2', ctx)).toBe(-6);
  });

  it('handles null propagation in arithmetic', () => {
    const withNull: EvalContext = { x: null };
    expect(evaluateExpression('x + 5', withNull)).toBeNull();
    expect(evaluateExpression('x * 3', withNull)).toBeNull();
    expect(evaluateExpression('10 / x', withNull)).toBeNull();
  });

  it('handles division by zero', () => {
    expect(evaluateExpression('10 / 0', ctx)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Variable references
// ---------------------------------------------------------------------------

describe('variable references', () => {
  it('resolves variables from context', () => {
    const ctx: EvalContext = { age: 65, male: 1, hb_last: 118 };
    expect(evaluateExpression('age', ctx)).toBe(65);
    expect(evaluateExpression('male', ctx)).toBe(1);
    expect(evaluateExpression('hb_last', ctx)).toBe(118);
  });

  it('returns null for undefined variables', () => {
    expect(evaluateExpression('unknown_var', {})).toBeNull();
  });

  it('handles the dot shorthand for current variable', () => {
    const ctx: EvalContext = { my_var: 42 };
    expect(evaluateExpression('.', ctx, 'my_var')).toBe(42);
  });

  it('uses variables in arithmetic', () => {
    const ctx: EvalContext = { wt_val: 80, ht_val: 175 };
    // BMI = wt / (ht/100)^2 — using power function
    const result = evaluateExpression('round(wt_val / power(ht_val / 100, 2), 1)', ctx);
    expect(result).toBeCloseTo(26.1, 1);
  });
});

// ---------------------------------------------------------------------------
// Comparison operators
// ---------------------------------------------------------------------------

describe('comparison operators', () => {
  const ctx: EvalContext = { age: 65, egfr: 45, hb: null };

  it('equals (=)', () => {
    expect(evaluatePredicate('age = 65', ctx)).toBe(true);
    expect(evaluatePredicate('age = 70', ctx)).toBe(false);
  });

  it('not equals (!= and <>)', () => {
    expect(evaluatePredicate('age != 70', ctx)).toBe(true);
    expect(evaluatePredicate('age <> 70', ctx)).toBe(true);
    expect(evaluatePredicate('age != 65', ctx)).toBe(false);
  });

  it('less than (<)', () => {
    expect(evaluatePredicate('egfr < 60', ctx)).toBe(true);
    expect(evaluatePredicate('egfr < 40', ctx)).toBe(false);
  });

  it('greater than (>)', () => {
    expect(evaluatePredicate('age > 60', ctx)).toBe(true);
    expect(evaluatePredicate('age > 70', ctx)).toBe(false);
  });

  it('less than or equal (<=)', () => {
    expect(evaluatePredicate('egfr <= 45', ctx)).toBe(true);
    expect(evaluatePredicate('egfr <= 44', ctx)).toBe(false);
  });

  it('greater than or equal (>=)', () => {
    expect(evaluatePredicate('age >= 65', ctx)).toBe(true);
    expect(evaluatePredicate('age >= 66', ctx)).toBe(false);
  });

  it('null comparison returns false (SQL semantics)', () => {
    expect(evaluatePredicate('hb < 120', ctx)).toBe(false);
    expect(evaluatePredicate('hb = 0', ctx)).toBe(false);
    expect(evaluatePredicate('hb > 0', ctx)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Null operators (!? and ?)
// ---------------------------------------------------------------------------

describe('null operators', () => {
  const ctx: EvalContext = { hb_last: 118, acr: null };

  it('!? (is not null)', () => {
    expect(evaluatePredicate('hb_last!?', ctx)).toBe(true);
    expect(evaluatePredicate('acr!?', ctx)).toBe(false);
  });

  it('? (is null)', () => {
    expect(evaluatePredicate('acr?', ctx)).toBe(true);
    expect(evaluatePredicate('hb_last?', ctx)).toBe(false);
  });

  it('is null / is not null', () => {
    expect(evaluatePredicate('acr is null', ctx)).toBe(true);
    expect(evaluatePredicate('hb_last is not null', ctx)).toBe(true);
    expect(evaluatePredicate('hb_last is null', ctx)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Logical operators
// ---------------------------------------------------------------------------

describe('logical operators', () => {
  const ctx: EvalContext = { dm: 1, ckd: 3, age: 65 };

  it('and', () => {
    expect(evaluatePredicate('dm = 1 and age >= 60', ctx)).toBe(true);
    expect(evaluatePredicate('dm = 1 and age >= 70', ctx)).toBe(false);
  });

  it('or', () => {
    expect(evaluatePredicate('dm = 1 or ckd >= 3', ctx)).toBe(true);
    expect(evaluatePredicate('dm = 0 or ckd >= 5', ctx)).toBe(false);
  });

  it('not', () => {
    expect(evaluatePredicate('not dm = 0', ctx)).toBe(true);
    expect(evaluatePredicate('not dm = 1', ctx)).toBe(false);
  });

  it('operator precedence: not > and > or', () => {
    // dm=1 or (ckd=0 and age=65) — 'and' binds tighter
    expect(evaluatePredicate('dm = 1 or ckd = 0 and age = 65', ctx)).toBe(true);
    // (not dm=0) and ckd>=3 — 'not' binds tightest
    expect(evaluatePredicate('not dm = 0 and ckd >= 3', ctx)).toBe(true);
  });

  it('compound conditions from cvra.prb', () => {
    // dm60 : {dm=1 and age>=60 => 1},{=>0};
    expect(evaluatePredicate('dm = 1 and age >= 60', ctx)).toBe(true);
    // dmckd1 : {dm=1 and ckd>=1 => 1},{=>0};
    expect(evaluatePredicate('dm = 1 and ckd >= 1', ctx)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// between and in operators
// ---------------------------------------------------------------------------

describe('between', () => {
  const ctx: EvalContext = { age: 67 };

  it('returns true when value is in range', () => {
    expect(evaluatePredicate('age between 65 and 70', ctx)).toBe(true);
  });

  it('is inclusive on both ends', () => {
    expect(evaluatePredicate('age between 67 and 70', ctx)).toBe(true);
    expect(evaluatePredicate('age between 60 and 67', ctx)).toBe(true);
  });

  it('returns false when out of range', () => {
    expect(evaluatePredicate('age between 68 and 70', ctx)).toBe(false);
  });

  it('returns false when value is null', () => {
    expect(evaluatePredicate('x between 1 and 10', { x: null })).toBe(false);
  });
});

describe('in', () => {
  const ctx: EvalContext = { rrt: 2 };

  it('returns true when value is in list', () => {
    // rrt.prb: esrd : {rrt in (1,2,4)=>1},{=>0};
    expect(evaluatePredicate('rrt in (1, 2, 4)', ctx)).toBe(true);
  });

  it('returns false when value is not in list', () => {
    expect(evaluatePredicate('rrt in (1, 3, 5)', ctx)).toBe(false);
  });

  it('not in', () => {
    expect(evaluatePredicate('rrt not in (1, 3, 5)', ctx)).toBe(true);
    expect(evaluatePredicate('rrt not in (1, 2, 3)', ctx)).toBe(false);
  });

  it('returns false when value is null', () => {
    expect(evaluatePredicate('x in (1, 2, 3)', { x: null })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Function calls
// ---------------------------------------------------------------------------

describe('function calls', () => {
  const ctx: EvalContext = {};

  it('round', () => {
    expect(evaluateExpression('round(12.345, 2)', ctx)).toBe(12.35);
    expect(evaluateExpression('round(3.14159, 0)', ctx)).toBe(3);
  });

  it('ln and exp', () => {
    expect(evaluateExpression('ln(1)', ctx)).toBe(0);
    expect(evaluateExpression('exp(0)', ctx)).toBe(1);
    // exp(ln(x)) = x
    expect(evaluateExpression('exp(ln(5))', ctx)).toBeCloseTo(5, 10);
  });

  it('power', () => {
    expect(evaluateExpression('power(2, 3)', ctx)).toBe(8);
  });

  it('abs', () => {
    expect(evaluateExpression('abs(-5)', ctx)).toBe(5);
  });

  it('ceil', () => {
    expect(evaluateExpression('ceil(1.1)', ctx)).toBe(2);
  });

  it('sqrt', () => {
    expect(evaluateExpression('sqrt(9)', ctx)).toBe(3);
  });

  it('nvl', () => {
    const withNull: EvalContext = { x: null };
    expect(evaluateExpression('nvl(x, 0)', withNull)).toBe(0);
    const withVal: EvalContext = { x: 42 };
    expect(evaluateExpression('nvl(x, 0)', withVal)).toBe(42);
  });

  it('coalesce', () => {
    const ctx: EvalContext = { a: null, b: null, c: 3 };
    expect(evaluateExpression('coalesce(a, b, c)', ctx)).toBe(3);
  });

  it('greatest', () => {
    expect(evaluateExpression('greatest(1, 5, 3)', ctx)).toBe(5);
  });

  it('least', () => {
    expect(evaluateExpression('least(1, 5, 3)', ctx)).toBe(1);
  });

  it('substr', () => {
    const ctx: EvalContext = { s: 'ABCDEF' };
    expect(evaluateExpression("substr(s, 2, 3)", ctx)).toBe('BCD');
  });

  it('to_number', () => {
    expect(evaluateExpression("to_number('42')", ctx)).toBe(42);
  });

  it('to_char', () => {
    expect(evaluateExpression('to_char(42)', ctx)).toBe('42');
  });

  it('nested function calls', () => {
    expect(evaluateExpression('round(ln(exp(2)), 2)', ctx)).toBe(2);
  });

  it('function with null propagation', () => {
    const ctx: EvalContext = { x: null };
    expect(evaluateExpression('round(x, 2)', ctx)).toBeNull();
    expect(evaluateExpression('ln(x)', ctx)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// String literals
// ---------------------------------------------------------------------------

describe('string literals', () => {
  it('handles backtick-quoted strings', () => {
    expect(evaluateExpression('`G1`', {})).toBe('G1');
    expect(evaluateExpression('`NA`', {})).toBe('NA');
  });

  it('handles single-quoted strings', () => {
    expect(evaluateExpression("'YYYY'", {})).toBe('YYYY');
  });
});

// ---------------------------------------------------------------------------
// Real ruleblock expressions
// ---------------------------------------------------------------------------

describe('real ruleblock expressions', () => {
  it('cvra.prb: age calculation', () => {
    // age : { dob < sysdate => round(((sysdate-dob)/365.25),0)};
    // We test the return value expression with pre-computed sysdate-dob
    const ctx: EvalContext = { sysdate_minus_dob: 23741 }; // ~65 years in days
    expect(evaluateExpression('round(sysdate_minus_dob / 365.25, 0)', ctx)).toBe(65);
  });

  it('cvra.prb: override criteria', () => {
    const ctx: EvalContext = { dm60: 0, dmckd1: 0, ckd3: 1, tc7: 0, sbp180: 0, age74: 0, cvd_prev: 0 };
    // risk_high_ovr : { greatest(dm60,dmckd1,ckd3,tc7,sbp180,age74,cvd_prev)>0 =>1},{=>0};
    expect(evaluatePredicate('greatest(dm60, dmckd1, ckd3, tc7, sbp180, age74, cvd_prev) > 0', ctx)).toBe(true);
  });

  it('cvra.prb: ln_zero exclusion', () => {
    // ln_zero_ex1 : { nvl(least(age,tc,hdl,sbp),0)=0 => 1},{=>0};
    const ctx: EvalContext = { age: 65, tc: 5.5, hdl: 1.2, sbp: 140 };
    expect(evaluatePredicate('nvl(least(age, tc, hdl, sbp), 0) = 0', ctx)).toBe(false);

    // When one is null, least returns null, nvl converts to 0
    const ctx2: EvalContext = { age: 65, tc: null, hdl: 1.2, sbp: 140 };
    expect(evaluatePredicate('nvl(least(age, tc, hdl, sbp), 0) = 0', ctx2)).toBe(true);
  });

  it('cvra.prb: Framingham CHD risk formula', () => {
    // Simplified version of the risk_5_chd formula
    const ctx: EvalContext = {
      risk_high_ovr: 0, ln_zero_ex1: 0,
      age: 65, male: 1, sbp: 140, smoke: 0, tc: 6.0, hdl: 1.2,
    };

    // The actual predicate
    expect(evaluatePredicate('risk_high_ovr = 0 and ln_zero_ex1 = 0', ctx)).toBe(true);

    // A portion of the return value expression
    const result = evaluateExpression(
      'round(100 * (1 - exp(-exp((ln(5) - (15.5305 + (-1.4792 * ln(age)))) / (exp(0.9145))))), 2)',
      ctx
    );
    expect(result).not.toBeNull();
    expect(typeof result).toBe('number');
  });

  it('cd_masld.prb: FLI calculation', () => {
    const ctx: EvalContext = { tg_val: 180, ggt_val: 45, wc_val: 95, bmi: 28 };

    // fli_l : { fli_data=1 => 0.953*ln(tg_val) + 0.139*bmi + 0.718*ln(ggt_val) + 0.053*wc_val - 15.745 };
    const fli_l = evaluateExpression(
      '0.953 * ln(tg_val) + 0.139 * bmi + 0.718 * ln(ggt_val) + 0.053 * wc_val - 15.745',
      ctx
    );
    expect(fli_l).not.toBeNull();

    // fli : { fli_l!? => round(100 * exp(fli_l) / (1 + exp(fli_l)), 1) };
    const ctx2 = { ...ctx, fli_l };
    const fli = evaluateExpression('round(100 * exp(fli_l) / (1 + exp(fli_l)), 1)', ctx2);
    expect(fli).not.toBeNull();
    expect(typeof fli).toBe('number');
    expect(fli).toBeGreaterThan(0);
    expect(fli).toBeLessThan(100);
  });

  it('kfre.prb: KFRE 4-variable equation', () => {
    const ctx: EvalContext = { egfr_val: 25, male: 1, uacr_val: 300, age: 70, kfre4v_ap: 1 };

    expect(evaluatePredicate('kfre4v_ap = 1', ctx)).toBe(true);

    const kfre4v_exp = evaluateExpression(
      'exp((-0.5567 * (egfr_val / 5 - 7.222)) + (0.2467 * (male - 0.5642)) + (0.451 * (ln(uacr_val * 8.84) - 5.137)) - (0.2201 * (age / 10 - 7.036)))',
      ctx
    );
    expect(kfre4v_exp).not.toBeNull();

    const ctx2 = { ...ctx, kfre4v_exp };
    const kfre4v_2yr = evaluateExpression('round(1 - power(0.9832, kfre4v_exp), 2)', ctx2);
    expect(kfre4v_2yr).not.toBeNull();
    expect(kfre4v_2yr).toBeGreaterThan(0);
    expect(kfre4v_2yr).toBeLessThan(1);
  });

  it('cd_obesity.prb: BMI', () => {
    const ctx: EvalContext = { wt_val: 80, ht_val: 175, ht_err: 0, wt_err: 0 };
    expect(evaluatePredicate('ht_err = 0 and wt_err = 0', ctx)).toBe(true);
    const bmi = evaluateExpression('round(wt_val / power(ht_val / 100, 2), 1)', ctx);
    expect(bmi).toBeCloseTo(26.1, 1);
  });

  it('ckd.prb: CKD staging', () => {
    // ckd_stage : { egfr >= 90 => 1 }, { egfr >= 60 => 2 }, { egfr >= 45 => 3 }, { => 0 };
    const ctx: EvalContext = { egfr: 55 };
    expect(evaluatePredicate('egfr >= 90', ctx)).toBe(false);
    expect(evaluatePredicate('egfr >= 60', ctx)).toBe(false);
    expect(evaluatePredicate('egfr >= 45', ctx)).toBe(true);
  });

  it('rrt.prb: in-list check', () => {
    // esrd : {rrt in (1,2,4)=>1},{=>0};
    const ctx: EvalContext = { rrt: 2 };
    expect(evaluatePredicate('rrt in (1, 2, 4)', ctx)).toBe(true);
  });

  it('periop_nsqip.prb: between check', () => {
    // { age between 65 and 70 => 0.5 }
    const ctx: EvalContext = { age: 67 };
    expect(evaluatePredicate('age between 65 and 70', ctx)).toBe(true);
    expect(evaluateExpression('0.5', ctx)).toBe(0.5);
  });

  it('ckd_uacr_metrics.prb: ratio calculation', () => {
    // sigma_l_max : { acr_l_dt > acr_max_l_dt and acr_max_l_val>0 => round(acr_l_val/acr_max_l_val, 2) };
    const ctx: EvalContext = { acr_l_val: 15.5, acr_max_l_val: 45.0 };
    const result = evaluateExpression('round(acr_l_val / acr_max_l_val, 2)', ctx);
    expect(result).toBeCloseTo(0.34, 2);
  });

  it('handles sum of coalesced values', () => {
    // risk_sum : { . => dm + htn + cvd + obesity + aki + rhd + hepb }, { => 0 };
    const ctx: EvalContext = { dm: 1, htn: 1, cvd: 0, obesity: 0, aki: 0, rhd: 0, hepb: 0 };
    expect(evaluateExpression('dm + htn + cvd + obesity + aki + rhd + hepb', ctx)).toBe(2);
  });

  it('handles coalesced sums pattern', () => {
    // cmr_count : { . => coalesce(cmr_bmi,0) + coalesce(cmr_glu,0) + ... };
    const ctx: EvalContext = { cmr_bmi: 1, cmr_glu: null, cmr_bp: 1 };
    expect(evaluateExpression('coalesce(cmr_bmi, 0) + coalesce(cmr_glu, 0) + coalesce(cmr_bp, 0)', ctx)).toBe(2);
  });

  it('handles nested parenthesized sub-expressions', () => {
    // cvd_prev : { (cabg + cad + cva)>0 =>1},{=>0};
    const ctx: EvalContext = { cabg: 0, cad: 1, cva: 0 };
    expect(evaluatePredicate('(cabg + cad + cva) > 0', ctx)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// evaluatePredicate (boolean wrapper)
// ---------------------------------------------------------------------------

describe('evaluatePredicate', () => {
  it('returns true for truthy results', () => {
    expect(evaluatePredicate('1 = 1', {})).toBe(true);
    expect(evaluatePredicate('5 > 3', {})).toBe(true);
  });

  it('returns false for falsy results', () => {
    expect(evaluatePredicate('1 = 2', {})).toBe(false);
    expect(evaluatePredicate('5 < 3', {})).toBe(false);
  });

  it('returns false for null expressions', () => {
    expect(evaluatePredicate('x > 5', { x: null })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('handles empty expression', () => {
    expect(evaluateExpression('', {})).toBeNull();
    expect(evaluateExpression('  ', {})).toBeNull();
  });

  it('handles deeply nested parentheses', () => {
    expect(evaluateExpression('((((1 + 2))))', {})).toBe(3);
  });

  it('handles negative number in parentheses', () => {
    expect(evaluateExpression('(-5)', {})).toBe(-5);
    expect(evaluateExpression('(-1.4792 * 4)', {})).toBeCloseTo(-5.9168, 4);
  });

  it('handles case-insensitive function names', () => {
    expect(evaluateExpression('LN(1)', {})).toBe(0);
    expect(evaluateExpression('EXP(0)', {})).toBe(1);
    expect(evaluateExpression('ROUND(1.5, 0)', {})).toBe(2);
    expect(evaluateExpression('NVL(null, 0)', {})).toBe(0);
  });

  it('handles multiple negative coefficients in formula', () => {
    // Common pattern in Framingham: (-1.4792*LN(age))+(0*LN(age)*LN(age))
    const ctx: EvalContext = { age: 65 };
    const result = evaluateExpression('(-1.4792 * ln(age)) + (0 * ln(age) * ln(age))', ctx);
    expect(result).toBeCloseTo(-1.4792 * Math.log(65), 4);
  });

  it('throws on unknown function', () => {
    expect(() => evaluateExpression('unknown_func(1)', {})).toThrow('Unknown function');
  });
});
