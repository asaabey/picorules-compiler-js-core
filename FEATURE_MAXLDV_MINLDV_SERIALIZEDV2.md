# Feature: maxldv(), minldv(), and serializedv2() Functions

## Original Request
Implement the missing `maxldv()`, `minldv()`, and `serializedv2()` functions in the Picorules compiler-js-core to support the `acr_graph.prb` rule block.

## Overview
This feature adds three new window/aggregation functions to the Picorules compiler:

1. **`maxldv()`** - Returns the value and date for the record with the maximum value
2. **`minldv()`** - Returns the value and date for the record with the minimum value
3. **`serializedv2(format)`** - Serializes records with a custom format expression

## Function Semantics

### Date-Value Functions (lastdv, firstdv, maxldv, minldv)

All date-value (dv) functions return **two columns** with `_val` and `_dt` suffixes:
- `varname_val` - the numeric value
- `varname_dt` - the date

**Note:** Previous implementation returned a compound string `val~YYYY-MM-DD`. This was changed to return separate columns for better usability in downstream calculations.

### maxldv() - Maximum Last Date-Value
Returns the record where the value is maximum, outputting:
- `varname_val` - the numeric value
- `varname_dt` - the date

**Example:**
```picorules
acr_max => eadv.lab_ua_acr._.maxldv();
```
This generates `acr_max_val` and `acr_max_dt` columns.

### minldv() - Minimum Last Date-Value
Same as maxldv but returns the record with minimum value.

**Example:**
```picorules
acr_min => eadv.lab_ua_acr._.minldv();
```
This generates `acr_min_val` and `acr_min_dt` columns.

### lastdv() - Last Date-Value
Returns the most recent record by date.

**Example:**
```picorules
acr_l => eadv.lab_ua_acr._.lastdv();
```
This generates `acr_l_val` and `acr_l_dt` columns.

### firstdv() - First Date-Value
Returns the oldest record by date.

**Example:**
```picorules
acr_f => eadv.lab_ua_acr._.firstdv();
```
This generates `acr_f_val` and `acr_f_dt` columns.

### serializedv2(format) - Custom Format Serialization
Unlike `serializedv()` which uses the default `val~dt` format, `serializedv2()` allows a custom format expression.

**Example:**
```picorules
acr_graph => eadv.lab_ua_acr.val.serializedv2(round(val,0)~dt);
```
This produces comma-separated records like: `15~2024-01-01,23~2024-02-15,18~2024-03-20`

## Implementation Details

### Files Modified

1. **`src/sql/templates/template-interface.ts`**
   - Added `fetchMaxldv`, `fetchMinldv`, `fetchSerializedv2` to SqlTemplates interface

2. **`src/sql/sql-generator.ts`**
   - Added function mappings for `maxldv`, `minldv`, `serializedv2`

3. **`src/sql/templates/mssql-templates.ts`**
   - Implemented T-SQL versions using ROW_NUMBER with ORDER BY val DESC/ASC
   - serializedv2 uses STRING_AGG with custom format expression

4. **`src/sql/templates/oracle-templates.ts`**
   - Implemented Oracle versions using ROW_NUMBER with TO_NUMBER ordering
   - serializedv2 uses LISTAGG with custom format expression

5. **`src/sql/templates/postgresql-templates.ts`**
   - Implemented PostgreSQL versions using ROW_NUMBER with ::numeric casting
   - serializedv2 uses STRING_AGG with custom format expression

6. **`src/parsing/fetch-statement-parser.ts`**
   - Fixed function parameter parsing to handle nested parentheses
   - `round(val,0)~dt` now correctly parsed as a single parameter

## SQL Generation Examples

### MSSQL - maxldv()
```sql
SELECT
    eid,
    val AS acr_max_val,
    dt AS acr_max_dt
INTO #SQ_acr_max
FROM (
    SELECT eadv.eid, val, dt,
           ROW_NUMBER() OVER (PARTITION BY eadv.eid ORDER BY CAST(val AS FLOAT) DESC, dt DESC, att ASC) AS RANK
    FROM eadv
    WHERE ATT = 'lab_ua_acr'
) SQ_acr_max_WINDOW
WHERE RANK = 1;
```

### MSSQL - serializedv2(round(val,0)~dt)
```sql
SELECT
    eadv.eid,
    STRING_AGG(CAST(round(val,0) AS VARCHAR(100)) + '~' + CONVERT(VARCHAR, dt, 23), ',')
    WITHIN GROUP (ORDER BY dt) AS acr_graph
INTO #SQ_acr_graph
FROM eadv
WHERE ATT = 'lab_ua_acr'
GROUP BY eadv.eid;
```

## Testing

Verified with `acr_graph.prb`:
```bash
npm run test:prb sample-prb/acr_graph.prb
```

The compilation now succeeds and generates valid SQL for all three dialects.

## Bug Fix: Parameter Parsing

Fixed an issue where function parameters containing nested parentheses (like `round(val,0)~dt`) were being incorrectly split by commas. The parser now uses a balanced parenthesis-aware splitting algorithm.

**Before:** `round(val,0)~dt` → `['round(val', '0)~dt']`
**After:** `round(val,0)~dt` → `['round(val,0)~dt']`

## Bug Fix: Date-Value Function Output Columns

Fixed an issue where `firstdv`, `lastdv`, `maxldv`, and `minldv` functions were returning a compound `val~dt` string column in addition to the `_val` and `_dt` columns. The compound column has been removed, and these functions now only return the `_val` and `_dt` columns as intended.

**Before:** Functions generated 3 columns: `varname` (compound), `varname_val`, `varname_dt`
**After:** Functions generate 2 columns: `varname_val`, `varname_dt`

### Files Modified for this Fix

1. **`src/sql/templates/template-interface.ts`**
   - Added `VariableMetadata` interface to track which variables come from dv functions

2. **`src/sql/sql-generator.ts`**
   - Track `isDvFunction` flag for each variable
   - Pass `VariableMetadata[]` instead of `string[]` to ruleblock template

3. **`src/sql/templates/mssql-templates.ts`**
   - Updated dv functions to only output `_val` and `_dt` columns
   - Updated ruleblock template to handle multi-column dv function output

4. **`src/sql/templates/oracle-templates.ts`**
   - Updated dv functions to only output `_val` and `_dt` columns
   - Updated ruleblock template to handle multi-column dv function output

5. **`src/sql/templates/postgresql-templates.ts`**
   - Updated dv functions to only output `_val` and `_dt` columns
   - Updated ruleblock template to handle multi-column dv function output

## Backward Compatibility

The dv function output change is a **breaking change** for any code that depended on the compound `val~dt` column. However, this change aligns the output with the intended design where downstream calculations can directly reference `_val` and `_dt` columns without parsing.

The `serializedv2()` function and other new functions are purely additive.
