import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { ensureAdminApp, getAdminFirestore } from '@/shared/lib/firebase/admin';
import { DataContractDoc, Slug } from '@/shared/schemas';
import {
  DATAVIZ_DATABASE_ID,
  isAdminEmail,
} from '@/shared/lib/runtime-config';
import { verifyAuthToken } from '@/shared/lib/api-auth';
import { auditFields } from '@/shared/lib/firestore/audit';

/**
 * CRUD para dataContracts/ — camada semântica (ADR-0015).
 * Escrita restrita a admin; leitura para qualquer usuário autenticado.
 */

ensureAdminApp();

function firestore() {
  return getAdminFirestore(DATAVIZ_DATABASE_ID);
}


export async function GET(req: NextRequest) {
  const email = await verifyAuthToken(req);
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  try {
    const snap = await firestore().collection('dataContracts').get();
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
      return NextResponse.json({ error: 'ID inválido (kebab-case)' }, { status: 400 });
    }

    const docParse = DataContractDoc.omit({ createdAt: true, updatedAt: true }).safeParse({
      name: rawBody.name,
      version: rawBody.version ?? '1.0.0',
      status: rawBody.status ?? 'draft',
      description: rawBody.description ?? null,
    });
    if (!docParse.success) {
      return NextResponse.json(
        { error: 'Payload inválido', issues: docParse.error.issues },
        { status: 400 },
      );
    }

    const ref = firestore().collection('dataContracts').doc(idParse.data);
    const existing = await ref.get();
    await ref.set(
      {
        ...docParse.data,
        ...auditFields(email, !existing.exists),
      },
      { merge: false },
    );

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
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    const hard = url.searchParams.get('hard') === 'true';
    const idParse = Slug.safeParse(id);
    if (!idParse.success) return NextResponse.json({ error: 'ID inválido' }, { status: 400 });

    const db = firestore();
    const contractRef = db.collection('dataContracts').doc(idParse.data);

    if (!hard) {
      // Soft delete: marca contract como deprecated. Entities/attributes intactos.
      await contractRef.update({ status: 'deprecated', updatedAt: Timestamp.now() });
      return NextResponse.json({ ok: true });
    }

    // Guard: bloqueia hard-delete se alguma métrica ATIVA referencia atributos
    // deste contract. Firestore não suporta prefix-match em arrays, então
    // filtramos em memória. Métricas deprecated (soft-deleted) são ignoradas —
    // não devem tornar o contract permanentemente indeletável.
    const metricsSnap = await db.collection('metrics').get();
    const prefix = idParse.data + '.';
    const dependentMetrics = metricsSnap.docs
      .filter((m) => {
        const data = m.data();
        if (data.status === 'deprecated') return false;
        const requires = (data.requires ?? []) as string[];
        return requires.some((r: string) => r.startsWith(prefix));
      })
      .map((m) => m.id);
    if (dependentMetrics.length > 0) {
      return NextResponse.json(
        { error: 'Contract referenciado por métricas', dependents: dependentMetrics },
        { status: 422 },
      );
    }

    // Hard delete + cascade: remove attributes → entities → contract.
    let deletedAttrs = 0;
    let deletedEntities = 0;
    const entitiesSnap = await contractRef.collection('entities').get();

    for (const entityDoc of entitiesSnap.docs) {
      const attrsSnap = await entityDoc.ref.collection('attributes').get();
      let i = 0;
      while (i < attrsSnap.size) {
        const batch = db.batch();
        const slice = attrsSnap.docs.slice(i, i + 400);
        for (const a of slice) batch.delete(a.ref);
        await batch.commit();
        i += slice.length;
      }
      deletedAttrs += attrsSnap.size;
      await entityDoc.ref.delete();
      deletedEntities += 1;
    }

    await contractRef.delete();
    return NextResponse.json({
      ok: true,
      deletedEntities,
      deletedAttributes: deletedAttrs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao excluir';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
