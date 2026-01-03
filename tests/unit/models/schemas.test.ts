import { describe, it, expect } from 'vitest';
import { RuleblockInputSchema, CompilerOptionsSchema } from '../../../src/models/schemas';
import { Dialect } from '../../../src/models/constants';

describe('RuleblockInputSchema', () => {
  it('should validate valid ruleblock', () => {
    const input = {
      name: 'test_rule',
      text: 'x => eadv.att1.val.last();',
      isActive: true,
    };

    const result = RuleblockInputSchema.parse(input);
    expect(result.name).toBe('test_rule');
  });

  it('should reject invalid name', () => {
    const input = {
      name: '123invalid',
      text: 'x => eadv.att1.val.last();',
    };

    expect(() => RuleblockInputSchema.parse(input)).toThrow();
  });

  it('should default isActive to true', () => {
    const input = {
      name: 'test',
      text: 'x => eadv.att1.val.last();',
    };

    const result = RuleblockInputSchema.parse(input);
    expect(result.isActive).toBe(true);
  });
});

describe('CompilerOptionsSchema', () => {
  it('should validate valid options', () => {
    const options = {
      dialect: Dialect.ORACLE,
      includeInactive: false,
    };

    const result = CompilerOptionsSchema.parse(options);
    expect(result.dialect).toBe(Dialect.ORACLE);
  });
});
