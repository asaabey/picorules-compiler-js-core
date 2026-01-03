export { generateSqlForRuleblock } from './sql-generator';

import { generateSqlForRuleblock } from './sql-generator';
import type { ParsedRuleblock } from '../models/types';
import { Dialect } from '../models/constants';

export function generateSql(ruleblocks: ParsedRuleblock[], dialect: Dialect): string[] {
  return ruleblocks.map(rb => generateSqlForRuleblock(rb, dialect));
}
