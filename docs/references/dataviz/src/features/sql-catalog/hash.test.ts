import { describe, it, expect } from 'vitest';
import { canonicalSqlHash } from './hash';

describe('canonicalSqlHash', () => {
  it('produces same hash for SQLs differing only in whitespace and case', () => {
    const a = 'SELECT id, name FROM contratos WHERE rating = "AA"';
    const b = '  select   id,    name\n  from contratos\n where rating = "AA"  ';
    expect(canonicalSqlHash(a)).toBe(canonicalSqlHash(b));
  });

  it('produces same hash when only line/block comments differ', () => {
    const a = `
      SELECT id -- inline comment
      FROM contratos
      /* block
         comment */
      WHERE rating = 'AA'
    `;
    const b = `
      SELECT id
      FROM contratos
      WHERE rating = 'AA'
    `;
    expect(canonicalSqlHash(a)).toBe(canonicalSqlHash(b));
  });

  it('produces DIFFERENT hashes for semantically different SQLs', () => {
    const a = 'SELECT id FROM contratos WHERE rating = "AA"';
    const b = 'SELECT id FROM contratos WHERE rating = "BB"';
    expect(canonicalSqlHash(a)).not.toBe(canonicalSqlHash(b));
  });

  it('produces different hashes when columns differ', () => {
    const a = 'SELECT id FROM contratos';
    const b = 'SELECT name FROM contratos';
    expect(canonicalSqlHash(a)).not.toBe(canonicalSqlHash(b));
  });

  it('returns hex sha256 (64 chars)', () => {
    const h = canonicalSqlHash('SELECT 1');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('aliases are NOT normalized — documented limitation', () => {
    // Aliases differ → hashes differ. Documented in JSDoc.
    const a = 'SELECT c.id FROM contratos AS c';
    const b = 'SELECT x.id FROM contratos AS x';
    expect(canonicalSqlHash(a)).not.toBe(canonicalSqlHash(b));
  });
});
