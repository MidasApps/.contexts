import { NextRequest, NextResponse } from 'next/server';
import { ensureAdminApp, getAdminFirestore } from '@/shared/lib/firebase/admin';
import { Slug, SqlIdentifier } from '@/shared/schemas';
import {
  DATAVIZ_DATABASE_ID,
  isAdminEmail,
} from '@/shared/lib/runtime-config';
import { verifyAuthToken } from '@/shared/lib/api-auth';

/**
 * DELETE para uma entity do Data Contract.
 *
 * Hard delete obrigatório (EntityDoc não tem flag `deprecated`). Cascateia
 * os attributes filhos em batch antes de remover a entity. Métricas que
 * referenciam attributes desta entity passam a falhar fail-loud na
 * resolução — recomendado revisar `metrics` antes de chamar.
 */

ensureAdminApp();

function firestore() {
  return getAdminFirestore(DATAVIZ_DATABASE_ID);
}


type RouteParams = Promise<{ id: string; entityId: string }>;

export async function DELETE(req: NextRequest, { params }: { params: RouteParams }) {
  const email = await verifyAuthToken(req);
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!isAdminEmail(email)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const p = await params;
  const contractParse = Slug.safeParse(p.id);
  if (!contractParse.success) return NextResponse.json({ error: 'Contract ID inválido' }, { status: 400 });
  const entityParse = SqlIdentifier.safeParse(p.entityId);
  if (!entityParse.success) return NextResponse.json({ error: 'Entity ID inválido' }, { status: 400 });

  try {
    const db = firestore();
    const entityRef = db
      .collection('dataContracts')
      .doc(contractParse.data)
      .collection('entities')
      .doc(entityParse.data);

    const attrsSnap = await entityRef.collection('attributes').get();
    let deletedAttrs = 0;
    while (deletedAttrs < attrsSnap.size) {
      const batch = db.batch();
      const slice = attrsSnap.docs.slice(deletedAttrs, deletedAttrs + 400);
      for (const doc of slice) batch.delete(doc.ref);
      await batch.commit();
      deletedAttrs += slice.length;
    }

    await entityRef.delete();
    return NextResponse.json({ ok: true, deletedAttributes: deletedAttrs });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao remover entity';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
