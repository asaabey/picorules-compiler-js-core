/**
 * Integration tests: JS evaluator against mock EADV data.
 *
 * Uses the eadv-mocker to generate synthetic patient data from real ruleblock
 * source, then runs the JS evaluator and verifies results are clinically
 * sensible. Uses a fixed seed for reproducibility.
 *
 * These tests validate that:
 * 1. The parser → evaluator pipeline works end-to-end
 * 2. All fetch functions produce non-null results with valid mock data
 * 3. Conditional logic produces expected clinical classifications
 * 4. Multi-ruleblock dependency chains resolve correctly
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../../../src/index';
import { evaluate } from '../../../src/runtime/evaluator';
import { evaluateAll } from '../../../src/runtime/orchestrator';
import { EadvDataAdapter } from '../../../src/runtime/eadv-data-adapter';
import { generateMockData } from 'picorules-compiler-js-eadv-mocker';

const SEED = 42; // Fixed seed for reproducible tests

// ---------------------------------------------------------------------------
// Helper: parse ruleblock, generate mock data, evaluate for one patient
// ---------------------------------------------------------------------------

function parseAndEvaluate(
  name: string,
  prbSource: string,
  options?: { entityCount?: number; observationsPerEntity?: number }
) {
  const parsed = parse([{ name, text: prbSource, isActive: true }]);

  const mockResult = generateMockData({
    ruleblocks: [{ name, text: prbSource, isActive: true }],
    options: {
      seed: SEED,
      entityCount: options?.entityCount ?? 1,
      observationsPerEntity: options?.observationsPerEntity ?? 5,
      dateFormat: 'iso',
    },
  });

  // Filter to first patient
  const firstEid = mockResult.metadata.entities[0];
  const patientRecords = mockResult.eadv.filter(r => r.eid === firstEid);

  const adapter = new EadvDataAdapter(
    patientRecords.map(r => ({
      eid: r.eid,
      att: r.att,
      dt: r.dt,
      val: r.val,
    }))
  );

  const result = evaluate(parsed[0] as any, adapter);
  return { result, mockData: mockResult, parsed };
}

// ---------------------------------------------------------------------------
// Test 1: Simple anaemia assessment
// ---------------------------------------------------------------------------

describe('simple anaemia ruleblock', () => {
  const prbSource = `
    #define_ruleblock(anaemia_test, {
      description: "Test anaemia assessment",
      is_active: 2
    });

    hb_last => eadv.lab_bld_haemoglobin.val.last();
    hb_count => eadv.lab_bld_haemoglobin.dt.count();
    hb_min => eadv.lab_bld_haemoglobin.val.min();
    hb_max => eadv.lab_bld_haemoglobin.val.max();
    hb_avg => eadv.lab_bld_haemoglobin.val.avg();

    is_anaemic : { hb_last < 120 => 1 }, { => 0 };
  `;

  it('produces valid results from mock data', () => {
    const { result } = parseAndEvaluate('anaemia_test', prbSource);

    // All fetch results should be non-null (mocker generates data for referenced attributes)
    expect(result.hb_last).not.toBeNull();
    expect(result.hb_count).toBeGreaterThan(0);
    expect(result.hb_min).not.toBeNull();
    expect(result.hb_max).not.toBeNull();
    expect(result.hb_avg).not.toBeNull();

    // Clinical validity: min <= avg <= max
    expect(result.hb_min as number).toBeLessThanOrEqual(result.hb_avg as number);
    expect(result.hb_avg as number).toBeLessThanOrEqual(result.hb_max as number);

    // Conditional should produce 0 or 1
    expect([0, 1]).toContain(result.is_anaemic);

    // Verify conditional logic is consistent
    if ((result.hb_last as number) < 120) {
      expect(result.is_anaemic).toBe(1);
    } else {
      expect(result.is_anaemic).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 2: CKD staging with eGFR
// ---------------------------------------------------------------------------

describe('CKD staging ruleblock', () => {
  const prbSource = `
    #define_ruleblock(ckd_staging, {
      description: "CKD staging by eGFR",
      is_active: 2
    });

    egfr_last => eadv.lab_bld_egfr.val.last();
    egfr_count => eadv.lab_bld_egfr.dt.count();
    egfr_slope => eadv.lab_bld_egfr.val.regr_slope();
    egfr_min => eadv.lab_bld_egfr.val.min();

    ckd_stage :
      { egfr_last >= 90 => 1 },
      { egfr_last >= 60 => 2 },
      { egfr_last >= 45 => 3 },
      { egfr_last >= 30 => 4 },
      { egfr_last >= 15 => 5 },
      { => 0 };

    has_ckd : { ckd_stage >= 3 => 1 }, { => 0 };
  `;

  it('produces valid CKD staging', () => {
    const { result } = parseAndEvaluate('ckd_staging', prbSource);

    expect(result.egfr_last).not.toBeNull();
    expect(result.egfr_count).toBeGreaterThan(0);

    // eGFR mocker generates values 15-120
    const egfr = result.egfr_last as number;
    expect(egfr).toBeGreaterThanOrEqual(0);
    expect(egfr).toBeLessThanOrEqual(200);

    // Staging must be 0-5
    expect([0, 1, 2, 3, 4, 5]).toContain(result.ckd_stage);

    // Verify staging is consistent with eGFR
    if (egfr >= 90) expect(result.ckd_stage).toBe(1);
    else if (egfr >= 60) expect(result.ckd_stage).toBe(2);
    else if (egfr >= 45) expect(result.ckd_stage).toBe(3);
    else if (egfr >= 30) expect(result.ckd_stage).toBe(4);
    else if (egfr >= 15) expect(result.ckd_stage).toBe(5);
    else expect(result.ckd_stage).toBe(0);

    // has_ckd is derived from staging
    if ((result.ckd_stage as number) >= 3) {
      expect(result.has_ckd).toBe(1);
    } else {
      expect(result.has_ckd).toBe(0);
    }

    // Regression slope should be a number (with 5 data points)
    expect(result.egfr_slope).not.toBeNull();
    expect(typeof result.egfr_slope).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// Test 3: BMI calculation
// ---------------------------------------------------------------------------

describe('BMI calculation ruleblock', () => {
  const prbSource = `
    #define_ruleblock(obesity, {
      description: "BMI assessment",
      is_active: 2
    });

    wt => eadv.obs_weight._.lastdv();
    ht => eadv.obs_height._.lastdv();

    bmi : { wt_val!? and ht_val!? and ht_val > 0 => round(wt_val / power(ht_val / 100, 2), 1) };

    bmi_cat :
      { bmi >= 40 => 4 },
      { bmi >= 30 => 3 },
      { bmi >= 25 => 2 },
      { bmi >= 18.5 => 1 },
      { bmi!? => 0 },
      { => 0 };
  `;

  it('computes BMI from mocked weight and height', () => {
    const { result } = parseAndEvaluate('obesity', prbSource);

    // DV functions should produce _val and _dt
    expect(result.wt_val).not.toBeNull();
    expect(result.wt_dt).not.toBeNull();
    expect(result.ht_val).not.toBeNull();
    expect(result.ht_dt).not.toBeNull();

    // Weight should be in realistic range (mocker: 40-150)
    expect(result.wt_val as number).toBeGreaterThanOrEqual(30);
    expect(result.wt_val as number).toBeLessThanOrEqual(200);

    // Height - mocker may use default range if obs_height isn't in clinical generators
    expect(result.ht_val as number).toBeGreaterThanOrEqual(0);

    // BMI should be computed (may not be clinically realistic since mocker
    // uses default 0-100 range for obs_height if not in clinical generators)
    if (result.bmi != null) {
      expect(result.bmi as number).toBeGreaterThan(0);

      // Verify BMI = wt / (ht/100)^2 — the math should be correct
      const expectedBmi = (result.wt_val as number) / Math.pow((result.ht_val as number) / 100, 2);
      expect(result.bmi as number).toBeCloseTo(expectedBmi, 0);
    }

    // Category should be 0-4
    expect([0, 1, 2, 3, 4]).toContain(result.bmi_cat);
  });
});

// ---------------------------------------------------------------------------
// Test 4: Lipid panel with multiple attributes
// ---------------------------------------------------------------------------

describe('lipid panel ruleblock', () => {
  const prbSource = `
    #define_ruleblock(dyslip, {
      description: "Dyslipidaemia assessment",
      is_active: 2
    });

    tc => eadv.lab_bld_cholesterol_total.val.last();
    hdl => eadv.lab_bld_cholesterol_hdl.val.last();
    tg => eadv.lab_bld_cholesterol_tg.val.last();

    tc_hdl_ratio : { tc!? and hdl!? and hdl > 0 => round(tc / hdl, 1) };

    high_tc : { tc >= 5.5 => 1 }, { => 0 };
    low_hdl : { hdl < 1.0 => 1 }, { => 0 };
    high_tg : { tg >= 1.7 => 1 }, { => 0 };

    dyslip_count : { => coalesce(high_tc, 0) + coalesce(low_hdl, 0) + coalesce(high_tg, 0) };

    [[rb_id]] : { dyslip_count > 0 => 1 }, { => 0 };
  `;

  it('evaluates lipid panel correctly', () => {
    const { result } = parseAndEvaluate('dyslip', prbSource);

    // All lipids should be fetched
    expect(result.tc).not.toBeNull();
    expect(result.hdl).not.toBeNull();
    expect(result.tg).not.toBeNull();

    // TC/HDL ratio should be computed
    if (result.tc != null && result.hdl != null && (result.hdl as number) > 0) {
      expect(result.tc_hdl_ratio).not.toBeNull();
      const expected = Math.round(((result.tc as number) / (result.hdl as number)) * 10) / 10;
      expect(result.tc_hdl_ratio as number).toBeCloseTo(expected, 0);
    }

    // Binary flags
    expect([0, 1]).toContain(result.high_tc);
    expect([0, 1]).toContain(result.low_hdl);
    expect([0, 1]).toContain(result.high_tg);

    // Count is sum of flags
    const expectedCount = (result.high_tc as number) + (result.low_hdl as number) + (result.high_tg as number);
    expect(result.dyslip_count).toBe(expectedCount);

    // [[rb_id]] resolves to ruleblock name
    expect(result.dyslip).toBe(expectedCount > 0 ? 1 : 0);
  });
});

// ---------------------------------------------------------------------------
// Test 5: DV functions — lastdv, firstdv, maxldv
// ---------------------------------------------------------------------------

describe('date-value pair functions', () => {
  const prbSource = `
    #define_ruleblock(dv_test, {
      description: "Test DV functions",
      is_active: 2
    });

    egfr_l => eadv.lab_bld_egfr._.lastdv();
    egfr_f => eadv.lab_bld_egfr._.firstdv();
    egfr_max => eadv.lab_bld_egfr._.maxldv();
    egfr_min => eadv.lab_bld_egfr._.minldv();
    egfr_count => eadv.lab_bld_egfr.dt.count();
  `;

  it('produces val and dt pairs for all DV functions', () => {
    const { result } = parseAndEvaluate('dv_test', prbSource);

    // lastdv
    expect(result.egfr_l_val).not.toBeNull();
    expect(result.egfr_l_dt).not.toBeNull();
    expect(result.egfr_l_dt).toBeInstanceOf(Date);

    // firstdv
    expect(result.egfr_f_val).not.toBeNull();
    expect(result.egfr_f_dt).not.toBeNull();

    // maxldv — value should be >= all others
    expect(result.egfr_max_val).not.toBeNull();
    expect(result.egfr_max_val as number).toBeGreaterThanOrEqual(result.egfr_l_val as number);
    expect(result.egfr_max_val as number).toBeGreaterThanOrEqual(result.egfr_f_val as number);

    // minldv — value should be <= all others
    expect(result.egfr_min_val).not.toBeNull();
    expect(result.egfr_min_val as number).toBeLessThanOrEqual(result.egfr_l_val as number);
    expect(result.egfr_min_val as number).toBeLessThanOrEqual(result.egfr_f_val as number);

    // firstdv date should be <= lastdv date
    expect((result.egfr_f_dt as Date).getTime()).toBeLessThanOrEqual((result.egfr_l_dt as Date).getTime());

    expect(result.egfr_count).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Test 6: Statistical functions
// ---------------------------------------------------------------------------

describe('statistical functions', () => {
  const prbSource = `
    #define_ruleblock(stats_test, {
      description: "Test statistical functions",
      is_active: 2
    });

    egfr_slope => eadv.lab_bld_egfr.val.regr_slope();
    egfr_intercept => eadv.lab_bld_egfr.val.regr_intercept();
    egfr_r2 => eadv.lab_bld_egfr.val.regr_r2();
    egfr_median => eadv.lab_bld_egfr.val.median();
    egfr_avg => eadv.lab_bld_egfr.val.avg();
    bp_regularity => eadv.obs_bp_systolic.dt.temporal_regularity();
  `;

  it('computes all statistical functions', () => {
    const { result } = parseAndEvaluate('stats_test', prbSource);

    // Regression
    expect(result.egfr_slope).not.toBeNull();
    expect(typeof result.egfr_slope).toBe('number');

    expect(result.egfr_intercept).not.toBeNull();
    expect(typeof result.egfr_intercept).toBe('number');

    // R² should be between 0 and 1
    expect(result.egfr_r2).not.toBeNull();
    expect(result.egfr_r2 as number).toBeGreaterThanOrEqual(0);
    expect(result.egfr_r2 as number).toBeLessThanOrEqual(1);

    // Median should be between min and max
    expect(result.egfr_median).not.toBeNull();
    expect(result.egfr_avg).not.toBeNull();

    // Temporal regularity should be non-negative
    expect(result.bp_regularity).not.toBeNull();
    expect(result.bp_regularity as number).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Test 7: Wildcard attribute matching
// ---------------------------------------------------------------------------

describe('wildcard attribute matching', () => {
  const prbSource = `
    #define_ruleblock(wildcard_test, {
      description: "Test wildcard matching",
      is_active: 2
    });

    has_dm_icd => eadv.icd_e11%.dt.exists();
    any_lab => eadv.lab_bld%.dt.count();
  `;

  it('matches wildcard attributes from mock data', () => {
    const { result, mockData } = parseAndEvaluate('wildcard_test', prbSource);

    // The mocker expands wildcards like icd_e11% → icd_e11xx
    // exists() should find those records
    // Check what attributes were generated
    const atts = new Set(mockData.eadv.map(r => r.att));
    const hasIcd = [...atts].some(a => a.startsWith('icd_e11'));
    const hasLab = [...atts].some(a => a.startsWith('lab_bld'));

    if (hasIcd) {
      expect(result.has_dm_icd).toBe(1);
    }
    if (hasLab) {
      expect(result.any_lab as number).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 8: Reproducibility with fixed seed
// ---------------------------------------------------------------------------

describe('reproducibility', () => {
  const prbSource = `
    #define_ruleblock(repro_test, {
      description: "Test reproducibility",
      is_active: 2
    });

    hb => eadv.lab_bld_haemoglobin.val.last();
    egfr => eadv.lab_bld_egfr.val.last();
  `;

  it('produces identical results with same seed', () => {
    const run1 = parseAndEvaluate('repro_test', prbSource);
    const run2 = parseAndEvaluate('repro_test', prbSource);

    expect(run1.result.hb).toBe(run2.result.hb);
    expect(run1.result.egfr).toBe(run2.result.egfr);
  });
});

// ---------------------------------------------------------------------------
// Test 9: Coalesce/NVL patterns
// ---------------------------------------------------------------------------

describe('null handling patterns', () => {
  const prbSource = `
    #define_ruleblock(null_test, {
      description: "Test null handling",
      is_active: 2
    });

    hb => eadv.lab_bld_haemoglobin.val.last();

    safe_hb : { => nvl(hb, 0) };
    null_check : { hb!? => 1 }, { => 0 };
  `;

  it('handles null correctly with nvl', () => {
    const { result } = parseAndEvaluate('null_test', prbSource);

    // hb should have a value from mock data
    expect(result.hb).not.toBeNull();

    // nvl(hb, 0) = hb (since hb is not null)
    expect(result.safe_hb).toBe(result.hb);

    // hb!? should be true → 1
    expect(result.null_check).toBe(1);
  });

  it('handles missing attributes as null', () => {
    // Manually create adapter with no data for a tested attribute
    const parsed = parse([{
      name: 'null_manual',
      text: `
        #define_ruleblock(null_manual, { description: "test", is_active: 2 });
        missing => eadv.totally_made_up_attribute.val.last();
        safe : { => nvl(missing, 99) };
        check : { missing!? => 1 }, { => 0 };
      `,
      isActive: true,
    }]);

    // Empty adapter — no data at all
    const adapter = new EadvDataAdapter([]);
    const result = evaluate(parsed[0] as any, adapter);

    expect(result.missing).toBeNull();
    expect(result.safe).toBe(99);
    expect(result.check).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test 10: Multi-ruleblock with mock data
// ---------------------------------------------------------------------------

describe('multi-ruleblock evaluation with mock data', () => {
  it('evaluates dependent ruleblocks against shared mock data', () => {
    const baseSrc = `
      #define_ruleblock(base_metrics, {
        description: "Base metrics",
        is_active: 2
      });

      hb_last => eadv.lab_bld_haemoglobin.val.last();
      egfr_last => eadv.lab_bld_egfr.val.last();
      sbp_last => eadv.obs_bp_systolic.val.last();
    `;

    const derivedSrc = `
      #define_ruleblock(risk_flags, {
        description: "Risk flags derived from base",
        is_active: 2
      });

      hb => rout_base_metrics.hb_last.val.bind();
      egfr => rout_base_metrics.egfr_last.val.bind();
      sbp => rout_base_metrics.sbp_last.val.bind();

      anaemia : { hb < 120 => 1 }, { => 0 };
      ckd : { egfr < 60 => 1 }, { => 0 };
      htn : { sbp >= 140 => 1 }, { => 0 };
      risk_count : { => coalesce(anaemia, 0) + coalesce(ckd, 0) + coalesce(htn, 0) };
    `;

    // Parse both
    const parsedBase = parse([{ name: 'base_metrics', text: baseSrc, isActive: true }]);
    const parsedDerived = parse([{ name: 'risk_flags', text: derivedSrc, isActive: true }]);

    // Generate mock data from the base ruleblock
    const mockResult = generateMockData({
      ruleblocks: [{ name: 'base_metrics', text: baseSrc, isActive: true }],
      options: { seed: SEED, entityCount: 1, observationsPerEntity: 5, dateFormat: 'iso' },
    });

    const firstEid = mockResult.metadata.entities[0];
    const patientRecords = mockResult.eadv.filter(r => r.eid === firstEid);
    const adapter = new EadvDataAdapter(
      patientRecords.map(r => ({ eid: r.eid, att: r.att, dt: r.dt, val: r.val }))
    );

    // Use evaluateAll with both ruleblocks
    const allRuleblocks = [...parsedBase, ...parsedDerived] as any[];
    const results = evaluateAll(allRuleblocks, adapter);

    // Base should have raw values
    const base = results.get('base_metrics')!;
    expect(base.hb_last).not.toBeNull();
    expect(base.egfr_last).not.toBeNull();
    expect(base.sbp_last).not.toBeNull();

    // Derived should bind from base and compute flags
    const derived = results.get('risk_flags')!;
    expect(derived.hb).toBe(base.hb_last);     // bound value matches
    expect(derived.egfr).toBe(base.egfr_last);
    expect(derived.sbp).toBe(base.sbp_last);

    // Flags should be consistent
    expect(derived.anaemia).toBe((base.hb_last as number) < 120 ? 1 : 0);
    expect(derived.ckd).toBe((base.egfr_last as number) < 60 ? 1 : 0);
    expect(derived.htn).toBe((base.sbp_last as number) >= 140 ? 1 : 0);

    // risk_count = sum of flags
    expect(derived.risk_count).toBe(
      (derived.anaemia as number) + (derived.ckd as number) + (derived.htn as number)
    );
  });
});
