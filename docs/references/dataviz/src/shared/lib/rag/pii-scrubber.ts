/**
 * PII scrubber for RAG ingest pipeline (ADR-0011).
 * Masks Brazilian CPF/CNPJ and emails before embedding any text that may
 * contain literal user data (e.g., SQL drafts in semantic recall).
 *
 * Sprint 2.D extends this scrubber with `scrubObject` (deep) and `hashId`
 * for shared use across the agent stack. We chose to extend the existing
 * RAG scrubber instead of creating a parallel one under `security/` to
 * avoid duplicating regex sources of truth.
 */

import { createHash } from 'node:crypto';

const CPF_FORMATTED = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;
const CPF_RAW = /(?<![\d.\-/])\d{11}(?![\d.\-/])/g;
const CNPJ_FORMATTED = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g;
const CNPJ_RAW = /(?<![\d.\-/])\d{14}(?![\d.\-/])/g;
const EMAIL = /[A-Za-zÀ-ÖØ-öø-ÿ0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;

export function scrubPii(text: string): string {
  return text
    .replace(EMAIL, '[EMAIL_REDACTED]')
    .replace(CNPJ_FORMATTED, '[CNPJ_REDACTED]')
    .replace(CNPJ_RAW, '[CNPJ_REDACTED]')
    .replace(CPF_FORMATTED, '[CPF_REDACTED]')
    .replace(CPF_RAW, '[CPF_REDACTED]');
}

/**
 * Recursively walks an object/array tree applying `scrubPii` to every string
 * leaf. Non-string primitives, Dates, null, and undefined are preserved.
 */
export function scrubObject<T>(input: T): T {
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') return scrubPii(input) as unknown as T;
  if (typeof input !== 'object') return input;
  if (input instanceof Date) return input;
  if (Array.isArray(input)) {
    return input.map((v) => scrubObject(v)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    out[k] = scrubObject(v);
  }
  return out as T;
}

/**
 * Deterministic short hash of a raw identifier (e.g., devedor email/CPF) for
 * use in telemetry or tables where we must not expose the raw value but
 * still want stable joins.
 */
export function hashId(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 12);
}
