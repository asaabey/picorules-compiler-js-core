import { describe, it, expect } from 'vitest';
import { compile, Dialect } from '../../src';

describe('compile', () => {
  it('should compile simple ruleblock end-to-end', () => {
    const ruleblocks = [
      {
        name: 'ckd',
        text: `
          egfr_last => eadv.lab_bld_egfr.val.last();
          has_ckd : {egfr_last < 60 => 1}, {=> 0};
        `,
        isActive: true,
      },
    ];

    const result = compile(ruleblocks, { dialect: Dialect.ORACLE });

    expect(result.success).toBe(true);
    expect(result.sql).toHaveLength(1);
    expect(result.sql[0]).toContain('CREATE TABLE ROUT_CKD');
    expect(result.sql[0]).toContain('SQ_EGFR_LAST');
    expect(result.sql[0]).toContain('SQ_HAS_CKD');
    expect(result.errors).toHaveLength(0);
  });

  it('should compile empty ruleblock when text has no valid statements', () => {
    const ruleblocks = [
      {
        name: 'empty',
        text: 'this is invalid syntax',
        isActive: true,
      },
    ];

    const result = compile(ruleblocks, { dialect: Dialect.ORACLE });

    // Current behavior: silently ignores unrecognized statements
    expect(result.success).toBe(true);
    expect(result.sql).toHaveLength(1);
  });

  it('should validate ruleblock name', () => {
    const ruleblocks = [
      {
        name: '123invalid',
        text: 'x => eadv.att1.val.last();',
        isActive: true,
      },
    ];

    const result = compile(ruleblocks, { dialect: Dialect.ORACLE });

    expect(result.success).toBe(false);
  });
});
