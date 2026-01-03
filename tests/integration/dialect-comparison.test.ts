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

  describe('PostgreSQL', () => {
    it('should generate PostgreSQL with CURRENT_DATE and proper syntax', () => {
      const result = compile([testRuleblock], { dialect: Dialect.POSTGRESQL });

      expect(result.success).toBe(true);
      expect(result.sql).toHaveLength(1);

      const sql = result.sql[0];

      // PostgreSQL-specific checks
      expect(sql).toContain('CREATE TABLE ROUT_TEST AS');
      expect(sql).toContain('WITH');
      expect(sql).toContain('UEADV AS');
      expect(sql).toContain('SELECT DISTINCT eid FROM eadv');
      expect(sql).toContain('LEFT JOIN');
      expect(sql).toContain('USING (eid)');

      // Should NOT contain Oracle or T-SQL specific syntax
      expect(sql).not.toContain('SELECT INTO');
      expect(sql).not.toContain('SYSDATE');
      expect(sql).not.toContain('GETDATE()');
    });

    it('should use PostgreSQL-specific string aggregation', () => {
      const ruleblock = {
        name: 'test_agg',
        text: 'values_list => eadv.lab_bld_egfr.val.serialize(",");',
        isActive: true,
      };

      const result = compile([ruleblock], { dialect: Dialect.POSTGRESQL });
      const sql = result.sql[0];

      // PostgreSQL uses STRING_AGG with ORDER BY inside
      expect(sql).toContain('STRING_AGG');
      expect(sql).toMatch(/STRING_AGG\([^,]+,\s*'[^']*'\s+ORDER BY/);
      expect(sql).not.toContain('LISTAGG');
    });

    it('should use PostgreSQL date functions', () => {
      const ruleblock = {
        name: 'test_dates',
        text: `
          egfr_lastdv => eadv.lab_bld_egfr.val.lastdv();
        `,
        isActive: true,
      };

      const result = compile([ruleblock], { dialect: Dialect.POSTGRESQL });
      const sql = result.sql[0];

      // PostgreSQL uses to_char for date formatting (lowercase)
      expect(sql).toMatch(/to_char/);
      expect(sql).not.toContain('TO_CHAR');
      expect(sql).not.toContain('CONVERT');
    });

    it('should handle median with PERCENTILE_CONT', () => {
      const ruleblock = {
        name: 'test_median',
        text: 'egfr_median => eadv.lab_bld_egfr.val.median();',
        isActive: true,
      };

      const result = compile([ruleblock], { dialect: Dialect.POSTGRESQL });
      const sql = result.sql[0];

      // PostgreSQL uses PERCENTILE_CONT like T-SQL
      expect(sql).toContain('PERCENTILE_CONT(0.5)');
      expect(sql).not.toContain('MEDIAN()');
    });

    it('should use subquery aliases', () => {
      const result = compile([testRuleblock], { dialect: Dialect.POSTGRESQL });
      const sql = result.sql[0];

      // PostgreSQL uses subquery aliases (we check for the pattern with whitespace/newline)
      expect(sql).toMatch(/\)\s+ranked/);
      expect(sql).toContain('ROW_NUMBER() OVER');
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

    it('should generate PostgreSQL for cross-ruleblock references', () => {
      const result = compile(ruleblocks, { dialect: Dialect.POSTGRESQL });

      expect(result.success).toBe(true);
      expect(result.sql).toHaveLength(2);

      expect(result.sql[0]).toContain('CREATE TABLE ROUT_BASE');
      expect(result.sql[1]).toContain('CREATE TABLE ROUT_DERIVED');
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

    it('should generate PostgreSQL for complex ruleblock', () => {
      const result = compile([complexRuleblock], { dialect: Dialect.POSTGRESQL });

      expect(result.success).toBe(true);
      expect(result.sql[0]).toContain('SQ_EGFR_LAST');
      expect(result.sql[0]).toContain('SQ_EGFR_FIRST');
      expect(result.sql[0]).toContain('SQ_EGFR_COUNT');
      expect(result.sql[0]).toContain('SQ_STAGE');
    });
  });
});
