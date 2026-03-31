/**
 * Recursive-descent expression evaluator for picorules conditional expressions.
 *
 * Parses and evaluates predicate strings like:
 *   "risk_high_ovr=0 and ln_zero_ex1=0"
 *   "round(100*(1-EXP(-EXP(...))),2)"
 *   "nvl(risk_5_chd,0) + nvl(risk_5_mi,0)"
 *   "age between 65 and 70"
 *   "rrt in (1,2,4)"
 *   "hb_last!?"                       (is not null)
 *   "hb_last?"                        (is null)
 *
 * Grammar (informal):
 *   expr       → or_expr
 *   or_expr    → and_expr ('or' and_expr)*
 *   and_expr   → not_expr ('and' not_expr)*
 *   not_expr   → 'not' not_expr | compare
 *   compare    → addition (('='|'!='|'<>'|'<'|'>'|'<='|'>='|'!?'|'?') addition)?
 *              | addition 'is' 'not'? 'null'
 *              | addition 'between' addition 'and' addition
 *              | addition 'not'? 'in' '(' expr_list ')'
 *   addition   → multiply (('+' | '-') multiply)*
 *   multiply   → unary (('*' | '/') unary)*
 *   unary      → '-' unary | atom
 *   atom       → NUMBER | STRING | 'null' | '.' | variable
 *              | function_call
 *              | '(' expr ')'
 *   function_call → IDENT '(' expr_list? ')'
 */

import * as pico from './pico-functions';

// ---------------------------------------------------------------------------
// Token types
// ---------------------------------------------------------------------------

enum TokenType {
  Number,
  String,       // backtick-quoted strings
  Identifier,
  LParen,
  RParen,
  Comma,
  Plus,
  Minus,
  Star,
  Slash,
  Eq,           // =
  Neq,          // != or <>
  Lt,           // <
  Gt,           // >
  Lte,          // <=
  Gte,          // >=
  NotNull,      // !?
  IsNull,       // ?
  Dot,          // .
  And,
  Or,
  Not,
  In,
  Between,
  Is,
  Null,
  EOF,
}

interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

const KEYWORDS: Record<string, TokenType> = {
  'and': TokenType.And,
  'or': TokenType.Or,
  'not': TokenType.Not,
  'in': TokenType.In,
  'between': TokenType.Between,
  'is': TokenType.Is,
  'null': TokenType.Null,
};

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    // Skip whitespace
    if (/\s/.test(input[i])) { i++; continue; }

    const pos = i;

    // Two-character operators
    if (i + 1 < len) {
      const two = input.substring(i, i + 2);
      if (two === '<=') { tokens.push({ type: TokenType.Lte, value: '<=', pos }); i += 2; continue; }
      if (two === '>=') { tokens.push({ type: TokenType.Gte, value: '>=', pos }); i += 2; continue; }
      if (two === '!=') { tokens.push({ type: TokenType.Neq, value: '!=', pos }); i += 2; continue; }
      if (two === '<>') { tokens.push({ type: TokenType.Neq, value: '<>', pos }); i += 2; continue; }
      if (two === '!?') { tokens.push({ type: TokenType.NotNull, value: '!?', pos }); i += 2; continue; }
    }

    // Single-character operators
    const ch = input[i];
    if (ch === '(') { tokens.push({ type: TokenType.LParen, value: '(', pos }); i++; continue; }
    if (ch === ')') { tokens.push({ type: TokenType.RParen, value: ')', pos }); i++; continue; }
    if (ch === ',') { tokens.push({ type: TokenType.Comma, value: ',', pos }); i++; continue; }
    if (ch === '+') { tokens.push({ type: TokenType.Plus, value: '+', pos }); i++; continue; }
    if (ch === '-') { tokens.push({ type: TokenType.Minus, value: '-', pos }); i++; continue; }
    if (ch === '*') { tokens.push({ type: TokenType.Star, value: '*', pos }); i++; continue; }
    if (ch === '/') { tokens.push({ type: TokenType.Slash, value: '/', pos }); i++; continue; }
    if (ch === '=') { tokens.push({ type: TokenType.Eq, value: '=', pos }); i++; continue; }
    if (ch === '<') { tokens.push({ type: TokenType.Lt, value: '<', pos }); i++; continue; }
    if (ch === '>') { tokens.push({ type: TokenType.Gt, value: '>', pos }); i++; continue; }
    if (ch === '.') { tokens.push({ type: TokenType.Dot, value: '.', pos }); i++; continue; }
    if (ch === '?') { tokens.push({ type: TokenType.IsNull, value: '?', pos }); i++; continue; }

    // Numbers (including decimals)
    if (/[0-9]/.test(ch)) {
      let num = '';
      while (i < len && /[0-9.]/.test(input[i])) {
        num += input[i];
        i++;
      }
      tokens.push({ type: TokenType.Number, value: num, pos });
      continue;
    }

    // Backtick-quoted strings
    if (ch === '`') {
      i++; // skip opening backtick
      let str = '';
      while (i < len && input[i] !== '`') {
        str += input[i];
        i++;
      }
      if (i < len) i++; // skip closing backtick
      tokens.push({ type: TokenType.String, value: str, pos });
      continue;
    }

    // Single-quoted strings (used in some expressions like format strings)
    if (ch === "'") {
      i++;
      let str = '';
      while (i < len && input[i] !== "'") {
        str += input[i];
        i++;
      }
      if (i < len) i++;
      tokens.push({ type: TokenType.String, value: str, pos });
      continue;
    }

    // Identifiers and keywords
    if (/[a-zA-Z_]/.test(ch)) {
      let ident = '';
      while (i < len && /[a-zA-Z0-9_]/.test(input[i])) {
        ident += input[i];
        i++;
      }
      const lower = ident.toLowerCase();
      if (lower in KEYWORDS) {
        tokens.push({ type: KEYWORDS[lower], value: lower, pos });
      } else {
        tokens.push({ type: TokenType.Identifier, value: ident, pos });
      }
      continue;
    }

    throw new Error(`Unexpected character '${ch}' at position ${pos} in expression: ${input}`);
  }

  tokens.push({ type: TokenType.EOF, value: '', pos: i });
  return tokens;
}

// ---------------------------------------------------------------------------
// Parser + Evaluator
// ---------------------------------------------------------------------------

/** Context: variable name → current value */
export type EvalContext = Record<string, number | string | Date | null>;

/**
 * Built-in function registry. Maps function names (lowercase) to their
 * implementations from pico-functions.
 */
const FUNCTIONS: Record<string, (...args: any[]) => any> = {
  round:          pico.round,
  ln:             pico.ln,
  exp:            pico.exp,
  power:          pico.power,
  abs:            pico.abs,
  ceil:           pico.ceil,
  log:            pico.log,
  sqrt:           pico.sqrt,
  nvl:            pico.nvl,
  coalesce:       pico.coalesce,
  greatest:       pico.greatest,
  least:          pico.least,
  greatest_date:  pico.greatest_date,
  least_date:     pico.least_date,
  substr:         pico.substr,
  to_number:      pico.to_number,
  to_char:        pico.to_char,
  to_date:        pico.to_date,
};

class ExpressionParser {
  private tokens: Token[];
  private pos: number;
  private context: EvalContext;
  private currentVariable?: string; // for the '.' shorthand

  constructor(tokens: Token[], context: EvalContext, currentVariable?: string) {
    this.tokens = tokens;
    this.pos = 0;
    this.context = context;
    this.currentVariable = currentVariable;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    const token = this.tokens[this.pos];
    this.pos++;
    return token;
  }

  private expect(type: TokenType): Token {
    const token = this.peek();
    if (token.type !== type) {
      throw new Error(`Expected token type ${TokenType[type]} but got ${TokenType[token.type]} ('${token.value}') at position ${token.pos}`);
    }
    return this.advance();
  }

  private match(type: TokenType): boolean {
    if (this.peek().type === type) {
      this.advance();
      return true;
    }
    return false;
  }

  // expr → or_expr
  parse(): any {
    const result = this.parseOr();
    if (this.peek().type !== TokenType.EOF) {
      throw new Error(`Unexpected token '${this.peek().value}' at position ${this.peek().pos}`);
    }
    return result;
  }

  // or_expr → and_expr ('or' and_expr)*
  private parseOr(): any {
    let left = this.parseAnd();
    while (this.peek().type === TokenType.Or) {
      this.advance();
      const right = this.parseAnd();
      left = toBool(left) || toBool(right);
    }
    return left;
  }

  // and_expr → not_expr ('and' not_expr)*
  private parseAnd(): any {
    let left = this.parseNot();
    while (this.peek().type === TokenType.And) {
      // Check if this 'and' belongs to a 'between' expression
      // by saving position and checking context
      this.advance();
      const right = this.parseNot();
      left = toBool(left) && toBool(right);
    }
    return left;
  }

  // not_expr → 'not' not_expr | compare
  private parseNot(): any {
    if (this.peek().type === TokenType.Not) {
      this.advance();
      return !toBool(this.parseNot());
    }
    return this.parseCompare();
  }

  // compare → addition (comparison_op addition)?
  //         | addition 'is' 'not'? 'null'
  //         | addition 'between' addition 'and' addition
  //         | addition 'not'? 'in' '(' expr_list ')'
  //         | addition ('!?' | '?')  (postfix null checks)
  private parseCompare(): any {
    const left = this.parseAddition();

    const t = this.peek();

    // Postfix null checks: variable!? or variable?
    if (t.type === TokenType.NotNull) {
      this.advance();
      return left != null;
    }
    if (t.type === TokenType.IsNull) {
      this.advance();
      return left == null;
    }

    // 'is' [not] null
    if (t.type === TokenType.Is) {
      this.advance();
      const negated = this.match(TokenType.Not);
      this.expect(TokenType.Null);
      return negated ? left != null : left == null;
    }

    // 'between' X 'and' Y
    if (t.type === TokenType.Between) {
      this.advance();
      const low = this.parseAddition();
      this.expect(TokenType.And);
      const high = this.parseAddition();
      if (left == null) return false;
      return left >= low && left <= high;
    }

    // [not] 'in' '(' list ')'
    if (t.type === TokenType.Not && this.pos + 1 < this.tokens.length && this.tokens[this.pos + 1].type === TokenType.In) {
      this.advance(); // skip 'not'
      this.advance(); // skip 'in'
      const list = this.parseList();
      if (left == null) return false;
      return !list.includes(left);
    }
    if (t.type === TokenType.In) {
      this.advance();
      const list = this.parseList();
      if (left == null) return false;
      return list.includes(left);
    }

    // Standard comparison operators
    if (t.type === TokenType.Eq) { this.advance(); const r = this.parseAddition(); return nullCompare(left, r, (a, b) => a == b); }
    if (t.type === TokenType.Neq) { this.advance(); const r = this.parseAddition(); return nullCompare(left, r, (a, b) => a != b); }
    if (t.type === TokenType.Lt) { this.advance(); const r = this.parseAddition(); return nullCompare(left, r, (a, b) => a < b); }
    if (t.type === TokenType.Gt) { this.advance(); const r = this.parseAddition(); return nullCompare(left, r, (a, b) => a > b); }
    if (t.type === TokenType.Lte) { this.advance(); const r = this.parseAddition(); return nullCompare(left, r, (a, b) => a <= b); }
    if (t.type === TokenType.Gte) { this.advance(); const r = this.parseAddition(); return nullCompare(left, r, (a, b) => a >= b); }

    return left;
  }

  // addition → multiply (('+' | '-') multiply)*
  private parseAddition(): any {
    let left = this.parseMultiply();
    while (true) {
      if (this.peek().type === TokenType.Plus) {
        this.advance();
        const right = this.parseMultiply();
        left = smartAdd(left, right);
      } else if (this.peek().type === TokenType.Minus) {
        this.advance();
        const right = this.parseMultiply();
        left = smartSubtract(left, right);
      } else {
        break;
      }
    }
    return left;
  }

  // multiply → unary (('*' | '/') unary)*
  private parseMultiply(): any {
    let left = this.parseUnary();
    while (true) {
      if (this.peek().type === TokenType.Star) {
        this.advance();
        const right = this.parseUnary();
        left = pico.multiply(toNum(left), toNum(right));
      } else if (this.peek().type === TokenType.Slash) {
        this.advance();
        const right = this.parseUnary();
        left = pico.divide(toNum(left), toNum(right));
      } else {
        break;
      }
    }
    return left;
  }

  // unary → '-' unary | atom
  private parseUnary(): any {
    if (this.peek().type === TokenType.Minus) {
      this.advance();
      const val = this.parseUnary();
      return val == null ? null : -toNum(val);
    }
    return this.parseAtom();
  }

  // atom → NUMBER | STRING | 'null' | '.' | function_call | variable | '(' expr ')'
  private parseAtom(): any {
    const t = this.peek();

    // Number literal
    if (t.type === TokenType.Number) {
      this.advance();
      return parseFloat(t.value);
    }

    // String literal (backtick or single-quoted)
    if (t.type === TokenType.String) {
      this.advance();
      return t.value;
    }

    // null
    if (t.type === TokenType.Null) {
      this.advance();
      return null;
    }

    // '.' — shorthand for current variable in conditional return values
    if (t.type === TokenType.Dot) {
      this.advance();
      if (this.currentVariable) {
        return this.context[this.currentVariable] ?? null;
      }
      return null;
    }

    // Parenthesized expression
    if (t.type === TokenType.LParen) {
      this.advance();
      const val = this.parseOr();
      this.expect(TokenType.RParen);
      return val;
    }

    // Identifier: function call or variable reference
    if (t.type === TokenType.Identifier) {
      this.advance();
      const name = t.value;

      // Check for function call: identifier followed by '('
      if (this.peek().type === TokenType.LParen) {
        return this.parseFunctionCall(name);
      }

      // Variable reference — look up in context first
      const lowerName = name.toLowerCase();

      // Check context (exact match)
      const val = this.context[name];
      if (val !== undefined) return val;

      // Check context (case-insensitive)
      for (const key of Object.keys(this.context)) {
        if (key.toLowerCase() === lowerName) return this.context[key];
      }

      // Special: 'sysdate' without parens — only if not in context
      if (lowerName === 'sysdate') {
        return pico.sysdate();
      }

      // Undefined variables are null (matching SQL behaviour)
      return null;
    }

    throw new Error(`Unexpected token '${t.value}' (${TokenType[t.type]}) at position ${t.pos}`);
  }

  private parseFunctionCall(name: string): any {
    const lowerName = name.toLowerCase();

    // Special case: extract(year from expr) — SQL EXTRACT syntax
    if (lowerName === 'extract') {
      return this.parseExtract();
    }

    this.expect(TokenType.LParen);
    const args: any[] = [];

    if (this.peek().type !== TokenType.RParen) {
      args.push(this.parseOr());
      while (this.match(TokenType.Comma)) {
        args.push(this.parseOr());
      }
    }

    this.expect(TokenType.RParen);

    // Look up function
    const fn = FUNCTIONS[lowerName];
    if (fn) {
      return fn(...args);
    }

    throw new Error(`Unknown function: ${name}`);
  }

  /**
   * Parse extract(year from expr) / extract(month from expr) / extract(day from expr)
   */
  private parseExtract(): any {
    this.expect(TokenType.LParen);

    // Read the part name (year, month, day) — it's an identifier
    const partToken = this.expect(TokenType.Identifier);
    const part = partToken.value.toLowerCase();

    // Expect 'from' — also an identifier in our tokenizer
    const fromToken = this.expect(TokenType.Identifier);
    if (fromToken.value.toLowerCase() !== 'from') {
      throw new Error(`Expected 'from' in extract() but got '${fromToken.value}'`);
    }

    // Parse the date expression
    const dateExpr = this.parseOr();
    this.expect(TokenType.RParen);

    if (dateExpr == null) return null;
    const d = dateExpr instanceof Date ? dateExpr : new Date(dateExpr);
    if (isNaN(d.getTime())) return null;

    switch (part) {
      case 'year':  return d.getFullYear();
      case 'month': return d.getMonth() + 1;
      case 'day':   return d.getDate();
      default:
        throw new Error(`Unsupported extract part: ${part}`);
    }
  }

  private parseList(): any[] {
    this.expect(TokenType.LParen);
    const items: any[] = [];
    if (this.peek().type !== TokenType.RParen) {
      items.push(this.parseOr());
      while (this.match(TokenType.Comma)) {
        items.push(this.parseOr());
      }
    }
    this.expect(TokenType.RParen);
    return items;
  }
}

// ---------------------------------------------------------------------------
// Type coercion helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Type-aware arithmetic (Date-aware +/- operators)
// ---------------------------------------------------------------------------

/** Check if a value is a Date (or Date-like from the evaluator). */
function isDate(val: any): val is Date {
  return val instanceof Date;
}

/**
 * Type-aware addition:
 *   Date + Number → new Date (add N days)
 *   Number + Date → new Date (add N days)
 *   String + any  → string concatenation
 *   any + String  → string concatenation
 *   Number + Number → number addition (null-safe)
 */
function smartAdd(left: any, right: any): any {
  if (left == null || right == null) {
    // String concatenation treats null as empty (matching SQL concat behaviour)
    if (typeof left === 'string' || typeof right === 'string') {
      return String(left ?? '') + String(right ?? '');
    }
    return null;
  }
  if (isDate(left) && typeof right === 'number') {
    return pico.dateAdd(left, right);
  }
  if (typeof left === 'number' && isDate(right)) {
    return pico.dateAdd(right, left);
  }
  if (typeof left === 'string' || typeof right === 'string') {
    return String(left) + String(right);
  }
  return pico.add(toNum(left), toNum(right));
}

/**
 * Type-aware subtraction:
 *   Date - Date   → number of days between them
 *   Date - Number → new Date (subtract N days)
 *   Number - Number → number subtraction (null-safe)
 */
function smartSubtract(left: any, right: any): any {
  if (left == null || right == null) return null;
  if (isDate(left) && isDate(right)) {
    return pico.daysBetween(left, right);
  }
  if (isDate(left) && typeof right === 'number') {
    return pico.dateAdd(left, -right);
  }
  return pico.subtract(toNum(left), toNum(right));
}

// ---------------------------------------------------------------------------
// Type coercion helpers
// ---------------------------------------------------------------------------

/** Coerce value to boolean for logical operators (SQL: null → false). */
function toBool(val: any): boolean {
  if (val == null) return false;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  return true;
}

/** Coerce value to number for arithmetic (null stays null, strings coerced). */
function toNum(val: any): number | null {
  if (val == null) return null;
  if (typeof val === 'number') return val;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

/** Null-safe comparison: if either side is null, result is false (matching SQL WHERE). */
function nullCompare(a: any, b: any, op: (a: any, b: any) => boolean): boolean {
  if (a == null || b == null) return false;
  return op(a, b);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate an expression string against a variable context.
 *
 * @param expression - The expression string (e.g., "hb_last < 120")
 * @param context - Map of variable names to their current values
 * @param currentVariable - Optional: the variable being assigned (for '.' shorthand)
 * @returns The evaluated result (number, string, boolean, null, or Date)
 */
export function evaluateExpression(
  expression: string,
  context: EvalContext,
  currentVariable?: string
): any {
  if (!expression || expression.trim() === '') return null;

  const tokens = tokenize(expression.trim());
  const parser = new ExpressionParser(tokens, context, currentVariable);
  return parser.parse();
}

/**
 * Evaluate a predicate (condition) — always returns a boolean.
 * Null results are treated as false (SQL WHERE semantics).
 */
export function evaluatePredicate(
  predicate: string,
  context: EvalContext
): boolean {
  const result = evaluateExpression(predicate, context);
  return toBool(result);
}
