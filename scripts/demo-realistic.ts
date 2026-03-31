#!/usr/bin/env node

/**
 * Demo: Run cd_obesity.prb with hand-crafted realistic patient data.
 */

import { readFileSync } from 'fs';
import { parse } from '../src/index';
import { evaluate } from '../src/runtime/evaluator';
import { EadvDataAdapter } from '../src/runtime/eadv-data-adapter';

const prbSource = readFileSync('../picorules-agent/reference/rules/picodomain_rule_pack/rule_blocks/cd_obesity.prb', 'utf-8');
const parsed = parse([{ name: 'cd_obesity', text: prbSource, isActive: true }]);

// Realistic patient: overweight male, 170cm, 95kg, has obesity ICD code
const patientData = [
  { eid: 1, att: 'obs_height', dt: '2023-06-01', val: 170 },
  { eid: 1, att: 'obs_height', dt: '2024-06-01', val: 170 },

  { eid: 1, att: 'obs_weight', dt: '2023-06-01', val: 88 },
  { eid: 1, att: 'obs_weight', dt: '2024-01-15', val: 92 },
  { eid: 1, att: 'obs_weight', dt: '2024-06-01', val: 95 },

  { eid: 1, att: 'icd_e66.0', dt: '2024-01-15', val: 1 },
];

const adapter = new EadvDataAdapter(patientData);
const t0 = performance.now();
const result = evaluate(parsed[0] as any, adapter);
const evalTime = (performance.now() - t0).toFixed(2);

console.log('======================================================================');
console.log('REALISTIC PATIENT: 170cm, 95kg, ICD E66.0 coded');
console.log('======================================================================');
console.log();
console.log('--- Patient Data ---');
console.log('  att'.padEnd(22) + 'dt'.padEnd(14) + 'val');
console.log('  ' + '-'.repeat(45));
for (const r of patientData) {
  console.log(`  ${String(r.att).padEnd(20)}${String(r.dt).padEnd(14)}${r.val}`);
}
console.log();
console.log('--- Results ---');
console.log('  Variable'.padEnd(22) + 'Value'.padEnd(12) + 'Interpretation');
console.log('  ' + '-'.repeat(60));

const interpretations: Record<string, string> = {
  ht_val: 'Latest height (cm)',
  ht_dt: 'Height measurement date',
  ht_err: 'Height validation (0=ok, 1=error)',
  wt_val: 'Latest weight (kg)',
  wt_dt: 'Weight measurement date',
  wt_err: 'Weight validation (0=ok, 1=error)',
  bmi_err: 'BMI calculable? (0=yes, 1=no)',
  bmi: 'Body Mass Index',
  obs_icd: 'Count of ICD obesity codes',
  obs_icpc: 'Count of ICPC obesity codes',
  bmi_class: 'WHO class (0=none, 1=I, 2=II, 3=III)',
  cd_obesity: 'Obesity diagnosis (0/1)',
  obs_dx_uncoded: 'Obese but missing ICD/ICPC code',
};

for (const [key, value] of Object.entries(result)) {
  let displayVal;
  if (value instanceof Date) {
    displayVal = value.toISOString().slice(0, 10);
  } else if (value === null) {
    displayVal = 'NULL';
  } else if (typeof value === 'number') {
    displayVal = Number.isInteger(value) ? String(value) : value.toFixed(1);
  } else {
    displayVal = String(value);
  }
  const interp = interpretations[key] ?? '';
  console.log(`  ${key.padEnd(20)}${displayVal.padEnd(12)}${interp}`);
}

console.log();
console.log(`Evaluated in ${evalTime}ms`);
console.log('======================================================================');
