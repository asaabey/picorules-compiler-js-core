#!/usr/bin/env node

/**
 * Demo: Run multiple first-order ruleblocks with hand-crafted realistic data.
 * Tests: ca_prostate, cd_htn, ckd_egfr_metrics, ckd_uacr_metrics, cd_obesity
 */

import { readFileSync } from 'fs';
import { parse } from '../src/index';
import { evaluate } from '../src/runtime/evaluator';
import { EadvDataAdapter } from '../src/runtime/eadv-data-adapter';

const RULES_DIR = '../picorules-agent/reference/rules/picodomain_rule_pack/rule_blocks';

// A single patient: 68-year-old male with CKD, hypertension, prostate cancer
const patientData = [
  // Demographics
  { eid: 1, att: 'dmg_dob',     dt: '1957-05-20', val: null },
  { eid: 1, att: 'dmg_gender',  dt: '2024-01-01', val: 1 },

  // eGFR — declining over 2 years
  { eid: 1, att: 'lab_bld_egfr', dt: '2023-01-15', val: 52 },
  { eid: 1, att: 'lab_bld_egfr', dt: '2023-07-10', val: 48 },
  { eid: 1, att: 'lab_bld_egfr', dt: '2024-01-20', val: 45 },
  { eid: 1, att: 'lab_bld_egfr', dt: '2024-07-15', val: 42 },
  { eid: 1, att: 'lab_bld_egfr', dt: '2025-01-10', val: 39 },

  // Creatinine — rising
  { eid: 1, att: 'lab_bld_creatinine', dt: '2023-01-15', val: 120 },
  { eid: 1, att: 'lab_bld_creatinine', dt: '2024-01-20', val: 145 },
  { eid: 1, att: 'lab_bld_creatinine', dt: '2025-01-10', val: 165 },

  // ACR — elevated
  { eid: 1, att: 'lab_ua_acr', dt: '2023-06-01', val: 15 },
  { eid: 1, att: 'lab_ua_acr', dt: '2024-01-20', val: 25 },
  { eid: 1, att: 'lab_ua_acr', dt: '2024-07-15', val: 35 },
  { eid: 1, att: 'lab_ua_acr', dt: '2025-01-10', val: 45 },

  // Blood pressure — hypertensive
  { eid: 1, att: 'obs_bp_systolic',  dt: '2024-01-20', val: 148 },
  { eid: 1, att: 'obs_bp_systolic',  dt: '2024-07-15', val: 152 },
  { eid: 1, att: 'obs_bp_systolic',  dt: '2025-01-10', val: 145 },
  { eid: 1, att: 'obs_bp_diastolic', dt: '2024-01-20', val: 88 },
  { eid: 1, att: 'obs_bp_diastolic', dt: '2024-07-15', val: 92 },
  { eid: 1, att: 'obs_bp_diastolic', dt: '2025-01-10', val: 85 },

  // Hypertension ICD/ICPC codes
  { eid: 1, att: 'icd_i10',    dt: '2020-03-15', val: 1 },
  { eid: 1, att: 'icpc_k86001', dt: '2020-03-15', val: 1 },

  // Antihypertensives
  { eid: 1, att: 'rxnc_c09aa', dt: '2020-06-01', val: 1 },  // ACE inhibitor
  { eid: 1, att: 'rxnc_c08ca', dt: '2022-01-01', val: 1 },  // CCB

  // Prostate cancer ICD code
  { eid: 1, att: 'icd_c61',   dt: '2023-09-01', val: 1 },

  // Height/Weight
  { eid: 1, att: 'obs_height', dt: '2024-01-20', val: 175 },
  { eid: 1, att: 'obs_weight', dt: '2024-01-20', val: 82 },
  { eid: 1, att: 'obs_weight', dt: '2025-01-10', val: 80 },

  // Haemoglobin
  { eid: 1, att: 'lab_bld_haemoglobin', dt: '2024-01-20', val: 125 },
  { eid: 1, att: 'lab_bld_haemoglobin', dt: '2025-01-10', val: 118 },

  // Cholesterol
  { eid: 1, att: 'lab_bld_cholesterol_total', dt: '2025-01-10', val: 5.2 },
  { eid: 1, att: 'lab_bld_cholesterol_hdl',   dt: '2025-01-10', val: 1.3 },

  // Smoking status (never smoker = 1)
  { eid: 1, att: 'status_smoking_h2_v1', dt: '2024-01-20', val: 1 },
];

const adapter = new EadvDataAdapter(patientData);

// Rules to test
const rulesToTest = [
  'ca_prostate',
  'cd_obesity',
  'ckd_egfr_metrics',
  'ckd_uacr_metrics',
  'cd_htn',
];

console.log('='.repeat(70));
console.log('PICORULES JS EVALUATOR — MULTI-RULE DEMO');
console.log('Patient: 68yo male, CKD stage 3b, HTN, prostate cancer');
console.log('='.repeat(70));

for (const ruleName of rulesToTest) {
  const prbPath = `${RULES_DIR}/${ruleName}.prb`;
  let prbSource: string;
  try {
    prbSource = readFileSync(prbPath, 'utf-8');
  } catch {
    console.log(`\n--- ${ruleName} --- SKIPPED (file not found)`);
    continue;
  }

  let parsed;
  try {
    parsed = parse([{ name: ruleName, text: prbSource, isActive: true }]);
  } catch (e: any) {
    console.log(`\n--- ${ruleName} --- PARSE ERROR: ${e.message}`);
    continue;
  }

  let result;
  const t0 = performance.now();
  try {
    result = evaluate(parsed[0] as any, adapter);
  } catch (e: any) {
    console.log(`\n--- ${ruleName} --- EVAL ERROR: ${e.message}`);
    continue;
  }
  const ms = (performance.now() - t0).toFixed(2);

  console.log(`\n--- ${ruleName} (${ms}ms) ---`);

  for (const [key, value] of Object.entries(result)) {
    let displayVal: string;
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
}

console.log('\n' + '='.repeat(70));
