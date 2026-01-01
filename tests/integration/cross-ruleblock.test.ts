import { describe, it, expect } from 'vitest';
import { compile, Dialect } from '../../src';

describe('Cross-ruleblock references', () => {
  it('should compile two ruleblocks with bind statement', () => {
    const ruleblocks = [
      {
        name: 'ckd',
        text: 'egfr_last => eadv.lab_bld_egfr.val.last();',
        isActive: true,
      },
      {
        name: 'risk',
        text: `
          ckd_status => rout_ckd.egfr_last.val.bind();
          is_at_risk : {ckd_status < 60 => 1}, {=> 0};
        `,
        isActive: true,
      },
    ];

    const result = compile(ruleblocks, { dialect: Dialect.ORACLE });

    expect(result.success).toBe(true);
    expect(result.sql).toHaveLength(2);

    // First ruleblock (ckd) should come before second (risk) due to dependency
    expect(result.sql[0]).toContain('ROUT_CKD');
    expect(result.sql[1]).toContain('ROUT_RISK');
    expect(result.sql[1]).toContain('SQ_CKD_STATUS');
    expect(result.sql[1]).toContain('FROM ROUT_CKD');
  });

  it('should order ruleblocks correctly based on dependencies', () => {
    const ruleblocks = [
      // rb3 depends on rb2
      {
        name: 'rb3',
        text: 'c => rout_rb2.b.val.bind();',
        isActive: true,
      },
      // rb1 has no dependencies
      {
        name: 'rb1',
        text: 'a => eadv.att1.val.last();',
        isActive: true,
      },
      // rb2 depends on rb1
      {
        name: 'rb2',
        text: 'b => rout_rb1.a.val.bind();',
        isActive: true,
      },
    ];

    const result = compile(ruleblocks, { dialect: Dialect.ORACLE });

    expect(result.success).toBe(true);
    expect(result.sql).toHaveLength(3);

    // SQL should be ordered: rb1, rb2, rb3
    expect(result.sql[0]).toContain('ROUT_RB1');
    expect(result.sql[1]).toContain('ROUT_RB2');
    expect(result.sql[2]).toContain('ROUT_RB3');
  });

  it('should handle mixed statements in ruleblock with bind', () => {
    const ruleblocks = [
      {
        name: 'base',
        text: `
          egfr_last => eadv.lab_bld_egfr.val.last();
          hb_last => eadv.lab_bld_haemoglobin.val.last();
        `,
        isActive: true,
      },
      {
        name: 'derived',
        text: `
          egfr => rout_base.egfr_last.val.bind();
          hb => rout_base.hb_last.val.bind();
          has_ckd : {egfr < 60 => 1}, {=> 0};
          is_anaemic : {hb < 120 => 1}, {=> 0};
          has_issues : {has_ckd = 1 or is_anaemic = 1 => 1}, {=> 0};
        `,
        isActive: true,
      },
    ];

    const result = compile(ruleblocks, { dialect: Dialect.ORACLE });

    expect(result.success).toBe(true);
    expect(result.sql).toHaveLength(2);

    // Derived ruleblock should have all variables
    expect(result.sql[1]).toContain('SQ_EGFR');
    expect(result.sql[1]).toContain('SQ_HB');
    expect(result.sql[1]).toContain('SQ_HAS_CKD');
    expect(result.sql[1]).toContain('SQ_IS_ANAEMIC');
    expect(result.sql[1]).toContain('SQ_HAS_ISSUES');
  });

  it('should detect circular dependencies', () => {
    const ruleblocks = [
      {
        name: 'rb1',
        text: 'a => rout_rb2.b.val.bind();',
        isActive: true,
      },
      {
        name: 'rb2',
        text: 'b => rout_rb1.a.val.bind();',
        isActive: true,
      },
    ];

    const result = compile(ruleblocks, { dialect: Dialect.ORACLE });

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('Circular dependency');
  });

  it('should handle reference resolution in compute statements', () => {
    const ruleblocks = [
      {
        name: 'test',
        text: `
          egfr_last => eadv.lab_bld_egfr.val.last();
          has_ckd : {egfr_last < 60 => 1}, {=> 0};
          stage : {egfr_last < 30 => 5}, {egfr_last < 45 => 4}, {egfr_last < 60 => 3}, {=> 0};
        `,
        isActive: true,
      },
    ];

    const result = compile(ruleblocks, { dialect: Dialect.ORACLE });

    expect(result.success).toBe(true);
    expect(result.sql[0]).toContain('SQ_EGFR_LAST');
    expect(result.sql[0]).toContain('SQ_HAS_CKD');
    expect(result.sql[0]).toContain('SQ_STAGE');

    // Check that compute statements reference egfr_last
    expect(result.sql[0]).toContain('WHEN egfr_last < 60');
    expect(result.sql[0]).toContain('WHEN egfr_last < 30');
  });
});
