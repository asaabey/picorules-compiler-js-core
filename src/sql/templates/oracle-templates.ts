import type { SqlTemplates, FetchContext, ComputeContext, BindContext, VariableMetadata } from './template-interface';

/**
 * Translate Picorules helper functions to Oracle PL/SQL
 */
function translateFunctions(expression: string): string {
  if (!expression) return expression;

  let result = expression;

  // least_date(a, b, ...) - Returns MIN of non-NULL dates using LEAST with COALESCE
  // Uses a large date (9999-12-31) as upper bound, then NULLIF to convert back
  result = result.replace(/least_date\s*\((.*?)\)/g, (_match, args) => {
    const argList = args.split(',').map((a: string) => a.trim());
    const coalesceArgs = argList.map((arg: string) => `COALESCE(${arg}, TO_DATE('9999-12-31', 'YYYY-MM-DD'))`).join(', ');
    return `NULLIF(LEAST(${coalesceArgs}), TO_DATE('9999-12-31', 'YYYY-MM-DD'))`;
  });

  // greatest_date(a, b, ...) - Returns MAX of non-NULL dates using GREATEST with COALESCE
  // Uses a small date (0001-01-01) as lower bound, then NULLIF to convert back
  result = result.replace(/greatest_date\s*\((.*?)\)/g, (_match, args) => {
    const argList = args.split(',').map((a: string) => a.trim());
    const coalesceArgs = argList.map((arg: string) => `COALESCE(${arg}, TO_DATE('0001-01-01', 'YYYY-MM-DD'))`).join(', ');
    return `NULLIF(GREATEST(${coalesceArgs}), TO_DATE('0001-01-01', 'YYYY-MM-DD'))`;
  });

  // least(a, b, ...) - Native Oracle LEAST function
  result = result.replace(/least\s*\((.*?)\)/g, (_match, args) => {
    return `LEAST(${args})`;
  });

  // greatest(a, b, ...) - Native Oracle GREATEST function
  result = result.replace(/greatest\s*\((.*?)\)/g, (_match, args) => {
    return `GREATEST(${args})`;
  });

  return result;
}

/**
 * Build WHERE clause filter for attribute matching
 * Supports wildcards (%) and multiple attributes
 * - Single attribute without wildcard: WHERE att = 'value'
 * - Single attribute with wildcard: WHERE att LIKE 'value%'
 * - Multiple attributes: WHERE (att LIKE 'value1%' OR att LIKE 'value2%')
 */
function buildAttributeFilter(attributeList: string[]): string {
  if (attributeList.length === 0) {
    throw new Error('attributeList cannot be empty');
  }

  const conditions = attributeList.map(attr => {
    const hasWildcard = attr.includes('%');
    if (hasWildcard) {
      return `att LIKE '${attr}'`;
    } else {
      return `att = '${attr}'`;
    }
  });

  if (conditions.length === 1) {
    return conditions[0];
  } else {
    return `(${conditions.join(' OR ')})`;
  }
}

/**
 * Translate Picorules operators to Oracle SQL
 * - !? becomes IS NOT NULL
 * - ? becomes IS NULL
 * - . becomes 1=1
 * - Also translates helper functions
 */
function translateOperators(expression: string): string {
  if (!expression) return expression;

  let result = expression;

  // Translate '.' to '1=1' (always true condition)
  if (result.trim() === '.') {
    return '1=1';
  }

  // Translate helper functions first
  result = translateFunctions(result);

  // IS NOT NULL: variable!?
  result = result.replace(/(\w+)\s*!\?/g, '$1 IS NOT NULL');

  // IS NULL: variable?
  result = result.replace(/(\w+)\s*\?/g, '$1 IS NULL');

  return result;
}

/**
 * Oracle PL/SQL Templates
 */
export const oracleTemplates: SqlTemplates = {
  // ========== Basic Fetch Functions ==========

  fetchLast: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, ${ctx.property} AS ${ctx.assignedVariable}
    FROM (
      SELECT eid, ${ctx.property},
             ROW_NUMBER() OVER (PARTITION BY eid ORDER BY dt DESC) AS rn
      FROM ${ctx.table}
      WHERE ${buildAttributeFilter(ctx.attributeList)}
      ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    )
    WHERE rn = 1
  )`.trim(),

  fetchFirst: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, ${ctx.property} AS ${ctx.assignedVariable}
    FROM (
      SELECT eid, ${ctx.property},
             ROW_NUMBER() OVER (PARTITION BY eid ORDER BY dt ASC) AS rn
      FROM ${ctx.table}
      WHERE ${buildAttributeFilter(ctx.attributeList)}
      ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    )
    WHERE rn = 1
  )`.trim(),

  fetchCount: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, COUNT(${ctx.property}) AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE ${buildAttributeFilter(ctx.attributeList)}
    ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    GROUP BY eid
  )`.trim(),

  // ========== Aggregation Functions ==========

  fetchSum: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, SUM(${ctx.property}) AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE ${buildAttributeFilter(ctx.attributeList)}
    ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    GROUP BY eid
  )`.trim(),

  fetchAvg: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, AVG(${ctx.property}) AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE ${buildAttributeFilter(ctx.attributeList)}
    ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    GROUP BY eid
  )`.trim(),

  fetchMin: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, MIN(${ctx.property}) AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE ${buildAttributeFilter(ctx.attributeList)}
    ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    GROUP BY eid
  )`.trim(),

  fetchMax: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, MAX(${ctx.property}) AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE ${buildAttributeFilter(ctx.attributeList)}
    ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    GROUP BY eid
  )`.trim(),

  fetchMedian: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, MEDIAN(${ctx.property}) AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE ${buildAttributeFilter(ctx.attributeList)}
    ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    GROUP BY eid
  )`.trim(),

  fetchDistinctCount: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, COUNT(DISTINCT ${ctx.property}) AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE ${buildAttributeFilter(ctx.attributeList)}
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
      WHERE ${buildAttributeFilter(ctx.attributeList)}
      ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    )
    WHERE rn = ${n}
  )`.trim();
  },

  // lastdv() returns separate _val and _dt columns for the last record by date
  fetchLastdv: (ctx: FetchContext) => {
    const prop = ctx.property === '_' ? 'val' : ctx.property;
    return `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid,
           ${prop} AS ${ctx.assignedVariable}_val,
           dt AS ${ctx.assignedVariable}_dt
    FROM (
      SELECT eid, ${prop}, dt,
             ROW_NUMBER() OVER (PARTITION BY eid ORDER BY dt DESC) AS rn
      FROM ${ctx.table}
      WHERE ${buildAttributeFilter(ctx.attributeList)}
      ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    )
    WHERE rn = 1
  )`.trim();
  },

  // firstdv() returns separate _val and _dt columns for the first record by date
  fetchFirstdv: (ctx: FetchContext) => {
    const prop = ctx.property === '_' ? 'val' : ctx.property;
    return `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid,
           ${prop} AS ${ctx.assignedVariable}_val,
           dt AS ${ctx.assignedVariable}_dt
    FROM (
      SELECT eid, ${prop}, dt,
             ROW_NUMBER() OVER (PARTITION BY eid ORDER BY dt ASC) AS rn
      FROM ${ctx.table}
      WHERE ${buildAttributeFilter(ctx.attributeList)}
      ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    )
    WHERE rn = 1
  )`.trim();
  },

  // maxldv() returns separate _val and _dt columns for the row with MAX value
  fetchMaxldv: (ctx: FetchContext) => {
    const prop = ctx.property === '_' ? 'val' : ctx.property;
    return `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid,
           ${prop} AS ${ctx.assignedVariable}_val,
           dt AS ${ctx.assignedVariable}_dt
    FROM (
      SELECT eid, ${prop}, dt,
             ROW_NUMBER() OVER (PARTITION BY eid ORDER BY TO_NUMBER(${prop}) DESC, dt DESC) AS rn
      FROM ${ctx.table}
      WHERE ${buildAttributeFilter(ctx.attributeList)}
      ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    )
    WHERE rn = 1
  )`.trim();
  },

  // minldv() returns separate _val and _dt columns for the row with MIN value
  fetchMinldv: (ctx: FetchContext) => {
    const prop = ctx.property === '_' ? 'val' : ctx.property;
    return `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid,
           ${prop} AS ${ctx.assignedVariable}_val,
           dt AS ${ctx.assignedVariable}_dt
    FROM (
      SELECT eid, ${prop}, dt,
             ROW_NUMBER() OVER (PARTITION BY eid ORDER BY TO_NUMBER(${prop}) ASC, dt DESC) AS rn
      FROM ${ctx.table}
      WHERE ${buildAttributeFilter(ctx.attributeList)}
      ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    )
    WHERE rn = 1
  )`.trim();
  },

  // ========== String Functions ==========

  fetchSerialize: (ctx: FetchContext) => {
    const delimiter = ctx.functionParams?.[0] ? ctx.functionParams[0].replace(/['"]/g, '') : ',';
    return `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, LISTAGG(${ctx.property}, '${delimiter}') WITHIN GROUP (ORDER BY dt) AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE ${buildAttributeFilter(ctx.attributeList)}
    ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    GROUP BY eid
  )`.trim();
  },

  fetchSerializedv: (ctx: FetchContext) => {
    const delimiter = ctx.functionParams?.[0] ? ctx.functionParams[0].replace(/['"]/g, '') : ',';
    return `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid,
           LISTAGG(${ctx.property} || '~' || TO_CHAR(dt, 'YYYY-MM-DD'), '${delimiter}')
           WITHIN GROUP (ORDER BY dt) AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE ${buildAttributeFilter(ctx.attributeList)}
    ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    GROUP BY eid
  )`.trim();
  },

  // serializedv2(format) - serialize with custom format expression
  // Format can include column references like: round(val,0)~dt
  fetchSerializedv2: (ctx: FetchContext) => {
    const delimiter = ',';
    // The format expression is passed as functionParams[0]
    // e.g., "round(val,0)~dt" needs to be translated to SQL
    let formatExpr = ctx.functionParams?.[0] || 'val';
    // Split by ~ and join with proper SQL concatenation
    const parts = formatExpr.split('~');
    const sqlParts = parts.map((part: string) => {
      part = part.trim();
      if (part === 'dt') {
        return "TO_CHAR(dt, 'YYYY-MM-DD')";
      } else {
        // Use TO_CHAR for numeric expressions in Oracle
        return `TO_CHAR(${part})`;
      }
    });
    formatExpr = sqlParts.join(" || '~' || ");
    formatExpr = translateFunctions(formatExpr);
    return `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid,
           LISTAGG(${formatExpr}, '${delimiter}')
           WITHIN GROUP (ORDER BY dt) AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE ${buildAttributeFilter(ctx.attributeList)}
    ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    GROUP BY eid
  )`.trim();
  },

  // ========== Statistical Functions ==========

  fetchRegrSlope: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid,
           REGR_SLOPE(${ctx.property},
                     (dt - MIN(dt) OVER (PARTITION BY eid))) AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE ${buildAttributeFilter(ctx.attributeList)}
    ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    GROUP BY eid
  )`.trim(),

  fetchRegrIntercept: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid,
           REGR_INTERCEPT(${ctx.property},
                         (dt - MIN(dt) OVER (PARTITION BY eid))) AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE ${buildAttributeFilter(ctx.attributeList)}
    ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    GROUP BY eid
  )`.trim(),

  fetchRegrR2: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid,
           REGR_R2(${ctx.property},
                  (dt - MIN(dt) OVER (PARTITION BY eid))) AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE ${buildAttributeFilter(ctx.attributeList)}
    ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    GROUP BY eid
  )`.trim(),

  // ========== Existence Function ==========

  fetchExists: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid,
           CASE WHEN COUNT(*) > 0 THEN 1 ELSE 0 END AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE ${buildAttributeFilter(ctx.attributeList)}
    ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    GROUP BY eid
  )`.trim(),

  // ========== Statistical Mode Function ==========
  // stats_mode() returns the most frequent value per patient

  fetchStatsMode: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, ${resolveProperty(ctx.property)} AS ${ctx.assignedVariable}
    FROM (
      SELECT eid, ${resolveProperty(ctx.property)},
             ROW_NUMBER() OVER (PARTITION BY eid ORDER BY cnt DESC, ${resolveProperty(ctx.property)}) AS rn
      FROM (
        SELECT eid, ${resolveProperty(ctx.property)}, COUNT(*) AS cnt
        FROM ${ctx.table}
        WHERE ${buildAttributeFilter(ctx.attributeList)}
        ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
        GROUP BY eid, ${resolveProperty(ctx.property)}
      )
    )
    WHERE rn = 1
  )`.trim(),

  // ========== Minimum First Date-Value Function ==========
  // minfdv() returns _val and _dt columns for the minimum value with its FIRST date of occurrence

  fetchMinfdv: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid,
           ${resolveProperty(ctx.property)} AS ${ctx.assignedVariable}_val,
           dt AS ${ctx.assignedVariable}_dt
    FROM (
      SELECT eid, ${resolveProperty(ctx.property)}, dt,
             ROW_NUMBER() OVER (PARTITION BY eid ORDER BY ${resolveProperty(ctx.property, 'numeric')} ASC, dt ASC) AS rn
      FROM ${ctx.table}
      WHERE ${buildAttributeFilter(ctx.attributeList)}
      ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    )
    WHERE rn = 1
  )`.trim(),

  // ========== Extended Serialization Function ==========
  // serialize2() is like serialize but may use different delimiter or encoding

  fetchSerialize2: (ctx: FetchContext) => {
    const delimiter = ctx.functionParams?.[0] ? ctx.functionParams[0].replace(/['"]/g, '') : ',';
    return `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, LISTAGG(${resolveProperty(ctx.property)}, '${delimiter}') WITHIN GROUP (ORDER BY dt) AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE ${buildAttributeFilter(ctx.attributeList)}
    ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    GROUP BY eid
  )`.trim();
  },

  // ========== Maximum Negative Delta with Date Function ==========
  // max_neg_delta_dv() returns _val and _dt for the largest decrease between consecutive values

  fetchMaxNegDeltaDv: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid,
           delta AS ${ctx.assignedVariable}_val,
           dt AS ${ctx.assignedVariable}_dt
    FROM (
      SELECT eid, delta, dt,
             ROW_NUMBER() OVER (PARTITION BY eid ORDER BY delta ASC, dt DESC) AS rn
      FROM (
        SELECT eid,
               ${resolveProperty(ctx.property, 'numeric')} - LAG(${resolveProperty(ctx.property, 'numeric')}) OVER (PARTITION BY eid ORDER BY dt) AS delta,
               dt
        FROM ${ctx.table}
        WHERE ${buildAttributeFilter(ctx.attributeList)}
        ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
      )
      WHERE delta < 0
    )
    WHERE rn = 1
  )`.trim(),

  // ========== Temporal Regularity Function ==========
  // temporal_regularity() measures the regularity of event intervals (coefficient of variation)

  fetchTemporalRegularity: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid,
           CASE
             WHEN COUNT(*) <= 1 THEN NULL
             WHEN AVG(interval_days) = 0 THEN 0
             ELSE STDDEV(interval_days) / NULLIF(AVG(interval_days), 0)
           END AS ${ctx.assignedVariable}
    FROM (
      SELECT eid,
             dt - LAG(dt) OVER (PARTITION BY eid ORDER BY dt) AS interval_days
      FROM ${ctx.table}
      WHERE ${buildAttributeFilter(ctx.attributeList)}
      ${ctx.predicate ? `AND ${ctx.predicate}` : ''}
    )
    WHERE interval_days IS NOT NULL
    GROUP BY eid
  )`.trim(),

  // ========== Compute Statement ==========

  compute: (ctx: ComputeContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid,
           CASE
${ctx.conditions.map(c =>
  c.predicate
    ? `           WHEN ${translateOperators(c.predicate)} THEN ${translateFunctions(c.returnValue)}`
    : `           ELSE ${translateFunctions(c.returnValue)}`
).join('\n')}
           END AS ${ctx.assignedVariable}
    FROM UEADV
  )`.trim(),

  // ========== Bind Statement ==========

  bind: (ctx: BindContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, ${ctx.sourceVariable} AS ${ctx.assignedVariable}
    FROM ROUT_${ctx.sourceRuleblock.toUpperCase()}
  )`.trim(),

  // ========== Ruleblock Wrapper ==========

  ruleblock: (name: string, ctes: string[], variables: VariableMetadata[]) => {
    // Build column list - for dv functions, select _val and _dt columns
    const columnList = variables.map(v => {
      if (v.isDvFunction) {
        return `${v.name}_val,\n       ${v.name}_dt`;
      }
      return v.name;
    }).join(',\n       ');

    // Build JOIN clauses
    const joinList = variables.map(v =>
      `LEFT JOIN SQ_${v.name.toUpperCase()} USING (eid)`
    ).join('\n');

    return `
--================================================
-- SQL Dialect: Oracle (PL/SQL)
-- Ruleblock: ${name}
--================================================
CREATE TABLE ROUT_${name.toUpperCase()} AS
WITH
  UEADV AS (
    SELECT DISTINCT eid FROM eadv
  ),
${ctes.join(',\n')}
SELECT eid${variables.length > 0 ? ',\n       ' + columnList : ''}
FROM UEADV
${joinList}
`.trim();
  },

  // ========== Helper Functions ==========

  helpers: {
    currentDate: () => 'SYSDATE',

    dateAdd: (column: string, days: number) =>
      `${column} + ${days}`,

    dateDiff: (startCol: string, endCol: string, unit: 'DAY' | 'MONTH' | 'YEAR') => {
      switch (unit) {
        case 'DAY':
          return `${endCol} - ${startCol}`;
        case 'MONTH':
          return `MONTHS_BETWEEN(${endCol}, ${startCol})`;
        case 'YEAR':
          return `EXTRACT(YEAR FROM ${endCol}) - EXTRACT(YEAR FROM ${startCol})`;
        default:
          return `${endCol} - ${startCol}`;
      }
    },

    stringAgg: (column: string, delimiter: string, orderBy?: string) =>
      `LISTAGG(${column}, '${delimiter}') WITHIN GROUP (ORDER BY ${orderBy || 'dt'})`,

    coalesce: (...columns: string[]) =>
      `COALESCE(${columns.join(', ')})`,

    nullIf: (col1: string, col2: string) =>
      `NULLIF(${col1}, ${col2})`,
  },
};
