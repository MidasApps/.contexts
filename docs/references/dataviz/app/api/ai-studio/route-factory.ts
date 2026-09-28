import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAdmin, isAdminAuthOk } from '@/shared/lib/auth/require-admin';
import { Slug } from '@/shared/schemas/identifier';
import { AiStudioRepo } from '@/features/ai-studio/repo';
import { getSeed } from '@/features/ai-studio/seed/manifest';
import { ProtectionError } from '@/features/ai-studio/protection';
import type { AiEntityType } from '@/features/ai-studio/protection';

function errStatus(e: unknown): number {
  if (e instanceof ProtectionError) return e.status;
  if (e instanceof ZodError) return 400;
  return 500;
}
function msg(e: unknown, fallback: string): string {
  if (e instanceof ZodError) return e.issues.map((i) => i.message).join('; ') || 'Payload inválido';
  return e instanceof Error ? e.message : fallback;
}

export function makeAiStudioRoutes(type: AiEntityType) {
  const repo = () => new AiStudioRepo(type);

  async function GET(req: Request) {
    const auth = await requireAdmin(req);
    if (!isAdminAuthOk(auth)) return auth;
    try {
      const id = new URL(req.url).searchParams.get('id');
      if (id) {
        const data = await repo().get(id);
        if (!data) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
        return NextResponse.json({ data });
      }
      return NextResponse.json({ data: await repo().list() });
    } catch (e) {
      return NextResponse.json({ error: msg(e, 'Erro ao listar') }, { status: 500 });
    }
  }

  async function POST(req: Request) {
    const auth = await requireAdmin(req);
    if (!isAdminAuthOk(auth)) return auth;
    try {
      const body = await req.json();

      if (body.action === 'reset') {
        if (!body.id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 });
        const seed = getSeed(type, body.id);
        if (!seed) return NextResponse.json({ error: 'Sem seed para restaurar' }, { status: 404 });
        await repo().reset(body.id, seed.doc);
        return NextResponse.json({ data: { id: body.id } });
      }

      const idResult = Slug.safeParse(body.id);
      if (!idResult.success) return NextResponse.json({ error: 'id inválido (kebab-case)' }, { status: 400 });
      const { id: _id, action: _action, ...payload } = body;
      const result = await repo().upsert(idResult.data, payload);
      return NextResponse.json({ data: result });
    } catch (e) {
      return NextResponse.json({ error: msg(e, 'Erro ao salvar') }, { status: errStatus(e) });
    }
  }

  async function PATCH(req: Request) {
    const auth = await requireAdmin(req);
    if (!isAdminAuthOk(auth)) return auth;
    try {
      const body = await req.json();
      if (!body.id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 });
      const { id, ...updates } = body;
      await repo().patch(id, updates);
      return NextResponse.json({ ok: true });
    } catch (e) {
      return NextResponse.json({ error: msg(e, 'Erro ao atualizar') }, { status: errStatus(e) });
    }
  }

  async function DELETE(req: Request) {
    const auth = await requireAdmin(req);
    if (!isAdminAuthOk(auth)) return auth;
    try {
      const id = new URL(req.url).searchParams.get('id');
      if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 });
      await repo().remove(id);
      return NextResponse.json({ ok: true });
    } catch (e) {
      return NextResponse.json({ error: msg(e, 'Erro ao excluir') }, { status: errStatus(e) });
    }
  }

  return { GET, POST, PATCH, DELETE };
}
