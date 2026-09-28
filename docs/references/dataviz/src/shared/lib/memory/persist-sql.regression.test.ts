import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { scrubPii } from '@/shared/lib/rag/pii-scrubber';

interface Fixture {
  id: string;
  sql: string;
  pii: string[];
}

const fixtures = JSON.parse(
  readFileSync('docs/eval/adversarial-sql-pii.json', 'utf8'),
) as Fixture[];

describe('PII regression suite (adversarial SQLs)', () => {
  it('loads exactly 30 fixtures', () => {
    expect(fixtures).toHaveLength(30);
  });

  for (const f of fixtures) {
    it(`scrubs all PII in fixture ${f.id}`, () => {
      const out = scrubPii(f.sql);
      for (const literal of f.pii) {
        expect(out, `fixture ${f.id} retained literal "${literal}"`).not.toContain(literal);
      }
    });
  }
});
