import { describe, it, expect } from 'vitest';
import { generateManifest } from '../../../src/manifest/manifest-generator';
import { buildDependencyGraph } from '../../../src/linking/dependency-graph';
import { Dialect, RuleType } from '../../../src/models/constants';
import type { ParsedRuleblock } from '../../../src/models/types';

describe('generateManifest', () => {
  it('should generate manifest for single ruleblock with no dependencies', () => {
    const ruleblocks: ParsedRuleblock[] = [
      {
        name: 'test_rb',
        text: '',
        isActive: true,
        rules: [
          {
            ruleType: RuleType.FETCH_STATEMENT,
            assignedVariable: 'hb_last',
            table: 'eadv',
            attributeList: ['lab_bld_haemoglobin'],
            property: 'val',
            functionName: 'last',
            references: [],
          },
        ],
      },
    ];

    const graph = buildDependencyGraph(ruleblocks);
    const manifest = generateManifest(ruleblocks, graph, Dialect.MSSQL);

    expect(manifest.version).toBe('1.0.0');
    expect(manifest.dialect).toBe('mssql');
    expect(manifest.totalRuleblocks).toBe(1);
    expect(manifest.entries).toHaveLength(1);

    const entry = manifest.entries[0];
    expect(entry.ruleblockId).toBe('test_rb');
    expect(entry.executionOrder).toBe(0);
    expect(entry.targetTable).toBe('SROUT_test_rb');
    expect(entry.dependencies).toEqual([]);
    expect(entry.outputVariables).toContain('hb_last');
    expect(entry.sqlIndex).toBe(0);
  });

  it('should generate manifest with correct dependency ordering', () => {
    const ruleblocks: ParsedRuleblock[] = [
      {
        name: 'base',
        text: '',
        isActive: true,
        rules: [
          {
            ruleType: RuleType.FETCH_STATEMENT,
            assignedVariable: 'x',
            table: 'eadv',
            attributeList: ['att1'],
            property: 'val',
            functionName: 'last',
            references: [],
          },
        ],
      },
      {
        name: 'derived',
        text: '',
        isActive: true,
        rules: [
          {
            ruleType: RuleType.BIND_STATEMENT,
            assignedVariable: 'y',
            sourceRuleblock: 'base',
            sourceVariable: 'x',
            property: 'val',
            references: ['x'],
          },
          {
            ruleType: RuleType.COMPUTE_STATEMENT,
            assignedVariable: 'is_high',
            conditions: [
              { predicate: 'y > 100', returnValue: '1' },
              { returnValue: '0' },
            ],
            references: ['y'],
          },
        ],
      },
    ];

    const graph = buildDependencyGraph(ruleblocks);
    const manifest = generateManifest(ruleblocks, graph, Dialect.MSSQL);

    expect(manifest.totalRuleblocks).toBe(2);

    // Find entries by name
    const baseEntry = manifest.entries.find(e => e.ruleblockId === 'base');
    const derivedEntry = manifest.entries.find(e => e.ruleblockId === 'derived');

    expect(baseEntry).toBeDefined();
    expect(derivedEntry).toBeDefined();

    // Base should have no dependencies
    expect(baseEntry!.dependencies).toEqual([]);

    // Derived should depend on base
    expect(derivedEntry!.dependencies).toContain('base');

    // Derived should have both variables
    expect(derivedEntry!.outputVariables).toContain('y');
    expect(derivedEntry!.outputVariables).toContain('is_high');

    // Dependency graph should be included
    expect(manifest.dependencyGraph['base']).toEqual([]);
    expect(manifest.dependencyGraph['derived']).toContain('base');
  });

  it('should use correct table naming for different dialects', () => {
    const ruleblocks: ParsedRuleblock[] = [
      {
        name: 'ckd',
        text: '',
        isActive: true,
        rules: [],
      },
    ];

    const graph = buildDependencyGraph(ruleblocks);

    // MSSQL
    const mssqlManifest = generateManifest(ruleblocks, graph, Dialect.MSSQL);
    expect(mssqlManifest.entries[0].targetTable).toBe('SROUT_ckd');

    // Oracle
    const oracleManifest = generateManifest(ruleblocks, graph, Dialect.ORACLE);
    expect(oracleManifest.entries[0].targetTable).toBe('ROUT_CKD');

    // PostgreSQL
    const pgManifest = generateManifest(ruleblocks, graph, Dialect.POSTGRESQL);
    expect(pgManifest.entries[0].targetTable).toBe('srout_ckd');
  });

  it('should include compiledAt timestamp', () => {
    const ruleblocks: ParsedRuleblock[] = [
      {
        name: 'test',
        text: '',
        isActive: true,
        rules: [],
      },
    ];

    const graph = buildDependencyGraph(ruleblocks);
    const manifest = generateManifest(ruleblocks, graph, Dialect.MSSQL);

    expect(manifest.compiledAt).toBeDefined();
    // Should be valid ISO date
    expect(() => new Date(manifest.compiledAt)).not.toThrow();
  });

  it('should handle complex dependency chains', () => {
    // Chain: a -> b -> c -> d
    const ruleblocks: ParsedRuleblock[] = [
      {
        name: 'a',
        text: '',
        isActive: true,
        rules: [
          {
            ruleType: RuleType.FETCH_STATEMENT,
            assignedVariable: 'var_a',
            table: 'eadv',
            attributeList: ['att'],
            property: 'val',
            functionName: 'last',
            references: [],
          },
        ],
      },
      {
        name: 'b',
        text: '',
        isActive: true,
        rules: [
          {
            ruleType: RuleType.BIND_STATEMENT,
            assignedVariable: 'var_b',
            sourceRuleblock: 'a',
            sourceVariable: 'var_a',
            property: 'val',
            references: [],
          },
        ],
      },
      {
        name: 'c',
        text: '',
        isActive: true,
        rules: [
          {
            ruleType: RuleType.BIND_STATEMENT,
            assignedVariable: 'var_c',
            sourceRuleblock: 'b',
            sourceVariable: 'var_b',
            property: 'val',
            references: [],
          },
        ],
      },
      {
        name: 'd',
        text: '',
        isActive: true,
        rules: [
          {
            ruleType: RuleType.BIND_STATEMENT,
            assignedVariable: 'var_d',
            sourceRuleblock: 'c',
            sourceVariable: 'var_c',
            property: 'val',
            references: [],
          },
        ],
      },
    ];

    const graph = buildDependencyGraph(ruleblocks);
    const manifest = generateManifest(ruleblocks, graph, Dialect.MSSQL);

    expect(manifest.totalRuleblocks).toBe(4);

    // Verify dependencies
    const entries = Object.fromEntries(
      manifest.entries.map(e => [e.ruleblockId, e])
    );

    expect(entries['a'].dependencies).toEqual([]);
    expect(entries['b'].dependencies).toContain('a');
    expect(entries['c'].dependencies).toContain('b');
    expect(entries['d'].dependencies).toContain('c');
  });

  it('should handle diamond dependency pattern', () => {
    // Diamond: a -> b, a -> c, b -> d, c -> d
    const ruleblocks: ParsedRuleblock[] = [
      {
        name: 'a',
        text: '',
        isActive: true,
        rules: [
          {
            ruleType: RuleType.FETCH_STATEMENT,
            assignedVariable: 'var_a',
            table: 'eadv',
            attributeList: ['att'],
            property: 'val',
            functionName: 'last',
            references: [],
          },
        ],
      },
      {
        name: 'b',
        text: '',
        isActive: true,
        rules: [
          {
            ruleType: RuleType.BIND_STATEMENT,
            assignedVariable: 'var_b',
            sourceRuleblock: 'a',
            sourceVariable: 'var_a',
            property: 'val',
            references: [],
          },
        ],
      },
      {
        name: 'c',
        text: '',
        isActive: true,
        rules: [
          {
            ruleType: RuleType.BIND_STATEMENT,
            assignedVariable: 'var_c',
            sourceRuleblock: 'a',
            sourceVariable: 'var_a',
            property: 'val',
            references: [],
          },
        ],
      },
      {
        name: 'd',
        text: '',
        isActive: true,
        rules: [
          {
            ruleType: RuleType.BIND_STATEMENT,
            assignedVariable: 'from_b',
            sourceRuleblock: 'b',
            sourceVariable: 'var_b',
            property: 'val',
            references: [],
          },
          {
            ruleType: RuleType.BIND_STATEMENT,
            assignedVariable: 'from_c',
            sourceRuleblock: 'c',
            sourceVariable: 'var_c',
            property: 'val',
            references: [],
          },
        ],
      },
    ];

    const graph = buildDependencyGraph(ruleblocks);
    const manifest = generateManifest(ruleblocks, graph, Dialect.MSSQL);

    const entries = Object.fromEntries(
      manifest.entries.map(e => [e.ruleblockId, e])
    );

    // D should depend on both B and C
    expect(entries['d'].dependencies).toContain('b');
    expect(entries['d'].dependencies).toContain('c');
    expect(entries['d'].outputVariables).toContain('from_b');
    expect(entries['d'].outputVariables).toContain('from_c');
  });
});
