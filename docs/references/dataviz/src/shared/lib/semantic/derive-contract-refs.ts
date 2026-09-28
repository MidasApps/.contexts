/**
 * Deriva os `contractRefs` de um Product a partir das entities selecionadas
 * (ADR-0015). Substitui o literal fixo `['canonical']` que apontava para um
 * contrato inexistente e deixava produtos/bindings criados pela Admin sem
 * dados (fail-loud 422 na resolução de métrica).
 *
 * Um contrato entra no resultado quando ao menos uma das entities
 * selecionadas pertence a ele. Nunca inventa um contrato: entity não
 * presente no catálogo simplesmente não contribui.
 */
export interface ContractEntityGroup {
  contractId: string;
  entityIds: string[];
}

export function deriveContractRefs(
  selectedEntityIds: string[],
  catalog: ContractEntityGroup[],
): string[] {
  const selected = new Set(selectedEntityIds);
  const refs = new Set<string>();
  for (const group of catalog) {
    if (group.entityIds.some((id) => selected.has(id))) {
      refs.add(group.contractId);
    }
  }
  return Array.from(refs).sort();
}
