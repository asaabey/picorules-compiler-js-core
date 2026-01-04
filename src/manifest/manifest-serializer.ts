import type { CompilationManifest } from '../models/types';

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
