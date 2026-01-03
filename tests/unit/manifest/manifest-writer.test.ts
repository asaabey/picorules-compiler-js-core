import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { writeManifestFile, serializeManifest } from '../../../src/manifest/manifest-writer';
import type { CompilationManifest } from '../../../src/models/types';

describe('manifest-writer', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-test-'));
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const sampleManifest: CompilationManifest = {
    version: '1.0.0',
    dialect: 'mssql',
    compiledAt: '2026-01-03T10:00:00.000Z',
    totalRuleblocks: 2,
    entries: [
      {
        ruleblockId: 'base',
        executionOrder: 0,
        targetTable: 'SROUT_base',
        dependencies: [],
        outputVariables: ['x', 'y'],
        sqlIndex: 0,
      },
      {
        ruleblockId: 'derived',
        executionOrder: 1,
        targetTable: 'SROUT_derived',
        dependencies: ['base'],
        outputVariables: ['z'],
        sqlIndex: 1,
      },
    ],
    dependencyGraph: {
      base: [],
      derived: ['base'],
    },
  };

  describe('writeManifestFile', () => {
    it('should write manifest to file with pretty printing by default', () => {
      const filePath = path.join(tempDir, 'manifest.json');

      writeManifestFile(sampleManifest, filePath);

      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.version).toBe('1.0.0');
      expect(parsed.dialect).toBe('mssql');
      expect(parsed.entries).toHaveLength(2);

      // Check it's pretty printed (has newlines)
      expect(content).toContain('\n');
    });

    it('should write manifest without pretty printing when option is false', () => {
      const filePath = path.join(tempDir, 'manifest-compact.json');

      writeManifestFile(sampleManifest, filePath, { prettyPrint: false });

      const content = fs.readFileSync(filePath, 'utf-8');

      // Should be single line (no newlines in content)
      expect(content.split('\n')).toHaveLength(1);

      const parsed = JSON.parse(content);
      expect(parsed.version).toBe('1.0.0');
    });

    it('should create directory if it does not exist', () => {
      const nestedDir = path.join(tempDir, 'nested', 'deep', 'path');
      const filePath = path.join(nestedDir, 'manifest.json');

      expect(fs.existsSync(nestedDir)).toBe(false);

      writeManifestFile(sampleManifest, filePath);

      expect(fs.existsSync(nestedDir)).toBe(true);
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('should throw error when createDir is false and directory does not exist', () => {
      const nestedDir = path.join(tempDir, 'nonexistent');
      const filePath = path.join(nestedDir, 'manifest.json');

      expect(() => {
        writeManifestFile(sampleManifest, filePath, { createDir: false });
      }).toThrow();
    });

    it('should use custom indent when specified', () => {
      const filePath = path.join(tempDir, 'manifest-indent4.json');

      writeManifestFile(sampleManifest, filePath, { indent: 4 });

      const content = fs.readFileSync(filePath, 'utf-8');

      // Check for 4-space indentation
      expect(content).toContain('    "version"');
    });

    it('should overwrite existing file', () => {
      const filePath = path.join(tempDir, 'manifest.json');

      // Write initial content
      fs.writeFileSync(filePath, 'old content');

      writeManifestFile(sampleManifest, filePath);

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).not.toBe('old content');
      expect(content).toContain('"version"');
    });
  });

  describe('serializeManifest', () => {
    it('should serialize manifest to pretty-printed JSON string by default', () => {
      const result = serializeManifest(sampleManifest);

      expect(result).toContain('\n');
      expect(result).toContain('  "version"');

      const parsed = JSON.parse(result);
      expect(parsed.version).toBe('1.0.0');
    });

    it('should serialize manifest to compact JSON when prettyPrint is false', () => {
      const result = serializeManifest(sampleManifest, false);

      expect(result.split('\n')).toHaveLength(1);

      const parsed = JSON.parse(result);
      expect(parsed.version).toBe('1.0.0');
    });

    it('should use custom indent', () => {
      const result = serializeManifest(sampleManifest, true, 4);

      expect(result).toContain('    "version"');
    });

    it('should produce valid JSON that can be parsed back', () => {
      const result = serializeManifest(sampleManifest);
      const parsed = JSON.parse(result) as CompilationManifest;

      expect(parsed.version).toBe(sampleManifest.version);
      expect(parsed.dialect).toBe(sampleManifest.dialect);
      expect(parsed.totalRuleblocks).toBe(sampleManifest.totalRuleblocks);
      expect(parsed.entries).toHaveLength(sampleManifest.entries.length);
      expect(parsed.entries[0].ruleblockId).toBe(sampleManifest.entries[0].ruleblockId);
      expect(parsed.dependencyGraph).toEqual(sampleManifest.dependencyGraph);
    });
  });
});
