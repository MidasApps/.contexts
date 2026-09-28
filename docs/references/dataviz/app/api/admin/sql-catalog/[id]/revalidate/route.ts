/**
 * Sprint 3.C — Task 8 — Revalidate.
 *
 * Força re-dry_run de uma entrada `needs_revalidation`. Se passa, marca como
 * `approved` mantendo `curated_by`/`curated_at` originais e populando as
 * versões correntes (glossary + regulatory pack).
 *
 * Se falha, uma entrada `approved` cai para `needs_revalidation`: seguir
 * aprovada mantinha o SQL reprovado sendo servido ao modelo como exemplo
 * validado (`list_validated_queries`).
 */
import { NextResponse } from 'next/server';
import { createRepository } from '@/features/sql-catalog/repository';
import { dryRunInClientScope } from '@/features/ai-agents/tools/bq-dry-run';
import { requireAdmin, isAdminAuthOk } from '@/shared/lib/auth/require-admin';
import { GLOSSARY_VERSION } from '@/shared/config/glossary';

export const runtime = 'nodejs';

const FIVE_GB = 5 * 1024 * 1024 * 1024;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  const auth = await requireAdmin(req);
  if (!isAdminAuthOk(auth)) return auth;
  const { id } = await params;

  const repo = createRepository();
  const existing = await repo.getById(id);
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const dryRun = await dryRunInClientScope(existing.sql, existing.client_id);
  const rejected = !dryRun.valid || (dryRun.bytesProcessed ?? 0) > FIVE_GB;
  if (rejected && existing.status === 'approved') {
    await repo.markNeedsRevalidation({ affectedIds: [id] });
  }
  const status = rejected && existing.status === 'approved' ? 'needs_revalidation' : existing.status;
  if (!dryRun.valid) {
    return NextResponse.json(
      { error: 'dry_run failed', detail: dryRun.error, status },
      { status: 422 },
    );
  }
  if ((dryRun.bytesProcessed ?? 0) > FIVE_GB) {
    return NextResponse.json(
      { error: 'bytes_processed exceeds budget', bytesProcessed: dryRun.bytesProcessed, status },
      { status: 422 },
    );
  }

  const regulatoryPackVersion = process.env.REGULATORY_PACK_VERSION ?? 'r1';
  // Re-approve: re-stamps versions and quality_score, retains existing curatedBy when possible.
  const qualityScore = existing.quality_score ?? 0.7;
  const curatedBy = existing.curated_by ?? auth.uid;
  await repo.approve({
    id,
    curatedBy,
    qualityScore,
    glossaryVersion: GLOSSARY_VERSION,
    regulatoryPackVersion,
  });
  return NextResponse.json({
    ok: true,
    status: 'approved',
    glossaryVersion: GLOSSARY_VERSION,
    regulatoryPackVersion,
  });
}
