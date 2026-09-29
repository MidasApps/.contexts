import { createHash } from 'node:crypto';

/**
 * SHA-256 hex digest of UTF-8 text. Used by RAG ingest pipeline to detect
 * content drift (re-ingest only when hash changes) per Sprint 2.A spec.
 */
export function contentHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
