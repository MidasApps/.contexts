import { scrubObject, hashId } from '@/shared/lib/rag/pii-scrubber';

export class WorkingMemoryPiiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkingMemoryPiiError';
  }
}

const PII_RESIDUAL = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/;

interface SanitizedFilter {
  filter: string;
  valueHash?: string;
  value?: unknown;
}

function sanitizeFilters(filters: unknown): unknown {
  if (!Array.isArray(filters)) return filters;
  return filters.map((f) => {
    if (f && typeof f === 'object' && 'filter' in f && 'value' in f) {
      const ff = f as { filter: string; value: unknown };
      if (ff.filter === 'cpf' || ff.filter === 'cnpj' || ff.filter === 'email') {
        return {
          filter: ff.filter,
          valueHash: hashId(String(ff.value)),
        } as SanitizedFilter;
      }
    }
    return f;
  });
}

export function sanitizeWorkingMemory<T>(memory: T): T {
  if (memory === null || memory === undefined) return memory;
  // 1. Hash sensitive filter values
  let stage1: unknown = memory;
  if (typeof memory === 'object' && memory !== null && 'filters' in memory) {
    stage1 = {
      ...(memory as Record<string, unknown>),
      filters: sanitizeFilters((memory as Record<string, unknown>).filters),
    };
  }
  // 2. Deep scrub remaining strings
  const stage2 = scrubObject(stage1);
  // 3. Defense-in-depth: residual PII scan
  const json = JSON.stringify(stage2);
  if (PII_RESIDUAL.test(json)) {
    throw new WorkingMemoryPiiError('Residual PII detected after sanitize');
  }
  return stage2 as T;
}
