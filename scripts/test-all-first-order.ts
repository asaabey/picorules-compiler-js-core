#!/usr/bin/env node

/**
 * Attempt to parse and evaluate ALL first-order (no-bind) ruleblocks.
 * Reports which ones succeed and which fail, with error details.
 */

import { readdirSync, readFileSync } from 'fs';
import { parse } from '../src/index';
import { evaluate } from '../src/runtime/evaluator';
import { EadvDataAdapter } from '../src/runtime/eadv-data-adapter';
import { generateMockData } from 'picorules-compiler-js-eadv-mocker';

const RULES_DIR = '../picorules-agent/reference/rules/picodomain_rule_pack/rule_blocks';
const files = readdirSync(RULES_DIR).filter(f => f.endsWith('.prb')).sort();

// Find first-order rules (no .bind() calls)
const firstOrder: string[] = [];
const hasBinds: string[] = [];

for (const file of files) {
  const src = readFileSync(`${RULES_DIR}/${file}`, 'utf-8');
  if (src.includes('.bind()')) {
    hasBinds.push(file);
  } else {
    firstOrder.push(file);
  }
}

console.log(`Total rules: ${files.length}`);
console.log(`First-order (no binds): ${firstOrder.length}`);
console.log(`Has binds: ${hasBinds.length}`);
console.log();

let parseOk = 0, parseFail = 0, evalOk = 0, evalFail = 0;
const parseErrors: { file: string; error: string }[] = [];
const evalErrors: { file: string; error: string }[] = [];

for (const file of firstOrder) {
  const name = file.replace('.prb', '');
  const src = readFileSync(`${RULES_DIR}/${file}`, 'utf-8');

  // Step 1: Parse
  let parsed;
  try {
    parsed = parse([{ name, text: src, isActive: true }]);
    parseOk++;
  } catch (e: any) {
    parseFail++;
    parseErrors.push({ file, error: e.message.slice(0, 120) });
    continue;
  }

  // Step 2: Generate mock data & evaluate
  try {
    const mockResult = generateMockData({
      ruleblocks: [{ name, text: src, isActive: true }],
      options: { seed: 42, entityCount: 1, observationsPerEntity: 3, dateFormat: 'iso' },
    });

    const eid = mockResult.metadata.entities[0];
    const records = mockResult.eadv.filter(r => r.eid === eid);
    const adapter = new EadvDataAdapter(
      records.map(r => ({ eid: r.eid, att: r.att, dt: r.dt, val: r.val }))
    );

    const result = evaluate(parsed[0] as any, adapter);
    const varCount = Object.keys(result).length;
    evalOk++;
  } catch (e: any) {
    evalFail++;
    evalErrors.push({ file, error: e.message.slice(0, 120) });
  }
}

console.log('=== RESULTS ===');
console.log(`Parse:    ${parseOk} OK, ${parseFail} failed`);
console.log(`Evaluate: ${evalOk} OK, ${evalFail} failed`);
console.log();

if (parseErrors.length > 0) {
  console.log('--- Parse Errors ---');
  for (const { file, error } of parseErrors) {
    console.log(`  ${file.padEnd(35)} ${error}`);
  }
  console.log();
}

if (evalErrors.length > 0) {
  console.log('--- Eval Errors ---');
  for (const { file, error } of evalErrors) {
    console.log(`  ${file.padEnd(35)} ${error}`);
  }
  console.log();
}

if (evalErrors.length === 0 && parseErrors.length === 0) {
  console.log('ALL FIRST-ORDER RULES PARSED AND EVALUATED SUCCESSFULLY');
}
