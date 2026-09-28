/**
 * Sprint 3.C — Task 8.
 *
 *   GET    /api/admin/sql-catalog/[id]   — detail
 *   PATCH  /api/admin/sql-catalog/[id]   — edit; SQL change → re-dry_run
 *   DELETE /api/admin/sql-catalog/[id]   — soft delete (status='deprecated')
 */
import { NextResponse } from 'next/server';
import { createRepository } from '@/features/sql-catalog/repository';
import { dryRunInClientScope } from '@/features/ai-agents/tools/bq-dry-run';
import { requireAdmin, isAdminAuthOk } from '@/shared/lib/auth/require-admin';

export const runtime = 'nodejs';

function getRepo() {
  return createRepository();
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, { params }: RouteParams) {
  const auth = await requireAdmin(req);
  if (!isAdminAuthOk(auth)) return auth;
  const { id } = await params;
  const row = await getRepo().getById(id);
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ item: row });
}

interface PatchBody {
  intent?: unknown;
  sql?: unknown;
  tags?: unknown;
  qualityScore?: unknown;
  schemaSnapshot?: unknown;
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const auth = await requireAdmin(req);
  if (!isAdminAuthOk(auth)) return auth;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as PatchBody;
  const repo = getRepo();
  const existing = await repo.getById(id);
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const update: Parameters<typeof repo.updateFields>[0] = { id };
  if (typeof body.intent === 'string') update.intent = body.intent;
  if (typeof body.sql === 'string' && body.sql !== existing.sql) {
    const dryRun = await dryRunInClientScope(body.sql, existing.client_id);
    if (!dryRun.valid) {
      return NextResponse.json(
        { error: 'dry_run failed', detail: dryRun.error },
        { status: 422 },
      );
    }
    update.sql = body.sql;
  }
  if (Array.isArray(body.tags)) {
    update.tags = body.tags.filter((t) => typeof t === 'string') as string[];
  } else if (body.tags === null) {
    update.tags = null;
  }
  if (typeof body.qualityScore === 'number') update.qualityScore = body.qualityScore;
  if (body.schemaSnapshot !== undefined) {
    update.schemaSnapshot =
      body.schemaSnapshot && typeof body.schemaSnapshot === 'object'
        ? (body.schemaSnapshot as Record<string, unknown>)
        : null;
  }

  await repo.updateFields(update);
  const fresh = await repo.getById(id);
  return NextResponse.json({ item: fresh });
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const auth = await requireAdmin(req);
  if (!isAdminAuthOk(auth)) return auth;
  const { id } = await params;
  const repo = getRepo();
  const existing = await repo.getById(id);
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });
  await repo.reject({ id });
  return NextResponse.json({ ok: true, status: 'deprecated' });
}
