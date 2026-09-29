import { NextResponse } from 'next/server';
import { requireAdmin, isAdminAuthOk } from '@/shared/lib/auth/require-admin';
import { listTools } from '@/features/ai-studio/tools-manifest';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (!isAdminAuthOk(auth)) return auth;
  return NextResponse.json({ data: listTools() });
}
