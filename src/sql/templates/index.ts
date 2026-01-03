export { oracleTemplates } from './oracle-templates';
export { mssqlTemplates } from './mssql-templates';
export { postgresqlTemplates } from './postgresql-templates';
export type { SqlTemplates, FetchContext, ComputeContext, BindContext } from './template-interface';

import { oracleTemplates } from './oracle-templates';
import { mssqlTemplates } from './mssql-templates';
import { postgresqlTemplates } from './postgresql-templates';
import type { SqlTemplates } from './template-interface';
import { Dialect } from '../../models/constants';

/**
 * Get SQL templates for the specified dialect
 */
export function getTemplates(dialect: Dialect): SqlTemplates {
  switch (dialect) {
    case Dialect.ORACLE:
      return oracleTemplates;
    case Dialect.MSSQL:
      return mssqlTemplates;
    case Dialect.POSTGRESQL:
      return postgresqlTemplates;
    default:
      throw new Error(`Unsupported SQL dialect: ${dialect}`);
  }
}
