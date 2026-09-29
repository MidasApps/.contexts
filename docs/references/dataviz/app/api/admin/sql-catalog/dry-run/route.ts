/**
 * Sprint 3.C — Task 9 — endpoint de dry-run usado pela UI antes de salvar
 * edição de SQL. Valida no escopo do cliente da entrada, como o save fará
 * (`dryRunInClientScope`).
 */
import { NextResponse } from 'next/server';
import { dryRunInClientScope } from '@/features/ai-agents/tools/bq-dry-run';
import { requireAdmin, isAdminAuthOk } from '@/shared/lib/auth/require-admin';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (!isAdminAuthOk(auth)) return auth;
  const body = (await req.json().catch(() => ({}))) as { sql?: unknown; clientId?: unknown };
  const sql = typeof body.sql === 'string' ? body.sql : '';
  const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
  if (!sql || !clientId) return NextResponse.json({ error: 'sql e clientId obrigatórios' }, { status: 400 });
  const result = await dryRunInClientScope(sql, clientId);
  return NextResponse.json(result, { status: result.valid ? 200 : 422 });
}
