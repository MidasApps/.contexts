import type { CanvasBlock, CanvasRow, CanvasPageFilters } from '@/shared/config/agents/types';
import type { TemplateQueryConfig } from '@/shared/config/dashboard-templates';

export interface Report {
  id: string;
  name: string;
  /** Short subtitle shown above the canvas. Copied from template on import. */
  description?: string;
  order: number;
  blockMap: Record<string, CanvasBlock>;
  layout: CanvasRow[];
  filters?: CanvasPageFilters;
  /** Query configs for auto-populating data (from template import) */
  queries?: TemplateQueryConfig[];
  /** Slug do DashboardTemplate de origem (se criado a partir de um template). */
  templateId?: string;
  /** Copiado de template.productRefs no import. */
  productRefs?: string[];
  /** Copiado de template.metricRefs no import. */
  metricRefs?: string[];
}

async function getToken(): Promise<string> {
  const { getExternalToken } = await import('@/shared/lib/external-token');
  const externalToken = getExternalToken();
  if (externalToken) return externalToken;

  const { getFirebaseAuth } = await import('@/shared/lib/firebase/config');
  const auth = getFirebaseAuth();
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Not authenticated');
  return token;
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function fetchReports(clientId: string, groupId: string): Promise<Report[]> {
  const token = await getToken();
  const res = await fetch(
    `/api/reports?clientId=${encodeURIComponent(clientId)}&groupId=${encodeURIComponent(groupId)}`,
    { headers: headers(token) },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to fetch reports');
  }
  const body = await res.json();
  return body.data ?? [];
}

export async function getReport(
  clientId: string,
  groupId: string,
  reportId: string,
  signal?: AbortSignal,
): Promise<Report | null> {
  const token = await getToken();
  const res = await fetch(
    `/api/reports?clientId=${encodeURIComponent(clientId)}&groupId=${encodeURIComponent(groupId)}&reportId=${encodeURIComponent(reportId)}`,
    { headers: headers(token), signal },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to fetch report');
  }
  const body = await res.json();
  return body.data ?? null;
}

export async function createReport(
  clientId: string,
  groupId: string,
  name: string,
  blockMap: Record<string, CanvasBlock> = {},
  layout: CanvasRow[] = [],
  queries?: TemplateQueryConfig[],
  description?: string,
  filters?: CanvasPageFilters,
  templateId?: string,
  productRefs?: string[],
  metricRefs?: string[],
): Promise<string> {
  const token = await getToken();
  const payload: Record<string, unknown> = { clientId, groupId, name, blockMap, layout };
  if (queries && queries.length > 0) payload.queries = queries;
  if (description) payload.description = description;
  if (filters && Object.keys(filters).length > 0) payload.filters = filters;
  if (templateId) payload.templateId = templateId;
  if (productRefs?.length) payload.productRefs = productRefs;
  if (metricRefs?.length) payload.metricRefs = metricRefs;
  const res = await fetch('/api/reports', {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to create report');
  }
  const body = await res.json();
  return body.data.id;
}

export async function renameReport(
  clientId: string,
  groupId: string,
  reportId: string,
  name: string,
): Promise<void> {
  const token = await getToken();
  const res = await fetch('/api/reports', {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify({ clientId, groupId, reportId, name }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to rename report');
  }
}

export async function updateReport(
  clientId: string,
  groupId: string,
  reportId: string,
  blockMap: Record<string, CanvasBlock>,
  layout: CanvasRow[],
): Promise<void> {
  const token = await getToken();
  const res = await fetch('/api/reports', {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify({ clientId, groupId, reportId, blockMap, layout }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to update report');
  }
}

export async function deleteReport(
  clientId: string,
  groupId: string,
  reportId: string,
): Promise<void> {
  const token = await getToken();
  const res = await fetch(
    `/api/reports?clientId=${encodeURIComponent(clientId)}&groupId=${encodeURIComponent(groupId)}&reportId=${encodeURIComponent(reportId)}`,
    {
      method: 'DELETE',
      headers: headers(token),
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to delete report');
  }
}

export async function duplicateReport(
  clientId: string,
  groupId: string,
  reportId: string,
): Promise<string> {
  const token = await getToken();
  const res = await fetch('/api/reports', {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ action: 'duplicate', clientId, groupId, reportId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to duplicate report');
  }
  const body = await res.json();
  return body.data.id;
}

export async function moveReport(
  clientId: string,
  fromGroupId: string,
  toGroupId: string,
  reportId: string,
): Promise<string> {
  const token = await getToken();
  const res = await fetch('/api/reports', {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ action: 'move', clientId, groupId: fromGroupId, reportId, toGroupId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to move report');
  }
  const body = await res.json();
  return body.data.id;
}
