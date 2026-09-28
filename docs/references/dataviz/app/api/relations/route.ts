import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/shared/lib/firebase/admin';
import { isAdminEmail } from '@/shared/lib/runtime-config';
import { verifyAuthToken } from '@/shared/lib/api-auth';
import { RelationDoc } from '@/shared/schemas/relation';
import { Slug } from '@/shared/schemas/identifier';
import { auditFields } from '@/shared/lib/firestore/audit';

/**
 * CRUD de Relations (chaves de JOIN cross-contract — ADR-0015 / R2).
 * Leitura para qualquer usuário autenticado; escrita só admin.
 */
export async function GET(req: NextRequest) {
  const email = await verifyAuthToken(req);
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const snap = await getDb().collection('relations').get();
  const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const email = await verifyAuthToken(req);
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!isAdminEmail(email)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const raw = await req.json();
  const idResult = Slug.safeParse(raw?.id);
  if (!idResult.success) {
    return NextResponse.json({ error: 'id inválido (kebab-case)' }, { status: 400 });
  }
  const parsed = RelationDoc.safeParse({ ...raw, createdAt: raw?.createdAt ?? 0, updatedAt: raw?.updatedAt ?? 0 });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Payload inválido', issues: parsed.error.issues }, { status: 400 });
  }

  const ref = getDb().collection('relations').doc(idResult.data);
  const existing = await ref.get();
  await ref.set(
    {
      label: parsed.data.label,
      leftRef: parsed.data.leftRef,
      rightRef: parsed.data.rightRef,
      cardinality: parsed.data.cardinality,
      description: parsed.data.description ?? null,
      ...auditFields(email, !existing.exists),
    },
    { merge: true },
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const email = await verifyAuthToken(req);
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!isAdminEmail(email)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 });
  await getDb().collection('relations').doc(id).delete();
  return NextResponse.json({ ok: true });
}
