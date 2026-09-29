'use client';

import { useAppStore } from '@/shared/stores/app-store';
import { primaryDatasetOf } from '@/shared/lib/clients/primary-dataset';

export function useActiveClient() {
  return useAppStore((s) => s.getActiveClient());
}

/**
 * Returns the primary dataset string for backward compat with existing query hooks.
 * A ordem de resolução vive em `primaryDatasetOf`.
 */
export function useActiveDataset() {
  return useAppStore((s) => {
    const c = s.getActiveClient();
    return c ? primaryDatasetOf(c) : null;
  });
}

// useActiveDatasets() removida — era camada de compatibilidade que derivava
// DatasetConfig[] de productBindings para os consumidores antigos. Nenhum
// sobreviveu; quem precisa do dataset usa useActiveDataset (singular).
