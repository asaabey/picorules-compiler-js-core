/**
 * Example 3: Transformation Pipeline
 *
 * This example demonstrates the transformation features:
 * subset selection and pruning.
 */

import { compile, Dialect } from '../src';

const ruleblocks = [
  {
    name: 'lab_data',
    text: `
      egfr_last => eadv.lab_bld_egfr.val.last();
      hb_last => eadv.lab_bld_haemoglobin.val.last();
      glucose_last => eadv.lab_bld_glucose.val.last();
    `,
    isActive: true,
  },
  {
    name: 'ckd_assessment',
    text: `
      egfr => rout_lab_data.egfr_last.val.bind();
      has_ckd : {egfr < 60 => 1}, {=> 0};
    `,
    isActive: true,
  },
  {
    name: 'anemia_assessment',
    text: `
      hb => rout_lab_data.hb_last.val.bind();
      is_anaemic : {hb < 120 => 1}, {=> 0};
    `,
    isActive: true,
  },
  {
    name: 'diabetes_assessment',
    text: `
      glucose => rout_lab_data.glucose_last.val.bind();
      has_diabetes : {glucose > 126 => 1}, {=> 0};
    `,
    isActive: true,
  },
  {
    name: 'patient_dashboard',
    text: `
      ckd => rout_ckd_assessment.has_ckd.val.bind();
      anaemia => rout_anemia_assessment.is_anaemic.val.bind();
      risk_score : {ckd = 1 and anaemia = 1 => 3}, {ckd = 1 => 2}, {anaemia = 1 => 1}, {=> 0};
    `,
    isActive: true,
  },
];

console.log('🔧 Transformation Pipeline Examples\n');

// Example 1: Subset Selection
console.log('1️⃣  Subset Selection - Compile only specific ruleblocks');
console.log('─'.repeat(60));

const subsetResult = compile(ruleblocks, {
  dialect: Dialect.ORACLE,
  subset: ['lab_data', 'ckd_assessment'],
});

console.log(`   Compiled ${subsetResult.sql.length} ruleblocks (lab_data, ckd_assessment)\n`);

// Example 2: Output Pruning
console.log('2️⃣  Output Pruning - Keep only what\'s needed for dashboard');
console.log('─'.repeat(60));

const outputPruneResult = compile(ruleblocks, {
  dialect: Dialect.ORACLE,
  pruneOutputs: ['patient_dashboard'],
});

console.log(`   Compiled ${outputPruneResult.sql.length} ruleblocks`);
console.log('   Kept: lab_data, ckd_assessment, anemia_assessment, patient_dashboard');
console.log('   Pruned: diabetes_assessment (not needed for dashboard)\n');

// Example 3: Input Pruning
console.log('3️⃣  Input Pruning - Keep only what uses lab_data');
console.log('─'.repeat(60));

const inputPruneResult = compile(ruleblocks, {
  dialect: Dialect.ORACLE,
  pruneInputs: ['lab_data'],
});

console.log(`   Compiled ${inputPruneResult.sql.length} ruleblocks (all depend on lab_data)\n`);

// Example 4: Combined Pruning
console.log('4️⃣  Combined Pruning - Path from input to output');
console.log('─'.repeat(60));

const combinedResult = compile(ruleblocks, {
  dialect: Dialect.ORACLE,
  pruneInputs: ['lab_data'],
  pruneOutputs: ['ckd_assessment'],
});

console.log(`   Compiled ${combinedResult.sql.length} ruleblocks`);
console.log('   Kept only the path: lab_data → ckd_assessment\n');

// Performance comparison
console.log('📊 Performance Comparison');
console.log('─'.repeat(60));
console.log(`   Full compilation: ${compile(ruleblocks, { dialect: Dialect.ORACLE }).metrics?.totalTimeMs}ms (${ruleblocks.length} ruleblocks)`);
console.log(`   With subset: ${subsetResult.metrics?.totalTimeMs}ms (${subsetResult.sql.length} ruleblocks)`);
console.log(`   With pruning: ${combinedResult.metrics?.totalTimeMs}ms (${combinedResult.sql.length} ruleblocks)`);
