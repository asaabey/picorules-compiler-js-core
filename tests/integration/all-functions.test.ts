import { describe, it, expect } from 'vitest';
import { compile, Dialect } from '../../src';

describe('All Picorules Functions', () => {
  describe('Aggregation Functions', () => {
    describe('sum()', () => {
      const ruleblock = {
        name: 'test_sum',
        text: 'total_egfr => eadv.lab_bld_egfr.val.sum();',
        isActive: true,
      };

      it('should generate Oracle SQL with SUM', () => {
        const result = compile([ruleblock], { dialect: Dialect.ORACLE });
        expect(result.success).toBe(true);
        expect(result.sql[0]).toContain('SUM(val)');
        expect(result.sql[0]).toContain('SQ_TOTAL_EGFR');
      });

      it('should generate T-SQL with SUM', () => {
        const result = compile([ruleblock], { dialect: Dialect.MSSQL });
        expect(result.success).toBe(true);
        expect(result.sql[0]).toContain('SUM(CAST(val AS FLOAT))');
        expect(result.sql[0]).toContain('#SQ_total_egfr');
      });
    });

    describe('avg()', () => {
      const ruleblock = {
        name: 'test_avg',
        text: 'avg_egfr => eadv.lab_bld_egfr.val.avg();',
        isActive: true,
      };

      it('should generate Oracle SQL with AVG', () => {
        const result = compile([ruleblock], { dialect: Dialect.ORACLE });
        expect(result.success).toBe(true);
        expect(result.sql[0]).toContain('AVG(val)');
        expect(result.sql[0]).toContain('SQ_AVG_EGFR');
      });

      it('should generate T-SQL with AVG', () => {
        const result = compile([ruleblock], { dialect: Dialect.MSSQL });
        expect(result.success).toBe(true);
        expect(result.sql[0]).toContain('AVG(CAST(val AS FLOAT))');
        expect(result.sql[0]).toContain('#SQ_avg_egfr');
      });
    });

    describe('min()', () => {
      const ruleblock = {
        name: 'test_min',
        text: 'min_egfr => eadv.lab_bld_egfr.val.min();',
        isActive: true,
      };

      it('should generate Oracle SQL with MIN', () => {
        const result = compile([ruleblock], { dialect: Dialect.ORACLE });
        expect(result.success).toBe(true);
        expect(result.sql[0]).toContain('MIN(val)');
        expect(result.sql[0]).toContain('SQ_MIN_EGFR');
      });

      it('should generate T-SQL with MIN', () => {
        const result = compile([ruleblock], { dialect: Dialect.MSSQL });
        expect(result.success).toBe(true);
        expect(result.sql[0]).toContain('MIN(CAST(val AS FLOAT))');
        expect(result.sql[0]).toContain('#SQ_min_egfr');
      });
    });

    describe('max()', () => {
      const ruleblock = {
        name: 'test_max',
        text: 'max_egfr => eadv.lab_bld_egfr.val.max();',
        isActive: true,
      };

      it('should generate Oracle SQL with MAX', () => {
        const result = compile([ruleblock], { dialect: Dialect.ORACLE });
        expect(result.success).toBe(true);
        expect(result.sql[0]).toContain('MAX(val)');
        expect(result.sql[0]).toContain('SQ_MAX_EGFR');
      });

      it('should generate T-SQL with MAX', () => {
        const result = compile([ruleblock], { dialect: Dialect.MSSQL });
        expect(result.success).toBe(true);
        expect(result.sql[0]).toContain('MAX(CAST(val AS FLOAT))');
        expect(result.sql[0]).toContain('#SQ_max_egfr');
      });
    });

    describe('median()', () => {
      const ruleblock = {
        name: 'test_median',
        text: 'median_egfr => eadv.lab_bld_egfr.val.median();',
        isActive: true,
      };

      it('should generate Oracle SQL with MEDIAN', () => {
        const result = compile([ruleblock], { dialect: Dialect.ORACLE });
        expect(result.success).toBe(true);
        expect(result.sql[0]).toContain('MEDIAN(val)');
        expect(result.sql[0]).toContain('SQ_MEDIAN_EGFR');
      });

      it('should generate T-SQL with PERCENTILE_CONT', () => {
        const result = compile([ruleblock], { dialect: Dialect.MSSQL });
        expect(result.success).toBe(true);
        expect(result.sql[0]).toContain('PERCENTILE_CONT(0.5)');
        expect(result.sql[0]).toContain('#SQ_median_egfr');
      });
    });

    describe('distinct_count()', () => {
      const ruleblock = {
        name: 'test_distinct',
        text: 'unique_vals => eadv.lab_bld_egfr.val.distinct_count();',
        isActive: true,
      };

      it('should generate Oracle SQL with COUNT DISTINCT', () => {
        const result = compile([ruleblock], { dialect: Dialect.ORACLE });
        expect(result.success).toBe(true);
        expect(result.sql[0]).toContain('COUNT(DISTINCT val)');
        expect(result.sql[0]).toContain('SQ_UNIQUE_VALS');
      });

      it('should generate T-SQL with COUNT DISTINCT', () => {
        const result = compile([ruleblock], { dialect: Dialect.MSSQL });
        expect(result.success).toBe(true);
        expect(result.sql[0]).toContain('COUNT(DISTINCT val)');
        expect(result.sql[0]).toContain('#SQ_unique_vals');
      });
    });
  });

  describe('Window Functions', () => {
    describe('nth()', () => {
      const ruleblock = {
        name: 'test_nth',
        text: 'second_egfr => eadv.lab_bld_egfr.val.nth(2);',
        isActive: true,
      };

      it('should generate Oracle SQL with ROW_NUMBER and nth parameter', () => {
        const result = compile([ruleblock], { dialect: Dialect.ORACLE });
        expect(result.success).toBe(true);
        expect(result.sql[0]).toContain('ROW_NUMBER()');
        expect(result.sql[0]).toContain('WHERE rn = 2');
        expect(result.sql[0]).toContain('SQ_SECOND_EGFR');
      });

      it('should generate T-SQL with ROW_NUMBER and nth parameter', () => {
        const result = compile([ruleblock], { dialect: Dialect.MSSQL });
        expect(result.success).toBe(true);
        expect(result.sql[0]).toContain('ROW_NUMBER()');
        expect(result.sql[0]).toContain('RANK = 2');
        expect(result.sql[0]).toContain('#SQ_second_egfr');
      });
    });

    describe('lastdv()', () => {
      const ruleblock = {
        name: 'test_lastdv',
        text: 'egfr_lastdv => eadv.lab_bld_egfr._.lastdv();',
        isActive: true,
      };

      it('should generate Oracle SQL with separate val and dt columns', () => {
        const result = compile([ruleblock], { dialect: Dialect.ORACLE });
        expect(result.success).toBe(true);
        // lastdv returns separate _val and _dt columns
        expect(result.sql[0]).toContain('egfr_lastdv_val');
        expect(result.sql[0]).toContain('egfr_lastdv_dt');
        expect(result.sql[0]).toContain('ORDER BY dt DESC');
        expect(result.sql[0]).toContain('SQ_EGFR_LASTDV');
      });

      it('should generate T-SQL with separate val and dt columns', () => {
        const result = compile([ruleblock], { dialect: Dialect.MSSQL });
        expect(result.success).toBe(true);
        // lastdv returns separate _val and _dt columns
        expect(result.sql[0]).toContain('egfr_lastdv_val');
        expect(result.sql[0]).toContain('egfr_lastdv_dt');
        expect(result.sql[0]).toContain('ORDER BY');
        expect(result.sql[0]).toContain('#SQ_egfr_lastdv');
      });
    });

    describe('firstdv()', () => {
      const ruleblock = {
        name: 'test_firstdv',
        text: 'egfr_firstdv => eadv.lab_bld_egfr._.firstdv();',
        isActive: true,
      };

      it('should generate Oracle SQL with ASC ordering', () => {
        const result = compile([ruleblock], { dialect: Dialect.ORACLE });
        expect(result.success).toBe(true);
        expect(result.sql[0]).toContain('ORDER BY dt ASC');
        // firstdv returns separate _val and _dt columns
        expect(result.sql[0]).toContain('egfr_firstdv_val');
        expect(result.sql[0]).toContain('egfr_firstdv_dt');
        expect(result.sql[0]).toContain('SQ_EGFR_FIRSTDV');
      });

      it('should generate T-SQL with ASC ordering', () => {
        const result = compile([ruleblock], { dialect: Dialect.MSSQL });
        expect(result.success).toBe(true);
        expect(result.sql[0]).toContain('dt ASC');
        // firstdv returns separate _val and _dt columns
        expect(result.sql[0]).toContain('egfr_firstdv_val');
        expect(result.sql[0]).toContain('egfr_firstdv_dt');
        expect(result.sql[0]).toContain('#SQ_egfr_firstdv');
      });
    });
  });

  describe('String Functions', () => {
    describe('serialize()', () => {
      const ruleblock = {
        name: 'test_serialize',
        text: 'egfr_series => eadv.lab_bld_egfr.val.serialize(|);',
        isActive: true,
      };

      it('should generate Oracle SQL with LISTAGG and custom delimiter', () => {
        const result = compile([ruleblock], { dialect: Dialect.ORACLE });
        expect(result.success).toBe(true);
        expect(result.sql[0]).toContain('LISTAGG');
        expect(result.sql[0]).toContain("'|'");
        expect(result.sql[0]).toContain('WITHIN GROUP (ORDER BY dt)');
        expect(result.sql[0]).toContain('SQ_EGFR_SERIES');
      });

      it('should generate T-SQL with STRING_AGG and custom delimiter', () => {
        const result = compile([ruleblock], { dialect: Dialect.MSSQL });
        expect(result.success).toBe(true);
        expect(result.sql[0]).toContain('STRING_AGG');
        expect(result.sql[0]).toContain("'|'");
        expect(result.sql[0]).toContain('WITHIN GROUP (ORDER BY dt)');
        expect(result.sql[0]).toContain('#SQ_egfr_series');
      });
    });

    describe('serializedv()', () => {
      const ruleblock = {
        name: 'test_serializedv',
        text: 'egfr_seriesdv => eadv.lab_bld_egfr._.serializedv(|);',
        isActive: true,
      };

      it('should generate Oracle SQL with value~date pairs', () => {
        const result = compile([ruleblock], { dialect: Dialect.ORACLE });
        expect(result.success).toBe(true);
        expect(result.sql[0]).toContain('LISTAGG');
        expect(result.sql[0]).toContain("|| '~' ||");
        expect(result.sql[0]).toContain("'|'");
        expect(result.sql[0]).toContain('SQ_EGFR_SERIESDV');
      });

      it('should generate T-SQL with value~date pairs', () => {
        const result = compile([ruleblock], { dialect: Dialect.MSSQL });
        expect(result.success).toBe(true);
        expect(result.sql[0]).toContain('STRING_AGG');
        expect(result.sql[0]).toContain("+ '~' +");
        expect(result.sql[0]).toContain("'|'");
        expect(result.sql[0]).toContain('#SQ_egfr_seriesdv');
      });
    });
  });

  describe('Statistical Functions', () => {
    describe('regr_slope()', () => {
      const ruleblock = {
        name: 'test_slope',
        text: 'egfr_slope => eadv.lab_bld_egfr.val.regr_slope();',
        isActive: true,
      };

      it('should generate Oracle SQL with REGR_SLOPE', () => {
        const result = compile([ruleblock], { dialect: Dialect.ORACLE });
        expect(result.success).toBe(true);
        expect(result.sql[0]).toContain('REGR_SLOPE');
        expect(result.sql[0]).toContain('SQ_EGFR_SLOPE');
      });

      it('should generate T-SQL with regression formula', () => {
        const result = compile([ruleblock], { dialect: Dialect.MSSQL });
        expect(result.success).toBe(true);
        // T-SQL uses manual regression calculation
        expect(result.sql[0].toLowerCase()).toContain('sum');
        expect(result.sql[0]).toContain('#SQ_egfr_slope');
      });
    });

    describe('regr_intercept()', () => {
      const ruleblock = {
        name: 'test_intercept',
        text: 'egfr_intercept => eadv.lab_bld_egfr.val.regr_intercept();',
        isActive: true,
      };

      it('should generate Oracle SQL with REGR_INTERCEPT', () => {
        const result = compile([ruleblock], { dialect: Dialect.ORACLE });
        expect(result.success).toBe(true);
        expect(result.sql[0]).toContain('REGR_INTERCEPT');
        expect(result.sql[0]).toContain('SQ_EGFR_INTERCEPT');
      });

      it('should generate T-SQL with intercept formula', () => {
        const result = compile([ruleblock], { dialect: Dialect.MSSQL });
        expect(result.success).toBe(true);
        expect(result.sql[0].toLowerCase()).toContain('sum');
        expect(result.sql[0]).toContain('#SQ_egfr_intercept');
      });
    });

    describe('regr_r2()', () => {
      const ruleblock = {
        name: 'test_r2',
        text: 'egfr_r2 => eadv.lab_bld_egfr.val.regr_r2();',
        isActive: true,
      };

      it('should generate Oracle SQL with REGR_R2', () => {
        const result = compile([ruleblock], { dialect: Dialect.ORACLE });
        expect(result.success).toBe(true);
        expect(result.sql[0]).toContain('REGR_R2');
        expect(result.sql[0]).toContain('SQ_EGFR_R2');
      });

      it('should generate T-SQL with R-squared formula', () => {
        const result = compile([ruleblock], { dialect: Dialect.MSSQL });
        expect(result.success).toBe(true);
        expect(result.sql[0].toLowerCase()).toContain('power');
        expect(result.sql[0]).toContain('#SQ_egfr_r2');
      });
    });
  });

  describe('Existence Function', () => {
    describe('exists()', () => {
      const ruleblock = {
        name: 'test_exists',
        text: 'has_egfr => eadv.lab_bld_egfr.val.exists();',
        isActive: true,
      };

      it('should generate Oracle SQL with CASE WHEN COUNT', () => {
        const result = compile([ruleblock], { dialect: Dialect.ORACLE });
        expect(result.success).toBe(true);
        expect(result.sql[0]).toContain('CASE WHEN COUNT(*) > 0');
        expect(result.sql[0]).toContain('THEN 1 ELSE 0');
        expect(result.sql[0]).toContain('SQ_HAS_EGFR');
      });

      it('should generate T-SQL with CASE WHEN COUNT', () => {
        const result = compile([ruleblock], { dialect: Dialect.MSSQL });
        expect(result.success).toBe(true);
        expect(result.sql[0]).toContain('CASE WHEN COUNT(*) > 0');
        expect(result.sql[0]).toContain('THEN 1 ELSE 0');
        expect(result.sql[0]).toContain('#SQ_has_egfr');
      });
    });
  });

  describe('Complex Ruleblock with Multiple Function Types', () => {
    const ruleblock = {
      name: 'complex',
      text: `
        egfr_last => eadv.lab_bld_egfr.val.last();
        egfr_avg => eadv.lab_bld_egfr.val.avg();
        egfr_count => eadv.lab_bld_egfr.val.count();
        egfr_series => eadv.lab_bld_egfr.val.serialize(,);
        egfr_slope => eadv.lab_bld_egfr.val.regr_slope();
        has_egfr => eadv.lab_bld_egfr.val.exists();
        is_ckd : {egfr_last < 60 => 1}, {=> 0};
      `,
      isActive: true,
    };

    it('should generate Oracle SQL with all function types', () => {
      const result = compile([ruleblock], { dialect: Dialect.ORACLE });

      expect(result.success).toBe(true);

      const sql = result.sql[0];
      expect(sql).toContain('SQ_EGFR_LAST');
      expect(sql).toContain('SQ_EGFR_AVG');
      expect(sql).toContain('SQ_EGFR_COUNT');
      expect(sql).toContain('SQ_EGFR_SERIES');
      expect(sql).toContain('SQ_EGFR_SLOPE');
      expect(sql).toContain('SQ_HAS_EGFR');
      expect(sql).toContain('SQ_IS_CKD');

      // Should have proper CTE structure
      expect(sql).toContain('CREATE TABLE ROUT_COMPLEX');
      expect(sql).toContain('WITH');
      expect(sql).toContain('UEADV AS');
    });

    it('should generate T-SQL with all function types', () => {
      const result = compile([ruleblock], { dialect: Dialect.MSSQL });

      expect(result.success).toBe(true);

      const sql = result.sql[0];
      expect(sql).toContain('#SQ_egfr_last');
      expect(sql).toContain('#SQ_egfr_avg');
      expect(sql).toContain('#SQ_egfr_count');
      expect(sql).toContain('#SQ_egfr_series');
      expect(sql).toContain('#SQ_egfr_slope');
      expect(sql).toContain('#SQ_has_egfr');
      expect(sql).toContain('#SQ_is_ckd');

      // Should have proper SELECT INTO structure
      expect(sql).toContain('SROUT_complex');
      expect(sql).toContain('#UEADV');
    });
  });
});
