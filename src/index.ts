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

// Node.js-only exports - import from 'picorules-compiler-js-core/node' instead
// export { writeManifestFile } from './manifest/manifest-writer';
// export type { WriteManifestOptions } from './manifest/manifest-writer';
