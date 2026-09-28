import { NextRequest, NextResponse } from 'next/server';
import { ensureAdminApp, getAdminFirestore } from '@/shared/lib/firebase/admin';
import { EntityDoc, Slug, SqlIdentifier } from '@/shared/schemas';
import {
  DATAVIZ_DATABASE_ID,
  isAdminEmail,
} from '@/shared/lib/runtime-config';
import { verifyAuthToken } from '@/shared/lib/api-auth';
import { auditFields } from '@/shared/lib/firestore/audit';

/**
 * CRUD para entities de um Data Contract (ADR-0015).
 * Path: dataContracts/{id}/entities/{entityId}
 */

ensureAdminApp();

function firestore() {
  return getAdminFirestore(DATAVIZ_DATABASE_ID);
}


export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const email = await verifyAuthToken(req);
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { id } = await params;
  const idParse = Slug.safeParse(id);
  if (!idParse.success) return NextResponse.json({ error: 'Contract ID inválido' }, { status: 400 });

  try {
    const snap = await firestore()
      .collection('dataContracts')
      .doc(idParse.data)
      .collection('entities')
      .get();
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao listar';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const email = await verifyAuthToken(req);
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!isAdminEmail(email)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const { id } = await params;
  const contractParse = Slug.safeParse(id);
  if (!contractParse.success) {
    return NextResponse.json({ error: 'Contract ID inválido' }, { status: 400 });
  }

  try {
    const rawBody = await req.json();
    const entityIdParse = SqlIdentifier.safeParse(rawBody?.id);
    if (!entityIdParse.success) {
      return NextResponse.json({ error: 'Entity ID inválido (SqlIdentifier)' }, { status: 400 });
    }

    const docParse = EntityDoc.omit({ createdAt: true, updatedAt: true }).safeParse({
      label: rawBody.label,
      description: rawBody.description ?? '',
    });
    if (!docParse.success) {
      return NextResponse.json(
        { error: 'Payload inválido', issues: docParse.error.issues },
        { status: 400 },
      );
    }

    const contractRef = firestore().collection('dataContracts').doc(contractParse.data);
    const contractSnap = await contractRef.get();
    if (!contractSnap.exists) {
      return NextResponse.json({ error: 'Contract não encontrado' }, { status: 404 });
    }

    const ref = contractRef.collection('entities').doc(entityIdParse.data);
    const existing = await ref.get();
    await ref.set(
      {
        ...docParse.data,
        ...auditFields(email, !existing.exists),
      },
      { merge: false },
    );

    return NextResponse.json({ ok: true, id: entityIdParse.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao salvar';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
