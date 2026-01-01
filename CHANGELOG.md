# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-01

### 🎉 Initial Production Release

First production-ready release of the Picorules JavaScript/TypeScript compiler.

### Added

#### Core Compiler
- **4-Stage Compilation Pipeline**: Parse → Link → Transform → Generate
- **Pure TypeScript implementation** with full type safety
- **Zod-based validation** for all inputs and outputs
- **Comprehensive error handling** with structured error messages
- **Performance metrics** tracking for all compilation stages

#### Language Support
- **Fetch statements** with 18 functions:
  - Basic: `last()`, `first()`, `count()`
  - Aggregation: `sum()`, `avg()`, `min()`, `max()`, `median()`, `distinct_count()`
  - Window: `nth(n)`, `lastdv()`, `firstdv()`
  - String: `serialize(delimiter)`, `serializedv(delimiter)`
  - Statistical: `regr_slope()`, `regr_intercept()`, `regr_r2()`
  - Existence: `exists()`
- **Compute statements** with multi-condition CASE logic
- **Bind statements** for cross-ruleblock references
- **Multi-attribute support** with `[att1,att2]` syntax
- **Predicates** with `.where()` clause
- **Function parameters** support

#### Multi-Dialect SQL Generation
- **Oracle PL/SQL support**:
  - `CREATE TABLE AS` syntax
  - `LISTAGG` for string aggregation
  - `MEDIAN()` for median calculation
  - `REGR_*` functions for regression
  - `USING (eid)` for joins
- **SQL Server T-SQL support**:
  - `SELECT INTO` syntax
  - `STRING_AGG` for string aggregation
  - `PERCENTILE_CONT(0.5)` for median
  - Manual regression formulas
  - `ON table1.eid = table2.eid` for joins
  - Required subquery aliases

#### Linking & Dependencies
- **Automatic dependency resolution** via bind statements
- **Topological sort** for correct execution order
- **Circular dependency detection** with clear error messages
- **Reference resolution** in compute statements
- **Dependency graph** visualization support

#### Transformation Pipeline
- **Subset selection**: Filter ruleblocks by name (case-insensitive)
- **Output pruning**: Keep only ancestors of specified outputs
- **Input pruning**: Keep only descendants of specified inputs
- **Combined pruning**: Intersection of ancestors and descendants
- **Dependency ordering preservation**: Maintains topological sort

#### Testing & Quality
- **79 passing tests** across 8 test files
- **100% test success rate**
- **Unit tests** for parsers, linking, models
- **Integration tests** for compilation, cross-ruleblock, dialects, functions, transformations
- **Vitest** test framework with fast execution
- **TypeScript strict mode** enabled

#### Build & Distribution
- **Dual package exports**: CommonJS (CJS) and ES Modules (ESM)
- **TypeScript definitions** (.d.ts) included
- **Tree-shakeable** ESM build
- **tsup** bundler for optimal output
- **No runtime dependencies** except Zod

### Documentation
- Comprehensive README with quick start guide
- API reference documentation
- Usage examples for all features
- Architecture overview
- Performance characteristics
- Development setup guide

### Build Artifacts
- **CJS**: 37.99 KB (dist/index.js)
- **ESM**: 36.06 KB (dist/index.mjs)
- **DTS**: 12.69 KB (dist/index.d.ts)

### Performance
- Single ruleblock: < 1ms
- 10 ruleblocks: < 10ms
- 100 ruleblocks: < 100ms
- Metrics tracking for all compilation stages

## [Unreleased]

### Future Enhancements (Post v1.0.0)
- Compiler directives parsing (#define_ruleblock, #define_attribute, #doc)
- Enhanced error messages with line numbers
- Warning system for unused variables
- Expression caching for performance
- Additional SQL dialects (PostgreSQL, MySQL)
- CLI tool (separate package)
- VSCode extension (separate package)
- Web playground (separate package)

---

## Version History

### Phase 1-3: MVP (Completed 2026-01-01)
- ✅ Project setup with TypeScript, ESLint, Prettier, Vitest
- ✅ Data models and Zod schemas
- ✅ Basic parsers (fetch, compute)
- ✅ Oracle SQL generation
- ✅ Main compile function

### Phase 4.1: Linking (Completed 2026-01-01)
- ✅ Bind statement parser
- ✅ Dependency graph with topological sort
- ✅ Circular dependency detection
- ✅ Reference resolution

### Phase 4.2: All Functions (Completed 2026-01-01)
- ✅ Aggregation functions (6)
- ✅ Window functions (3)
- ✅ String functions (2)
- ✅ Statistical functions (3)
- ✅ Existence function (1)
- ✅ Function parameter support

### Phase 4.3: Multi-Dialect (Completed 2026-01-01)
- ✅ Template interface system
- ✅ Oracle PL/SQL templates
- ✅ SQL Server T-SQL templates
- ✅ Dialect selection
- ✅ Dialect-specific tests

### Phase 4.4: Transformations (Completed 2026-01-01)
- ✅ Subset selection
- ✅ Output pruning (ancestors)
- ✅ Input pruning (descendants)
- ✅ Combined pruning
- ✅ Dependency ordering preservation

### Phase 5: Polish (Completed 2026-01-01)
- ✅ README documentation
- ✅ CHANGELOG creation
- ✅ Package preparation
- ✅ v1.0.0 release

---

## Upgrade Guide

### From Pre-Release to v1.0.0

**Breaking Changes**: None (first release)

**New Features**:
All features listed in v1.0.0 Added section.

**Migration Steps**:
1. Install: `npm install picorules-compiler-js-core@1.0.0`
2. Import: `import { compile, Dialect } from 'picorules-compiler-js-core'`
3. Use: See README for quick start guide

---

## Contributors

- Initial development by Claude (Anthropic) for The Kidney Centre (TKC)
- Project maintained by TKC development team

## License

MIT License - see LICENSE file for details

---

**Note**: This is the first stable release (v1.0.0). All major features are complete and tested. Future releases will follow semantic versioning.
