# Picorules Compiler JS Core

A pure JavaScript/TypeScript compiler and runtime evaluator for the Picorules clinical decision support language. Compiles ruleblocks to optimized SQL (Oracle, SQL Server, PostgreSQL) **or** evaluates them directly in JavaScript for single-patient use — in the browser, Node.js, or edge environments.

[![npm version](https://img.shields.io/npm/v/picorules-compiler-js-core.svg)](https://www.npmjs.com/package/picorules-compiler-js-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Status

✅ **v1.1.0** - Production Ready

## Features

- ✅ **Pure TypeScript**: Full type safety and IDE support
- ✅ **Multi-Dialect SQL**: Compiles to Oracle PL/SQL, SQL Server T-SQL, and PostgreSQL
- ✅ **JavaScript Runtime Evaluator**: Evaluate ruleblocks directly in JS without a database
- ✅ **26 Functions**: Complete Picorules function library
- ✅ **Cross-Ruleblock References**: Automatic dependency resolution via topological sort
- ✅ **Transformation Pipeline**: Subset selection and pruning
- ✅ **Pluggable Data Adapters**: EADV built-in, extensible for FHIR and other data models
- ✅ **Zero Runtime Dependencies**: Only Zod for input validation
- ✅ **Tree-Shakeable**: ESM and CJS builds
- ✅ **Fully Tested**: 406 tests, all 85 first-order ruleblocks validated

## Installation

```bash
npm install picorules-compiler-js-core
```

## Two Execution Modes

### Mode 1: Compile to SQL (Population-scale, batch)

Compile ruleblocks to SQL for execution against an EADV database. Best for processing thousands to millions of patients in batch.

```typescript
import { compile, Dialect } from 'picorules-compiler-js-core';

const result = compile(
  [{ name: 'ckd', text: ruleblockSource, isActive: true }],
  { dialect: Dialect.ORACLE }
);

if (result.success) {
  console.log(result.sql[0]); // Optimized Oracle SQL
}
```

### Mode 2: Evaluate in JavaScript (Single-patient, real-time)

Evaluate ruleblocks directly against in-memory data. No database required. Best for point-of-care CDS, SMART on FHIR apps, and browser-based tools.

```typescript
import { parse, evaluate, EadvDataAdapter } from 'picorules-compiler-js-core';

// 1. Parse the ruleblock
const parsed = parse([{ name: 'ckd', text: ruleblockSource, isActive: true }]);

// 2. Load patient data
const adapter = new EadvDataAdapter([
  { eid: 1, att: 'lab_bld_egfr', dt: '2024-06-01', val: 44 },
  { eid: 1, att: 'lab_bld_egfr', dt: '2024-01-15', val: 48 },
  { eid: 1, att: 'lab_bld_egfr', dt: '2023-06-01', val: 52 },
]);

// 3. Evaluate
const result = evaluate(parsed[0], adapter);
console.log(result);
// { egfr_last: 44, has_ckd: 1, ... }
```

**Performance**: Parse + evaluate completes in ~1ms per ruleblock.

## Quick Start: JS Evaluator

### Single Ruleblock

```typescript
import { parse, evaluate, EadvDataAdapter } from 'picorules-compiler-js-core';

const prbSource = `
  #define_ruleblock(cd_obesity, {
    description: "BMI assessment",
    is_active: 2
  });

  ht => eadv.obs_height.val.lastdv();
  wt => eadv.obs_weight.val.lastdv();

  bmi : { ht_val!? and wt_val!? => round(wt_val / power(ht_val / 100, 2), 1) };
  is_obese : { bmi > 30 => 1 }, { => 0 };
`;

const parsed = parse([{ name: 'cd_obesity', text: prbSource, isActive: true }]);

const adapter = new EadvDataAdapter([
  { eid: 1, att: 'obs_height', dt: '2024-06-01', val: 170 },
  { eid: 1, att: 'obs_weight', dt: '2024-06-01', val: 95 },
]);

const result = evaluate(parsed[0], adapter);
// result = { ht_val: 170, ht_dt: Date, wt_val: 95, wt_dt: Date, bmi: 32.9, is_obese: 1 }
```

### Multiple Ruleblocks with Dependencies

```typescript
import { parse, evaluateAll, EadvDataAdapter } from 'picorules-compiler-js-core';

// Ruleblock 1: base metrics
const baseSrc = `
  #define_ruleblock(base, { description: "Base", is_active: 2 });
  egfr_last => eadv.lab_bld_egfr.val.last();
  hb_last => eadv.lab_bld_haemoglobin.val.last();
`;

// Ruleblock 2: depends on base via bind
const derivedSrc = `
  #define_ruleblock(flags, { description: "Flags", is_active: 2 });
  egfr => rout_base.egfr_last.val.bind();
  hb => rout_base.hb_last.val.bind();
  has_ckd : { egfr < 60 => 1 }, { => 0 };
  has_anaemia : { hb < 120 => 1 }, { => 0 };
`;

const parsed = parse([
  { name: 'base', text: baseSrc, isActive: true },
  { name: 'flags', text: derivedSrc, isActive: true },
]);

const adapter = new EadvDataAdapter([
  { eid: 1, att: 'lab_bld_egfr', dt: '2024-06-01', val: 44 },
  { eid: 1, att: 'lab_bld_haemoglobin', dt: '2024-06-01', val: 118 },
]);

// evaluateAll handles dependency ordering automatically
const results = evaluateAll(parsed, adapter);
// results.get('base')  = { egfr_last: 44, hb_last: 118 }
// results.get('flags') = { egfr: 44, hb: 118, has_ckd: 1, has_anaemia: 1 }
```

### Custom Data Adapter

Implement the `DataAdapter` interface to evaluate against any data source:

```typescript
import { DataAdapter, DataRecord } from 'picorules-compiler-js-core';

class MyFhirAdapter implements DataAdapter {
  constructor(private bundle: FhirBundle) {}

  getRecords(attributeList: string[]): DataRecord[] {
    // Map FHIR resources to DataRecords
    // attributeList may contain wildcards: ["icd_E11%"]
    return this.bundle.entry
      .filter(e => matchesCodes(e.resource, attributeList))
      .map(e => ({
        val: extractValue(e.resource),
        dt: extractDate(e.resource),
      }));
  }
}
```

## Supported Functions

**Basic** (3): `last()`, `first()`, `count()`

**Aggregation** (6): `sum()`, `avg()`, `min()`, `max()`, `median()`, `distinct_count()`

**Date-Value Window** (4): `lastdv()`, `firstdv()`, `maxldv()`, `minldv()`

**Positional Window** (2): `nth(n)`, `minfdv()`

**String** (4): `serialize(delimiter)`, `serialize2(delimiter)`, `serializedv(delimiter)`, `serializedv2(delimiter)`

**Statistical** (4): `regr_slope()`, `regr_intercept()`, `regr_r2()`, `stats_mode()`

**Existence** (1): `exists()`

**Advanced** (2): `max_neg_delta_dv()`, `temporal_regularity()`

### Expression Functions (JS Evaluator)

The following SQL functions are supported in conditional expressions:

| Category | Functions |
|----------|-----------|
| Math | `round()`, `ln()`, `exp()`, `power()`, `abs()`, `ceil()`, `log()`, `sqrt()` |
| Null handling | `nvl()`, `coalesce()` |
| Comparison | `greatest()`, `least()`, `greatest_date()`, `least_date()` |
| String | `substr()`, `to_number()`, `to_char()` |
| Date | `sysdate`, `extract(year/month/day from date)`, `to_date()` |
| Date arithmetic | `date - date` (days), `date ± number` (new date) |
| Operators | `and`, `or`, `not`, `in`, `not in`, `between`, `is null`, `is not null`, `!?`, `?` |

## SQL Compilation

### Cross-Ruleblock References

```typescript
const ruleblocks = [
  {
    name: 'base',
    text: 'egfr_last => eadv.lab_bld_egfr.val.last();',
    isActive: true,
  },
  {
    name: 'derived',
    text: `
      egfr => rout_base.egfr_last.val.bind();
      has_ckd : {egfr < 60 => 1}, {=> 0};
    `,
    isActive: true,
  },
];

const result = compile(ruleblocks, { dialect: Dialect.ORACLE });
// Automatically orders: base first, then derived
```

### Subset Selection

```typescript
compile(ruleblocks, {
  dialect: Dialect.ORACLE,
  subset: ['ckd', 'anemia'], // Only compile these
});
```

### Pruning Transformations

**Output Pruning** - Keep only ancestors:
```typescript
compile(ruleblocks, {
  dialect: Dialect.ORACLE,
  pruneOutputs: ['dashboard'], // Keep dashboard + its dependencies
});
```

**Input Pruning** - Keep only descendants:
```typescript
compile(ruleblocks, {
  dialect: Dialect.ORACLE,
  pruneInputs: ['source'], // Keep source + what depends on it
});
```

## API Reference

### SQL Compilation

#### `compile(ruleblocks, options)`

Full pipeline: parse, link, transform, generate SQL.

- `ruleblocks: RuleblockInput[]` - Array of `{ name, text, isActive }`
- `options: CompilerOptions` - `{ dialect, subset?, pruneInputs?, pruneOutputs? }`
- Returns: `CompilationResult` - `{ success, sql, errors, warnings, metrics }`

#### `parse(ruleblocks)`

Parse ruleblocks to AST without generating SQL.

- Returns: `ParsedRuleblock[]`

#### `generateSql(ruleblocks, dialect)`

Generate SQL from already-parsed ruleblocks.

- Returns: `string[]`

### JS Runtime Evaluation

#### `evaluate(ruleblock, data, bindings?)`

Evaluate a single parsed ruleblock against a data adapter.

- `ruleblock: ParsedRuleblock` - From `parse()`
- `data: DataAdapter` - Data source (e.g., `EadvDataAdapter`)
- `bindings?: Bindings` - Results from previously evaluated ruleblocks
- Returns: `EvaluationResult` - `Record<string, number | string | Date | null>`

#### `evaluateAll(ruleblocks, data)`

Evaluate multiple ruleblocks in dependency order.

- `ruleblocks: ParsedRuleblock[]` - From `parse()`, any order
- `data: DataAdapter` - Data source
- Returns: `Map<string, EvaluationResult>`

#### `EadvDataAdapter`

Built-in data adapter for EADV (Entity-Attribute-Date-Value) records.

```typescript
const adapter = new EadvDataAdapter([
  { eid: 1, att: 'lab_bld_egfr', dt: '2024-06-01', val: 44 },
]);
```

Supports exact attribute matching and wildcard patterns (`icd_E11%`).

#### `evaluateExpression(expression, context)`

Evaluate a standalone expression (for advanced use).

```typescript
import { evaluateExpression } from 'picorules-compiler-js-core';

const age = evaluateExpression('round((sysdate - dob) / 365.25, 0)', {
  sysdate: new Date(),
  dob: new Date('1957-05-20'),
});
```

#### `pico` (Runtime Library)

Null-safe function library, usable independently:

```typescript
import { pico } from 'picorules-compiler-js-core';

pico.round(12.345, 2);         // 12.35
pico.nvl(null, 0);             // 0
pico.daysBetween(d1, d2);      // days between dates
pico.least_date(d1, d2, d3);   // earliest non-null date
```

## SQL Dialect Support

| Feature | Oracle | SQL Server | PostgreSQL |
|---------|--------|------------|------------|
| Table creation | `CREATE TABLE AS` | `SELECT INTO` | `CREATE TABLE AS` |
| String aggregation | `LISTAGG` | `STRING_AGG` | `STRING_AGG` |
| Median | `MEDIAN()` | `PERCENTILE_CONT` | `PERCENTILE_CONT` |
| Regression | `REGR_*` built-in | Manual formulas | Manual formulas |
| Join syntax | `USING (eid)` | `ON ... =` | `USING (eid)` |
| Current date | `SYSDATE` | `GETDATE()` | `CURRENT_DATE` |

## Architecture

```
                    ┌──────────────────────┐
                    │   .prb source file    │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │    Parse → AST        │
                    │    Link → Sort deps   │
                    │    Transform → Filter │
                    └──────────┬───────────┘
                               │
               ┌───────────────┴───────────────┐
               │                               │
    ┌──────────▼──────────┐         ┌──────────▼──────────┐
    │   Generate SQL       │         │   Evaluate in JS     │
    │                      │         │                      │
    │   Oracle / MSSQL /   │         │   Browser / Node /   │
    │   PostgreSQL         │         │   Edge               │
    │                      │         │                      │
    │   Population batch   │         │   Single-patient     │
    │   analytics          │         │   real-time CDS      │
    └──────────────────────┘         └──────────────────────┘
```

## Development

```bash
npm install          # Install dependencies
npm run build        # Build CJS + ESM + types
npm test             # Run 406 tests
npm run test:watch   # Watch mode
npm run lint         # ESLint
```

## Performance

**SQL Compilation:**
- Single ruleblock: < 1ms
- 10 ruleblocks: < 10ms
- 100 ruleblocks: < 100ms

**JS Evaluation (single patient):**
- Parse + evaluate: ~1ms per ruleblock
- Evaluate only (pre-parsed): ~0.3ms per ruleblock
- All 85 first-order ruleblocks: validated against mock data

## License

MIT

## Credits

Developed for The Kidney Centre (TKC) clinical decision support system.
