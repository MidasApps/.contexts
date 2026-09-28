import { NextRequest, NextResponse } from 'next/server';
import { ensureAdminApp, getAdminFirestore } from '@/shared/lib/firebase/admin';
import { DataSourceDoc, Slug } from '@/shared/schemas';
import {
  DATAVIZ_DATABASE_ID,
  isAdminEmail,
} from '@/shared/lib/runtime-config';
import { verifyAuthToken } from '@/shared/lib/api-auth';
import { invalidateDataSourceCache } from '@/shared/repositories/data-source-repo';
import { auditFields } from '@/shared/lib/firestore/audit';

/**
 * CRUD para dataSources/ — projetos GCP acessíveis pelo sistema.
 * Escrita restrita a admin; leitura pede apenas usuário autenticado.
 */

ensureAdminApp();

function firestore() {
  return getAdminFirestore(DATAVIZ_DATABASE_ID);
}


export async function GET(req: NextRequest) {
  const email = await verifyAuthToken(req);
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  try {
    const snap = await firestore().collection('dataSources').get();
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao listar';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const email = await verifyAuthToken(req);
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!isAdminEmail(email)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  try {
    const rawBody = await req.json();
    const idParse = Slug.safeParse(rawBody?.id);
    if (!idParse.success) {
      return NextResponse.json({ error: 'ID inválido (esperado kebab-case)' }, { status: 400 });
    }

    const docParse = DataSourceDoc.omit({ createdAt: true, updatedAt: true }).safeParse({
      name: rawBody.name,
      projectId: rawBody.projectId,
      location: rawBody.location ?? 'US',
      description: rawBody.description ?? null,
    });
    if (!docParse.success) {
      return NextResponse.json(
        { error: 'Payload inválido', issues: docParse.error.issues },
        { status: 400 },
      );
    }

    const ref = firestore().collection('dataSources').doc(idParse.data);
    const existing = await ref.get();
    await ref.set(
      {
        ...docParse.data,
        ...auditFields(email, !existing.exists),
      },
      { merge: true },
    );

    invalidateDataSourceCache(idParse.data);
    return NextResponse.json({ ok: true, id: idParse.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao salvar';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const email = await verifyAuthToken(req);
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!isAdminEmail(email)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  try {
    const id = new URL(req.url).searchParams.get('id');
    const idParse = Slug.safeParse(id);
    if (!idParse.success) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

    await firestore().collection('dataSources').doc(idParse.data).delete();
    invalidateDataSourceCache(idParse.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao excluir';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
