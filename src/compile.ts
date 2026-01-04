import { RuleblockInputSchema, CompilerOptionsSchema } from './models/schemas';
import type { RuleblockInput, CompilerOptions, CompilationResult } from './models/types';
import { parse } from './parsing';
import { link, buildDependencyGraph } from './linking';
import { transform } from './transformation';
import { generateSql } from './sql';
import { generateManifest } from './manifest';
import { Dialect } from './models/constants';

/**
 * Compile Picorules to SQL
 */
export function compile(
  ruleblocks: RuleblockInput[],
  options: CompilerOptions = { dialect: Dialect.ORACLE, includeInactive: false }
): CompilationResult {
  const startTime = Date.now();

  try {
    // Validate inputs
    const validatedRuleblocks = ruleblocks.map(rb => RuleblockInputSchema.parse(rb));
    const validatedOptions = CompilerOptionsSchema.parse(options);

    // Stage 1: Parse
    const parseStart = Date.now();
    const parsed = parse(validatedRuleblocks);
    const parseTime = Date.now() - parseStart;

    // Stage 2: Link
    const linkStart = Date.now();
    const linked = link(parsed);
    const linkTime = Date.now() - linkStart;

    // Stage 3: Transform
    const transformStart = Date.now();
    const transformed = transform(linked, validatedOptions);
    const transformTime = Date.now() - transformStart;

    // Stage 4: Generate SQL
    const sqlGenStart = Date.now();
    const sql = generateSql(transformed, validatedOptions.dialect);
    const sqlGenTime = Date.now() - sqlGenStart;

    // Stage 5: Generate manifest
    const dependencyGraph = buildDependencyGraph(transformed);
    const manifest = generateManifest(transformed, dependencyGraph, validatedOptions.dialect);

    // Note: manifestPath option is deprecated in the browser-compatible version.
    // Use writeManifestFile from 'picorules-compiler-js-core/node' separately.
    if (validatedOptions.manifestPath) {
      console.warn(
        'manifestPath option is deprecated. Use writeManifestFile from "picorules-compiler-js-core/node" instead.'
      );
    }

    const totalTime = Date.now() - startTime;

    return {
      success: true,
      sql,
      errors: [],
      warnings: [],
      metrics: {
        parseTimeMs: parseTime,
        linkTimeMs: linkTime,
        transformTimeMs: transformTime,
        sqlGenTimeMs: sqlGenTime,
        totalTimeMs: totalTime,
        ruleblockCount: ruleblocks.length,
        cacheHitRate: 0,
      },
      manifest,
    };
  } catch (error) {
    return {
      success: false,
      sql: [],
      errors: [
        {
          message: error instanceof Error ? error.message : String(error),
        },
      ],
      warnings: [],
    };
  }
}
