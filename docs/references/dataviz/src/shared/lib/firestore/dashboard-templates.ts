import type { CanvasBlock, CanvasRow, CanvasPageFilters } from '@/shared/config/agents/types';
import type { TemplateQueryConfig } from '@/shared/config/dashboard-templates';

export interface TemplateRecord {
  id: string;
  name: string;
  description: string;
  category: 'Carteira' | 'Risco' | 'Operacional' | 'Covenants' | 'Imobiliária';
  productRefs: string[];
  segment?: 'sbpe' | 'mcmv' | 'both';
  blockMap: Record<string, CanvasBlock>;
  layout: CanvasRow[];
  filters?: CanvasPageFilters;
  queries?: TemplateQueryConfig[];
  metricRefs: string[];
  status: 'active' | 'draft' | 'archived';
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

const BASE = '/api/dashboard-templates';

export async function fetchTemplates(): Promise<TemplateRecord[]> {
  const token = await getToken();
  const res = await fetch(BASE, { headers: headers(token) });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Falha ao listar templates');
  }
  const body = await res.json();
  return body.data ?? [];
}

export async function getTemplate(id: string): Promise<TemplateRecord | null> {
  const token = await getToken();
  const res = await fetch(`${BASE}?id=${encodeURIComponent(id)}`, { headers: headers(token) });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Falha ao buscar template');
  }
  const body = await res.json();
  return body.data ?? null;
}

export interface SaveTemplateResult {
  id: string;
  /** productRefs são soft (frente-A): refs órfãs viram aviso não-bloqueante.
   * Presente só quando o backend sinalizou algo. Surfacing (toast) fica no hook. */
  warnings?: string[];
}

export async function saveTemplate(
  record: Partial<TemplateRecord> & { id: string },
): Promise<SaveTemplateResult> {
  const token = await getToken();
  const res = await fetch(BASE, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(record),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Falha ao salvar template');
  }
  const body = await res.json();
  const warnings = body.data?.warnings;
  return {
    id: body.data.id,
    ...(Array.isArray(warnings) && warnings.length > 0 ? { warnings } : {}),
  };
}

/**
 * `null` é diferente de ausente: o PATCH só toca os campos presentes no corpo,
 * então limpar `filters`/`queries` de um template exige mandá-los como `null`
 * — omitir manteria os antigos.
 */
export type TemplateUpdate = Partial<Omit<TemplateRecord, 'filters' | 'queries'>> & {
  filters?: CanvasPageFilters | null;
  queries?: TemplateQueryConfig[] | null;
};

export async function patchTemplate(id: string, updates: TemplateUpdate): Promise<void> {
  const token = await getToken();
  const res = await fetch(BASE, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify({ id, ...updates }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Falha ao atualizar template');
  }
}

export async function deleteTemplate(id: string): Promise<void> {
  const token = await getToken();
  const res = await fetch(`${BASE}?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: headers(token),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Falha ao excluir template');
  }
}

export async function duplicateTemplate(id: string): Promise<string> {
  const token = await getToken();
  const res = await fetch(BASE, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ action: 'duplicate', id }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Falha ao duplicar template');
  }
  const body = await res.json();
  return body.data.id;
}
