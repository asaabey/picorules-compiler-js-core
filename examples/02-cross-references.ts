/**
 * Example 2: Cross-Ruleblock References
 *
 * This example demonstrates how to use bind statements to reference
 * variables from other ruleblocks. The compiler automatically resolves
 * dependencies and orders ruleblocks correctly.
 */

import { compile, Dialect } from '../src';

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
    `,
    isActive: true,
  },
  {
    name: 'final',
    text: `
      ckd_status => rout_derived.has_ckd.val.bind();
      anaemia_status => rout_derived.is_anaemic.val.bind();
      both_conditions : {ckd_status = 1 and anaemia_status = 1 => 1}, {=> 0};
    `,
    isActive: true,
  },
];

console.log('🔗 Compiling ruleblocks with cross-references...\n');

const result = compile(ruleblocks, { dialect: Dialect.ORACLE });

if (result.success) {
  console.log(`✅ Successfully compiled ${result.sql.length} ruleblocks\n`);

  console.log('📋 Execution order (resolved dependencies):');
  console.log('  1. base (no dependencies)');
  console.log('  2. derived (depends on base)');
  console.log('  3. final (depends on derived)');

  console.log('\n💾 Generated SQL statements:\n');

  result.sql.forEach((sql, index) => {
    const rbName = ['base', 'derived', 'final'][index];
    console.log(`${index + 1}. Ruleblock: ${rbName}`);
    console.log('─'.repeat(60));
    console.log(sql.substring(0, 300) + '...\n');
  });

  if (result.metrics) {
    console.log(`⏱️  Total compilation time: ${result.metrics.totalTimeMs}ms`);
  }
} else {
  console.error('❌ Compilation failed!');
  result.errors.forEach(err => {
    console.error(`  - ${err.message}`);
  });
}
