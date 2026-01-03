import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { compile, Dialect } from '../../src';

describe('compile', () => {
  it('should compile simple ruleblock end-to-end', () => {
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

    expect(result.success).toBe(true);
    expect(result.sql).toHaveLength(1);
    expect(result.sql[0]).toContain('CREATE TABLE ROUT_CKD');
    expect(result.sql[0]).toContain('SQ_EGFR_LAST');
    expect(result.sql[0]).toContain('SQ_HAS_CKD');
    expect(result.errors).toHaveLength(0);
  });

  it('should include manifest in compilation result', () => {
    const ruleblocks = [
      {
        name: 'base',
        text: 'x => eadv.att1.val.last();',
        isActive: true,
      },
      {
        name: 'derived',
        text: `
          y => rout_base.x.val.bind();
          z : {y > 10 => 1}, {=> 0};
        `,
        isActive: true,
      },
    ];

    const result = compile(ruleblocks, { dialect: Dialect.MSSQL });

    expect(result.success).toBe(true);
    expect(result.manifest).toBeDefined();
    expect(result.manifest!.version).toBe('1.0.0');
    expect(result.manifest!.dialect).toBe('mssql');
    expect(result.manifest!.totalRuleblocks).toBe(2);
    expect(result.manifest!.entries).toHaveLength(2);

    // Verify dependency ordering
    const baseEntry = result.manifest!.entries.find(e => e.ruleblockId === 'base');
    const derivedEntry = result.manifest!.entries.find(e => e.ruleblockId === 'derived');

    expect(baseEntry).toBeDefined();
    expect(derivedEntry).toBeDefined();
    expect(baseEntry!.dependencies).toEqual([]);
    expect(derivedEntry!.dependencies).toContain('base');

    // Verify target tables
    expect(baseEntry!.targetTable).toBe('SROUT_base');
    expect(derivedEntry!.targetTable).toBe('SROUT_derived');

    // Verify output variables
    expect(baseEntry!.outputVariables).toContain('x');
    expect(derivedEntry!.outputVariables).toContain('y');
    expect(derivedEntry!.outputVariables).toContain('z');

    // Verify SQL index matches array position
    expect(result.sql[baseEntry!.sqlIndex]).toContain('SROUT_base');
    expect(result.sql[derivedEntry!.sqlIndex]).toContain('SROUT_derived');
  });

  it('should compile empty ruleblock when text has no valid statements', () => {
    const ruleblocks = [
      {
        name: 'empty',
        text: 'this is invalid syntax',
        isActive: true,
      },
    ];

    const result = compile(ruleblocks, { dialect: Dialect.ORACLE });

    // Current behavior: silently ignores unrecognized statements
    expect(result.success).toBe(true);
    expect(result.sql).toHaveLength(1);
  });

  it('should validate ruleblock name', () => {
    const ruleblocks = [
      {
        name: '123invalid',
        text: 'x => eadv.att1.val.last();',
        isActive: true,
      },
    ];

    const result = compile(ruleblocks, { dialect: Dialect.ORACLE });

    expect(result.success).toBe(false);
  });

  describe('manifestPath option', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compile-manifest-test-'));
    });

    afterEach(() => {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should write manifest to file when manifestPath is specified', () => {
      const manifestPath = path.join(tempDir, 'output-manifest.json');
      const ruleblocks = [
        {
          name: 'test',
          text: 'x => eadv.att1.val.last();',
          isActive: true,
        },
      ];

      const result = compile(ruleblocks, {
        dialect: Dialect.MSSQL,
        manifestPath,
      });

      expect(result.success).toBe(true);
      expect(fs.existsSync(manifestPath)).toBe(true);

      const fileContent = fs.readFileSync(manifestPath, 'utf-8');
      const parsed = JSON.parse(fileContent);

      expect(parsed.version).toBe('1.0.0');
      expect(parsed.dialect).toBe('mssql');
      expect(parsed.entries).toHaveLength(1);
      expect(parsed.entries[0].ruleblockId).toBe('test');
    });

    it('should not write manifest file when manifestPath is not specified', () => {
      const ruleblocks = [
        {
          name: 'test',
          text: 'x => eadv.att1.val.last();',
          isActive: true,
        },
      ];

      const result = compile(ruleblocks, { dialect: Dialect.MSSQL });

      expect(result.success).toBe(true);
      // No file should be created (no manifestPath specified)
      const files = fs.readdirSync(tempDir);
      expect(files).toHaveLength(0);
    });
  });
});
