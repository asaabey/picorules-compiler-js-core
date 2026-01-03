import type { ParsedRuleblock } from '../models/types';

/**
 * Subset selection - filter ruleblocks by name
 *
 * @param ruleblocks - All ruleblocks
 * @param subset - List of ruleblock names to include (if undefined, include all)
 * @returns Filtered ruleblocks
 */
export function selectSubset(
  ruleblocks: ParsedRuleblock[],
  subset?: string[]
): ParsedRuleblock[] {
  // If no subset specified, return all ruleblocks
  if (!subset || subset.length === 0) {
    return ruleblocks;
  }

  // Convert subset to lowercase set for case-insensitive matching
  const subsetSet = new Set(subset.map(name => name.toLowerCase()));

  // Filter ruleblocks by name
  return ruleblocks.filter(rb => subsetSet.has(rb.name.toLowerCase()));
}
