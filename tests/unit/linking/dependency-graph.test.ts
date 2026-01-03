import { describe, it, expect } from 'vitest';
import { buildDependencyGraph, detectCircularDependencies, topologicalSort } from '../../../src/linking/dependency-graph';
import { RuleType } from '../../../src/models/constants';

describe('buildDependencyGraph', () => {
  it('should build graph with no dependencies', () => {
    const ruleblocks = [
      {
        name: 'rb1',
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
    ];

    const graph = buildDependencyGraph(ruleblocks);

    expect(graph.nodes.size).toBe(1);
    expect(graph.nodes.get('rb1')?.dependencies.size).toBe(0);
  });

  it('should detect dependencies from bind statements', () => {
    const ruleblocks = [
      {
        name: 'rb1',
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
        name: 'rb2',
        text: '',
        isActive: true,
        rules: [
          {
            ruleType: RuleType.BIND_STATEMENT,
            assignedVariable: 'y',
            sourceRuleblock: 'rb1',
            sourceVariable: 'x',
            property: 'val',
            references: ['x'],
          },
        ],
      },
    ];

    const graph = buildDependencyGraph(ruleblocks);

    expect(graph.nodes.size).toBe(2);
    expect(graph.nodes.get('rb2')?.dependencies.has('rb1')).toBe(true);
    expect(graph.edges.get('rb2')?.has('rb1')).toBe(true);
  });
});

describe('detectCircularDependencies', () => {
  it('should return null for acyclic graph', () => {
    const ruleblocks = [
      {
        name: 'rb1',
        text: '',
        isActive: true,
        rules: [],
      },
      {
        name: 'rb2',
        text: '',
        isActive: true,
        rules: [
          {
            ruleType: RuleType.BIND_STATEMENT,
            assignedVariable: 'y',
            sourceRuleblock: 'rb1',
            sourceVariable: 'x',
            property: 'val',
            references: ['x'],
          },
        ],
      },
    ];

    const graph = buildDependencyGraph(ruleblocks);
    const cycles = detectCircularDependencies(graph);

    expect(cycles).toBeNull();
  });
});

describe('topologicalSort', () => {
  it('should sort ruleblocks in dependency order', () => {
    const ruleblocks = [
      {
        name: 'rb3',
        text: '',
        isActive: true,
        rules: [
          {
            ruleType: RuleType.BIND_STATEMENT,
            assignedVariable: 'z',
            sourceRuleblock: 'rb2',
            sourceVariable: 'y',
            property: 'val',
            references: ['y'],
          },
        ],
      },
      {
        name: 'rb1',
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
        name: 'rb2',
        text: '',
        isActive: true,
        rules: [
          {
            ruleType: RuleType.BIND_STATEMENT,
            assignedVariable: 'y',
            sourceRuleblock: 'rb1',
            sourceVariable: 'x',
            property: 'val',
            references: ['x'],
          },
        ],
      },
    ];

    const sorted = topologicalSort(ruleblocks);

    // rb1 should come before rb2, rb2 should come before rb3
    const names = sorted.map(rb => rb.name);
    expect(names.indexOf('rb1')).toBeLessThan(names.indexOf('rb2'));
    expect(names.indexOf('rb2')).toBeLessThan(names.indexOf('rb3'));
  });

  it('should handle independent ruleblocks', () => {
    const ruleblocks = [
      {
        name: 'rb1',
        text: '',
        isActive: true,
        rules: [],
      },
      {
        name: 'rb2',
        text: '',
        isActive: true,
        rules: [],
      },
    ];

    const sorted = topologicalSort(ruleblocks);

    expect(sorted).toHaveLength(2);
  });
});
