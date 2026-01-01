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
  FETCH_STATEMENT: /^(\w+)\s*=>\s*(\w+)\.(\w+|\[.+?\])\.(\w+)\.(\w+)\((.*?)\)(?:\.where\((.*?)\))?;?$/,
  COMPUTE_STATEMENT: /^(\w+)\s*:\s*(.+);?$/,
  COMPILER_DIRECTIVE: /^#(\w+)\((.*?),\s*(\{.+\})\);?$/,
};
