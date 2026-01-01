import { describe, it, expect } from 'vitest';
import { compile, Dialect } from '../../src';

describe('SQL Dialect Comparison', () => {
  const testRuleblock = {
    name: 'test',
    text: `
      egfr_last => eadv.lab_bld_egfr.val.last();
      has_ckd : {egfr_last < 60 => 1}, {=> 0};
    `,
    isActive: true,
  };

  describe('Oracle PL/SQL', () => {
    it('should generate Oracle SQL with SYSDATE and proper syntax', () => {
      const result = compile([testRuleblock], { dialect: Dialect.ORACLE });

      expect(result.success).toBe(true);
      expect(result.sql).toHaveLength(1);

      const sql = result.sql[0];

      // Oracle-specific checks
      expect(sql).toContain('CREATE TABLE ROUT_TEST AS');
      expect(sql).toContain('WITH');
      expect(sql).toContain('UEADV AS');
      expect(sql).toContain('SELECT DISTINCT eid FROM eadv');
      expect(sql).toContain('LEFT JOIN');
      expect(sql).toContain('USING (eid)');

      // Should NOT contain T-SQL specific syntax
      expect(sql).not.toContain('SELECT INTO');
      expect(sql).not.toContain('AS ranked');
      expect(sql).not.toContain('GETDATE()');
    });

    it('should handle fetch statements without subquery aliases', () => {
      const result = compile([testRuleblock], { dialect: Dialect.ORACLE });
      const sql = result.sql[0];

      // Oracle doesn't require subquery aliases
      expect(sql).toContain('ROW_NUMBER() OVER');
      expect(sql).not.toContain(') AS ranked');
    });
  });

  describe('SQL Server T-SQL', () => {
    it('should generate T-SQL with GETDATE() and proper syntax', () => {
      const result = compile([testRuleblock], { dialect: Dialect.MSSQL });

      expect(result.success).toBe(true);
      expect(result.sql).toHaveLength(1);

      const sql = result.sql[0];

      // T-SQL-specific checks
      expect(sql).toContain('SELECT');
      expect(sql).toContain('INTO ROUT_TEST');
      expect(sql).toContain('WITH');
      expect(sql).toContain('UEADV AS');

      // Should NOT contain Oracle-specific syntax
      expect(sql).not.toContain('CREATE TABLE');
      expect(sql).not.toContain('USING (eid)');
      expect(sql).not.toContain('SYSDATE');
    });

    it('should require subquery aliases', () => {
      const result = compile([testRuleblock], { dialect: Dialect.MSSQL });
      const sql = result.sql[0];

      // T-SQL requires subquery aliases
      expect(sql).toContain('AS ranked');
    });

    it('should use ON clause for joins instead of USING', () => {
      const result = compile([testRuleblock], { dialect: Dialect.MSSQL });
      const sql = result.sql[0];

      // T-SQL uses ON for joins
      expect(sql).toMatch(/LEFT JOIN.*ON.*eid.*=.*eid/);
      expect(sql).not.toContain('USING');
    });
  });

  describe('Cross-ruleblock with both dialects', () => {
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
    ];

    it('should generate Oracle SQL for cross-ruleblock references', () => {
      const result = compile(ruleblocks, { dialect: Dialect.ORACLE });

      expect(result.success).toBe(true);
      expect(result.sql).toHaveLength(2);

      expect(result.sql[0]).toContain('CREATE TABLE ROUT_BASE');
      expect(result.sql[1]).toContain('CREATE TABLE ROUT_DERIVED');
      expect(result.sql[1]).toContain('FROM ROUT_BASE');
    });

    it('should generate T-SQL for cross-ruleblock references', () => {
      const result = compile(ruleblocks, { dialect: Dialect.MSSQL });

      expect(result.success).toBe(true);
      expect(result.sql).toHaveLength(2);

      expect(result.sql[0]).toContain('INTO ROUT_BASE');
      expect(result.sql[1]).toContain('INTO ROUT_DERIVED');
      expect(result.sql[1]).toContain('FROM ROUT_BASE');
    });
  });

  describe('Dialect selection', () => {
    it('should default to Oracle when no dialect specified', () => {
      const result = compile([testRuleblock]);

      expect(result.success).toBe(true);
      expect(result.sql[0]).toContain('CREATE TABLE');
    });

    it('should respect dialect option', () => {
      const oracleResult = compile([testRuleblock], { dialect: Dialect.ORACLE });
      const mssqlResult = compile([testRuleblock], { dialect: Dialect.MSSQL });

      expect(oracleResult.sql[0]).toContain('CREATE TABLE');
      expect(mssqlResult.sql[0]).toContain('SELECT');
      expect(mssqlResult.sql[0]).toContain('INTO');
    });
  });

  describe('Complex statements with both dialects', () => {
    const complexRuleblock = {
      name: 'complex',
      text: `
        egfr_last => eadv.lab_bld_egfr.val.last();
        egfr_first => eadv.lab_bld_egfr.val.first();
        egfr_count => eadv.lab_bld_egfr.val.count();
        stage : {egfr_last < 30 => 5}, {egfr_last < 45 => 4}, {egfr_last < 60 => 3}, {=> 0};
      `,
      isActive: true,
    };

    it('should generate Oracle SQL for complex ruleblock', () => {
      const result = compile([complexRuleblock], { dialect: Dialect.ORACLE });

      expect(result.success).toBe(true);
      expect(result.sql[0]).toContain('SQ_EGFR_LAST');
      expect(result.sql[0]).toContain('SQ_EGFR_FIRST');
      expect(result.sql[0]).toContain('SQ_EGFR_COUNT');
      expect(result.sql[0]).toContain('SQ_STAGE');
    });

    it('should generate T-SQL for complex ruleblock', () => {
      const result = compile([complexRuleblock], { dialect: Dialect.MSSQL });

      expect(result.success).toBe(true);
      expect(result.sql[0]).toContain('SQ_EGFR_LAST');
      expect(result.sql[0]).toContain('SQ_EGFR_FIRST');
      expect(result.sql[0]).toContain('SQ_EGFR_COUNT');
      expect(result.sql[0]).toContain('SQ_STAGE');
    });
  });
});
