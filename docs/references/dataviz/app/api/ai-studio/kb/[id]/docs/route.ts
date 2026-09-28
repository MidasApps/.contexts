import { NextResponse } from 'next/server';
import { requireAdmin, isAdminAuthOk } from '@/shared/lib/auth/require-admin';
import { AiStudioRepo } from '@/features/ai-studio/repo';
import { ingestKbFile } from '@/features/ai-studio/kb/ingest';
import { listSources, deleteSource } from '@/features/ai-studio/kb/sources-repo';
import { extFromFilename } from '@/features/ai-studio/kb/extract';

export const runtime = 'nodejs';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: RouteParams) {
  const auth = await requireAdmin(req);
  if (!isAdminAuthOk(auth)) return auth;
  try {
    const { id } = await params;
    return NextResponse.json({ data: await listSources(id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro ao listar docs' }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: RouteParams) {
  const auth = await requireAdmin(req);
  if (!isAdminAuthOk(auth)) return auth;
  try {
    const { id } = await params;
    const kb = await new AiStudioRepo('knowledgeBase').get(id);
    if (!kb) return NextResponse.json({ error: 'KB não encontrada' }, { status: 404 });

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Arquivo ausente (campo "file")' }, { status: 400 });

    if (!extFromFilename(file.name)) {
      return NextResponse.json({ error: 'Formato não suportado (use .md, .txt ou .pdf)' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Arquivo excede 10 MB' }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const source = await ingestKbFile({
      kb: { id: kb.id, clientId: (kb as { clientId?: string | null }).clientId ?? null },
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      bytes,
      uploadedBy: auth.uid,
    }, undefined);
    return NextResponse.json({ data: source });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro no upload' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const auth = await requireAdmin(req);
  if (!isAdminAuthOk(auth)) return auth;
  try {
    await params; // valida o shape; id não é necessário (docId identifica o source)
    const docId = new URL(req.url).searchParams.get('docId');
    if (!docId) return NextResponse.json({ error: 'docId é obrigatório' }, { status: 400 });
    await deleteSource(docId, undefined);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro ao excluir doc' }, { status: 500 });
  }
}
