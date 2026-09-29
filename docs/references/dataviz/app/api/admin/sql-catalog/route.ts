/**
 * Sprint 3.C — Task 8.
 *
 * Admin SQL-catalog collection endpoint.
 *
 *   GET  /api/admin/sql-catalog?clientId=...&status=...&personaId=...&page=1&pageSize=50
 *   POST /api/admin/sql-catalog          (cria draft; valida via dry-run antes)
 *
 * Multi-tenancy (ADR-0006): `clientId` é obrigatório no GET (fail-closed).
 * Sem `clientId` → 400, jamais dump global silencioso.
 */
import { NextResponse } from 'next/server';
import { createRepository } from '@/features/sql-catalog/repository';
import type { SqlCatalogStatus } from '@/features/sql-catalog/repository';
import { dryRunInClientScope } from '@/features/ai-agents/tools/bq-dry-run';
import { requireAdmin, isAdminAuthOk } from '@/shared/lib/auth/require-admin';

export const runtime = 'nodejs';

const VALID_STATUSES = new Set<SqlCatalogStatus>([
  'draft',
  'approved',
  'deprecated',
  'needs_revalidation',
]);

function getRepo() {
  return createRepository();
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (!isAdminAuthOk(auth)) return auth;

  const url = new URL(req.url);
  const clientId = url.searchParams.get('clientId')?.trim();
  if (!clientId) {
    return NextResponse.json(
      { error: 'clientId é obrigatório (ADR-0006 fail-closed).' },
      { status: 400 },
    );
  }
  const statusRaw = url.searchParams.get('status') ?? undefined;
  const status =
    statusRaw && VALID_STATUSES.has(statusRaw as SqlCatalogStatus)
      ? (statusRaw as SqlCatalogStatus)
      : undefined;
  const personaId = url.searchParams.get('personaId') ?? undefined;
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
  const pageSize = Math.min(
    200,
    Math.max(1, Number(url.searchParams.get('pageSize') ?? '50') || 50),
  );
  const offset = (page - 1) * pageSize;

  const repo = getRepo();
  const [items, total] = await Promise.all([
    repo.listByClient({ clientId, status, personaId, limit: pageSize, offset }),
    repo.countByClient({ clientId, status, personaId }),
  ]);
  return NextResponse.json({ items, total, page, pageSize });
}

interface PostBody {
  intent?: unknown;
  sql?: unknown;
  clientId?: unknown;
  personaId?: unknown;
  schemaSnapshot?: unknown;
  tags?: unknown;
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (!isAdminAuthOk(auth)) return auth;

  const body = (await req.json().catch(() => ({}))) as PostBody;
  const intent = typeof body.intent === 'string' ? body.intent : '';
  const sql = typeof body.sql === 'string' ? body.sql : '';
  const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
  if (!intent || !sql || !clientId) {
    return NextResponse.json(
      { error: 'intent, sql e clientId são obrigatórios.' },
      { status: 400 },
    );
  }

  const dryRun = await dryRunInClientScope(sql, clientId);
  if (!dryRun.valid) {
    return NextResponse.json(
      { error: 'dry_run failed', detail: dryRun.error, errorClass: dryRun.errorClass },
      { status: 422 },
    );
  }

  const repo = getRepo();
  const personaId = typeof body.personaId === 'string' ? body.personaId : null;
  const tags = Array.isArray(body.tags)
    ? (body.tags.filter((t) => typeof t === 'string') as string[])
    : null;
  const schemaSnapshot =
    body.schemaSnapshot && typeof body.schemaSnapshot === 'object'
      ? (body.schemaSnapshot as Record<string, unknown>)
      : null;

  const { id, sqlHash } = await repo.insertDraft({
    intent,
    sql,
    clientId,
    personaId,
    schemaSnapshot,
    tags,
  });
  return NextResponse.json({ id, sqlHash, status: 'draft' }, { status: 201 });
}
