import type { SqlTemplates, FetchContext, ComputeContext, BindContext } from './template-interface';

/**
 * SQL Server T-SQL Templates
 *
 * Key differences from Oracle:
 * - Subqueries require aliases
 * - GETDATE() instead of SYSDATE
 * - DATEADD/DATEDIFF for date arithmetic
 * - STRING_AGG instead of LISTAGG
 * - SELECT INTO instead of CREATE TABLE AS
 */
export const mssqlTemplates: SqlTemplates = {
  fetchLast: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, ${ctx.property} AS ${ctx.assignedVariable}
    FROM (
      SELECT eid, ${ctx.property},
             ROW_NUMBER() OVER (PARTITION BY eid ORDER BY dt DESC) AS rn
      FROM ${ctx.table}
      WHERE att = '${ctx.attribute}'
      ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    ) AS ranked
    WHERE rn = 1
  )`.trim(),

  fetchFirst: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, ${ctx.property} AS ${ctx.assignedVariable}
    FROM (
      SELECT eid, ${ctx.property},
             ROW_NUMBER() OVER (PARTITION BY eid ORDER BY dt ASC) AS rn
      FROM ${ctx.table}
      WHERE att = '${ctx.attribute}'
      ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    ) AS ranked
    WHERE rn = 1
  )`.trim(),

  fetchCount: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, COUNT(${ctx.property}) AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE att = '${ctx.attribute}'
    ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    GROUP BY eid
  )`.trim(),

  // ========== Aggregation Functions ==========

  fetchSum: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, SUM(${ctx.property}) AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE att = '${ctx.attribute}'
    ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    GROUP BY eid
  )`.trim(),

  fetchAvg: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, AVG(${ctx.property}) AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE att = '${ctx.attribute}'
    ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    GROUP BY eid
  )`.trim(),

  fetchMin: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, MIN(${ctx.property}) AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE att = '${ctx.attribute}'
    ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    GROUP BY eid
  )`.trim(),

  fetchMax: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, MAX(${ctx.property}) AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE att = '${ctx.attribute}'
    ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    GROUP BY eid
  )`.trim(),

  fetchMedian: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${ctx.property}) AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE att = '${ctx.attribute}'
    ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    GROUP BY eid
  )`.trim(),

  fetchDistinctCount: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, COUNT(DISTINCT ${ctx.property}) AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE att = '${ctx.attribute}'
    ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    GROUP BY eid
  )`.trim(),

  // ========== Window Functions ==========

  fetchNth: (ctx: FetchContext) => {
    const n = ctx.functionParams?.[0] || '1';
    return `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, ${ctx.property} AS ${ctx.assignedVariable}
    FROM (
      SELECT eid, ${ctx.property},
             ROW_NUMBER() OVER (PARTITION BY eid ORDER BY dt DESC) AS rn
      FROM ${ctx.table}
      WHERE att = '${ctx.attribute}'
      ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    ) AS ranked
    WHERE rn = ${n}
  )`.trim();
  },

  fetchLastdv: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, ${ctx.property} + '~' + CONVERT(VARCHAR, dt, 23) AS ${ctx.assignedVariable}
    FROM (
      SELECT eid, ${ctx.property}, dt,
             ROW_NUMBER() OVER (PARTITION BY eid ORDER BY dt DESC) AS rn
      FROM ${ctx.table}
      WHERE att = '${ctx.attribute}'
      ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    ) AS ranked
    WHERE rn = 1
  )`.trim(),

  fetchFirstdv: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, ${ctx.property} + '~' + CONVERT(VARCHAR, dt, 23) AS ${ctx.assignedVariable}
    FROM (
      SELECT eid, ${ctx.property}, dt,
             ROW_NUMBER() OVER (PARTITION BY eid ORDER BY dt ASC) AS rn
      FROM ${ctx.table}
      WHERE att = '${ctx.attribute}'
      ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    ) AS ranked
    WHERE rn = 1
  )`.trim(),

  // ========== String Functions ==========

  fetchSerialize: (ctx: FetchContext) => {
    const delimiter = ctx.functionParams?.[0] ? ctx.functionParams[0].replace(/['\"]/g, '') : ',';
    return `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, STRING_AGG(${ctx.property}, '${delimiter}') WITHIN GROUP (ORDER BY dt) AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE att = '${ctx.attribute}'
    ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    GROUP BY eid
  )`.trim();
  },

  fetchSerializedv: (ctx: FetchContext) => {
    const delimiter = ctx.functionParams?.[0] ? ctx.functionParams[0].replace(/['\"]/g, '') : ',';
    return `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid,
           STRING_AGG(${ctx.property} + '~' + CONVERT(VARCHAR, dt, 23), '${delimiter}')
           WITHIN GROUP (ORDER BY dt) AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE att = '${ctx.attribute}'
    ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    GROUP BY eid
  )`.trim();
  },

  // ========== Statistical Functions ==========

  fetchRegrSlope: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid,
           (COUNT(*) * SUM(x * y) - SUM(x) * SUM(y)) /
           (COUNT(*) * SUM(x * x) - SUM(x) * SUM(x)) AS ${ctx.assignedVariable}
    FROM (
      SELECT eid,
             ${ctx.property} AS y,
             DATEDIFF(DAY, MIN(dt) OVER (PARTITION BY eid), dt) AS x
      FROM ${ctx.table}
      WHERE att = '${ctx.attribute}'
      ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    ) AS regression_data
    GROUP BY eid
  )`.trim(),

  fetchRegrIntercept: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid,
           (SUM(y) - ((COUNT(*) * SUM(x * y) - SUM(x) * SUM(y)) /
           (COUNT(*) * SUM(x * x) - SUM(x) * SUM(x))) * SUM(x)) / COUNT(*) AS ${ctx.assignedVariable}
    FROM (
      SELECT eid,
             ${ctx.property} AS y,
             DATEDIFF(DAY, MIN(dt) OVER (PARTITION BY eid), dt) AS x
      FROM ${ctx.table}
      WHERE att = '${ctx.attribute}'
      ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    ) AS regression_data
    GROUP BY eid
  )`.trim(),

  fetchRegrR2: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid,
           POWER(
             (COUNT(*) * SUM(x * y) - SUM(x) * SUM(y)) /
             SQRT((COUNT(*) * SUM(x * x) - SUM(x) * SUM(x)) *
                  (COUNT(*) * SUM(y * y) - SUM(y) * SUM(y))),
             2
           ) AS ${ctx.assignedVariable}
    FROM (
      SELECT eid,
             ${ctx.property} AS y,
             DATEDIFF(DAY, MIN(dt) OVER (PARTITION BY eid), dt) AS x
      FROM ${ctx.table}
      WHERE att = '${ctx.attribute}'
      ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    ) AS regression_data
    GROUP BY eid
  )`.trim(),

  // ========== Existence Function ==========

  fetchExists: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid,
           CASE WHEN COUNT(*) > 0 THEN 1 ELSE 0 END AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE att = '${ctx.attribute}'
    ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    GROUP BY eid
  )`.trim(),

  // ========== Compute Statement ==========

  compute: (ctx: ComputeContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid,
           CASE
${ctx.conditions.map(c =>
  c.predicate
    ? `           WHEN ${c.predicate} THEN ${c.returnValue}`
    : `           ELSE ${c.returnValue}`
).join('\n')}
           END AS ${ctx.assignedVariable}
    FROM UEADV
  )`.trim(),

  bind: (ctx: BindContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, ${ctx.sourceVariable} AS ${ctx.assignedVariable}
    FROM ROUT_${ctx.sourceRuleblock.toUpperCase()}
  )`.trim(),

  ruleblock: (name: string, ctes: string[], variables: string[]) => `
--------------------------------------------------
-- Ruleblock: ${name}
--------------------------------------------------
SELECT eid${variables.length > 0 ? ',\n       ' + variables.join(',\n       ') : ''}
INTO ROUT_${name.toUpperCase()}
FROM (
  WITH
    UEADV AS (
      SELECT DISTINCT eid FROM eadv
    ),
${ctes.join(',\n')}
  SELECT eid${variables.length > 0 ? ',\n         ' + variables.join(',\n         ') : ''}
  FROM UEADV
${variables.map(v => `  LEFT JOIN SQ_${v.toUpperCase()} ON UEADV.eid = SQ_${v.toUpperCase()}.eid`).join('\n')}
) AS ruleblock_result
`.trim(),

  helpers: {
    currentDate: () => 'GETDATE()',

    dateAdd: (column: string, days: number) =>
      `DATEADD(DAY, ${days}, ${column})`,

    dateDiff: (startCol: string, endCol: string, unit: 'DAY' | 'MONTH' | 'YEAR') => {
      switch (unit) {
        case 'DAY':
          return `DATEDIFF(DAY, ${startCol}, ${endCol})`;
        case 'MONTH':
          return `DATEDIFF(MONTH, ${startCol}, ${endCol})`;
        case 'YEAR':
          return `DATEDIFF(YEAR, ${startCol}, ${endCol})`;
        default:
          return `DATEDIFF(DAY, ${startCol}, ${endCol})`;
      }
    },

    stringAgg: (column: string, delimiter: string, orderBy?: string) =>
      orderBy
        ? `STRING_AGG(${column}, '${delimiter}') WITHIN GROUP (ORDER BY ${orderBy})`
        : `STRING_AGG(${column}, '${delimiter}')`,

    coalesce: (...columns: string[]) =>
      `COALESCE(${columns.join(', ')})`,

    nullIf: (col1: string, col2: string) =>
      `NULLIF(${col1}, ${col2})`,
  },
};
