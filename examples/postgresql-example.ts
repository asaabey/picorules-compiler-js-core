/**
 * Example: Compiling Picorules to PostgreSQL
 *
 * This example demonstrates using the Picorules compiler to generate
 * PostgreSQL-compatible SQL from clinical decision support rules.
 */

import { compile, Dialect } from '../src/index';

// Define a simple CKD (Chronic Kidney Disease) detection ruleblock
const ckdRuleblock = {
  name: 'ckd_detection',
  text: `
    egfr_last => eadv.lab_bld_egfr.val.last();
    egfr_median => eadv.lab_bld_egfr.val.median();
    egfr_count => eadv.lab_bld_egfr.val.count();

    ckd_stage :
      { egfr_last < 15 => 5 },
      { egfr_last < 30 => 4 },
      { egfr_last < 45 => 3 },
      { egfr_last < 60 => 2 },
      { egfr_last < 90 => 1 },
      { => 0 };

    has_ckd : { ckd_stage >= 3 => 1 }, { => 0 };
  `,
  isActive: true,
};

// Compile to PostgreSQL
const result = compile([ckdRuleblock], {
  dialect: Dialect.POSTGRESQL
});

if (result.success) {
  console.log('PostgreSQL SQL generated successfully!\n');
  console.log('='.repeat(60));
  console.log(result.sql[0]);
  console.log('='.repeat(60));
  console.log('\nPostgreSQL-specific features used:');
  console.log('- PERCENTILE_CONT for median calculation');
  console.log('- to_char() for date formatting');
  console.log('- CREATE TABLE AS syntax');
  console.log('- USING (eid) for joins');
  console.log('- Subquery aliases (ranked)');
} else {
  console.error('Compilation failed:');
  console.error(result.errors);
}

// Compare with other dialects
console.log('\n' + '='.repeat(60));
console.log('Comparing with other dialects...\n');

const oracleResult = compile([ckdRuleblock], { dialect: Dialect.ORACLE });
const mssqlResult = compile([ckdRuleblock], { dialect: Dialect.MSSQL });

console.log('Oracle uses: MEDIAN(), SYSDATE, LISTAGG');
console.log('T-SQL uses: PERCENTILE_CONT, GETDATE(), STRING_AGG, SELECT INTO');
console.log('PostgreSQL uses: PERCENTILE_CONT, CURRENT_DATE, STRING_AGG, CREATE TABLE AS');

console.log('\nAll three dialects generate functionally equivalent SQL!');
