import type { ToolDescriptor } from '@/features/ai-studio/tools-manifest';

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
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export interface AiStudioRecordLike { id: string; [k: string]: unknown }
export interface SaveResult { id: string; warnings?: string[] }
export type EntityPath = 'agents' | 'skills' | 'workflows' | 'kb';

async function unwrap(res: Response, fallback: string) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || fallback);
  }
  return res.json();
}

export function makeAiStudioApi(path: EntityPath) {
  const BASE = `/api/ai-studio/${path}`;
  return {
    async list(): Promise<AiStudioRecordLike[]> {
      const token = await getToken();
      const body = await unwrap(await fetch(BASE, { headers: headers(token) }), 'Falha ao listar');
      return body.data ?? [];
    },
    async get(id: string): Promise<AiStudioRecordLike | null> {
      const token = await getToken();
      const res = await fetch(`${BASE}?id=${encodeURIComponent(id)}`, { headers: headers(token) });
      if (res.status === 404) return null;
      const body = await unwrap(res, 'Falha ao buscar');
      return body.data ?? null;
    },
    async save(record: { id: string } & Record<string, unknown>): Promise<SaveResult> {
      const token = await getToken();
      const body = await unwrap(
        await fetch(BASE, { method: 'POST', headers: headers(token), body: JSON.stringify(record) }),
        'Falha ao salvar',
      );
      const warnings = body.data?.warnings;
      return { id: body.data.id, ...(Array.isArray(warnings) && warnings.length ? { warnings } : {}) };
    },
    async patch(id: string, updates: Record<string, unknown>): Promise<void> {
      const token = await getToken();
      await unwrap(
        await fetch(BASE, { method: 'PATCH', headers: headers(token), body: JSON.stringify({ id, ...updates }) }),
        'Falha ao atualizar',
      );
    },
    async remove(id: string): Promise<void> {
      const token = await getToken();
      await unwrap(
        await fetch(`${BASE}?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: headers(token) }),
        'Falha ao excluir',
      );
    },
    async reset(id: string): Promise<void> {
      const token = await getToken();
      await unwrap(
        await fetch(BASE, { method: 'POST', headers: headers(token), body: JSON.stringify({ action: 'reset', id }) }),
        'Falha ao restaurar',
      );
    },
  };
}

export async function fetchTools(): Promise<ToolDescriptor[]> {
  const token = await getToken();
  const body = await unwrap(await fetch('/api/ai-studio/tools', { headers: headers(token) }), 'Falha ao listar tools');
  return body.data ?? [];
}

export interface KbSourceRecordLike {
  id: string; filename: string; status: 'pending' | 'processing' | 'ready' | 'error';
  chunkCount: number; error?: string; sizeBytes: number;
}

export async function listKbDocs(kbId: string, signal?: AbortSignal): Promise<KbSourceRecordLike[]> {
  const token = await getToken();
  const body = await unwrap(await fetch(`/api/ai-studio/kb/${encodeURIComponent(kbId)}/docs`, { headers: headers(token), signal }), 'Falha ao listar documentos');
  return body.data ?? [];
}

export async function uploadKbDoc(kbId: string, file: File): Promise<KbSourceRecordLike> {
  const token = await getToken();
  const fd = new FormData();
  fd.append('file', file);
  // NÃO setar Content-Type — o browser define o boundary do multipart.
  const res = await fetch(`/api/ai-studio/kb/${encodeURIComponent(kbId)}/docs`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
  });
  const body = await unwrap(res, 'Falha no upload');
  return body.data;
}

export async function deleteKbDoc(kbId: string, docId: string): Promise<void> {
  const token = await getToken();
  await unwrap(
    await fetch(`/api/ai-studio/kb/${encodeURIComponent(kbId)}/docs?docId=${encodeURIComponent(docId)}`, { method: 'DELETE', headers: headers(token) }),
    'Falha ao excluir documento',
  );
}
