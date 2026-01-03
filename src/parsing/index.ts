export { parseRuleblock } from './ruleblock-parser';
export { parseFetchStatement } from './fetch-statement-parser';
export { parseComputeStatement } from './compute-statement-parser';

import { parseRuleblock } from './ruleblock-parser';
import type { RuleblockInput, ParsedRuleblock } from '../models/types';

/**
 * Main parsing entry point
 */
export function parse(ruleblocks: RuleblockInput[]): ParsedRuleblock[] {
  return ruleblocks.map(rb => parseRuleblock(rb));
}
