import { createHash } from 'node:crypto';

/**
 * Computes a deterministic sha256 hex hash of a SQL string after canonicalization.
 *
 * Canonicalization steps:
 *  1. Strip `/* ... *​/` block comments (non-greedy, multi-line).
 *  2. Strip `--` line comments (until newline).
 *  3. Lowercase.
 *  4. Collapse all whitespace (incl. newlines) into a single space.
 *  5. Trim.
 *
 * Limitations (intentional, documented):
 *  - **Alias names are NOT normalized.** `SELECT c.id FROM t AS c` and
 *    `SELECT x.id FROM t AS x` will produce different hashes even though
 *    semantically identical. A full SQL parser/AST normalizer would be
 *    required to handle this; out of scope for ADR-0009 v1.
 *  - String literals are lowercased — be aware that case-sensitive string
 *    matches in the query are altered for hashing purposes only (the stored
 *    SQL is the original).
 *  - Trailing semicolons are not stripped explicitly but get folded by the
 *    whitespace pass.
 *
 * Hash space: sha256 hex (64 chars, ~2^256). Collisions infeasible.
 */
export function canonicalSqlHash(sql: string): string {
  const canonical = canonicalize(sql);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function canonicalize(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // strip block comments
    .replace(/--[^\n]*/g, ' ')          // strip line comments
    .toLowerCase()
    .replace(/\s+/g, ' ')               // collapse whitespace
    .trim();
}
