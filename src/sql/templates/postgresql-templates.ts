import type { SqlTemplates, FetchContext, ComputeContext, BindContext, VariableMetadata } from './template-interface';

/**
 * PostgreSQL Templates
 *
 * Key characteristics:
 * - Similar to Oracle in many ways (|| for concatenation, USING for joins)
 * - Uses INTERval syntax for date arithmetic
 * - PERCENTILE_CONT for median (like T-SQL)
 * - STRING_AGG with ORDER BY inside the function
 * - No native REGR_* functions (manual formulas like T-SQL)
 * - Subquery aliases optional (like Oracle)
 * - CREATE TABLE AS SELECT syntax
 * - CURRENT_DATE for current date
 */

/**
 * Helper to resolve property wildcards
 * In Picorules, '_' means "use val column"
 * For PostgreSQL, column names in eadv table are lowercase and unquoted
 */
function resolveProperty(property: string, cast?: 'numeric' | 'varchar'): string {
  const resolved = property === '_' ? 'val' : property;
  const columnName = resolved.toLowerCase();

  // Don't cast dt (date column) to numeric - it's already a date type
  if (cast === 'numeric' && columnName !== 'dt') {
    return `${columnName}::numeric`;
  }
  if (cast === 'varchar') {
    return `${columnName}::varchar`;
  }
  return columnName;
}

/**
 * Translate Picorules helper functions to PostgreSQL
 */
function translateFunctions(expression: string): string {
  if (!expression) return expression;

  let result = expression;

  // Backticks to single quotes: Picorules uses `string` for string literals
  // PostgreSQL uses 'string'
  result = result.replace(/`([^`]*)`/g, "'$1'");

  // String concatenation: Oracle/Picorules uses + for strings, PostgreSQL uses ||
  // Handle 'string' + expr and expr + 'string' patterns
  result = result.replace(/('[^']*')\s*\+\s*/g, '$1 || ');
  result = result.replace(/\s*\+\s*('[^']*')/g, ' || $1');

  // Oracle sysdate → PostgreSQL CURRENT_DATE
  result = result.replace(/\bsysdate\b/gi, 'CURRENT_DATE');

  // Oracle nvl(a, b) → PostgreSQL COALESCE(a, b)
  // Use non-greedy matching and handle nested parentheses carefully
  result = result.replace(/\bnvl\s*\(/gi, 'COALESCE(');

  // Oracle to_number(x) → PostgreSQL CAST(x AS NUMERIC) or x::numeric
  result = result.replace(/\bto_number\s*\(([^)]+)\)/gi, '($1)::NUMERIC');

  // Oracle to_char(num) without format → PostgreSQL num::text
  // Oracle to_char(date, format) → PostgreSQL to_char(date, format) (same syntax)
  // Handle to_char with single argument (for numbers) - convert to text cast
  // But preserve to_char with two arguments (date formatting)
  result = result.replace(/\bto_char\s*\(([^,)]+),\s*('[^']+')\)/gi, 'to_char($1, $2)');
  result = result.replace(/\bto_char\s*\(([^,)]+)\)/gi, '($1)::TEXT');

  // Oracle substr(str, start, len) → PostgreSQL SUBSTRING(str FROM start FOR len)
  // Handle negative start positions: Oracle substr(str, -n) = last n chars
  // PostgreSQL: RIGHT(str, n) for last n chars
  result = result.replace(/\bsubstr\s*\(([^,]+),\s*(-\d+)\)/gi, (_match, str, negStart) => {
    // Convert negative index to RIGHT function
    const len = Math.abs(parseInt(negStart));
    return `RIGHT(${str}::TEXT, ${len})`;
  });

  // Oracle substr(str, start, len) → PostgreSQL SUBSTRING(str FROM start FOR len)
  result = result.replace(/\bsubstr\s*\(([^,]+),\s*(\d+),\s*(\d+)\)/gi, 'SUBSTRING(($1)::TEXT FROM $2 FOR $3)');

  // Oracle substr(str, start) → PostgreSQL SUBSTRING(str FROM start)
  result = result.replace(/\bsubstr\s*\(([^,]+),\s*(\d+)\)/gi, 'SUBSTRING(($1)::TEXT FROM $2)');

  // least_date(a, b, ...) - Returns MIN of non-NULL dates using LEAST with COALESCE
  // PostgreSQL has native LEAST, use similar approach to Oracle
  result = result.replace(/least_date\s*\((.*?)\)/g, (_match, args) => {
    const argList = args.split(',').map((a: string) => a.trim());
    const coalesceArgs = argList.map((arg: string) => `COALESCE(${arg}, '9999-12-31'::DATE)`).join(', ');
    return `NULLIF(LEAST(${coalesceArgs}), '9999-12-31'::DATE)`;
  });

  // greatest_date(a, b, ...) - Returns MAX of non-NULL dates using GREATEST with COALESCE
  result = result.replace(/greatest_date\s*\((.*?)\)/g, (_match, args) => {
    const argList = args.split(',').map((a: string) => a.trim());
    const coalesceArgs = argList.map((arg: string) => `COALESCE(${arg}, '0001-01-01'::DATE)`).join(', ');
    return `NULLIF(GREATEST(${coalesceArgs}), '0001-01-01'::DATE)`;
  });

  // least(a, b, ...) - Native PostgreSQL LEAST function
  result = result.replace(/least\s*\((.*?)\)/g, (_match, args) => {
    return `LEAST(${args})`;
  });

  // greatest(a, b, ...) - Native PostgreSQL GREATEST function
  result = result.replace(/greatest\s*\((.*?)\)/g, (_match, args) => {
    return `GREATEST(${args})`;
  });

  // System constants: lower__bound__dt and upper__bound__dt
  // Used as sentinel values for date comparisons when other dates are null
  result = result.replace(/\blower__bound__dt\b/gi, "'0001-01-01'::DATE");
  result = result.replace(/\bupper__bound__dt\b/gi, "'9999-12-31'::DATE");

  return result;
}

/**
 * Normalize eadv column names in predicates for PostgreSQL
 * Converts column names to lowercase (PostgreSQL standard)
 * Handles: eid, att, dt, val (case-insensitive)
 */
function normalizeEadvColumns(expression: string): string {
  if (!expression) return expression;

  let result = expression;

  // Normalize column names to lowercase
  // Match word boundaries to avoid replacing parts of other identifiers
  result = result.replace(/\beid\b/gi, 'eid');
  result = result.replace(/\batt\b/gi, 'att');
  result = result.replace(/\bdt\b/gi, 'dt');
  result = result.replace(/\bval\b/gi, 'val');

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
 * Translate Picorules operators to PostgreSQL
 * - !? becomes IS NOT NULL
 * - ? becomes IS NULL
 * - . becomes 1=1
 * - Also translates helper functions and normalizes eadv column names to lowercase
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

  // IS NOT NULL: Handle both simple variable!? and expression!? patterns
  // Match: identifier!?, or expression)!? (for function calls like coalesce(a,b)!?)
  // Process )!? first (function calls), then simple variable!?
  result = result.replace(/\)(\s*)!\?/g, ') IS NOT NULL');
  result = result.replace(/(\w+)(\s*)!\?/g, '$1 IS NOT NULL');

  // IS NULL: Handle both simple variable? and expression)? patterns
  // Match only single ? (not !?)
  result = result.replace(/\)(\s*)\?(?!!)/g, ') IS NULL');
  result = result.replace(/(\w+)(\s*)\?(?!!)/g, '$1 IS NULL');

  // Normalize eadv column names to lowercase
  result = normalizeEadvColumns(result);

  return result;
}

/**
 * Translate fetch statement predicates (WHERE clause conditions)
 * Applies function translation plus column normalization
 */
function translatePredicate(predicate: string): string {
  if (!predicate) return predicate;
  return normalizeEadvColumns(translateFunctions(predicate));
}

/**
 * Build FROM clause with JOINs for fetch statements that have dependencies
 * When a fetch statement's predicate references other variables, we need to JOIN
 * with those CTEs to make the variables available
 */
function buildFetchWithDependencies(
  ctx: FetchContext,
  aggregateExpr: string,
  orderByForWindow?: 'DESC' | 'ASC'
): string {
  const prevVars = ctx.previousVariables || [];
  const joins = prevVars.map(v => `LEFT JOIN SQ_${v.toUpperCase()} USING (eid)`).join('\n    ');

  if (orderByForWindow) {
    // Window function pattern (for last, first, nth, lastdv, firstdv)
    return `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT base.eid, ${resolveProperty(ctx.property)} AS ${ctx.assignedVariable}
    FROM (
      SELECT base.eid, e.${resolveProperty(ctx.property)},
             ROW_NUMBER() OVER (PARTITION BY base.eid ORDER BY e.dt ${orderByForWindow}) AS rn
      FROM UEADV base
      ${joins}
      LEFT JOIN ${ctx.table} e ON e.eid = base.eid
        AND ${buildAttributeFilter(ctx.attributeList).replace(/att/g, 'e.att')}
        ${ctx.predicate ? `AND ${translatePredicate(ctx.predicate).replace(/\bdt\b/g, 'e.dt').replace(/\bval\b/g, 'e.val')}` : ''}
    ) ranked
    WHERE rn = 1
  )`.trim();
  } else {
    // Aggregate function pattern (for count, sum, avg, min, max)
    return `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT base.eid, ${aggregateExpr} AS ${ctx.assignedVariable}
    FROM UEADV base
    ${joins}
    LEFT JOIN ${ctx.table} e ON e.eid = base.eid
      AND ${buildAttributeFilter(ctx.attributeList).replace(/att/g, 'e.att')}
      ${ctx.predicate ? `AND ${translatePredicate(ctx.predicate).replace(/\bdt\b/g, 'e.dt').replace(/\bval\b/g, 'e.val')}` : ''}
    GROUP BY base.eid
  )`.trim();
  }
}

export const postgresqlTemplates: SqlTemplates = {
  // ========== Basic Fetch Functions ==========

  fetchLast: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, ${resolveProperty(ctx.property)} AS ${ctx.assignedVariable}
    FROM (
      SELECT eid, ${resolveProperty(ctx.property)},
             ROW_NUMBER() OVER (PARTITION BY eid ORDER BY dt DESC) AS rn
      FROM ${ctx.table}
      WHERE ${buildAttributeFilter(ctx.attributeList)}
      ${ctx.predicate ? `AND ${translatePredicate(ctx.predicate)}` : ''}
    ) ranked
    WHERE rn = 1
  )`.trim(),

  fetchFirst: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, ${resolveProperty(ctx.property)} AS ${ctx.assignedVariable}
    FROM (
      SELECT eid, ${resolveProperty(ctx.property)},
             ROW_NUMBER() OVER (PARTITION BY eid ORDER BY dt ASC) AS rn
      FROM ${ctx.table}
      WHERE ${buildAttributeFilter(ctx.attributeList)}
      ${ctx.predicate ? `AND ${translatePredicate(ctx.predicate)}` : ''}
    ) ranked
    WHERE rn = 1
  )`.trim(),

  fetchCount: (ctx: FetchContext) => {
    // If predicate references other variables, use the dependency pattern
    if (ctx.previousVariables && ctx.previousVariables.length > 0) {
      return buildFetchWithDependencies(ctx, `COUNT(e.${resolveProperty(ctx.property)})`);
    }
    return `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, COUNT(${resolveProperty(ctx.property)}) AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE ${buildAttributeFilter(ctx.attributeList)}
    ${ctx.predicate ? `AND ${translatePredicate(ctx.predicate)}` : ''}
    GROUP BY eid
  )`.trim();
  },

  // ========== Aggregation Functions ==========

  fetchSum: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, SUM(${resolveProperty(ctx.property, 'numeric')}) AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE ${buildAttributeFilter(ctx.attributeList)}
    ${ctx.predicate ? `AND ${translatePredicate(ctx.predicate)}` : ''}
    GROUP BY eid
  )`.trim(),

  fetchAvg: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, AVG(${resolveProperty(ctx.property, 'numeric')}) AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE ${buildAttributeFilter(ctx.attributeList)}
    ${ctx.predicate ? `AND ${translatePredicate(ctx.predicate)}` : ''}
    GROUP BY eid
  )`.trim(),

  fetchMin: (ctx: FetchContext) => {
    if (ctx.previousVariables && ctx.previousVariables.length > 0) {
      return buildFetchWithDependencies(ctx, `MIN(e.${resolveProperty(ctx.property, 'numeric')})`);
    }
    return `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, MIN(${resolveProperty(ctx.property, 'numeric')}) AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE ${buildAttributeFilter(ctx.attributeList)}
    ${ctx.predicate ? `AND ${translatePredicate(ctx.predicate)}` : ''}
    GROUP BY eid
  )`.trim();
  },

  fetchMax: (ctx: FetchContext) => {
    if (ctx.previousVariables && ctx.previousVariables.length > 0) {
      return buildFetchWithDependencies(ctx, `MAX(e.${resolveProperty(ctx.property, 'numeric')})`);
    }
    return `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, MAX(${resolveProperty(ctx.property, 'numeric')}) AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE ${buildAttributeFilter(ctx.attributeList)}
    ${ctx.predicate ? `AND ${translatePredicate(ctx.predicate)}` : ''}
    GROUP BY eid
  )`.trim();
  },

  fetchMedian: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT DISTINCT eid,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${resolveProperty(ctx.property, 'numeric')})
           OVER (PARTITION BY eid) AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE ${buildAttributeFilter(ctx.attributeList)}
    ${ctx.predicate ? `AND ${translatePredicate(ctx.predicate)}` : ''}
  )`.trim(),

  fetchDistinctCount: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, COUNT(DISTINCT ${resolveProperty(ctx.property)}) AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE ${buildAttributeFilter(ctx.attributeList)}
    ${ctx.predicate ? `AND ${translatePredicate(ctx.predicate)}` : ''}
    GROUP BY eid
  )`.trim(),

  // ========== Window Functions ==========

  fetchNth: (ctx: FetchContext) => {
    const n = ctx.functionParams?.[0] || '1';
    return `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, ${resolveProperty(ctx.property)} AS ${ctx.assignedVariable}
    FROM (
      SELECT eid, ${resolveProperty(ctx.property)},
             ROW_NUMBER() OVER (PARTITION BY eid ORDER BY dt DESC) AS rn
      FROM ${ctx.table}
      WHERE ${buildAttributeFilter(ctx.attributeList)}
      ${ctx.predicate ? `AND ${translatePredicate(ctx.predicate)}` : ''}
    ) ranked
    WHERE rn = ${n}
  )`.trim();
  },

  // lastdv() returns separate _val and _dt columns for the last record by date
  fetchLastdv: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid,
           ${resolveProperty(ctx.property)} AS ${ctx.assignedVariable}_val,
           dt AS ${ctx.assignedVariable}_dt
    FROM (
      SELECT eid, ${resolveProperty(ctx.property)}, dt,
             ROW_NUMBER() OVER (PARTITION BY eid ORDER BY dt DESC) AS rn
      FROM ${ctx.table}
      WHERE ${buildAttributeFilter(ctx.attributeList)}
      ${ctx.predicate ? `AND ${translatePredicate(ctx.predicate)}` : ''}
    ) ranked
    WHERE rn = 1
  )`.trim(),

  // firstdv() returns separate _val and _dt columns for the first record by date
  fetchFirstdv: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid,
           ${resolveProperty(ctx.property)} AS ${ctx.assignedVariable}_val,
           dt AS ${ctx.assignedVariable}_dt
    FROM (
      SELECT eid, ${resolveProperty(ctx.property)}, dt,
             ROW_NUMBER() OVER (PARTITION BY eid ORDER BY dt ASC) AS rn
      FROM ${ctx.table}
      WHERE ${buildAttributeFilter(ctx.attributeList)}
      ${ctx.predicate ? `AND ${translatePredicate(ctx.predicate)}` : ''}
    ) ranked
    WHERE rn = 1
  )`.trim(),

  // maxldv() returns separate _val and _dt columns for the row with MAX value
  fetchMaxldv: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid,
           ${resolveProperty(ctx.property)} AS ${ctx.assignedVariable}_val,
           dt AS ${ctx.assignedVariable}_dt
    FROM (
      SELECT eid, ${resolveProperty(ctx.property)}, dt,
             ROW_NUMBER() OVER (PARTITION BY eid ORDER BY ${resolveProperty(ctx.property, 'numeric')} DESC, dt DESC) AS rn
      FROM ${ctx.table}
      WHERE ${buildAttributeFilter(ctx.attributeList)}
      ${ctx.predicate ? `AND ${translatePredicate(ctx.predicate)}` : ''}
    ) ranked
    WHERE rn = 1
  )`.trim(),

  // minldv() returns separate _val and _dt columns for the row with MIN value
  fetchMinldv: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid,
           ${resolveProperty(ctx.property)} AS ${ctx.assignedVariable}_val,
           dt AS ${ctx.assignedVariable}_dt
    FROM (
      SELECT eid, ${resolveProperty(ctx.property)}, dt,
             ROW_NUMBER() OVER (PARTITION BY eid ORDER BY ${resolveProperty(ctx.property, 'numeric')} ASC, dt DESC) AS rn
      FROM ${ctx.table}
      WHERE ${buildAttributeFilter(ctx.attributeList)}
      ${ctx.predicate ? `AND ${translatePredicate(ctx.predicate)}` : ''}
    ) ranked
    WHERE rn = 1
  )`.trim(),

  // ========== String Functions ==========

  fetchSerialize: (ctx: FetchContext) => {
    const delimiter = ctx.functionParams?.[0] ? ctx.functionParams[0].replace(/['"]/g, '') : ',';
    return `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, STRING_AGG(${resolveProperty(ctx.property)}, '${delimiter}' ORDER BY dt) AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE ${buildAttributeFilter(ctx.attributeList)}
    ${ctx.predicate ? `AND ${translatePredicate(ctx.predicate)}` : ''}
    GROUP BY eid
  )`.trim();
  },

  fetchSerializedv: (ctx: FetchContext) => {
    const delimiter = ctx.functionParams?.[0] ? ctx.functionParams[0].replace(/['"]/g, '') : ',';
    return `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid,
           STRING_AGG(${resolveProperty(ctx.property)} || '~' || to_char(dt, 'YYYY-MM-DD'), '${delimiter}' ORDER BY dt) AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE ${buildAttributeFilter(ctx.attributeList)}
    ${ctx.predicate ? `AND ${translatePredicate(ctx.predicate)}` : ''}
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
        return "to_char(dt, 'YYYY-MM-DD')";
      } else {
        // Cast to text for PostgreSQL string concatenation
        return `(${part})::text`;
      }
    });
    formatExpr = sqlParts.join(" || '~' || ");
    formatExpr = translateFunctions(formatExpr);
    return `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid,
           STRING_AGG(${formatExpr}, '${delimiter}' ORDER BY dt) AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE ${buildAttributeFilter(ctx.attributeList)}
    ${ctx.predicate ? `AND ${translatePredicate(ctx.predicate)}` : ''}
    GROUP BY eid
  )`.trim();
  },

  // ========== Statistical Functions ==========
  // Note: PostgreSQL doesn't have native REGR_* functions, so we use manual formulas

  fetchRegrSlope: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid,
           CASE
             WHEN COUNT(*) * SUM(x * x) - SUM(x) * SUM(x) = 0 THEN NULL
             ELSE (COUNT(*) * SUM(x * y) - SUM(x) * SUM(y))::numeric /
                  (COUNT(*) * SUM(x * x) - SUM(x) * SUM(x))::numeric
           END AS ${ctx.assignedVariable}
    FROM (
      SELECT eid,
             ${resolveProperty(ctx.property, 'numeric')} AS y,
             EXTRACT(DAY FROM dt - MIN(dt) OVER (PARTITION BY eid))::numeric AS x
      FROM ${ctx.table}
      WHERE ${buildAttributeFilter(ctx.attributeList)}
      ${ctx.predicate ? `AND ${translatePredicate(ctx.predicate)}` : ''}
    ) regression_data
    GROUP BY eid
  )`.trim(),

  fetchRegrIntercept: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid,
           CASE
             WHEN COUNT(*) * SUM(x * x) - SUM(x) * SUM(x) = 0 THEN NULL
             ELSE (SUM(y) * SUM(x * x) - SUM(x) * SUM(x * y))::numeric /
                  (COUNT(*) * SUM(x * x) - SUM(x) * SUM(x))::numeric
           END AS ${ctx.assignedVariable}
    FROM (
      SELECT eid,
             ${resolveProperty(ctx.property, 'numeric')} AS y,
             EXTRACT(DAY FROM dt - MIN(dt) OVER (PARTITION BY eid))::numeric AS x
      FROM ${ctx.table}
      WHERE ${buildAttributeFilter(ctx.attributeList)}
      ${ctx.predicate ? `AND ${translatePredicate(ctx.predicate)}` : ''}
    ) regression_data
    GROUP BY eid
  )`.trim(),

  fetchRegrR2: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid,
           CASE
             WHEN VARIANCE(y) = 0 THEN NULL
             ELSE 1 - (SUM((y - y_pred) * (y - y_pred)) / (COUNT(*) * VARIANCE(y)))::numeric
           END AS ${ctx.assignedVariable}
    FROM (
      SELECT eid, y,
             AVG(y) OVER (PARTITION BY eid) +
             (CASE
               WHEN COUNT(*) OVER (PARTITION BY eid) * SUM(x * x) OVER (PARTITION BY eid) -
                    SUM(x) OVER (PARTITION BY eid) * SUM(x) OVER (PARTITION BY eid) = 0 THEN 0
               ELSE ((COUNT(*) OVER (PARTITION BY eid) * SUM(x * y) OVER (PARTITION BY eid) -
                      SUM(x) OVER (PARTITION BY eid) * SUM(y) OVER (PARTITION BY eid))::numeric /
                     (COUNT(*) OVER (PARTITION BY eid) * SUM(x * x) OVER (PARTITION BY eid) -
                      SUM(x) OVER (PARTITION BY eid) * SUM(x) OVER (PARTITION BY eid))::numeric)
             END) * (x - AVG(x) OVER (PARTITION BY eid)) AS y_pred
      FROM (
        SELECT eid,
               ${resolveProperty(ctx.property, 'numeric')} AS y,
               EXTRACT(DAY FROM dt - MIN(dt) OVER (PARTITION BY eid))::numeric AS x
        FROM ${ctx.table}
        WHERE ${buildAttributeFilter(ctx.attributeList)}
        ${ctx.predicate ? `AND ${translatePredicate(ctx.predicate)}` : ''}
      ) regression_data
    ) predictions
    GROUP BY eid
  )`.trim(),

  // ========== Existence Function ==========

  fetchExists: (ctx: FetchContext) => `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid,
           CASE WHEN COUNT(*) > 0 THEN 1 ELSE 0 END AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE ${buildAttributeFilter(ctx.attributeList)}
    ${ctx.predicate ? `AND ${translatePredicate(ctx.predicate)}` : ''}
    GROUP BY eid
  )`.trim(),

  // ========== Statistical Mode Function ==========
  // stats_mode() returns the most frequent value per patient

  fetchStatsMode: (ctx: FetchContext) => {
    if (ctx.previousVariables && ctx.previousVariables.length > 0) {
      const joins = ctx.previousVariables.map(v => `LEFT JOIN SQ_${v.toUpperCase()} USING (eid)`).join('\n    ');
      return `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, ${resolveProperty(ctx.property)} AS ${ctx.assignedVariable}
    FROM (
      SELECT base.eid, e.${resolveProperty(ctx.property)},
             ROW_NUMBER() OVER (PARTITION BY base.eid ORDER BY COUNT(*) OVER (PARTITION BY base.eid, e.${resolveProperty(ctx.property)}) DESC, e.${resolveProperty(ctx.property)}) AS rn
      FROM UEADV base
      ${joins}
      LEFT JOIN ${ctx.table} e ON e.eid = base.eid
        AND ${buildAttributeFilter(ctx.attributeList).replace(/att/g, 'e.att')}
        ${ctx.predicate ? `AND ${translatePredicate(ctx.predicate).replace(/\bdt\b/g, 'e.dt').replace(/\bval\b/g, 'e.val').replace(/\bloc\b/g, 'e.loc')}` : ''}
    ) ranked
    WHERE rn = 1
  )`.trim();
    }
    return `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, ${resolveProperty(ctx.property)} AS ${ctx.assignedVariable}
    FROM (
      SELECT eid, ${resolveProperty(ctx.property)},
             ROW_NUMBER() OVER (PARTITION BY eid ORDER BY cnt DESC, ${resolveProperty(ctx.property)}) AS rn
      FROM (
        SELECT eid, ${resolveProperty(ctx.property)}, COUNT(*) AS cnt
        FROM ${ctx.table}
        WHERE ${buildAttributeFilter(ctx.attributeList)}
        ${ctx.predicate ? `AND ${translatePredicate(ctx.predicate)}` : ''}
        GROUP BY eid, ${resolveProperty(ctx.property)}
      ) counts
    ) ranked
    WHERE rn = 1
  )`.trim();
  },

  // ========== Minimum First Date-Value Function ==========
  // minfdv() returns _val and _dt columns for the minimum value with its FIRST date of occurrence

  fetchMinfdv: (ctx: FetchContext) => {
    if (ctx.previousVariables && ctx.previousVariables.length > 0) {
      const joins = ctx.previousVariables.map(v => `LEFT JOIN SQ_${v.toUpperCase()} USING (eid)`).join('\n    ');
      return `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid,
           ${resolveProperty(ctx.property)} AS ${ctx.assignedVariable}_val,
           dt AS ${ctx.assignedVariable}_dt
    FROM (
      SELECT base.eid, e.${resolveProperty(ctx.property)}, e.dt,
             ROW_NUMBER() OVER (PARTITION BY base.eid ORDER BY e.${resolveProperty(ctx.property, 'numeric')} ASC, e.dt ASC) AS rn
      FROM UEADV base
      ${joins}
      LEFT JOIN ${ctx.table} e ON e.eid = base.eid
        AND ${buildAttributeFilter(ctx.attributeList).replace(/att/g, 'e.att')}
        ${ctx.predicate ? `AND ${translatePredicate(ctx.predicate).replace(/\bdt\b/g, 'e.dt').replace(/\bval\b/g, 'e.val')}` : ''}
    ) ranked
    WHERE rn = 1
  )`.trim();
    }
    return `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid,
           ${resolveProperty(ctx.property)} AS ${ctx.assignedVariable}_val,
           dt AS ${ctx.assignedVariable}_dt
    FROM (
      SELECT eid, ${resolveProperty(ctx.property)}, dt,
             ROW_NUMBER() OVER (PARTITION BY eid ORDER BY ${resolveProperty(ctx.property, 'numeric')} ASC, dt ASC) AS rn
      FROM ${ctx.table}
      WHERE ${buildAttributeFilter(ctx.attributeList)}
      ${ctx.predicate ? `AND ${translatePredicate(ctx.predicate)}` : ''}
    ) ranked
    WHERE rn = 1
  )`.trim();
  },

  // ========== Extended Serialization Function ==========
  // serialize2() is like serialize but may use different delimiter or encoding

  fetchSerialize2: (ctx: FetchContext) => {
    const delimiter = ctx.functionParams?.[0] ? ctx.functionParams[0].replace(/['"]/g, '') : ',';
    return `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid, STRING_AGG(${resolveProperty(ctx.property)}::text, '${delimiter}' ORDER BY dt) AS ${ctx.assignedVariable}
    FROM ${ctx.table}
    WHERE ${buildAttributeFilter(ctx.attributeList)}
    ${ctx.predicate ? `AND ${translatePredicate(ctx.predicate)}` : ''}
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
        ${ctx.predicate ? `AND ${translatePredicate(ctx.predicate)}` : ''}
      ) deltas
      WHERE delta < 0
    ) ranked
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
             EXTRACT(DAY FROM dt - LAG(dt) OVER (PARTITION BY eid ORDER BY dt))::numeric AS interval_days
      FROM ${ctx.table}
      WHERE ${buildAttributeFilter(ctx.attributeList)}
      ${ctx.predicate ? `AND ${translatePredicate(ctx.predicate)}` : ''}
    ) intervals
    WHERE interval_days IS NOT NULL
    GROUP BY eid
  )`.trim(),

  // ========== Compute Statement ==========

  compute: (ctx: ComputeContext) => {
    // Build FROM clause with JOINs for dependent variables
    const prevVars = ctx.previousVariables || [];
    let fromClause = 'FROM UEADV';
    if (prevVars.length > 0) {
      fromClause += '\n' + prevVars.map(v =>
        `    LEFT JOIN SQ_${v.toUpperCase()} USING (eid)`
      ).join('\n');
    }

    return `
  SQ_${ctx.assignedVariable.toUpperCase()} AS (
    SELECT eid,
           CASE
${ctx.conditions.map(c =>
  c.predicate
    ? `           WHEN ${translateOperators(c.predicate)} THEN ${translateFunctions(c.returnValue)}`
    : `           ELSE ${translateFunctions(c.returnValue)}`
).join('\n')}
           END AS ${ctx.assignedVariable}
    ${fromClause}
  )`.trim();
  },

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
-- SQL Dialect: PostgreSQL
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
    currentDate: () => 'CURRENT_DATE',

    dateAdd: (column: string, days: number) => {
      if (days >= 0) {
        return `${column} + INTERval '${days} days'`;
      } else {
        return `${column} - INTERval '${Math.abs(days)} days'`;
      }
    },

    dateDiff: (startCol: string, endCol: string, unit: 'DAY' | 'MONTH' | 'YEAR') => {
      switch (unit) {
        case 'DAY':
          return `EXTRACT(DAY FROM ${endCol}::timestamp - ${startCol}::timestamp)`;
        case 'MONTH':
          return `(EXTRACT(YEAR FROM ${endCol}) - EXTRACT(YEAR FROM ${startCol})) * 12 + ` +
                 `(EXTRACT(MONTH FROM ${endCol}) - EXTRACT(MONTH FROM ${startCol}))`;
        case 'YEAR':
          return `EXTRACT(YEAR FROM ${endCol}) - EXTRACT(YEAR FROM ${startCol})`;
        default:
          return `EXTRACT(DAY FROM ${endCol}::timestamp - ${startCol}::timestamp)`;
      }
    },

    stringAgg: (column: string, delimiter: string, orderBy?: string) =>
      `STRING_AGG(${column}, '${delimiter}' ORDER BY ${orderBy || 'dt'})`,

    coalesce: (...columns: string[]) =>
      `COALESCE(${columns.join(', ')})`,

    nullIf: (col1: string, col2: string) =>
      `NULLIF(${col1}, ${col2})`,
  },
};
