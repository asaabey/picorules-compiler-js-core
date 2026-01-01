import { describe, it, expect } from 'vitest';
import { parseBindStatement } from '../../../src/parsing/bind-statement-parser';
import { RuleType } from '../../../src/models/constants';

describe('parseBindStatement', () => {
  it('should parse basic bind statement', () => {
    const text = 'ckd => rout_ckd.ckd.val.bind();';
    const result = parseBindStatement(text);

    expect(result.ruleType).toBe(RuleType.BIND_STATEMENT);
    expect(result.assignedVariable).toBe('ckd');
    expect(result.sourceRuleblock).toBe('ckd');
    expect(result.sourceVariable).toBe('ckd');
    expect(result.property).toBe('val');
    expect(result.references).toContain('ckd');
  });

  it('should parse bind statement with different variable names', () => {
    const text = 'local_var => rout_other_block.remote_var.val.bind();';
    const result = parseBindStatement(text);

    expect(result.assignedVariable).toBe('local_var');
    expect(result.sourceRuleblock).toBe('other_block');
    expect(result.sourceVariable).toBe('remote_var');
    expect(result.property).toBe('val');
  });

  it('should handle bind statement without trailing semicolon', () => {
    const text = 'x => rout_block.y.val.bind()';
    const result = parseBindStatement(text);

    expect(result.assignedVariable).toBe('x');
    expect(result.sourceRuleblock).toBe('block');
  });

  it('should throw on invalid bind statement', () => {
    const text = 'invalid bind syntax';
    expect(() => parseBindStatement(text)).toThrow();
  });

  it('should throw on bind statement without rout_ prefix', () => {
    const text = 'x => block.y.val.bind();';
    expect(() => parseBindStatement(text)).toThrow();
  });
});
