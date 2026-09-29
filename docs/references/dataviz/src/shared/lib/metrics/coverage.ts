import type { ClientDatasetBinding } from '@/shared/schemas/client-binding';

export interface CoverageGap {
  /** Ref 3-part `contractId.entity.attr` exigida pela métrica. */
  ref: string;
  /** `sem-mapping`: ausente no schemaBindings; `desabilitado`: mapeado para null. */
  reason: 'sem-mapping' | 'desabilitado';
}

/**
 * Verifica a cobertura de `requires[]` (refs 3-part do contrato `contractId`)
 * contra `binding.schemaBindings`, retornando TODAS as lacunas de uma vez.
 *
 * Serve como pré-checagem de diagnóstico antes do fail-loud atributo-a-atributo
 * de `resolveColumn` (ADR-0015 §Resolution rules) — mesma semântica:
 *   - cliente legado (schemaBindings vazio) ⇒ sem lacunas (fallback back-compat);
 *   - cliente migrado, ref ausente ⇒ `sem-mapping`;
 *   - ref mapeada para `null` ⇒ `desabilitado`.
 * Refs de outros contratos são ignoradas (não são deste binding).
 */
export function collectBindingGaps(
  requires: string[],
  binding: ClientDatasetBinding,
  contractId: string,
): CoverageGap[] {
  const migrated =
    !!binding.schemaBindings && Object.keys(binding.schemaBindings).length > 0;
  if (!migrated) return [];

  const gaps: CoverageGap[] = [];
  for (const ref of requires) {
    const parts = ref.split('.');
    if (parts.length !== 3 || parts[0] !== contractId) continue;
    const key = `${parts[1]}.${parts[2]}`;
    const bound = binding.schemaBindings![key];
    if (bound === null) gaps.push({ ref, reason: 'desabilitado' });
    else if (bound === undefined) gaps.push({ ref, reason: 'sem-mapping' });
  }
  return gaps;
}
