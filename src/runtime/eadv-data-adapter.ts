/**
 * EADV (Entity-Attribute-Date-Value) data adapter.
 *
 * Wraps an in-memory array of EADV records and provides the DataAdapter
 * interface for the evaluator. This is the default adapter for running
 * picorules against the traditional EADV data model without SQL.
 */

import type { DataAdapter } from './data-adapter';
import type { DataRecord } from './aggregators';

export interface EadvRecord {
  eid: number | string;
  att: string;
  dt: Date | string | null;
  val: number | string | null;
}

export class EadvDataAdapter implements DataAdapter {
  private records: EadvRecord[];

  /**
   * @param records - EADV rows for a single patient
   */
  constructor(records: EadvRecord[]) {
    this.records = records;
  }

  getRecords(attributeList: string[]): DataRecord[] {
    const matchers = attributeList.map(att => buildMatcher(att));

    return this.records
      .filter(r => matchers.some(m => m(r.att)))
      .map(r => ({
        val: r.val,
        dt: r.dt == null ? null : (r.dt instanceof Date ? r.dt : new Date(r.dt)),
      }));
  }
}

/**
 * Build a matcher function for an attribute pattern.
 * Supports exact match and trailing wildcard (%).
 */
function buildMatcher(pattern: string): (att: string) => boolean {
  const lower = pattern.toLowerCase();
  if (lower.endsWith('%')) {
    const prefix = lower.slice(0, -1);
    return (att: string) => att.toLowerCase().startsWith(prefix);
  }
  return (att: string) => att.toLowerCase() === lower;
}
