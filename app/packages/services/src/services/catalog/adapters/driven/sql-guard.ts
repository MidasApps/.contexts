import type { GuardedSql, SemanticSqlGuard, SqlRejectionReason } from "../../application/ports/driven/semantic-sql-ports.ts";
import { SEMANTIC_SCHEMA } from "../../domain/semantic-view.ts";

/**
 * AST allowlist guard for AI-written SQL (spec §8.3, decision 0024). It parses
 * with the PostgreSQL 18 grammar (`libpg-query`, the server's own parser) and
 * accepts only node types listed here, so anything new in the grammar is
 * rejected by default. Defence in depth: the runner also executes read-only,
 * as `semantic_reader`, with a statement timeout and RLS.
 */

export const MAX_SQL_LENGTH = 10_000;

const ALLOWED_NODES = new Set([
  "SelectStmt", "ResTarget", "ColumnRef", "A_Star", "String", "Integer", "Float", "Boolean", "A_Const", "ParamRef",
  "A_Expr", "BoolExpr", "NullTest", "BooleanTest", "FuncCall", "CoalesceExpr", "MinMaxExpr", "CaseExpr", "CaseWhen",
  "TypeCast", "SortBy", "RangeVar", "RangeSubselect", "JoinExpr", "WithClause", "CommonTableExpr", "SubLink",
  "WindowDef", "SQLValueFunction", "List",
]);

const ALLOWED_FUNCTIONS = new Set([
  "count", "sum", "avg", "min", "max", "bool_and", "bool_or", "string_agg",
  "row_number", "rank", "dense_rank", "lag", "lead",
  "date_trunc", "date_part", "extract", "now", "age", "make_date",
  "lower", "upper", "length", "char_length", "btrim", "ltrim", "rtrim", "substring", "left", "right", "concat", "replace", "position",
  "abs", "round", "floor", "ceil", "ceiling", "trunc", "greatest", "least", "nullif",
]);

const ALLOWED_TYPES = new Set([
  "text", "varchar", "bpchar", "int2", "int4", "int8", "numeric", "float4", "float8", "bool",
  "date", "timestamp", "timestamptz", "interval", "uuid",
]);

const ALLOWED_OPERATORS = new Set(["=", "<>", "!=", "<", ">", "<=", ">=", "+", "-", "*", "/", "%", "||", "~~", "~~*", "!~~", "!~~*", "BETWEEN", "NOT BETWEEN", "BETWEEN SYMMETRIC", "NOT BETWEEN SYMMETRIC"]);

const ALLOWED_VALUE_FUNCTIONS = new Set(["SVFOP_CURRENT_DATE", "SVFOP_CURRENT_TIMESTAMP", "SVFOP_CURRENT_TIMESTAMP_N", "SVFOP_LOCALTIMESTAMP"]);

type Node = Record<string, unknown>;
type Rejection = { reason: SqlRejectionReason; detail?: string };
type WalkState = { readonly allowedViews: ReadonlySet<string>; readonly cteNames: ReadonlySet<string>; readonly paramCount: number };

const asNode = (value: unknown): Node => (value !== null && typeof value === "object" ? (value as Node) : {});
const stringsOf = (list: unknown): string[] =>
  Array.isArray(list) ? list.map((item) => asNode(asNode(item).String).sval).filter((value): value is string => typeof value === "string") : [];

const checkSelect = (body: Node): Rejection | undefined => {
  if (body.intoClause !== undefined) return { reason: "SELECT_INTO" };
  if (body.lockingClause !== undefined) return { reason: "LOCKING_CLAUSE" };
  return undefined;
};

/** AST string field, or undefined when absent (never a stringified object). */
const textOf = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

const checkRangeVar = (body: Node, state: WalkState): Rejection | undefined => {
  const relname = textOf(body.relname) ?? "";
  const schemaname = textOf(body.schemaname);
  if (body.catalogname !== undefined) return { reason: "SCHEMA_NOT_ALLOWED", detail: textOf(body.catalogname) ?? "" };
  if (schemaname === undefined) return state.cteNames.has(relname) ? undefined : { reason: "SCHEMA_NOT_ALLOWED", detail: relname };
  if (schemaname !== SEMANTIC_SCHEMA) return { reason: "SCHEMA_NOT_ALLOWED", detail: schemaname };
  return state.allowedViews.has(relname) ? undefined : { reason: "VIEW_NOT_ALLOWED", detail: relname };
};

const checkFuncCall = (body: Node): Rejection | undefined => {
  const names = stringsOf(body.funcname).map((name) => name.toLowerCase());
  const name = names.at(-1) ?? "";
  const qualifiedOk = names.length === 1 || (names.length === 2 && names[0] === "pg_catalog");
  return qualifiedOk && ALLOWED_FUNCTIONS.has(name) ? undefined : { reason: "FUNCTION_NOT_ALLOWED", detail: names.join(".") };
};

const checkTypeCast = (body: Node): Rejection | undefined => {
  const typeName = stringsOf(asNode(body.typeName).names).at(-1)?.toLowerCase() ?? "";
  return ALLOWED_TYPES.has(typeName) ? undefined : { reason: "TYPE_NOT_ALLOWED", detail: typeName };
};

const checkOperator = (body: Node): Rejection | undefined => {
  const operator = stringsOf(body.name).join(".");
  return operator === "" || ALLOWED_OPERATORS.has(operator) ? undefined : { reason: "OPERATOR_NOT_ALLOWED", detail: operator };
};

const checkParam = (body: Node, state: WalkState): Rejection | undefined => {
  const index = Number(body.number);
  return Number.isInteger(index) && index >= 1 && index <= state.paramCount ? undefined : { reason: "PARAM_OUT_OF_RANGE", detail: String(body.number) };
};

const checkValueFunction = (body: Node): Rejection | undefined =>
  ALLOWED_VALUE_FUNCTIONS.has(String(body.op)) ? undefined : { reason: "NODE_NOT_ALLOWED", detail: String(body.op) };

const NODE_CHECKS: Readonly<Record<string, (body: Node, state: WalkState) => Rejection | undefined>> = {
  SelectStmt: checkSelect,
  RangeVar: checkRangeVar,
  FuncCall: checkFuncCall,
  TypeCast: checkTypeCast,
  A_Expr: checkOperator,
  ParamRef: checkParam,
  SQLValueFunction: checkValueFunction,
};

/** Depth-first walk: a PascalCase key is a node type (must be allowlisted); other keys are fields. */
const walk = (value: unknown, state: WalkState): Rejection | undefined => {
  if (Array.isArray(value)) {
    for (const item of value) {
      const rejection = walk(item, state);
      if (rejection !== undefined) return rejection;
    }
    return undefined;
  }
  if (value === null || typeof value !== "object") return undefined;
  for (const [key, child] of Object.entries(value)) {
    const isNodeType = /^[A-Z]/.test(key);
    if (isNodeType && !ALLOWED_NODES.has(key)) return { reason: "NODE_NOT_ALLOWED", detail: key };
    const rejection = (isNodeType ? NODE_CHECKS[key]?.(asNode(child), state) : undefined) ?? walk(child, state);
    if (rejection !== undefined) return rejection;
  }
  return undefined;
};

/** Every CTE name in the statement; a bare relation name must be one of them. */
const collectCteNames = (value: unknown, names: Set<string> = new Set()): Set<string> => {
  if (Array.isArray(value)) value.forEach((item) => collectCteNames(item, names));
  else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key === "CommonTableExpr") names.add(String(asNode(child).ctename));
      collectCteNames(child, names);
    }
  }
  return names;
};

type ParsedStatement = { readonly stmt: Node; readonly text: string };

// Loaded on first use: the WASM parser initializes when its module is evaluated, so a
// bundle that never runs a semantic query (the Functions codebase imports the services
// barrel) must not evaluate it, nor ship its .wasm file.
const loadParser = () => import("libpg-query");

const singleStatement = async (sql: string): Promise<ParsedStatement | Rejection> => {
  const { parse } = await loadParser();
  let stmts: Node[];
  try {
    stmts = ((await parse(sql)) as { stmts?: Node[] }).stmts ?? [];
  } catch {
    return { reason: "PARSE_ERROR" };
  }
  if (stmts.length > 1) return { reason: "MULTIPLE_STATEMENTS" };
  const [first] = stmts;
  const stmt = asNode(first?.stmt);
  if (first === undefined || Object.keys(stmt).length !== 1 || stmt.SelectStmt === undefined) return { reason: "NOT_A_SELECT" };
  const start = Number(first.stmt_location ?? 0);
  const end = first.stmt_len === undefined ? undefined : start + Number(first.stmt_len);
  return { stmt, text: sql.slice(start, end).trim().replace(/;\s*$/, "") };
};

/**
 * Checks one AI-written statement against the allowlist.
 * @returns the statement text (without a trailing `;`) and its fingerprint, or the rejection reason.
 */
export const guardSemanticSql: SemanticSqlGuard = async ({ sql, allowedViews, paramCount }) => {
  if (sql.length > MAX_SQL_LENGTH) return { ok: false, error: { code: "SQL_REJECTED", reason: "TOO_LONG" } };
  const parsed = await singleStatement(sql);
  if ("reason" in parsed) return { ok: false, error: { code: "SQL_REJECTED", ...parsed } };
  const rejection = walk(parsed.stmt, { allowedViews, cteNames: collectCteNames(parsed.stmt), paramCount });
  if (rejection !== undefined) return { ok: false, error: { code: "SQL_REJECTED", ...rejection } };
  const { fingerprint } = await loadParser();
  const guarded: GuardedSql = { sql: parsed.text, fingerprint: await fingerprint(parsed.text) };
  return { ok: true, data: guarded };
};

/**
 * Wraps a guarded statement with the row cap. The newlines end any trailing
 * `--` comment of the inner text, so the cap can never be commented out.
 */
export const wrapWithLimit = (guardedSql: string, limitPlusOne: number): string =>
  `SELECT * FROM (\n${guardedSql}\n) AS semantic_query LIMIT ${Math.trunc(limitPlusOne)}`;
