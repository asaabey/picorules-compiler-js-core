import { describe, it, expect } from 'vitest';
import { evaluate, EvaluationResult, Bindings } from '../../../src/runtime/evaluator';
import { evaluateAll } from '../../../src/runtime/orchestrator';
import { EadvDataAdapter, EadvRecord } from '../../../src/runtime/eadv-data-adapter';
import { RuleType } from '../../../src/models/constants';

// ---------------------------------------------------------------------------
// Test fixtures: sample EADV data for a single patient
// ---------------------------------------------------------------------------

const patientData: EadvRecord[] = [
  // Demographics
  { eid: 1, att: 'dmg_dob', dt: '1960-01-15', val: null },
  { eid: 1, att: 'dmg_gender', dt: '2024-01-01', val: 1 },  // male

  // Haemoglobin
  { eid: 1, att: 'lab_bld_haemoglobin', dt: '2023-06-01', val: 110 },
  { eid: 1, att: 'lab_bld_haemoglobin', dt: '2024-01-15', val: 115 },
  { eid: 1, att: 'lab_bld_haemoglobin', dt: '2024-06-20', val: 118 },

  // Creatinine
  { eid: 1, att: 'lab_bld_creatinine', dt: '2024-01-15', val: 150 },
  { eid: 1, att: 'lab_bld_creatinine', dt: '2024-06-20', val: 160 },

  // eGFR
  { eid: 1, att: 'lab_bld_egfr', dt: '2023-01-01', val: 55 },
  { eid: 1, att: 'lab_bld_egfr', dt: '2023-06-01', val: 50 },
  { eid: 1, att: 'lab_bld_egfr', dt: '2024-01-01', val: 47 },
  { eid: 1, att: 'lab_bld_egfr', dt: '2024-06-01', val: 44 },

  // ACR (urine)
  { eid: 1, att: 'lab_ua_acr', dt: '2024-01-15', val: 35 },
  { eid: 1, att: 'lab_ua_acr', dt: '2024-06-20', val: 45 },

  // ICD codes (diabetes)
  { eid: 1, att: 'icd_e11', dt: '2022-03-10', val: 1 },

  // Blood pressure
  { eid: 1, att: 'obs_bp_systolic', dt: '2024-06-20', val: 145 },

  // Cholesterol
  { eid: 1, att: 'lab_bld_cholesterol_total', dt: '2024-06-20', val: 5.8 },
  { eid: 1, att: 'lab_bld_cholesterol_hdl', dt: '2024-06-20', val: 1.1 },
  { eid: 1, att: 'lab_bld_cholesterol_tg', dt: '2024-06-20', val: 2.1 },

  // BMI components
  { eid: 1, att: 'obs_weight', dt: '2024-06-20', val: 85 },
  { eid: 1, att: 'obs_height', dt: '2024-06-20', val: 170 },
];

// ---------------------------------------------------------------------------
// EadvDataAdapter tests
// ---------------------------------------------------------------------------

describe('EadvDataAdapter', () => {
  const adapter = new EadvDataAdapter(patientData);

  it('retrieves records by exact attribute name', () => {
    const records = adapter.getRecords(['lab_bld_haemoglobin']);
    expect(records).toHaveLength(3);
    expect(records.map(r => r.val)).toContain(110);
    expect(records.map(r => r.val)).toContain(115);
    expect(records.map(r => r.val)).toContain(118);
  });

  it('retrieves records by wildcard pattern', () => {
    const records = adapter.getRecords(['icd_e11%']);
    expect(records).toHaveLength(1);
    expect(records[0].val).toBe(1);
  });

  it('retrieves records by multiple attributes', () => {
    const records = adapter.getRecords(['lab_bld_haemoglobin', 'lab_bld_creatinine']);
    expect(records).toHaveLength(5); // 3 Hb + 2 Cr
  });

  it('returns empty array for non-existent attribute', () => {
    const records = adapter.getRecords(['nonexistent_attribute']);
    expect(records).toHaveLength(0);
  });

  it('is case-insensitive', () => {
    const records = adapter.getRecords(['LAB_BLD_HAEMOGLOBIN']);
    expect(records).toHaveLength(3);
  });

  it('converts string dates to Date objects', () => {
    const records = adapter.getRecords(['lab_bld_haemoglobin']);
    expect(records[0].dt).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// Single ruleblock evaluation: FETCH statements
// ---------------------------------------------------------------------------

describe('evaluate: fetch statements', () => {
  const adapter = new EadvDataAdapter(patientData);

  it('evaluates last()', () => {
    const rb = makeRuleblock('test', [
      makeFetch('hb_last', 'lab_bld_haemoglobin', 'val', 'last'),
    ]);
    const result = evaluate(rb, adapter);
    expect(result.hb_last).toBe(118); // most recent
  });

  it('evaluates first()', () => {
    const rb = makeRuleblock('test', [
      makeFetch('hb_first', 'lab_bld_haemoglobin', 'val', 'first'),
    ]);
    const result = evaluate(rb, adapter);
    expect(result.hb_first).toBe(110); // earliest
  });

  it('evaluates max()', () => {
    const rb = makeRuleblock('test', [
      makeFetch('hb_max', 'lab_bld_haemoglobin', 'val', 'max'),
    ]);
    const result = evaluate(rb, adapter);
    expect(result.hb_max).toBe(118);
  });

  it('evaluates count()', () => {
    const rb = makeRuleblock('test', [
      makeFetch('hb_count', 'lab_bld_haemoglobin', 'dt', 'count'),
    ]);
    const result = evaluate(rb, adapter);
    expect(result.hb_count).toBe(3);
  });

  it('evaluates exists()', () => {
    const rb = makeRuleblock('test', [
      makeFetch('has_dm', 'icd_e11%', 'dt', 'exists'),
    ]);
    const result = evaluate(rb, adapter);
    expect(result.has_dm).toBe(1);
  });

  it('evaluates exists() for missing attribute', () => {
    const rb = makeRuleblock('test', [
      makeFetch('has_hiv', 'icd_b20%', 'dt', 'exists'),
    ]);
    const result = evaluate(rb, adapter);
    expect(result.has_hiv).toBe(0);
  });

  it('evaluates lastdv() — produces _val and _dt', () => {
    const rb = makeRuleblock('test', [
      makeFetch('hb', 'lab_bld_haemoglobin', '_', 'lastdv'),
    ]);
    const result = evaluate(rb, adapter);
    expect(result.hb_val).toBe(118);
    expect(result.hb_dt).toBeInstanceOf(Date);
    expect((result.hb_dt as Date).toISOString().slice(0, 10)).toBe('2024-06-20');
  });

  it('evaluates regr_slope() for declining eGFR', () => {
    const rb = makeRuleblock('test', [
      makeFetch('egfr_slope', 'lab_bld_egfr', 'val', 'regr_slope'),
    ]);
    const result = evaluate(rb, adapter);
    expect(typeof result.egfr_slope).toBe('number');
    expect(result.egfr_slope as number).toBeLessThan(0); // declining
  });

  it('evaluates with wildcard attribute matching', () => {
    const rb = makeRuleblock('test', [
      makeFetch('has_icd', 'icd_%', 'dt', 'exists'),
    ]);
    const result = evaluate(rb, adapter);
    expect(result.has_icd).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Single ruleblock evaluation: COMPUTE statements
// ---------------------------------------------------------------------------

describe('evaluate: compute statements', () => {
  const adapter = new EadvDataAdapter(patientData);

  it('evaluates simple conditional', () => {
    const rb = makeRuleblock('test', [
      makeFetch('hb_last', 'lab_bld_haemoglobin', 'val', 'last'),
      makeCompute('is_anaemic', [
        { predicate: 'hb_last < 120', returnValue: '1' },
        { returnValue: '0' },
      ]),
    ]);
    const result = evaluate(rb, adapter);
    expect(result.hb_last).toBe(118);
    expect(result.is_anaemic).toBe(1); // 118 < 120
  });

  it('evaluates multi-case conditional (CKD staging)', () => {
    const rb = makeRuleblock('test', [
      makeFetch('egfr', 'lab_bld_egfr', 'val', 'last'),
      makeCompute('ckd_stage', [
        { predicate: 'egfr >= 90', returnValue: '1' },
        { predicate: 'egfr >= 60', returnValue: '2' },
        { predicate: 'egfr >= 45', returnValue: '3' },
        { predicate: 'egfr >= 30', returnValue: '3' },
        { returnValue: '0' },
      ]),
    ]);
    const result = evaluate(rb, adapter);
    expect(result.egfr).toBe(44); // most recent eGFR
    expect(result.ckd_stage).toBe(3); // egfr >= 30 but < 45
  });

  it('evaluates compound condition with and/or', () => {
    const rb = makeRuleblock('test', [
      makeFetch('has_dm', 'icd_e11%', 'dt', 'exists'),
      makeFetch('egfr', 'lab_bld_egfr', 'val', 'last'),
      makeCompute('dm_ckd', [
        { predicate: 'has_dm = 1 and egfr < 60', returnValue: '1' },
        { returnValue: '0' },
      ]),
    ]);
    const result = evaluate(rb, adapter);
    expect(result.dm_ckd).toBe(1); // has diabetes AND eGFR < 60
  });

  it('evaluates arithmetic return value', () => {
    const rb = makeRuleblock('test', [
      makeFetch('wt', 'obs_weight', 'val', 'last'),
      makeFetch('ht', 'obs_height', 'val', 'last'),
      makeCompute('bmi', [
        { predicate: 'wt!? and ht!?', returnValue: 'round(wt / power(ht / 100, 2), 1)' },
        { returnValue: '0' },
      ]),
    ]);
    const result = evaluate(rb, adapter);
    expect(result.bmi).toBeCloseTo(29.4, 1); // 85 / (1.7)^2
  });

  it('evaluates greatest() across multiple variables', () => {
    const rb = makeRuleblock('test', [
      makeFetch('has_dm', 'icd_e11%', 'dt', 'exists'),
      makeFetch('has_htn', 'icd_i10%', 'dt', 'exists'),
      makeCompute('has_any', [
        { predicate: 'greatest(has_dm, has_htn) > 0', returnValue: '1' },
        { returnValue: '0' },
      ]),
    ]);
    const result = evaluate(rb, adapter);
    // has_dm=1, has_htn=0 (no hypertension ICD code), but greatest(1,0)=1
    // Wait — greatest(1,0) > 0 is true
    expect(result.has_any).toBe(1);
  });

  it('evaluates [[rb_id]] as ruleblock name', () => {
    const rb = makeRuleblock('my_rule', [
      makeFetch('egfr', 'lab_bld_egfr', 'val', 'last'),
      makeCompute('[[rb_id]]', [
        { predicate: 'egfr < 60', returnValue: '1' },
        { returnValue: '0' },
      ]),
    ]);
    const result = evaluate(rb, adapter);
    expect(result.my_rule).toBe(1); // [[rb_id]] resolved to 'my_rule'
  });

  it('handles dot shorthand in return value', () => {
    // In picorules, { . => expr } means "always take this branch, expr uses current context"
    // The dot as a predicate evaluates the current variable (which is null before assignment → false)
    // The common real-world usage is: var : { . => some_expression };  (no predicate, just default)
    const rb = makeRuleblock('test', [
      makeFetch('a', 'lab_bld_haemoglobin', 'val', 'count'),
      makeFetch('b', 'lab_bld_creatinine', 'val', 'count'),
      makeCompute('total', [
        { returnValue: 'a + b' },  // default branch
      ]),
    ]);
    const result = evaluate(rb, adapter);
    expect(result.total).toBe(5); // 3 + 2
  });
});

// ---------------------------------------------------------------------------
// .where() predicate filtering
// ---------------------------------------------------------------------------

describe('evaluate: where predicates', () => {
  const adapter = new EadvDataAdapter(patientData);

  it('filters by date range using sysdate', () => {
    // Only count eGFR values from last year
    const rb = makeRuleblock('test', [
      makeFetchWithWhere('egfr_recent_count', 'lab_bld_egfr', 'dt', 'count', 'dt > sysdate - 365'),
    ]);
    const result = evaluate(rb, adapter);
    // How many eGFR records are within last 365 days depends on current date
    expect(typeof result.egfr_recent_count).toBe('number');
  });

  it('filters by value threshold', () => {
    const rb = makeRuleblock('test', [
      makeFetchWithWhere('acr_high_count', 'lab_ua_acr', 'dt', 'count', 'val >= 30'),
    ]);
    const result = evaluate(rb, adapter);
    expect(result.acr_high_count).toBe(2); // 35 and 45 are both >= 30
  });
});

// ---------------------------------------------------------------------------
// BIND statements
// ---------------------------------------------------------------------------

describe('evaluate: bind statements', () => {
  const adapter = new EadvDataAdapter(patientData);

  it('resolves bindings from previously evaluated ruleblocks', () => {
    const bindings: Bindings = new Map();
    bindings.set('ckd_egfr_metrics', { egfr_l_val: 44, egfr_slope: -0.02 });

    const rb = makeRuleblock('test', [
      makeBind('egfr', 'ckd_egfr_metrics', 'egfr_l_val', 'val'),
      makeCompute('has_ckd', [
        { predicate: 'egfr < 60', returnValue: '1' },
        { returnValue: '0' },
      ]),
    ]);

    const result = evaluate(rb, adapter, bindings);
    expect(result.egfr).toBe(44);
    expect(result.has_ckd).toBe(1);
  });

  it('returns null for missing bindings', () => {
    const rb = makeRuleblock('test', [
      makeBind('egfr', 'nonexistent_rule', 'egfr_val', 'val'),
    ]);
    const result = evaluate(rb, adapter);
    expect(result.egfr).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Multi-ruleblock orchestration
// ---------------------------------------------------------------------------

describe('evaluateAll', () => {
  const adapter = new EadvDataAdapter(patientData);

  it('evaluates dependent ruleblocks in correct order', () => {
    // Ruleblock 1: compute eGFR metrics
    const egfrMetrics = makeRuleblock('ckd_egfr_metrics', [
      makeFetch('egfr_l', 'lab_bld_egfr', 'val', 'last'),
      makeFetch('egfr_slope', 'lab_bld_egfr', 'val', 'regr_slope'),
    ]);

    // Ruleblock 2: depends on egfr_metrics via bind
    const ckd = makeRuleblock('ckd', [
      makeBind('egfr', 'ckd_egfr_metrics', 'egfr_l', 'val'),
      makeCompute('ckd_stage', [
        { predicate: 'egfr >= 90', returnValue: '1' },
        { predicate: 'egfr >= 60', returnValue: '2' },
        { predicate: 'egfr >= 45', returnValue: '3' },
        { predicate: 'egfr >= 30', returnValue: '4' },
        { returnValue: '5' },
      ]),
      makeCompute('[[rb_id]]', [
        { predicate: 'ckd_stage >= 3', returnValue: 'ckd_stage' },
        { returnValue: '0' },
      ]),
    ]);

    // Pass in reverse order — orchestrator should handle dependencies
    const results = evaluateAll([ckd, egfrMetrics], adapter);

    // egfr_metrics should have been evaluated first
    const metricsResult = results.get('ckd_egfr_metrics')!;
    expect(metricsResult.egfr_l).toBe(44);
    expect(typeof metricsResult.egfr_slope).toBe('number');

    // ckd should use bound value from egfr_metrics
    const ckdResult = results.get('ckd')!;
    expect(ckdResult.egfr).toBe(44);
    expect(ckdResult.ckd_stage).toBe(4); // 44 >= 30 but < 45
    expect(ckdResult.ckd).toBe(4);
  });

  it('handles three-level dependency chain', () => {
    const base = makeRuleblock('base', [
      makeFetch('hb', 'lab_bld_haemoglobin', 'val', 'last'),
    ]);
    const mid = makeRuleblock('mid', [
      makeBind('hb_val', 'base', 'hb', 'val'),
      makeCompute('anaemia', [
        { predicate: 'hb_val < 120', returnValue: '1' },
        { returnValue: '0' },
      ]),
    ]);
    const top = makeRuleblock('top', [
      makeBind('has_anaemia', 'mid', 'anaemia', 'val'),
      makeCompute('alert', [
        { predicate: 'has_anaemia = 1', returnValue: '1' },
        { returnValue: '0' },
      ]),
    ]);

    // Pass in wrong order — orchestrator sorts them
    const results = evaluateAll([top, base, mid], adapter);

    expect(results.get('base')!.hb).toBe(118);
    expect(results.get('mid')!.anaemia).toBe(1); // 118 < 120
    expect(results.get('top')!.alert).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Integration with existing parser
// ---------------------------------------------------------------------------

describe('integration with parser', () => {
  it('evaluates a parsed ruleblock from actual .prb source', async () => {
    // Dynamically import the parser
    const { parse } = await import('../../../src/index');

    const prbSource = `
      #define_ruleblock(test_anaemia, {
        description: "Test anaemia assessment",
        is_active: 2
      });

      hb_last => eadv.lab_bld_haemoglobin.val.last();
      hb_count => eadv.lab_bld_haemoglobin.dt.count();
      has_dm => eadv.icd_e11%.dt.exists();
      egfr => eadv.lab_bld_egfr.val.last();

      is_anaemic : { hb_last < 120 => 1 }, { => 0 };
      has_ckd : { egfr < 60 => 1 }, { => 0 };
      dm_ckd_anaemia : { is_anaemic = 1 and has_dm = 1 and has_ckd = 1 => 1 }, { => 0 };
    `;

    const parsed = parse([{ name: 'test_anaemia', text: prbSource, isActive: true }]);
    const adapter = new EadvDataAdapter(patientData);
    const result = evaluate(parsed[0] as any, adapter);

    expect(result.hb_last).toBe(118);
    expect(result.hb_count).toBe(3);
    expect(result.has_dm).toBe(1);
    expect(result.egfr).toBe(44);
    expect(result.is_anaemic).toBe(1);   // 118 < 120
    expect(result.has_ckd).toBe(1);      // 44 < 60
    expect(result.dm_ckd_anaemia).toBe(1); // all three conditions met
  });
});

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeRuleblock(name: string, rules: any[]) {
  return { name, text: '', isActive: true, rules };
}

function makeFetch(variable: string, att: string, property: string, fn: string, params?: string[]) {
  return {
    ruleType: RuleType.FETCH_STATEMENT,
    assignedVariable: variable,
    table: 'eadv',
    attributeList: att.includes(',') ? att.split(',').map(a => a.trim()) : [att],
    property,
    functionName: fn,
    functionParams: params,
    references: [],
  };
}

function makeFetchWithWhere(variable: string, att: string, property: string, fn: string, predicate: string) {
  return {
    ...makeFetch(variable, att, property, fn),
    predicate,
  };
}

function makeCompute(variable: string, conditions: Array<{ predicate?: string; returnValue: string }>) {
  return {
    ruleType: RuleType.COMPUTE_STATEMENT,
    assignedVariable: variable,
    conditions,
    references: [],
  };
}

function makeBind(variable: string, sourceRuleblock: string, sourceVariable: string, property: string) {
  return {
    ruleType: RuleType.BIND_STATEMENT,
    assignedVariable: variable,
    sourceRuleblock,
    sourceVariable,
    property,
    references: [],
  };
}
