/**
 * Sprint 3.C — Task 8 — Reject (soft delete via status='deprecated').
 */
import { NextResponse } from 'next/server';
import { createRepository } from '@/features/sql-catalog/repository';
import { requireAdmin, isAdminAuthOk } from '@/shared/lib/auth/require-admin';

export const runtime = 'nodejs';

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
  await repo.reject({ id });
  return NextResponse.json({ ok: true, status: 'deprecated' });
}
