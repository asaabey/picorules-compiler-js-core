import { z } from 'zod';
import { RuleType, Dialect } from './constants';

// Input schemas
export const RuleblockInputSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-z_][a-z0-9_]*$/i),
  text: z.string().max(1000000), // 1MB limit
  isActive: z.boolean().default(true),
});

export const CompilerOptionsSchema = z.object({
  dialect: z.nativeEnum(Dialect),
  includeInactive: z.boolean().optional().default(false),
  staticSysdate: z.string().optional(),
  cache: z.any().optional(), // ExpressionCache (defined later)
  // Transformation options
  subset: z.array(z.string()).optional(), // List of ruleblock names to include
  pruneInputs: z.array(z.string()).optional(), // Keep only descendants of these
  pruneOutputs: z.array(z.string()).optional(), // Keep only ancestors of these
  // Manifest output options
  manifestPath: z.string().optional(), // Path to write manifest JSON file
});

// Parsed rule schemas
export const ParsedFetchStatementSchema = z.object({
  ruleType: z.literal(RuleType.FETCH_STATEMENT),
  assignedVariable: z.string(),
  table: z.string(),
  attributeList: z.array(z.string()),
  property: z.string(),
  functionName: z.string(),
  functionParams: z.array(z.string()).optional(),
  predicate: z.string().optional(),
  references: z.array(z.string()).default([]),
});

export const ParsedComputeStatementSchema = z.object({
  ruleType: z.literal(RuleType.COMPUTE_STATEMENT),
  assignedVariable: z.string(),
  conditions: z.array(z.object({
    predicate: z.string().optional(),
    returnValue: z.string(),
  })),
  references: z.array(z.string()).default([]),
});

export const ParsedBindStatementSchema = z.object({
  ruleType: z.literal(RuleType.BIND_STATEMENT),
  assignedVariable: z.string(),
  sourceRuleblock: z.string(),
  sourceVariable: z.string(),
  property: z.string(),
  references: z.array(z.string()).default([]),
});

export const ParsedRuleblockSchema = z.object({
  name: z.string(),
  text: z.string(),
  isActive: z.boolean(),
  description: z.string().optional(),
  rules: z.array(z.union([
    ParsedFetchStatementSchema,
    ParsedComputeStatementSchema,
    ParsedBindStatementSchema,
  ])),
});

// Manifest schemas for batch compilation
export const ManifestEntrySchema = z.object({
  /** Ruleblock identifier */
  ruleblockId: z.string(),
  /** Execution order (0-based, dependencies first) */
  executionOrder: z.number().int().min(0),
  /** Output table name (e.g., "rout_ckd" or "SROUT_ckd") */
  targetTable: z.string(),
  /** List of ruleblock IDs this depends on */
  dependencies: z.array(z.string()),
  /** List of output variables/attributes */
  outputVariables: z.array(z.string()),
  /** Index into the sql[] array */
  sqlIndex: z.number().int().min(0),
});

export const CompilationManifestSchema = z.object({
  /** Manifest version for forward compatibility */
  version: z.string(),
  /** SQL dialect used */
  dialect: z.string(),
  /** Timestamp of compilation */
  compiledAt: z.string(),
  /** Total number of ruleblocks */
  totalRuleblocks: z.number().int().min(0),
  /** Ordered list of ruleblock entries */
  entries: z.array(ManifestEntrySchema),
  /** Dependency graph as adjacency list (for visualization/debugging) */
  dependencyGraph: z.record(z.string(), z.array(z.string())),
});

// Update CompilationResult to include manifest
export const CompilationResultSchema = z.object({
  success: z.boolean(),
  sql: z.array(z.string()),
  errors: z.array(z.object({
    message: z.string(),
    ruleblock: z.string().optional(),
    line: z.number().optional(),
  })),
  warnings: z.array(z.object({
    message: z.string(),
    ruleblock: z.string().optional(),
  })),
  metrics: z.object({
    parseTimeMs: z.number(),
    linkTimeMs: z.number(),
    transformTimeMs: z.number(),
    sqlGenTimeMs: z.number(),
    totalTimeMs: z.number(),
    ruleblockCount: z.number(),
    cacheHitRate: z.number(),
  }).optional(),
  /** Compilation manifest with dependency ordering */
  manifest: CompilationManifestSchema.optional(),
});

// Type inference
export type RuleblockInput = z.infer<typeof RuleblockInputSchema>;
export type CompilerOptions = z.infer<typeof CompilerOptionsSchema>;
export type ParsedFetchStatement = z.infer<typeof ParsedFetchStatementSchema>;
export type ParsedComputeStatement = z.infer<typeof ParsedComputeStatementSchema>;
export type ParsedBindStatement = z.infer<typeof ParsedBindStatementSchema>;
export type ParsedRuleblock = z.infer<typeof ParsedRuleblockSchema>;
export type ManifestEntry = z.infer<typeof ManifestEntrySchema>;
export type CompilationManifest = z.infer<typeof CompilationManifestSchema>;
export type CompilationResult = z.infer<typeof CompilationResultSchema>;
