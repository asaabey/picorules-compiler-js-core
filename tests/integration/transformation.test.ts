import { describe, it, expect } from 'vitest';
import { compile, Dialect } from '../../src';

describe('Transformation Pipeline', () => {
  describe('Subset Selection', () => {
    const ruleblocks = [
      {
        name: 'ckd',
        text: 'egfr_last => eadv.lab_bld_egfr.val.last();',
        isActive: true,
      },
      {
        name: 'anemia',
        text: 'hb_last => eadv.lab_bld_haemoglobin.val.last();',
        isActive: true,
      },
      {
        name: 'diabetes',
        text: 'glucose_last => eadv.lab_bld_glucose.val.last();',
        isActive: true,
      },
    ];

    it('should compile all ruleblocks when no subset specified', () => {
      const result = compile(ruleblocks, { dialect: Dialect.ORACLE });

      expect(result.success).toBe(true);
      expect(result.sql).toHaveLength(3);
      expect(result.sql[0]).toContain('ROUT_CKD');
      expect(result.sql[1]).toContain('ROUT_ANEMIA');
      expect(result.sql[2]).toContain('ROUT_DIABETES');
    });

    it('should compile only specified ruleblocks in subset', () => {
      const result = compile(ruleblocks, {
        dialect: Dialect.ORACLE,
        subset: ['ckd', 'anemia'],
      });

      expect(result.success).toBe(true);
      expect(result.sql).toHaveLength(2);
      expect(result.sql[0]).toContain('ROUT_CKD');
      expect(result.sql[1]).toContain('ROUT_ANEMIA');
      expect(result.sql.join('')).not.toContain('ROUT_DIABETES');
    });

    it('should handle case-insensitive subset names', () => {
      const result = compile(ruleblocks, {
        dialect: Dialect.ORACLE,
        subset: ['CKD', 'Anemia'], // Mixed case
      });

      expect(result.success).toBe(true);
      expect(result.sql).toHaveLength(2);
      expect(result.sql[0]).toContain('ROUT_CKD');
      expect(result.sql[1]).toContain('ROUT_ANEMIA');
    });

    it('should handle single ruleblock subset', () => {
      const result = compile(ruleblocks, {
        dialect: Dialect.ORACLE,
        subset: ['diabetes'],
      });

      expect(result.success).toBe(true);
      expect(result.sql).toHaveLength(1);
      expect(result.sql[0]).toContain('ROUT_DIABETES');
    });

    it('should handle empty subset array (compiles all)', () => {
      const result = compile(ruleblocks, {
        dialect: Dialect.ORACLE,
        subset: [],
      });

      expect(result.success).toBe(true);
      expect(result.sql).toHaveLength(3);
    });
  });

  describe('Pruning - Ancestors (Output Pruning)', () => {
    const ruleblocks = [
      {
        name: 'base',
        text: 'egfr_last => eadv.lab_bld_egfr.val.last();',
        isActive: true,
      },
      {
        name: 'derived',
        text: `
          egfr => rout_base.egfr_last.val.bind();
          has_ckd : {egfr < 60 => 1}, {=> 0};
        `,
        isActive: true,
      },
      {
        name: 'final',
        text: `
          ckd_status => rout_derived.has_ckd.val.bind();
          is_at_risk : {ckd_status = 1 => 1}, {=> 0};
        `,
        isActive: true,
      },
      {
        name: 'unrelated',
        text: 'glucose_last => eadv.lab_bld_glucose.val.last();',
        isActive: true,
      },
    ];

    it('should keep only ancestors when pruning outputs', () => {
      const result = compile(ruleblocks, {
        dialect: Dialect.ORACLE,
        pruneOutputs: ['final'], // Keep final and its ancestors (derived, base)
      });

      expect(result.success).toBe(true);
      expect(result.sql).toHaveLength(3);

      // Should have base, derived, final (in dependency order)
      expect(result.sql[0]).toContain('ROUT_BASE');
      expect(result.sql[1]).toContain('ROUT_DERIVED');
      expect(result.sql[2]).toContain('ROUT_FINAL');

      // Should NOT have unrelated
      expect(result.sql.join('')).not.toContain('ROUT_UNRELATED');
    });

    it('should keep only direct parent when pruning outputs', () => {
      const result = compile(ruleblocks, {
        dialect: Dialect.ORACLE,
        pruneOutputs: ['derived'], // Keep derived and base
      });

      expect(result.success).toBe(true);
      expect(result.sql).toHaveLength(2);

      expect(result.sql[0]).toContain('ROUT_BASE');
      expect(result.sql[1]).toContain('ROUT_DERIVED');

      // Should NOT have final or unrelated
      expect(result.sql.join('')).not.toContain('ROUT_FINAL');
      expect(result.sql.join('')).not.toContain('ROUT_UNRELATED');
    });

    it('should keep leaf node when it has no dependencies', () => {
      const result = compile(ruleblocks, {
        dialect: Dialect.ORACLE,
        pruneOutputs: ['base'], // Base has no dependencies
      });

      expect(result.success).toBe(true);
      expect(result.sql).toHaveLength(1);
      expect(result.sql[0]).toContain('ROUT_BASE');
    });
  });

  describe('Pruning - Descendants (Input Pruning)', () => {
    const ruleblocks = [
      {
        name: 'source',
        text: 'egfr_last => eadv.lab_bld_egfr.val.last();',
        isActive: true,
      },
      {
        name: 'child1',
        text: `
          egfr => rout_source.egfr_last.val.bind();
          has_ckd : {egfr < 60 => 1}, {=> 0};
        `,
        isActive: true,
      },
      {
        name: 'child2',
        text: `
          egfr => rout_source.egfr_last.val.bind();
          risk_score => eadv.risk_score.val.last();
        `,
        isActive: true,
      },
      {
        name: 'grandchild',
        text: `
          ckd => rout_child1.has_ckd.val.bind();
          risk => rout_child2.risk_score.val.bind();
        `,
        isActive: true,
      },
      {
        name: 'unrelated',
        text: 'glucose_last => eadv.lab_bld_glucose.val.last();',
        isActive: true,
      },
    ];

    it('should keep only descendants when pruning inputs', () => {
      const result = compile(ruleblocks, {
        dialect: Dialect.ORACLE,
        pruneInputs: ['source'], // Keep source and all that depend on it
      });

      expect(result.success).toBe(true);
      expect(result.sql).toHaveLength(4);

      // Should have source, child1, child2, grandchild
      expect(result.sql[0]).toContain('ROUT_SOURCE');
      expect(result.sql.join('')).toContain('ROUT_CHILD1');
      expect(result.sql.join('')).toContain('ROUT_CHILD2');
      expect(result.sql.join('')).toContain('ROUT_GRANDCHILD');

      // Should NOT have unrelated
      expect(result.sql.join('')).not.toContain('ROUT_UNRELATED');
    });

    it('should keep only direct children when pruning inputs', () => {
      const result = compile(ruleblocks, {
        dialect: Dialect.ORACLE,
        pruneInputs: ['child1'], // Keep child1 and grandchild
      });

      expect(result.success).toBe(true);
      expect(result.sql).toHaveLength(2);

      expect(result.sql.join('')).toContain('ROUT_CHILD1');
      expect(result.sql.join('')).toContain('ROUT_GRANDCHILD');

      // Should NOT have CREATE TABLE statements for source, child2, unrelated
      expect(result.sql.join('')).not.toContain('CREATE TABLE ROUT_SOURCE');
      expect(result.sql.join('')).not.toContain('CREATE TABLE ROUT_CHILD2');
      expect(result.sql.join('')).not.toContain('CREATE TABLE ROUT_UNRELATED');

      // child1 references ROUT_SOURCE in bind, which is expected
      expect(result.sql.join('')).toContain('FROM ROUT_SOURCE'); // Referenced but not created
    });
  });

  describe('Combined Pruning (Inputs and Outputs)', () => {
    const ruleblocks = [
      {
        name: 'a',
        text: 'x => eadv.att1.val.last();',
        isActive: true,
      },
      {
        name: 'b',
        text: 'y => rout_a.x.val.bind();',
        isActive: true,
      },
      {
        name: 'c',
        text: 'z => rout_b.y.val.bind();',
        isActive: true,
      },
      {
        name: 'd',
        text: 'w => rout_c.z.val.bind();',
        isActive: true,
      },
      {
        name: 'unrelated',
        text: 'u => eadv.att2.val.last();',
        isActive: true,
      },
    ];

    it('should keep intersection of ancestors and descendants', () => {
      const result = compile(ruleblocks, {
        dialect: Dialect.ORACLE,
        pruneInputs: ['a'], // Keep a, b, c, d (all descendants of a)
        pruneOutputs: ['c'], // Keep a, b, c (all ancestors of c)
      });

      // Intersection: a, b, c
      expect(result.success).toBe(true);
      expect(result.sql).toHaveLength(3);

      expect(result.sql[0]).toContain('ROUT_A');
      expect(result.sql[1]).toContain('ROUT_B');
      expect(result.sql[2]).toContain('ROUT_C');

      // Should NOT have d or unrelated
      expect(result.sql.join('')).not.toContain('ROUT_D');
      expect(result.sql.join('')).not.toContain('ROUT_UNRELATED');
    });

    it('should handle path from input to output', () => {
      const result = compile(ruleblocks, {
        dialect: Dialect.ORACLE,
        pruneInputs: ['b'],
        pruneOutputs: ['d'],
      });

      // Descendants of b: b, c, d
      // Ancestors of d: a, b, c, d
      // Intersection: b, c, d

      expect(result.success).toBe(true);
      expect(result.sql).toHaveLength(3);

      expect(result.sql.join('')).toContain('ROUT_B');
      expect(result.sql.join('')).toContain('ROUT_C');
      expect(result.sql.join('')).toContain('ROUT_D');

      // Should NOT have CREATE TABLE for a or unrelated
      expect(result.sql.join('')).not.toContain('CREATE TABLE ROUT_A');
      expect(result.sql.join('')).not.toContain('CREATE TABLE ROUT_UNRELATED');

      // b references ROUT_A in bind, which is expected
      expect(result.sql.join('')).toContain('FROM ROUT_A'); // Referenced but not created
    });
  });

  describe('Subset + Pruning Combined', () => {
    const ruleblocks = [
      {
        name: 'base1',
        text: 'x1 => eadv.att1.val.last();',
        isActive: true,
      },
      {
        name: 'base2',
        text: 'x2 => eadv.att2.val.last();',
        isActive: true,
      },
      {
        name: 'derived1',
        text: 'y1 => rout_base1.x1.val.bind();',
        isActive: true,
      },
      {
        name: 'derived2',
        text: 'y2 => rout_base2.x2.val.bind();',
        isActive: true,
      },
      {
        name: 'final',
        text: `
          z1 => rout_derived1.y1.val.bind();
          z2 => rout_derived2.y2.val.bind();
        `,
        isActive: true,
      },
    ];

    it('should apply subset first, then pruning', () => {
      const result = compile(ruleblocks, {
        dialect: Dialect.ORACLE,
        subset: ['base1', 'derived1', 'final'], // Exclude base2 and derived2
        pruneOutputs: ['final'], // Keep final and ancestors
      });

      // After subset: base1, derived1, final
      // After pruning (ancestors of final): base1, derived1, final
      // (base2 and derived2 already excluded by subset)

      expect(result.success).toBe(true);
      expect(result.sql).toHaveLength(3);

      expect(result.sql[0]).toContain('ROUT_BASE1');
      expect(result.sql[1]).toContain('ROUT_DERIVED1');
      expect(result.sql[2]).toContain('ROUT_FINAL');
    });
  });

  describe('Dependency Ordering Preservation', () => {
    it('should maintain dependency order after transformations', () => {
      const ruleblocks = [
        {
          name: 'z_last', // Alphabetically last, but should come first
          text: 'x => eadv.att1.val.last();',
          isActive: true,
        },
        {
          name: 'a_first', // Alphabetically first, but depends on z_last
          text: 'y => rout_z_last.x.val.bind();',
          isActive: true,
        },
      ];

      const result = compile(ruleblocks, { dialect: Dialect.ORACLE });

      expect(result.success).toBe(true);
      expect(result.sql).toHaveLength(2);

      // z_last should come before a_first (dependency order)
      expect(result.sql[0]).toContain('ROUT_Z_LAST');
      expect(result.sql[1]).toContain('ROUT_A_FIRST');
    });
  });
});
