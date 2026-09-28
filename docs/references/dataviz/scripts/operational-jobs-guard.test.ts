import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The production guard only protects these jobs if nothing that initialises
 * Firebase Admin or touches Firestore is loaded before it runs. A static import
 * of any of these modules would load it at import time, ahead of the guard.
 */
const JOBS = ['scripts/ingest-rag.ts', 'scripts/refresh-rag.ts', 'scripts/eviction-cron.ts', 'scripts/cron/revalidate-catalog.ts'];
const FIRESTORE_MODULES = [
  '@/shared/lib/firebase/admin',
  '@/shared/lib/rag/rag-service',
  '@/shared/lib/memory/eviction',
  '@/features/sql-catalog/revalidation',
];

const staticImports = (source: string): string[] =>
  [...source.matchAll(/^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm), ...source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)]
    .map((match) => match[1] ?? '');

describe('operational jobs load Firestore only after the production guard', () => {
  it.each(JOBS)('%s has no static import of a Firestore module', (job) => {
    const source = readFileSync(path.resolve(process.cwd(), job), 'utf8');

    expect(staticImports(source).filter((spec) => FIRESTORE_MODULES.includes(spec))).toEqual([]);
  });
});
