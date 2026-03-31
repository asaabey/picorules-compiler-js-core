/**
 * Data adapter interface for the picorules JS evaluator.
 *
 * Abstracts the data source so the evaluator can work against EADV data,
 * FHIR resources, or any other clinical data format.
 */

import type { DataRecord } from './aggregators';

/**
 * Interface that data sources must implement to be queryable by the evaluator.
 */
export interface DataAdapter {
  /**
   * Retrieve records matching the given attribute list.
   *
   * @param attributeList - Attribute names to match. Supports:
   *   - Exact match: ["lab_bld_haemoglobin"]
   *   - Multiple: ["lab_bld_haemoglobin", "lab_bld_hb"]
   *   - Wildcard: ["icd_E11%"] (trailing % matches prefix)
   * @returns Array of matching DataRecords
   */
  getRecords(attributeList: string[]): DataRecord[];
}
