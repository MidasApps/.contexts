'use client';

import { useMemo } from 'react';
import { useFetchResource } from '@/shared/hooks/useFetchResource';
import type { Attribute, Entity } from '@/shared/schemas';

async function authHeaders(): Promise<Record<string, string>> {
  const { getFirebaseAuth } = await import('@/shared/lib/firebase/config');
  const user = getFirebaseAuth().currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

export interface ContractSchemaEntity {
  entity: Entity;
  attributes: Attribute[];
}

const NO_SCHEMA: ContractSchemaEntity[] = [];

async function loadContractSchema(
  contractId: string,
  signal: AbortSignal,
): Promise<ContractSchemaEntity[]> {
  const headers = await authHeaders();
  const entitiesUrl = `/api/data-contracts/${encodeURIComponent(contractId)}/entities`;
  const entitiesRes = await fetch(entitiesUrl, { headers, signal });
  const eContentType = entitiesRes.headers.get('content-type') ?? '';
  if (!eContentType.includes('application/json')) {
    throw new Error(
      `Route returned ${eContentType || 'no content-type'} instead of JSON. ` +
      `If you just added/edited route files, restart the dev server.`,
    );
  }
  const entitiesBody = await entitiesRes.json().catch(() => ({}));
  if (!entitiesRes.ok) throw new Error(entitiesBody.error || `HTTP ${entitiesRes.status}`);
  const entities = (entitiesBody.data ?? []) as Entity[];

  return Promise.all(
    entities.map(async (entity) => {
      const url = `/api/data-contracts/${encodeURIComponent(contractId)}/entities/${encodeURIComponent(entity.id)}/attributes`;
      const res = await fetch(url, { headers, signal });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      return { entity, attributes: (body.data ?? []) as Attribute[] };
    }),
  );
}

/**
 * Carrega entities + attributes de um Data Contract em uma única estrutura,
 * usado pelo SchemaMapEditor (ADR-0015) para renderizar o de-para
 * `entity.attribute → coluna real`.
 *
 * Diferente de useAdminAttributes (que é por-entity), este hook agrega
 * todas as entities + attributes do contract numa única requisição em
 * paralelo (Promise.all).
 */
export function useContractSchema(contractId: string | null) {
  // Novo contrato = novo fetcher: os GETs anteriores são abortados e, se
  // ainda responderem, são ignorados (useFetchResource).
  const fetcher = useMemo(
    () => (contractId ? (signal: AbortSignal) => loadContractSchema(contractId, signal) : null),
    [contractId],
  );
  const { data: schema, loading, error, refetch } = useFetchResource(fetcher, NO_SCHEMA);
  return { schema, loading, error, refetch };
}
