// Main exports
export { compile } from './compile';

// Type exports
export type {
  RuleblockInput,
  CompilerOptions,
  CompilationResult,
  ParsedRuleblock,
  ParsedFetchStatement,
  ParsedComputeStatement,
  ParsedBindStatement,
  CompilationManifest,
  ManifestEntry,
} from './models/types';

// Enum exports
export { Dialect, RuleType, DataType } from './models/constants';

// Advanced exports (for power users)
export { parse } from './parsing';
export { generateSql } from './sql';
export { generateManifest, serializeManifest } from './manifest';

// Runtime evaluator exports (v1.1.0)
export { evaluate, type EvaluationResult, type Bindings } from './runtime/evaluator';
export { evaluateAll } from './runtime/orchestrator';
export { evaluateExpression, evaluatePredicate, type EvalContext } from './runtime/expression-evaluator';
export { type DataAdapter } from './runtime/data-adapter';
export { EadvDataAdapter, type EadvRecord } from './runtime/eadv-data-adapter';
export { type DataRecord, type DvResult, DV_FUNCTIONS } from './runtime/aggregators';
export * as pico from './runtime/pico-functions';

// Node.js-only exports - import from 'picorules-compiler-js-core/node' instead
// export { writeManifestFile } from './manifest/manifest-writer';
// export type { WriteManifestOptions } from './manifest/manifest-writer';
