import { NextResponse } from 'next/server';
import '@/shared/lib/firebase/admin';
import { getAuth } from 'firebase-admin/auth';
import { isAdminEmail, isDevAuthBypassEnabled, DEV_BYPASS_EMAIL } from '@/shared/lib/runtime-config';

/**
 * Sprint 3.C — Task 8.
 *
 * `requireAdmin` verifica Bearer token via Firebase Admin SDK e exige que o
 * usuário tenha custom claim `role === 'admin'` (gate primário). Como
 * fallback, aceita também e-mail no domínio admin (Sprint 3.B paridade) —
 * isso permite onboarding incremental enquanto custom claims não foram
 * provisionados em produção.
 *
 * Returns:
 *   - `{uid: string}` em sucesso.
 *   - `NextResponse` com 401/403 em falha.
 */
export interface AdminAuthOk {
  uid: string;
}

export type RequireAdminResult = AdminAuthOk | NextResponse;

export function isAdminAuthOk(r: RequireAdminResult): r is AdminAuthOk {
  return typeof (r as AdminAuthOk).uid === 'string';
}

function unauthorized(reason: string): NextResponse {
  return NextResponse.json({ error: reason }, { status: 401 });
}

function forbidden(reason: string): NextResponse {
  return NextResponse.json({ error: reason }, { status: 403 });
}

export async function requireAdmin(req: Request): Promise<RequireAdminResult> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    if (isDevAuthBypassEnabled()) return { uid: `dev:${DEV_BYPASS_EMAIL}` };
    return unauthorized('Token ausente');
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    if (isDevAuthBypassEnabled()) return { uid: `dev:${DEV_BYPASS_EMAIL}` };
    return unauthorized('Token ausente');
  }

  let decoded: Awaited<ReturnType<ReturnType<typeof getAuth>['verifyIdToken']>>;
  try {
    decoded = await getAuth().verifyIdToken(token);
  } catch {
    if (isDevAuthBypassEnabled()) return { uid: `dev:${DEV_BYPASS_EMAIL}` };
    return unauthorized('Token inválido');
  }

  const role = (decoded as { role?: unknown }).role;
  const email = decoded.email ?? null;
  const isAdminClaim = role === 'admin';
  const isAdminFallback = isAdminEmail(email);

  if (!isAdminClaim && !isAdminFallback) {
    return forbidden('Acesso restrito a administradores');
  }

  return { uid: decoded.uid };
}
