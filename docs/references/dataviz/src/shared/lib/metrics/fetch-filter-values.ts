export interface FilterValueOption {
  value: string;
  label?: string;
}

/**
 * Fetch autenticado de `POST /api/metrics/filter-values` (G3) — mesmo padrão
 * de token de `useReportData.fetchMetricsBatch` (external token com fallback
 * para Firebase Auth). Usado pelos dropdowns de filtro de página.
 */
export type FilterValuesArgs =
  { clientId: string; productId: string }
  & (
    /** Campo do resultado de uma métrica da página (ADR-0026). */
    | { metricId: string; field: string }
    /** Coluna crua da entidade — filtros gravados antes da ADR-0026. */
    | { attribute: string; labelAttribute?: string }
  );

export async function fetchFilterValues(args: FilterValuesArgs): Promise<FilterValueOption[]> {
  const { getExternalToken } = await import('@/shared/lib/external-token');
  const { getFirebaseAuth } = await import('@/shared/lib/firebase/config');
  const externalToken = getExternalToken();
  const token = externalToken ?? (await getFirebaseAuth().currentUser?.getIdToken());
  if (!token) throw new Error('Not authenticated');

  const res = await fetch('/api/metrics/filter-values', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Falha ao buscar valores do filtro');
  }
  const body = await res.json();
  return (body.values ?? []) as FilterValueOption[];
}
