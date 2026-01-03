import type { SqlTemplates, FetchContext, ComputeContext, BindContext, VariableMetadata } from './template-interface';

/**
 * SQL Server T-SQL Templates (Temporary Table Architecture)
 *
 * This implementation matches the Python picodomain approach:
 * - Uses temporary tables (#SQ_varname) instead of CTEs
 * - Creates primary key indexes for efficient joins
 * - Uses SELECT INTO pattern for output
 *
 * Key differences from Oracle:
 * - Subqueries require aliases
 * - GETDATE() instead of SYSDATE
 * - DATEADD/DATEDIFF for date arithmetic
 * - STRING_AGG instead of LISTAGG
 * - Uses temporary tables (#) for better memory management
 */

/**
 * Helper to resolve property wildcards and apply type casting
 * In Picorules, '_' means "use val column"
 */
function resolveProperty(property: string, cast?: 'numeric' | 'varchar'): string {
  const resolved = property === '_' ? 'val' : property;
  if (cast === 'numeric') {
    return `CAST(${resolved} AS FLOAT)`;
  }
  if (cast === 'varchar') {
    return `CAST(${resolved} AS VARCHAR(1000))`;
  }
  return resolved;
}

/**
 * Split function arguments by comma, respecting nested parentheses
 */
function splitFunctionArgs(argsString: string): string[] {
  const args: string[] = [];
  let current = '';
  let depth = 0;

  for (const char of argsString) {
    if (char === '(') {
      depth++;
      current += char;
    } else if (char === ')') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    args.push(current.trim());
  }

  return args;
}

/**
 * Extract balanced parenthesis content after a function name
 */
function extractBalancedArgs(str: string, funcName: string): { args: string; rest: string; fullMatch: string } | null {
  const pattern = new RegExp(`\\b${funcName}\\s*\\(`, 'i');
  const match = str.match(pattern);
  if (!match || match.index === undefined) return null;

  const startIdx = match.index + match[0].length;
  let depth = 1;
  let idx = startIdx;

  while (idx < str.length && depth > 0) {
    if (str[idx] === '(') depth++;
    else if (str[idx] === ')') depth--;
    idx++;
  }

  if (depth !== 0) return null;

  return {
    args: str.slice(startIdx, idx - 1),
    rest: str.slice(idx),
    fullMatch: str.slice(match.index, idx)
  };
}

/**
 * Replace all occurrences of a function with balanced parenthesis handling
 */
function replaceBalancedFunction(str: string, funcName: string, replacer: (args: string) => string): string {
  let result = str;
  let safety = 0;

  while (safety++ < 100) {
    const extracted = extractBalancedArgs(result, funcName);
    if (!extracted) break;

    const replacement = replacer(extracted.args);
    result = result.replace(extracted.fullMatch, replacement);
  }

  return result;
}

/**
 * Translate date arithmetic expressions to SQL Server DATEADD
 */
function translateDateArithmetic(expr: string): string {
  let result = expr;
  // Handle sysdate-N patterns
  result = result.replace(/\bsysdate\s*-\s*(\d+)/gi,
    (_match, days) => `DATEADD(DAY, -${days}, CAST(GETDATE() AS DATE))`
  );
  result = result.replace(/\bsysdate\s*\+\s*(\d+)/gi,
    (_match, days) => `DATEADD(DAY, ${days}, CAST(GETDATE() AS DATE))`
  );
  // Handle date variable patterns like "hd_dt", "pd_dt_min", "tx_dt_max", etc.
  result = result.replace(/\b(dt|[a-z_]+(?:_dt|_dt_min|_dt_max|_fd|_ld))\s*-\s*(\d+)/gi,
    (_match, dateExpr, days) => `DATEADD(DAY, -${days}, ${dateExpr})`
  );
  result = result.replace(/\b(dt|[a-z_]+(?:_dt|_dt_min|_dt_max|_fd|_ld))\s*\+\s*(\d+)/gi,
    (_match, dateExpr, days) => `DATEADD(DAY, ${days}, ${dateExpr})`
  );
  return result;
}

/**
 * Translate Picorules helper functions to SQL Server T-SQL
 */
function translateFunctions(expression: string): string {
  if (!expression) return expression;

  let result = expression;

  // Backticks to single quotes: Picorules uses `string` for string literals
  // MSSQL uses 'string' (same as PostgreSQL)
  result = result.replace(/`([^`]*)`/g, "'$1'");

  // EXTRACT(YEAR FROM date) → DATEPART(YEAR, date) or YEAR(date)
  result = result.replace(/\bEXTRACT\s*\(\s*(YEAR|MONTH|DAY|HOUR|MINUTE|SECOND)\s+FROM\s+([^)]+)\)/gi,
    (_match, part, dateExpr) => `DATEPART(${part.toUpperCase()}, ${dateExpr})`
  );

  // Oracle nvl(a, b) → SQL Server ISNULL(a, b) or COALESCE(a, b)
  result = result.replace(/\bnvl\s*\(/gi, 'ISNULL(');

  // Oracle to_number(x) → SQL Server CAST(x AS FLOAT)
  // Use balanced parenthesis matching to handle nested functions like to_number(substr(loc,2,2))
  result = replaceBalancedFunction(result, 'to_number', (args) => `CAST(${args} AS FLOAT)`);

  // ceil(x) → SQL Server CEILING(x)
  result = result.replace(/\bceil\s*\(/gi, 'CEILING(');

  // Oracle to_char(num) without format → SQL Server CAST(num AS VARCHAR)
  // Preserve to_char with two arguments (date formatting)
  result = result.replace(/\bto_char\s*\(([^,)]+),\s*('[^']+')\)/gi, 'FORMAT($1, $2)');
  result = result.replace(/\bto_char\s*\(([^,)]+)\)/gi, 'CAST($1 AS VARCHAR(100))');

  // Oracle substr with negative index → SQL Server RIGHT function
  // substr(str, -n) means "last n characters"
  // Use balanced parenthesis matching to handle nested functions like substr(coalesce(a,b), -12)
  result = replaceBalancedFunction(result, 'substr', (args) => {
    // Check if this is a 2-arg call with negative second arg
    const parts = splitFunctionArgs(args);
    if (parts.length === 2) {
      const secondArg = parts[1].trim();
      const negMatch = secondArg.match(/^-(\d+)$/);
      if (negMatch) {
        const len = parseInt(negMatch[1]);
        return `RIGHT(CAST(${parts[0]} AS VARCHAR(1000)), ${len})`;
      }
      // 2-arg with positive index: substr(str, n) -> from position n to end
      const posMatch = secondArg.match(/^(\d+)$/);
      if (posMatch) {
        const start = parseInt(posMatch[1]);
        return `SUBSTRING(${parts[0]}, ${start}, LEN(CAST(${parts[0]} AS VARCHAR(1000))) - ${start - 1})`;
      }
    }
    // 3-arg substr -> SUBSTRING with 3 args
    if (parts.length === 3) {
      return `SUBSTRING(${parts[0]}, ${parts[1]}, ${parts[2]})`;
    }
    // Fallback: just wrap in SUBSTRING
    return `SUBSTRING(${args})`;
  });

  // Note: The substr handler above using replaceBalancedFunction handles all substr cases:
  // - 2-arg with negative index: substr(str, -n) → RIGHT(str, n)
  // - 2-arg with positive index: substr(str, n) → SUBSTRING(str, n, LEN(str) - n + 1)
  // - 3-arg: substr(str, start, len) → SUBSTRING(str, start, len)

  // Oracle sysdate → SQL Server GETDATE()
  // Handle sysdate-N and sysdate+N patterns FIRST
  result = result.replace(/\bsysdate\s*-\s*(\d+)/gi,
    (_match, days) => `DATEADD(DAY, -${days}, GETDATE())`
  );
  result = result.replace(/\bsysdate\s*\+\s*(\d+)/gi,
    (_match, days) => `DATEADD(DAY, ${days}, GETDATE())`
  );
  // Handle sysdate - date_variable → DATEDIFF(DAY, date_variable, GETDATE())
  // This calculates the number of days between the variable and today
  // First handle variables that end in common date suffixes
  result = result.replace(/\bsysdate\s*-\s*([a-z_]+(?:_dt|_dt_min|_dt_max|_fd|_ld))/gi,
    (_match, dateVar) => `DATEDIFF(DAY, ${dateVar}, GETDATE())`
  );
  // Handle common date column names like 'dob', 'dod', 'dt'
  result = result.replace(/\bsysdate\s*-\s*(dob|dod|dt)\b/gi,
    (_match, dateVar) => `DATEDIFF(DAY, ${dateVar}, GETDATE())`
  );
  // Handle any remaining sysdate - identifier patterns
  // (this is more aggressive but needed for edge cases)
  result = result.replace(/\bsysdate\s*-\s*([a-z][a-z0-9_]*)/gi,
    (_match, dateVar) => `DATEDIFF(DAY, ${dateVar}, GETDATE())`
  );
  // Then handle standalone sysdate
  result = result.replace(/\bsysdate\b/gi, 'GETDATE()');

  // Date arithmetic for CAST expressions
  result = result.replace(/(CAST\s*\([^)]+\s+AS\s+DATE\s*\))\s*-\s*(\d+)/gi,
    (_match, dateExpr, days) => `DATEADD(DAY, -${days}, ${dateExpr})`
  );
  result = result.replace(/(CAST\s*\([^)]+\s+AS\s+DATE\s*\))\s*\+\s*(\d+)/gi,
    (_match, dateExpr, days) => `DATEADD(DAY, ${days}, ${dateExpr})`
  );
  // Date subtraction: date1 - date2 => DATEDIFF(DAY, date2, date1)
  // Must be processed BEFORE date +/- number patterns
  // Handles: acr_l_dt - acr_f_dt, dt - other_dt, etc.
  result = result.replace(/\b(dt|[a-z_]+(?:_dt|_dt_min|_dt_max|_fd|_ld))\s*-\s*(dt|[a-z_]+(?:_dt|_dt_min|_dt_max|_fd|_ld))\b/gi,
    (_match, date1, date2) => `DATEDIFF(DAY, ${date2}, ${date1})`
  );

  // Date arithmetic: handles patterns like "dt-30", "hd_dt + 90", "pd_dt_min + 90"
  // Variable names that end with date-related suffixes
  result = result.replace(/\b(dt|[a-z_]+(?:_dt|_dt_min|_dt_max|_fd|_ld))\s*-\s*(\d+)/gi,
    (_match, dateExpr, days) => `DATEADD(DAY, -${days}, ${dateExpr})`
  );
  result = result.replace(/\b(dt|[a-z_]+(?:_dt|_dt_min|_dt_max|_fd|_ld))\s*\+\s*(\d+)/gi,
    (_match, dateExpr, days) => `DATEADD(DAY, ${days}, ${dateExpr})`
  );

  // least_date(a, b, ...) - Returns MIN of non-NULL dates
  result = replaceBalancedFunction(result, 'least_date', (args) => {
    const argList = splitFunctionArgs(args).map((a: string) => translateDateArithmetic(a.trim()));
    const valuesClause = argList.map((arg: string) => `(${arg})`).join(', ');
    return `(SELECT MIN(x) FROM (VALUES ${valuesClause}) AS T(x) WHERE X IS NOT NULL)`;
  });

  // greatest_date(a, b, ...) - Returns MAX of non-NULL dates
  result = replaceBalancedFunction(result, 'greatest_date', (args) => {
    const argList = splitFunctionArgs(args).map((a: string) => translateDateArithmetic(a.trim()));
    const valuesClause = argList.map((arg: string) => `(${arg})`).join(', ');
    return `(SELECT MAX(x) FROM (VALUES ${valuesClause}) AS T(x) WHERE x IS NOT NULL)`;
  });

  // least(a, b, ...) - Returns MIN (returns NULL if ANY parameter is NULL)
  result = replaceBalancedFunction(result, 'least', (args) => {
    const argList = splitFunctionArgs(args).map((a: string) => translateDateArithmetic(a.trim()));
    const nullChecks = argList.map((arg: string) => `(${arg}) is null`).join(' or ');
    const valuesClause = argList.map((arg: string) => `(${arg})`).join(', ');
    return `(CASE WHEN (${nullChecks}) THEN NULL ELSE (SELECT MIN(x) FROM (VALUES ${valuesClause}) AS T(x)) END)`;
  });

  // greatest(a, b, ...) - Returns MAX (returns NULL if ANY parameter is NULL)
  result = replaceBalancedFunction(result, 'greatest', (args) => {
    const argList = splitFunctionArgs(args).map((a: string) => translateDateArithmetic(a.trim()));
    const nullChecks = argList.map((arg: string) => `(${arg}) is null`).join(' or ');
    const valuesClause = argList.map((arg: string) => `(${arg})`).join(', ');
    return `(CASE WHEN (${nullChecks}) THEN NULL ELSE (SELECT MAX(x) FROM (VALUES ${valuesClause}) AS T(x)) END)`;
  });

  // System constants
  result = result.replace(/\blower__bound__dt\b/gi, "CAST('0001-01-01' AS DATE)");
  result = result.replace(/\bupper__bound__dt\b/gi, "CAST('9999-12-31' AS DATE)");

  return result;
}

/**
 * Build WHERE clause filter for attribute matching
 * Supports wildcards (%) and multiple attributes
 */
function buildAttributeFilter(attributeList: string[], useEscape: boolean = false): string {
  if (attributeList.length === 0) {
    throw new Error('attributeList cannot be empty');
  }

  const conditions = attributeList.map(attr => {
    const hasWildcard = attr.includes('%');
    if (hasWildcard) {
      // Escape underscores in LIKE patterns (SQL Server uses backslash)
      const escaped = attr.replace(/_/g, '\\_');
      return useEscape ? `ATT LIKE '${escaped}' ESCAPE '\\'` : `ATT LIKE '${escaped}' ESCAPE '\\'`;
    } else {
      return `ATT = '${attr}'`;
    }
  });

  if (conditions.length === 1) {
    return `(${conditions[0]})`;
  } else {
    return `(${conditions.join(' OR ')})`;
  }
}

/**
 * Translate Picorules operators to SQL Server T-SQL
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
  result = result.replace(/\)(\s*)!\?/g, ') IS NOT NULL');
  result = result.replace(/(\w+)(\s*)!\?/g, '$1 IS NOT NULL');

  // IS NULL: Handle both simple variable? and expression)? patterns
  result = result.replace(/\)(\s*)\?(?!!)/g, ') IS NULL');
  result = result.replace(/(\w+)(\s*)\?(?!!)/g, '$1 IS NULL');

  return result;
}

/**
 * Translate fetch statement predicates
 */
function translatePredicate(predicate: string): string {
  if (!predicate) return predicate;
  return translateFunctions(predicate);
}

// ========== TEMPORARY TABLE GENERATORS ==========
// These functions generate SQL statements that create temporary tables
// instead of CTEs, matching the Python picodomain approach

/**
 * Generate temp table drop + create block for fetch statements (last/first)
 */
function fetchWindowTempTable(ctx: FetchContext, orderDir: 'DESC' | 'ASC'): string {
  const tableName = `#SQ_${ctx.assignedVariable}`;
  const prop = resolveProperty(ctx.property);
  const prevVars = ctx.previousVariables || [];

  // Build join clauses for dependent variables
  const dependencyJoins = prevVars.map(v =>
    `    LEFT OUTER JOIN #SQ_${v} ON #SQ_${v}.eid = #UEADV.eid`
  ).join('\n');

  // Check if predicate references previous variables
  const hasDependencies = prevVars.length > 0;

  if (hasDependencies) {
    // Complex case: predicate references other variables
    return `
DROP TABLE IF EXISTS ${tableName};

SELECT
    eid,
    ${prop} AS ${ctx.assignedVariable}
INTO
    ${tableName}
FROM
    (
    SELECT
        #UEADV.eid,
        ${prop},
        ROW_NUMBER()
    OVER
        (
        PARTITION BY
            #UEADV.eid
        ORDER BY
            dt ${orderDir}, att ASC, val ASC
        ) AS RANK
    FROM
            #UEADV
${dependencyJoins}
            LEFT OUTER JOIN eadv ON eadv.eid = #UEADV.eid
    WHERE (1=1)
        AND ${buildAttributeFilter(ctx.attributeList, true)}
        ${ctx.predicate ? `AND (${translatePredicate(ctx.predicate)})` : ''}
    ) SQ_${ctx.assignedVariable}_WINDOW
WHERE
    RANK = 1
;

ALTER TABLE ${tableName} ADD PRIMARY KEY (eid);`.trim();
  }

  // Simple case: no dependencies on other variables
  return `
DROP TABLE IF EXISTS ${tableName};

SELECT
    eid,
    ${prop} AS ${ctx.assignedVariable}
INTO
    ${tableName}
FROM
    (
    SELECT
        eadv.eid,
        ${prop},
        ROW_NUMBER()
    OVER
        (
        PARTITION BY
            eadv.eid
        ORDER BY
            dt ${orderDir}, att ASC, val ASC
        ) AS RANK
    FROM
            eadv
    WHERE (1=1)
        AND ${buildAttributeFilter(ctx.attributeList, true)}
        ${ctx.predicate ? `AND (${translatePredicate(ctx.predicate)})` : ''}
    ) SQ_${ctx.assignedVariable}_WINDOW
WHERE
    RANK = 1
;

ALTER TABLE ${tableName} ADD PRIMARY KEY (eid);`.trim();
}

/**
 * Generate temp table for aggregate fetch statements (count, sum, avg, min, max)
 */
function fetchAggregateTempTable(ctx: FetchContext, aggFunc: string, prop: string): string {
  const tableName = `#SQ_${ctx.assignedVariable}`;
  const prevVars = ctx.previousVariables || [];

  // Build join clauses for dependent variables
  const dependencyJoins = prevVars.map(v =>
    `    LEFT OUTER JOIN #SQ_${v} ON #SQ_${v}.eid = #UEADV.eid`
  ).join('\n');

  const hasDependencies = prevVars.length > 0;

  if (hasDependencies) {
    return `
DROP TABLE IF EXISTS ${tableName};

SELECT
    #UEADV.eid,
    ${aggFunc}(${prop}) AS ${ctx.assignedVariable}
INTO
    ${tableName}
FROM
    #UEADV
${dependencyJoins}
    LEFT OUTER JOIN eadv ON eadv.eid = #UEADV.eid
        AND ${buildAttributeFilter(ctx.attributeList, true)}
        ${ctx.predicate ? `AND (${translatePredicate(ctx.predicate)})` : ''}
GROUP BY
    #UEADV.eid
;

ALTER TABLE ${tableName} ADD PRIMARY KEY (eid);`.trim();
  }

  return `
DROP TABLE IF EXISTS ${tableName};

SELECT
    eadv.eid,
    ${aggFunc}(${prop}) AS ${ctx.assignedVariable}
INTO
    ${tableName}
FROM
    eadv
WHERE (1=1)
    AND ${buildAttributeFilter(ctx.attributeList, true)}
    ${ctx.predicate ? `AND (${translatePredicate(ctx.predicate)})` : ''}
GROUP BY
    eadv.eid
;

ALTER TABLE ${tableName} ADD PRIMARY KEY (eid);`.trim();
}

export const mssqlTemplates: SqlTemplates = {
  fetchLast: (ctx: FetchContext) => fetchWindowTempTable(ctx, 'DESC'),

  fetchFirst: (ctx: FetchContext) => fetchWindowTempTable(ctx, 'ASC'),

  fetchCount: (ctx: FetchContext) => fetchAggregateTempTable(ctx, 'COUNT', resolveProperty(ctx.property)),

  // ========== Aggregation Functions ==========

  fetchSum: (ctx: FetchContext) => fetchAggregateTempTable(ctx, 'SUM', resolveProperty(ctx.property, 'numeric')),

  fetchAvg: (ctx: FetchContext) => fetchAggregateTempTable(ctx, 'AVG', resolveProperty(ctx.property, 'numeric')),

  fetchMin: (ctx: FetchContext) => {
    const prop = ctx.property === 'dt' ? 'dt' : resolveProperty(ctx.property, 'numeric');
    return fetchAggregateTempTable(ctx, 'MIN', prop);
  },

  fetchMax: (ctx: FetchContext) => {
    const prop = ctx.property === 'dt' ? 'dt' : resolveProperty(ctx.property, 'numeric');
    return fetchAggregateTempTable(ctx, 'MAX', prop);
  },

  fetchMedian: (ctx: FetchContext) => {
    const tableName = `#SQ_${ctx.assignedVariable}`;
    const prop = resolveProperty(ctx.property, 'numeric');
    return `
DROP TABLE IF EXISTS ${tableName};

SELECT DISTINCT
    eadv.eid,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${prop})
    OVER (PARTITION BY eadv.eid) AS ${ctx.assignedVariable}
INTO
    ${tableName}
FROM
    eadv
WHERE (1=1)
    AND ${buildAttributeFilter(ctx.attributeList, true)}
    ${ctx.predicate ? `AND (${translatePredicate(ctx.predicate)})` : ''}
;

ALTER TABLE ${tableName} ADD PRIMARY KEY (eid);`.trim();
  },

  fetchDistinctCount: (ctx: FetchContext) => {
    const tableName = `#SQ_${ctx.assignedVariable}`;
    const prop = resolveProperty(ctx.property);
    return `
DROP TABLE IF EXISTS ${tableName};

SELECT
    eadv.eid,
    COUNT(DISTINCT ${prop}) AS ${ctx.assignedVariable}
INTO
    ${tableName}
FROM
    eadv
WHERE (1=1)
    AND ${buildAttributeFilter(ctx.attributeList, true)}
    ${ctx.predicate ? `AND (${translatePredicate(ctx.predicate)})` : ''}
GROUP BY
    eadv.eid
;

ALTER TABLE ${tableName} ADD PRIMARY KEY (eid);`.trim();
  },

  // ========== Window Functions ==========

  fetchNth: (ctx: FetchContext) => {
    const tableName = `#SQ_${ctx.assignedVariable}`;
    const n = ctx.functionParams?.[0] || '1';
    const prop = resolveProperty(ctx.property);
    return `
DROP TABLE IF EXISTS ${tableName};

SELECT
    eid,
    ${prop} AS ${ctx.assignedVariable}
INTO
    ${tableName}
FROM
    (
    SELECT
        eadv.eid,
        ${prop},
        ROW_NUMBER()
    OVER
        (
        PARTITION BY
            eadv.eid
        ORDER BY
            dt DESC, att ASC, val ASC
        ) AS RANK
    FROM
            eadv
    WHERE (1=1)
        AND ${buildAttributeFilter(ctx.attributeList, true)}
        ${ctx.predicate ? `AND (${translatePredicate(ctx.predicate)})` : ''}
    ) SQ_${ctx.assignedVariable}_WINDOW
WHERE
    RANK = ${n}
;

ALTER TABLE ${tableName} ADD PRIMARY KEY (eid);`.trim();
  },

  // lastdv() returns separate _val and _dt columns for the last record by date
  fetchLastdv: (ctx: FetchContext) => {
    const tableName = `#SQ_${ctx.assignedVariable}`;
    const prop = resolveProperty(ctx.property);
    return `
DROP TABLE IF EXISTS ${tableName};

SELECT
    eid,
    ${prop} AS ${ctx.assignedVariable}_val,
    dt AS ${ctx.assignedVariable}_dt
INTO
    ${tableName}
FROM
    (
    SELECT
        eadv.eid,
        ${prop},
        dt,
        ROW_NUMBER()
    OVER
        (
        PARTITION BY
            eadv.eid
        ORDER BY
            dt DESC, att ASC, val ASC
        ) AS RANK
    FROM
            eadv
    WHERE (1=1)
        AND ${buildAttributeFilter(ctx.attributeList, true)}
        ${ctx.predicate ? `AND (${translatePredicate(ctx.predicate)})` : ''}
    ) SQ_${ctx.assignedVariable}_WINDOW
WHERE
    RANK = 1
;

ALTER TABLE ${tableName} ADD PRIMARY KEY (eid);`.trim();
  },

  // firstdv() returns separate _val and _dt columns for the first record by date
  fetchFirstdv: (ctx: FetchContext) => {
    const tableName = `#SQ_${ctx.assignedVariable}`;
    const prop = resolveProperty(ctx.property);
    return `
DROP TABLE IF EXISTS ${tableName};

SELECT
    eid,
    ${prop} AS ${ctx.assignedVariable}_val,
    dt AS ${ctx.assignedVariable}_dt
INTO
    ${tableName}
FROM
    (
    SELECT
        eadv.eid,
        ${prop},
        dt,
        ROW_NUMBER()
    OVER
        (
        PARTITION BY
            eadv.eid
        ORDER BY
            dt ASC, att ASC, val ASC
        ) AS RANK
    FROM
            eadv
    WHERE (1=1)
        AND ${buildAttributeFilter(ctx.attributeList, true)}
        ${ctx.predicate ? `AND (${translatePredicate(ctx.predicate)})` : ''}
    ) SQ_${ctx.assignedVariable}_WINDOW
WHERE
    RANK = 1
;

ALTER TABLE ${tableName} ADD PRIMARY KEY (eid);`.trim();
  },

  // maxldv() returns separate _val and _dt columns for the row with MAX value
  fetchMaxldv: (ctx: FetchContext) => {
    const tableName = `#SQ_${ctx.assignedVariable}`;
    const prop = resolveProperty(ctx.property);
    const propNumeric = resolveProperty(ctx.property, 'numeric');
    return `
DROP TABLE IF EXISTS ${tableName};

SELECT
    eid,
    ${prop} AS ${ctx.assignedVariable}_val,
    dt AS ${ctx.assignedVariable}_dt
INTO
    ${tableName}
FROM
    (
    SELECT
        eadv.eid,
        ${prop},
        dt,
        ROW_NUMBER()
    OVER
        (
        PARTITION BY
            eadv.eid
        ORDER BY
            ${propNumeric} DESC, dt DESC, att ASC
        ) AS RANK
    FROM
            eadv
    WHERE (1=1)
        AND ${buildAttributeFilter(ctx.attributeList, true)}
        ${ctx.predicate ? `AND (${translatePredicate(ctx.predicate)})` : ''}
    ) SQ_${ctx.assignedVariable}_WINDOW
WHERE
    RANK = 1
;

ALTER TABLE ${tableName} ADD PRIMARY KEY (eid);`.trim();
  },

  // minldv() returns separate _val and _dt columns for the row with MIN value
  fetchMinldv: (ctx: FetchContext) => {
    const tableName = `#SQ_${ctx.assignedVariable}`;
    const prop = resolveProperty(ctx.property);
    const propNumeric = resolveProperty(ctx.property, 'numeric');
    return `
DROP TABLE IF EXISTS ${tableName};

SELECT
    eid,
    ${prop} AS ${ctx.assignedVariable}_val,
    dt AS ${ctx.assignedVariable}_dt
INTO
    ${tableName}
FROM
    (
    SELECT
        eadv.eid,
        ${prop},
        dt,
        ROW_NUMBER()
    OVER
        (
        PARTITION BY
            eadv.eid
        ORDER BY
            ${propNumeric} ASC, dt DESC, att ASC
        ) AS RANK
    FROM
            eadv
    WHERE (1=1)
        AND ${buildAttributeFilter(ctx.attributeList, true)}
        ${ctx.predicate ? `AND (${translatePredicate(ctx.predicate)})` : ''}
    ) SQ_${ctx.assignedVariable}_WINDOW
WHERE
    RANK = 1
;

ALTER TABLE ${tableName} ADD PRIMARY KEY (eid);`.trim();
  },

  // ========== String Functions ==========

  fetchSerialize: (ctx: FetchContext) => {
    const tableName = `#SQ_${ctx.assignedVariable}`;
    const delimiter = ctx.functionParams?.[0] ? ctx.functionParams[0].replace(/['\"]/g, '') : ',';
    const prop = resolveProperty(ctx.property);
    return `
DROP TABLE IF EXISTS ${tableName};

SELECT
    eadv.eid,
    STRING_AGG(${prop}, '${delimiter}') WITHIN GROUP (ORDER BY dt) AS ${ctx.assignedVariable}
INTO
    ${tableName}
FROM
    eadv
WHERE (1=1)
    AND ${buildAttributeFilter(ctx.attributeList, true)}
    ${ctx.predicate ? `AND (${translatePredicate(ctx.predicate)})` : ''}
GROUP BY
    eadv.eid
;

ALTER TABLE ${tableName} ADD PRIMARY KEY (eid);`.trim();
  },

  fetchSerializedv: (ctx: FetchContext) => {
    const tableName = `#SQ_${ctx.assignedVariable}`;
    const delimiter = ctx.functionParams?.[0] ? ctx.functionParams[0].replace(/['\"]/g, '') : ',';
    const prop = resolveProperty(ctx.property, 'varchar');
    return `
DROP TABLE IF EXISTS ${tableName};

SELECT
    eadv.eid,
    STRING_AGG(${prop} + '~' + CONVERT(VARCHAR, dt, 23), '${delimiter}')
    WITHIN GROUP (ORDER BY dt) AS ${ctx.assignedVariable}
INTO
    ${tableName}
FROM
    eadv
WHERE (1=1)
    AND ${buildAttributeFilter(ctx.attributeList, true)}
    ${ctx.predicate ? `AND (${translatePredicate(ctx.predicate)})` : ''}
GROUP BY
    eadv.eid
;

ALTER TABLE ${tableName} ADD PRIMARY KEY (eid);`.trim();
  },

  // serializedv2(format) - serialize with custom format expression
  // Format can include column references like: round(val,0)~dt
  fetchSerializedv2: (ctx: FetchContext) => {
    const tableName = `#SQ_${ctx.assignedVariable}`;
    const delimiter = ',';
    // The format expression is passed as functionParams[0]
    // e.g., "round(val,0)~dt" needs to be translated to SQL
    let formatExpr = ctx.functionParams?.[0] || 'val';
    // Replace ~ with string concatenation
    // Split by ~ and join with proper SQL concatenation
    const parts = formatExpr.split('~');
    const sqlParts = parts.map(part => {
      part = part.trim();
      if (part === 'dt') {
        return "CONVERT(VARCHAR, dt, 23)";
      } else {
        // Wrap numeric/function expressions in CAST for string concat
        return `CAST(${part} AS VARCHAR(100))`;
      }
    });
    formatExpr = sqlParts.join(" + '~' + ");
    // Translate any other functions
    formatExpr = translateFunctions(formatExpr);
    return `
DROP TABLE IF EXISTS ${tableName};

SELECT
    eadv.eid,
    STRING_AGG(${formatExpr}, '${delimiter}')
    WITHIN GROUP (ORDER BY dt) AS ${ctx.assignedVariable}
INTO
    ${tableName}
FROM
    eadv
WHERE (1=1)
    AND ${buildAttributeFilter(ctx.attributeList, true)}
    ${ctx.predicate ? `AND (${translatePredicate(ctx.predicate)})` : ''}
GROUP BY
    eadv.eid
;

ALTER TABLE ${tableName} ADD PRIMARY KEY (eid);`.trim();
  },

  // ========== Statistical Functions ==========

  fetchRegrSlope: (ctx: FetchContext) => {
    const tableName = `#SQ_${ctx.assignedVariable}`;
    const prop = resolveProperty(ctx.property, 'numeric');
    return `
DROP TABLE IF EXISTS ${tableName};

SELECT
    eid,
    (COUNT(*) * SUM(x * y) - SUM(x) * SUM(y)) /
    NULLIF((COUNT(*) * SUM(x * x) - SUM(x) * SUM(x)), 0) AS ${ctx.assignedVariable}
INTO
    ${tableName}
FROM
    (
    SELECT
        eadv.eid,
        ${prop} AS y,
        DATEDIFF(DAY, MIN(dt) OVER (PARTITION BY eadv.eid), dt) AS x
    FROM
        eadv
    WHERE (1=1)
        AND ${buildAttributeFilter(ctx.attributeList, true)}
        ${ctx.predicate ? `AND (${translatePredicate(ctx.predicate)})` : ''}
    ) AS regression_data
GROUP BY
    eid
;

ALTER TABLE ${tableName} ADD PRIMARY KEY (eid);`.trim();
  },

  fetchRegrIntercept: (ctx: FetchContext) => {
    const tableName = `#SQ_${ctx.assignedVariable}`;
    const prop = resolveProperty(ctx.property, 'numeric');
    return `
DROP TABLE IF EXISTS ${tableName};

SELECT
    eid,
    (SUM(y) - ((COUNT(*) * SUM(x * y) - SUM(x) * SUM(y)) /
    NULLIF((COUNT(*) * SUM(x * x) - SUM(x) * SUM(x)), 0)) * SUM(x)) / COUNT(*) AS ${ctx.assignedVariable}
INTO
    ${tableName}
FROM
    (
    SELECT
        eadv.eid,
        ${prop} AS y,
        DATEDIFF(DAY, MIN(dt) OVER (PARTITION BY eadv.eid), dt) AS x
    FROM
        eadv
    WHERE (1=1)
        AND ${buildAttributeFilter(ctx.attributeList, true)}
        ${ctx.predicate ? `AND (${translatePredicate(ctx.predicate)})` : ''}
    ) AS regression_data
GROUP BY
    eid
;

ALTER TABLE ${tableName} ADD PRIMARY KEY (eid);`.trim();
  },

  fetchRegrR2: (ctx: FetchContext) => {
    const tableName = `#SQ_${ctx.assignedVariable}`;
    const prop = resolveProperty(ctx.property, 'numeric');
    return `
DROP TABLE IF EXISTS ${tableName};

SELECT
    eid,
    POWER(
      (COUNT(*) * SUM(x * y) - SUM(x) * SUM(y)) /
      NULLIF(SQRT((COUNT(*) * SUM(x * x) - SUM(x) * SUM(x)) *
           (COUNT(*) * SUM(y * y) - SUM(y) * SUM(y))), 0),
      2
    ) AS ${ctx.assignedVariable}
INTO
    ${tableName}
FROM
    (
    SELECT
        eadv.eid,
        ${prop} AS y,
        DATEDIFF(DAY, MIN(dt) OVER (PARTITION BY eadv.eid), dt) AS x
    FROM
        eadv
    WHERE (1=1)
        AND ${buildAttributeFilter(ctx.attributeList, true)}
        ${ctx.predicate ? `AND (${translatePredicate(ctx.predicate)})` : ''}
    ) AS regression_data
GROUP BY
    eid
;

ALTER TABLE ${tableName} ADD PRIMARY KEY (eid);`.trim();
  },

  // ========== Existence Function ==========

  fetchExists: (ctx: FetchContext) => {
    const tableName = `#SQ_${ctx.assignedVariable}`;
    return `
DROP TABLE IF EXISTS ${tableName};

SELECT
    eadv.eid,
    CASE WHEN COUNT(*) > 0 THEN 1 ELSE 0 END AS ${ctx.assignedVariable}
INTO
    ${tableName}
FROM
    eadv
WHERE (1=1)
    AND ${buildAttributeFilter(ctx.attributeList, true)}
    ${ctx.predicate ? `AND (${translatePredicate(ctx.predicate)})` : ''}
GROUP BY
    eadv.eid
;

ALTER TABLE ${tableName} ADD PRIMARY KEY (eid);`.trim();
  },

  // ========== Statistical Mode Function ==========
  // stats_mode() returns the most frequent value per patient

  fetchStatsMode: (ctx: FetchContext) => {
    const tableName = `#SQ_${ctx.assignedVariable}`;
    const prevVars = ctx.previousVariables || [];
    const dependencyJoins = prevVars.map(v =>
      `    LEFT OUTER JOIN #SQ_${v} ON #SQ_${v}.eid = #UEADV.eid`
    ).join('\n');

    if (prevVars.length > 0) {
      return `
DROP TABLE IF EXISTS ${tableName};

SELECT
    eid,
    ${resolveProperty(ctx.property)} AS ${ctx.assignedVariable}
INTO
    ${tableName}
FROM
    (
    SELECT
        base.eid,
        e.${resolveProperty(ctx.property)},
        ROW_NUMBER() OVER (
            PARTITION BY base.eid
            ORDER BY COUNT(*) OVER (PARTITION BY base.eid, e.${resolveProperty(ctx.property)}) DESC, e.${resolveProperty(ctx.property)}
        ) AS RANK
    FROM
        #UEADV base
${dependencyJoins}
        LEFT OUTER JOIN eadv e ON e.eid = base.eid
            AND ${buildAttributeFilter(ctx.attributeList, true).replace(/ATT/g, 'e.ATT')}
            ${ctx.predicate ? `AND (${translatePredicate(ctx.predicate).replace(/\bdt\b/gi, 'e.dt').replace(/\bval\b/gi, 'e.val').replace(/\bloc\b/gi, 'e.loc')})` : ''}
    ) SQ_WINDOW
WHERE
    RANK = 1
;

ALTER TABLE ${tableName} ADD PRIMARY KEY (eid);`.trim();
    }

    return `
DROP TABLE IF EXISTS ${tableName};

SELECT
    eid,
    ${resolveProperty(ctx.property)} AS ${ctx.assignedVariable}
INTO
    ${tableName}
FROM
    (
    SELECT
        eid,
        ${resolveProperty(ctx.property)},
        ROW_NUMBER() OVER (PARTITION BY eid ORDER BY cnt DESC, ${resolveProperty(ctx.property)}) AS RANK
    FROM
        (
        SELECT
            eid,
            ${resolveProperty(ctx.property)},
            COUNT(*) AS cnt
        FROM
            eadv
        WHERE (1=1)
            AND ${buildAttributeFilter(ctx.attributeList, true)}
            ${ctx.predicate ? `AND (${translatePredicate(ctx.predicate)})` : ''}
        GROUP BY
            eid, ${resolveProperty(ctx.property)}
        ) counts
    ) ranked
WHERE
    RANK = 1
;

ALTER TABLE ${tableName} ADD PRIMARY KEY (eid);`.trim();
  },

  // ========== Minimum First Date-Value Function ==========
  // minfdv() returns _val and _dt columns for the minimum value with its FIRST date of occurrence

  fetchMinfdv: (ctx: FetchContext) => {
    const tableName = `#SQ_${ctx.assignedVariable}`;
    const prevVars = ctx.previousVariables || [];
    const dependencyJoins = prevVars.map(v =>
      `    LEFT OUTER JOIN #SQ_${v} ON #SQ_${v}.eid = #UEADV.eid`
    ).join('\n');

    if (prevVars.length > 0) {
      return `
DROP TABLE IF EXISTS ${tableName};

SELECT
    eid,
    ${resolveProperty(ctx.property)} AS ${ctx.assignedVariable}_val,
    dt AS ${ctx.assignedVariable}_dt
INTO
    ${tableName}
FROM
    (
    SELECT
        base.eid,
        e.${resolveProperty(ctx.property)},
        e.dt,
        ROW_NUMBER() OVER (
            PARTITION BY base.eid
            ORDER BY ${resolveProperty(ctx.property, 'numeric').replace(/^/, 'e.')} ASC, e.dt ASC
        ) AS RANK
    FROM
        #UEADV base
${dependencyJoins}
        LEFT OUTER JOIN eadv e ON e.eid = base.eid
            AND ${buildAttributeFilter(ctx.attributeList, true).replace(/ATT/g, 'e.ATT')}
            ${ctx.predicate ? `AND (${translatePredicate(ctx.predicate).replace(/\bdt\b/gi, 'e.dt').replace(/\bval\b/gi, 'e.val')})` : ''}
    ) SQ_WINDOW
WHERE
    RANK = 1
;

ALTER TABLE ${tableName} ADD PRIMARY KEY (eid);`.trim();
    }

    return `
DROP TABLE IF EXISTS ${tableName};

SELECT
    eid,
    ${resolveProperty(ctx.property)} AS ${ctx.assignedVariable}_val,
    dt AS ${ctx.assignedVariable}_dt
INTO
    ${tableName}
FROM
    (
    SELECT
        eadv.eid,
        ${resolveProperty(ctx.property)},
        dt,
        ROW_NUMBER() OVER (
            PARTITION BY eadv.eid
            ORDER BY ${resolveProperty(ctx.property, 'numeric')} ASC, dt ASC
        ) AS RANK
    FROM
        eadv
    WHERE (1=1)
        AND ${buildAttributeFilter(ctx.attributeList, true)}
        ${ctx.predicate ? `AND (${translatePredicate(ctx.predicate)})` : ''}
    ) SQ_WINDOW
WHERE
    RANK = 1
;

ALTER TABLE ${tableName} ADD PRIMARY KEY (eid);`.trim();
  },

  // ========== Extended Serialization Function ==========
  // serialize2() is like serialize but may use different delimiter or encoding

  fetchSerialize2: (ctx: FetchContext) => {
    const tableName = `#SQ_${ctx.assignedVariable}`;
    const delimiter = ctx.functionParams?.[0] ? ctx.functionParams[0].replace(/['"]/g, '') : ',';
    return `
DROP TABLE IF EXISTS ${tableName};

SELECT
    eadv.eid,
    STRING_AGG(CAST(${resolveProperty(ctx.property)} AS VARCHAR(1000)), '${delimiter}')
    WITHIN GROUP (ORDER BY dt) AS ${ctx.assignedVariable}
INTO
    ${tableName}
FROM
    eadv
WHERE (1=1)
    AND ${buildAttributeFilter(ctx.attributeList, true)}
    ${ctx.predicate ? `AND (${translatePredicate(ctx.predicate)})` : ''}
GROUP BY
    eadv.eid
;

ALTER TABLE ${tableName} ADD PRIMARY KEY (eid);`.trim();
  },

  // ========== Maximum Negative Delta with Date Function ==========
  // max_neg_delta_dv() returns _val and _dt for the largest decrease between consecutive values

  fetchMaxNegDeltaDv: (ctx: FetchContext) => {
    const tableName = `#SQ_${ctx.assignedVariable}`;
    return `
DROP TABLE IF EXISTS ${tableName};

SELECT
    eid,
    delta AS ${ctx.assignedVariable}_val,
    dt AS ${ctx.assignedVariable}_dt
INTO
    ${tableName}
FROM
    (
    SELECT
        eid,
        delta,
        dt,
        ROW_NUMBER() OVER (PARTITION BY eid ORDER BY delta ASC, dt DESC) AS RANK
    FROM
        (
        SELECT
            eadv.eid,
            ${resolveProperty(ctx.property, 'numeric')} - LAG(${resolveProperty(ctx.property, 'numeric')}) OVER (PARTITION BY eadv.eid ORDER BY dt) AS delta,
            dt
        FROM
            eadv
        WHERE (1=1)
            AND ${buildAttributeFilter(ctx.attributeList, true)}
            ${ctx.predicate ? `AND (${translatePredicate(ctx.predicate)})` : ''}
        ) deltas
    WHERE
        delta < 0
    ) ranked
WHERE
    RANK = 1
;

ALTER TABLE ${tableName} ADD PRIMARY KEY (eid);`.trim();
  },

  // ========== Temporal Regularity Function ==========
  // temporal_regularity() measures the regularity of event intervals (coefficient of variation)

  fetchTemporalRegularity: (ctx: FetchContext) => {
    const tableName = `#SQ_${ctx.assignedVariable}`;
    return `
DROP TABLE IF EXISTS ${tableName};

SELECT
    eid,
    CASE
        WHEN COUNT(*) <= 1 THEN NULL
        WHEN AVG(interval_days) = 0 THEN 0
        ELSE STDEV(interval_days) / NULLIF(AVG(interval_days), 0)
    END AS ${ctx.assignedVariable}
INTO
    ${tableName}
FROM
    (
    SELECT
        eadv.eid,
        CAST(DATEDIFF(DAY, LAG(dt) OVER (PARTITION BY eadv.eid ORDER BY dt), dt) AS FLOAT) AS interval_days
    FROM
        eadv
    WHERE (1=1)
        AND ${buildAttributeFilter(ctx.attributeList, true)}
        ${ctx.predicate ? `AND (${translatePredicate(ctx.predicate)})` : ''}
    ) intervals
WHERE
    interval_days IS NOT NULL
GROUP BY
    eid
;

ALTER TABLE ${tableName} ADD PRIMARY KEY (eid);`.trim();
  },

  // ========== Compute Statement ==========

  compute: (ctx: ComputeContext) => {
    const tableName = `#SQ_${ctx.assignedVariable}`;
    const prevVars = ctx.previousVariables || [];

    // Build join clauses for dependent variables
    const dependencyJoins = prevVars.map(v =>
      `    LEFT OUTER JOIN #SQ_${v} ON #SQ_${v}.eid = #UEADV.eid`
    ).join('\n');

    // Build CASE expression
    const caseExpr = ctx.conditions.map(c =>
      c.predicate
        ? `        WHEN ${translateOperators(c.predicate)}\n            THEN ${translateFunctions(c.returnValue)}`
        : `        ELSE ${translateFunctions(c.returnValue)}`
    ).join('\n');

    return `
DROP TABLE IF EXISTS ${tableName};

SELECT
    #UEADV.eid,
    CASE
${caseExpr}
    END AS ${ctx.assignedVariable}
INTO
    ${tableName}
FROM
    #UEADV
${dependencyJoins}
WHERE (1=1)
;

ALTER TABLE ${tableName} ADD PRIMARY KEY (eid);`.trim();
  },

  bind: (ctx: BindContext) => {
    const tableName = `#SQ_${ctx.assignedVariable}`;
    return `
DROP TABLE IF EXISTS ${tableName};

SELECT
    SROUT_${ctx.sourceRuleblock}.eid,
    SROUT_${ctx.sourceRuleblock}.${ctx.sourceVariable} AS ${ctx.assignedVariable}
INTO
    ${tableName}
FROM
    SROUT_${ctx.sourceRuleblock}
;

ALTER TABLE ${tableName} ADD PRIMARY KEY (eid);`.trim();
  },

  // Main ruleblock wrapper - creates temp tables and final output table
  ruleblock: (name: string, ctes: string[], variables: VariableMetadata[]) => {
    // Build final SELECT column list
    // For dv functions, select _val and _dt columns; for others, select the variable itself
    const columnList = variables.map(v => {
      if (v.isDvFunction) {
        return `    #SQ_${v.name}.${v.name}_val,\n    #SQ_${v.name}.${v.name}_dt`;
      }
      return `    #SQ_${v.name}.${v.name}`;
    }).join(',\n');

    // Build final JOIN clauses
    const finalJoins = variables.map(v =>
      `    LEFT OUTER JOIN #SQ_${v.name} ON #SQ_${v.name}.eid = #UEADV.eid`
    ).join('\n');

    return `--------------------------------------------------
-- ruleblock:   ${name}
--------------------------------------------------

DROP TABLE IF EXISTS SROUT_${name};

DROP TABLE IF EXISTS #UEADV;

SELECT
    eadv.eid
INTO
    #UEADV
FROM
    eadv
GROUP BY
    eadv.eid
;

${ctes.join('\n\n')}

DROP TABLE IF EXISTS SROUT_${name};

SELECT
    #UEADV.eid${variables.length > 0 ? ',\n' + columnList : ''}
INTO
    SROUT_${name}
FROM
    #UEADV
${finalJoins}
;

ALTER TABLE SROUT_${name} ADD PRIMARY KEY (eid);`.trim();
  },

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
