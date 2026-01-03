import * as fs from 'fs';
import * as path from 'path';
import type { CompilationManifest } from '../models/types';

export interface WriteManifestOptions {
  /** Pretty print the JSON output (default: true) */
  prettyPrint?: boolean;
  /** Indentation spaces for pretty print (default: 2) */
  indent?: number;
  /** Create directory if it doesn't exist (default: true) */
  createDir?: boolean;
}

const DEFAULT_OPTIONS: Required<WriteManifestOptions> = {
  prettyPrint: true,
  indent: 2,
  createDir: true,
};

/**
 * Write a compilation manifest to a JSON file
 *
 * @param manifest - The compilation manifest to write
 * @param outputPath - Path to the output JSON file
 * @param options - Optional configuration for writing
 * @throws Error if file cannot be written
 */
export function writeManifestFile(
  manifest: CompilationManifest,
  outputPath: string,
  options: WriteManifestOptions = {}
): void {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Ensure directory exists
  if (opts.createDir) {
    const dir = path.dirname(outputPath);
    if (dir && dir !== '.' && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Serialize manifest
  const content = opts.prettyPrint
    ? JSON.stringify(manifest, null, opts.indent)
    : JSON.stringify(manifest);

  // Write file
  fs.writeFileSync(outputPath, content, 'utf-8');
}

/**
 * Write a compilation manifest to a JSON string
 *
 * @param manifest - The compilation manifest to serialize
 * @param prettyPrint - Whether to pretty print (default: true)
 * @param indent - Indentation spaces (default: 2)
 * @returns JSON string representation of the manifest
 */
export function serializeManifest(
  manifest: CompilationManifest,
  prettyPrint: boolean = true,
  indent: number = 2
): string {
  return prettyPrint
    ? JSON.stringify(manifest, null, indent)
    : JSON.stringify(manifest);
}
