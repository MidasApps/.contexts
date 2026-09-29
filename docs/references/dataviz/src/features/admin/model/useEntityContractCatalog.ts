'use client';

import { useEffect, useState } from 'react';
import { useAdminContracts } from './useAdminContracts';
import type { Entity } from '@/shared/schemas';
import type { ContractEntityGroup } from '@/shared/lib/semantic/derive-contract-refs';

async function authHeaders(): Promise<Record<string, string>> {
  const { getFirebaseAuth } = await import('@/shared/lib/firebase/config');
  const user = getFirebaseAuth().currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

/**
 * Catálogo `{ contractId, entityIds }[]` agregando todos os Data Contracts e
 * suas entities. Usado para DERIVAR os `contractRefs` de um Product a partir
 * das entities selecionadas (ADR-0015) — ver `deriveContractRefs`.
 */
export function useEntityContractCatalog(): { catalog: ContractEntityGroup[] } {
  const { contracts, loading: contractsLoading } = useAdminContracts();
  const [catalog, setCatalog] = useState<ContractEntityGroup[]>([]);

  useEffect(() => {
    if (contractsLoading) return;
    let cancelled = false;
    void (async () => {
      const headers = await authHeaders();
      const groups = await Promise.all(
        contracts.map(async (c) => {
          const res = await fetch(
            `/api/data-contracts/${encodeURIComponent(c.id)}/entities`,
            { headers },
          );
          const body = await res.json().catch(() => ({}));
          const entities = (body.data ?? []) as Entity[];
          return { contractId: c.id, entityIds: entities.map((e) => e.id) };
        }),
      );
      if (!cancelled) setCatalog(groups);
    })();
    return () => {
      cancelled = true;
    };
  }, [contracts, contractsLoading]);

  return { catalog };
}
