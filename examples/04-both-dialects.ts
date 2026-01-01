/**
 * Example 4: Both SQL Dialects
 *
 * This example demonstrates compiling the same ruleblocks to both
 * Oracle PL/SQL and SQL Server T-SQL.
 */

import { compile, Dialect } from '../src';

const ruleblocks = [
  {
    name: 'analytics',
    text: `
      egfr_last => eadv.lab_bld_egfr.val.last();
      egfr_avg => eadv.lab_bld_egfr.val.avg();
      egfr_median => eadv.lab_bld_egfr.val.median();
      egfr_series => eadv.lab_bld_egfr.val.serialize(|);
      has_egfr => eadv.lab_bld_egfr.val.exists();
    `,
    isActive: true,
  },
];

console.log('🔄 Compiling to Both SQL Dialects\n');

// Compile to Oracle
console.log('1️⃣  Oracle PL/SQL');
console.log('=' .repeat(60));

const oracleResult = compile(ruleblocks, { dialect: Dialect.ORACLE });

if (oracleResult.success) {
  const sql = oracleResult.sql[0];

  console.log('\nKey Oracle Syntax:');
  console.log('  ✓ CREATE TABLE AS');
  console.log('  ✓ MEDIAN() function');
  console.log('  ✓ LISTAGG for string aggregation');
  console.log('  ✓ USING (eid) for joins\n');

  // Show snippets
  console.log('SQL Snippets:');
  if (sql.includes('CREATE TABLE')) {
    console.log('  - Table creation:', sql.match(/CREATE TABLE.*AS/)?.[0]);
  }
  if (sql.includes('MEDIAN')) {
    console.log('  - Median function: MEDIAN(val)');
  }
  if (sql.includes('LISTAGG')) {
    console.log('  - String agg: LISTAGG(...) WITHIN GROUP (ORDER BY dt)');
  }
}

console.log('\n');

// Compile to SQL Server
console.log('2️⃣  SQL Server T-SQL');
console.log('=' .repeat(60));

const mssqlResult = compile(ruleblocks, { dialect: Dialect.MSSQL });

if (mssqlResult.success) {
  const sql = mssqlResult.sql[0];

  console.log('\nKey T-SQL Syntax:');
  console.log('  ✓ SELECT INTO');
  console.log('  ✓ PERCENTILE_CONT(0.5) for median');
  console.log('  ✓ STRING_AGG for string aggregation');
  console.log('  ✓ ON table1.eid = table2.eid for joins');
  console.log('  ✓ AS ranked (required subquery aliases)\n');

  // Show snippets
  console.log('SQL Snippets:');
  if (sql.includes('INTO')) {
    console.log('  - Table creation:', sql.match(/SELECT.*INTO.*ROUT_ANALYTICS/)?.[0]);
  }
  if (sql.includes('PERCENTILE_CONT')) {
    console.log('  - Median function: PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY val)');
  }
  if (sql.includes('STRING_AGG')) {
    console.log('  - String agg: STRING_AGG(...) WITHIN GROUP (ORDER BY dt)');
  }
}

// Compare sizes
console.log('\n');
console.log('📏 SQL Size Comparison');
console.log('─'.repeat(60));
console.log(`  Oracle SQL: ${oracleResult.sql[0].length} characters`);
console.log(`  T-SQL:      ${mssqlResult.sql[0].length} characters`);

// Compare performance
console.log('\n');
console.log('⏱️  Compilation Performance');
console.log('─'.repeat(60));
console.log(`  Oracle: ${oracleResult.metrics?.totalTimeMs}ms`);
console.log(`  T-SQL:  ${mssqlResult.metrics?.totalTimeMs}ms`);

console.log('\n✅ Both dialects compiled successfully!');
