#!/usr/bin/env node

/**
 * Demo: Run a real .prb ruleblock through the JS evaluator with mock data.
 * Shows the complete pipeline: source → parse → mock data → evaluate → results.
 */

import { readFileSync } from 'fs';
import { parse } from '../src/index';
import { evaluate } from '../src/runtime/evaluator';
import { EadvDataAdapter } from '../src/runtime/eadv-data-adapter';
import { generateMockData } from 'picorules-compiler-js-eadv-mocker';

// ---------------------------------------------------------------------------
// 1. Load the ruleblock source
// ---------------------------------------------------------------------------

const prbPath = process.argv[2] || '../picorules-agent/reference/rules/picodomain_rule_pack/rule_blocks/cd_obesity.prb';
const prbSource = readFileSync(prbPath, 'utf-8');
const rbName = prbPath.split('/').pop().replace('.prb', '');

console.log('='.repeat(70));
console.log(`PICORULES JS EVALUATOR DEMO`);
console.log('='.repeat(70));
console.log(`\nRuleblock: ${rbName}`);
console.log(`Source file: ${prbPath}\n`);
console.log('--- Source ---');
console.log(prbSource.trim());
console.log();

// ---------------------------------------------------------------------------
// 2. Parse the ruleblock
// ---------------------------------------------------------------------------

console.log('--- Parsing ---');
const t0 = performance.now();
const parsed = parse([{ name: rbName, text: prbSource, isActive: true }]);
const parseTime = (performance.now() - t0).toFixed(2);
console.log(`Parsed in ${parseTime}ms`);
console.log(`Statements: ${parsed[0].rules.length}`);

for (const rule of parsed[0].rules) {
  const type = rule.ruleType.padEnd(20);
  const varName = rule.assignedVariable;
  if (rule.ruleType === 'FETCH_STATEMENT') {
    console.log(`  ${type} ${varName} => ${rule.table}.${rule.attributeList.join(',')}.${rule.property}.${rule.functionName}()`);
  } else if (rule.ruleType === 'COMPUTE_STATEMENT') {
    const cases = rule.conditions.map(c => c.predicate ? `{${c.predicate} => ${c.returnValue}}` : `{=> ${c.returnValue}}`).join(', ');
    console.log(`  ${type} ${varName} : ${cases}`);
  } else if (rule.ruleType === 'BIND_STATEMENT') {
    console.log(`  ${type} ${varName} => rout_${rule.sourceRuleblock}.${rule.sourceVariable}.bind()`);
  }
}
console.log();

// ---------------------------------------------------------------------------
// 3. Generate mock EADV data for a single patient
// ---------------------------------------------------------------------------

console.log('--- Mock Data Generation ---');
const mockResult = generateMockData({
  ruleblocks: [{ name: rbName, text: prbSource, isActive: true }],
  options: {
    seed: 42,
    entityCount: 1,
    observationsPerEntity: 5,
    dateFormat: 'iso',
  },
});

const firstEid = mockResult.metadata.entities[0];
const patientRecords = mockResult.eadv.filter(r => r.eid === firstEid);

console.log(`Patient ID: ${firstEid}`);
console.log(`Total EADV records: ${patientRecords.length}`);
console.log(`Attributes: ${mockResult.metadata.attributes.join(', ')}`);
console.log();

// Print the mock data as a table
console.log('--- Patient EADV Data ---');
console.log('  att'.padEnd(30) + 'dt'.padEnd(14) + 'val');
console.log('  ' + '-'.repeat(55));
for (const r of patientRecords.sort((a, b) => a.att.localeCompare(b.att) || String(a.dt).localeCompare(String(b.dt)))) {
  const att = String(r.att).padEnd(28);
  const dt = r.dt ? String(r.dt).slice(0, 10) : 'null';
  const val = r.val != null ? (typeof r.val === 'number' ? r.val.toFixed(2) : r.val) : 'null';
  console.log(`  ${att}${dt.padEnd(14)}${val}`);
}
console.log();

// ---------------------------------------------------------------------------
// 4. Run the JS evaluator
// ---------------------------------------------------------------------------

console.log('--- JS Evaluation ---');
const adapter = new EadvDataAdapter(
  patientRecords.map(r => ({ eid: r.eid, att: r.att, dt: r.dt, val: r.val }))
);

const t1 = performance.now();
const result = evaluate(parsed[0], adapter);
const evalTime = (performance.now() - t1).toFixed(2);

console.log(`Evaluated in ${evalTime}ms\n`);

console.log('--- Results ---');
console.log('  Variable'.padEnd(30) + 'Value');
console.log('  ' + '-'.repeat(50));
for (const [key, value] of Object.entries(result)) {
  let displayVal;
  if (value instanceof Date) {
    displayVal = value.toISOString().slice(0, 10);
  } else if (value === null) {
    displayVal = 'NULL';
  } else if (typeof value === 'number') {
    displayVal = Number.isInteger(value) ? String(value) : value.toFixed(4);
  } else {
    displayVal = String(value);
  }
  console.log(`  ${key.padEnd(28)}${displayVal}`);
}
console.log();
console.log(`Total time: ${(parseFloat(parseTime) + parseFloat(evalTime)).toFixed(2)}ms`);
console.log('='.repeat(70));
