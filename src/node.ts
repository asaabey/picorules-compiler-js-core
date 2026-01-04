/**
 * Node.js-only exports
 *
 * These exports require Node.js and cannot be used in browser environments.
 * For browser-safe functionality, import from the main entry point instead.
 */

export { writeManifestFile } from './manifest/manifest-writer';
export type { WriteManifestOptions } from './manifest/manifest-writer';
