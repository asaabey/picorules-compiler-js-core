# Picorules Compiler JS Core

A pure JavaScript/TypeScript compiler for the Picorules clinical decision support language, designed to compile Picorules ruleblocks into optimized SQL for Oracle PL/SQL and SQL Server T-SQL.

[![npm version](https://img.shields.io/npm/v/picorules-compiler-js-core.svg)](https://www.npmjs.com/package/picorules-compiler-js-core)
[![License](https://img.shields.io/npm/l/picorules-compiler-js-core.svg)](LICENSE)

## Status

✅ **v1.0.0** - Production Ready

## Features

- ✅ **Pure TypeScript**: Full type safety and IDE support
- ✅ **Multi-Dialect**: Supports Oracle PL/SQL and SQL Server T-SQL
- ✅ **18 Functions**: Complete Picorules function library
- ✅ **Cross-Ruleblock References**: Automatic dependency resolution
- ✅ **Transformation Pipeline**: Subset selection and pruning
- ✅ **Zero Dependencies**: Only runtime dependency is Zod for validation
- ✅ **Tree-Shakeable**: ESM and CJS builds
- ✅ **Fully Tested**: 79 tests with 100% success rate

## Installation

```bash
npm install picorules-compiler-js-core
```

## Quick Start

```typescript
import { compile, Dialect } from 'picorules-compiler-js-core';

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

const result = compile(ruleblocks, { dialect: Dialect.ORACLE });

if (result.success) {
  console.log(result.sql[0]);
  // Outputs optimized Oracle SQL with CTEs
} else {
  console.error(result.errors);
}
```

## Supported Functions

**Basic** (3): `last()`, `first()`, `count()`

**Aggregation** (6): `sum()`, `avg()`, `min()`, `max()`, `median()`, `distinct_count()`

**Window** (3): `nth(n)`, `lastdv()`, `firstdv()`

**String** (2): `serialize(delimiter)`, `serializedv(delimiter)`

**Statistical** (3): `regr_slope()`, `regr_intercept()`, `regr_r2()`

**Existence** (1): `exists()`

## Advanced Usage

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

Compile only specific ruleblocks:

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

**Combined** - Keep only the path:
```typescript
compile(ruleblocks, {
  dialect: Dialect.ORACLE,
  pruneInputs: ['eadv'],
  pruneOutputs: ['report'], // Only the path from eadv to report
});
```

## API Reference

### `compile(ruleblocks, options)`

**Parameters:**
- `ruleblocks: RuleblockInput[]`
  - `name: string` - Ruleblock name
  - `text: string` - Picorules code
  - `isActive: boolean` - Whether active
- `options: CompilerOptions`
  - `dialect: Dialect` - ORACLE or MSSQL
  - `subset?: string[]` - Filter ruleblocks
  - `pruneInputs?: string[]` - Keep descendants
  - `pruneOutputs?: string[]` - Keep ancestors

**Returns:** `CompilationResult`
- `success: boolean`
- `sql: string[]`
- `errors: Error[]`
- `warnings: Warning[]`
- `metrics?: Metrics`

## SQL Dialect Support

### Oracle PL/SQL
Uses `CREATE TABLE AS`, `LISTAGG`, `MEDIAN()`, `REGR_*`, `USING (eid)`

### SQL Server T-SQL
Uses `SELECT INTO`, `STRING_AGG`, `PERCENTILE_CONT`, manual regression, `ON ... =`

## Development

```bash
# Install
npm install

# Build
npm run build

# Test
npm test

# Lint
npm run lint
```

## Performance

- Single ruleblock: < 1ms
- 10 ruleblocks: < 10ms
- 100 ruleblocks: < 100ms

## Architecture

4-stage pipeline:
1. **Parse**: Text → AST
2. **Link**: Dependency resolution
3. **Transform**: Subset/pruning
4. **Generate**: AST → SQL

## License

MIT

## Credits

Developed for The Kidney Centre (TKC) clinical decision support system.
