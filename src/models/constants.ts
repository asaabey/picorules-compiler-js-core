// Enums and constants
export enum RuleType {
  FETCH_STATEMENT = 'FETCH_STATEMENT',
  COMPUTE_STATEMENT = 'COMPUTE_STATEMENT',
  BIND_STATEMENT = 'BIND_STATEMENT',
  COMPILER_DIRECTIVE = 'COMPILER_DIRECTIVE',
  EMPTY = 'EMPTY',
}

export enum Dialect {
  ORACLE = 'oracle',
  MSSQL = 'mssql',
  POSTGRESQL = 'postgresql',
}

export enum DataType {
  NUMERIC = 'NUMERIC',
  TEXT = 'TEXT',
  DATE = 'DATE',
  BOOLEAN = 'BOOLEAN',
}

// Regex patterns
export const PATTERNS = {
  VARIABLE_NAME: /^[a-z_][a-z0-9_]*$/i,
  // Updated to support:
  // - Single attributes with wildcards: eadv.icd_e10%.dt.min()
  // - Multi-attributes in brackets: eadv.[att1,att2%].val.last()
  // - Multi-line .where() clauses with any content
  FETCH_STATEMENT: /^(\w+)\s*=>\s*(\w+)\.([\w%]+|\[.+?\])\.(\w+)\.(\w+)\((.*?)\)(?:\.where\(([\s\S]*?)\))?;?$/,
  COMPUTE_STATEMENT: /^(\w+)\s*:\s*(.+);?$/,
  COMPILER_DIRECTIVE: /^#(\w+)\((.*?),\s*(\{.+\})\);?$/,
};
