/**
 * Sprint 3.C — Task 8 — Approve gate (ADR-0009 §Gates).
 *
 * POST /api/admin/sql-catalog/[id]/approve
 *   body: { qualityScore: number, clientId?: string }
 *
 * Gates:
 *   1. qualityScore >= 0.7 → senão 422 quality_score below threshold
 *   2. dry_run mandatório (re-roda) → senão 422 dry_run failed
 *   3. dry_run.bytesProcessed <= 5GB → senão 422 bytes_processed exceeds budget
 *   4. clientId obrigatório e igual ao clientId do row alvo (400 ausente / 403 mismatch)
 *
 * Carimba glossary_version + regulatory_pack_version correntes.
 */
import { NextResponse } from 'next/server';
import { createRepository } from '@/features/sql-catalog/repository';
import { dryRunInClientScope } from '@/features/ai-agents/tools/bq-dry-run';
import { requireAdmin, isAdminAuthOk } from '@/shared/lib/auth/require-admin';
import { GLOSSARY_VERSION } from '@/shared/config/glossary';

export const runtime = 'nodejs';

const FIVE_GB = 5 * 1024 * 1024 * 1024;
const QS_MIN = 0.7;

function getRepo() {
  return createRepository();
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  const auth = await requireAdmin(req);
  if (!isAdminAuthOk(auth)) return auth;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    qualityScore?: unknown;
    clientId?: unknown;
  };
  const qualityScore = typeof body.qualityScore === 'number' ? body.qualityScore : NaN;
  if (!Number.isFinite(qualityScore)) {
    return NextResponse.json({ error: 'qualityScore numérico obrigatório' }, { status: 400 });
  }
  if (qualityScore < QS_MIN) {
    return NextResponse.json(
      { error: 'quality_score below threshold', threshold: QS_MIN },
      { status: 422 },
    );
  }

  const repo = getRepo();
  const existing = await repo.getById(id);
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
  if (clientId === '') {
    return NextResponse.json(
      { error: 'clientId obrigatório (multi-tenant guard)' },
      { status: 400 },
    );
  }
  if (clientId !== existing.client_id) {
    return NextResponse.json(
      { error: 'clientId mismatch (multi-tenant guard)' },
      { status: 403 },
    );
  }

  const dryRun = await dryRunInClientScope(existing.sql, existing.client_id);
  if (!dryRun.valid) {
    return NextResponse.json(
      { error: 'dry_run failed', detail: dryRun.error },
      { status: 422 },
    );
  }
  if ((dryRun.bytesProcessed ?? 0) > FIVE_GB) {
    return NextResponse.json(
      {
        error: 'bytes_processed exceeds budget',
        bytesProcessed: dryRun.bytesProcessed,
        limit: FIVE_GB,
      },
      { status: 422 },
    );
  }

  const regulatoryPackVersion = process.env.REGULATORY_PACK_VERSION ?? 'r1';
  await repo.approve({
    id,
    curatedBy: auth.uid,
    qualityScore,
    glossaryVersion: GLOSSARY_VERSION,
    regulatoryPackVersion,
  });
  return NextResponse.json({
    ok: true,
    status: 'approved',
    qualityScore,
    glossaryVersion: GLOSSARY_VERSION,
    regulatoryPackVersion,
  });
}
