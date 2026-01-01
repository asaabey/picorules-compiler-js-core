/**
 * Example 1: Hello World - Basic Compilation
 *
 * This example demonstrates the simplest possible usage of the compiler:
 * compiling a single ruleblock to Oracle SQL.
 */

import { compile, Dialect } from '../src';

// Define a simple ruleblock
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

// Compile to Oracle SQL
const result = compile(ruleblocks, { dialect: Dialect.ORACLE });

if (result.success) {
  console.log('✅ Compilation successful!\n');
  console.log('Generated SQL:');
  console.log('=' .repeat(60));
  console.log(result.sql[0]);
  console.log('=' .repeat(60));

  if (result.metrics) {
    console.log('\n📊 Performance Metrics:');
    console.log(`  Parse time: ${result.metrics.parseTimeMs}ms`);
    console.log(`  Link time: ${result.metrics.linkTimeMs}ms`);
    console.log(`  Transform time: ${result.metrics.transformTimeMs}ms`);
    console.log(`  SQL generation time: ${result.metrics.sqlGenTimeMs}ms`);
    console.log(`  Total time: ${result.metrics.totalTimeMs}ms`);
  }
} else {
  console.error('❌ Compilation failed!');
  result.errors.forEach(err => {
    console.error(`  - ${err.message}`);
  });
}
