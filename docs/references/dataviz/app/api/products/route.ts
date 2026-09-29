import { NextRequest, NextResponse } from 'next/server';
import { ensureAdminApp, getAdminFirestore } from '@/shared/lib/firebase/admin';
import { ProductDoc, Slug } from '@/shared/schemas';
import {
  DATAVIZ_DATABASE_ID,
  isAdminEmail,
} from '@/shared/lib/runtime-config';
import { verifyAuthToken } from '@/shared/lib/api-auth';
import { invalidateProductCache } from '@/shared/repositories/product-repo';
import { auditFields } from '@/shared/lib/firestore/audit';

/**
 * CRUD para products/ — verticais com dicionário de dados.
 * Escrita restrita a admin; leitura pede apenas usuário autenticado.
 */

ensureAdminApp();

function firestore() {
  return getAdminFirestore(DATAVIZ_DATABASE_ID);
}

/**
 * Validação SOFT (não-bloqueante) das refs de catálogo de um produto.
 * Refs de catálogo não têm FK rígida (decisão frente-A: UI degrada
 * graciosamente), então refs órfãs viram `warnings` no 200 — nunca 422.
 *
 *  - metricRefs[]  → `metrics/{id}` deve existir.
 *  - entityRefs[]  → o entity deve existir sob ALGUM dos contractRefs do
 *    produto (`dataContracts/{contractRef}/entities/{entityId}`).
 */
async function collectProductRefWarnings(
  contractRefs: string[],
  entityRefs: string[],
  metricRefs: string[],
): Promise<string[]> {
  const db = firestore();
  const warnings: string[] = [];

  for (const id of metricRefs) {
    const snap = await db.collection('metrics').doc(id).get();
    if (!snap.exists) warnings.push(`metricRefs "${id}" inexistente`);
  }

  for (const entityId of entityRefs) {
    const checks = await Promise.all(
      contractRefs.map((contractRef) =>
        db
          .collection('dataContracts')
          .doc(contractRef)
          .collection('entities')
          .doc(entityId)
          .get()
          .then((snap) => snap.exists),
      ),
    );
    if (!checks.some(Boolean)) {
      warnings.push(`entityRefs "${entityId}" não encontrado em nenhum contractRef`);
    }
  }

  return warnings;
}


export async function GET(req: NextRequest) {
  const email = await verifyAuthToken(req);
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  try {
    const snap = await firestore().collection('products').get();
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

    const docParse = ProductDoc.omit({ createdAt: true, updatedAt: true }).safeParse({
      name: rawBody.name,
      slug: rawBody.slug ?? idParse.data,
      icon: rawBody.icon,
      color: rawBody.color,
      status: rawBody.status ?? 'draft',
      description: rawBody.description ?? null,
      // ── Camada nova (ADR-0015) ───────────────────────────
      contractRefs: rawBody.contractRefs ?? [],
      entityRefs: rawBody.entityRefs ?? [],
      metricRefs: rawBody.metricRefs ?? [],
      // ── Legado (coexistência) ────────────────────────────
      indicators: rawBody.indicators ?? [],
      routes: rawBody.routes ?? [],
    });
    if (!docParse.success) {
      return NextResponse.json(
        { error: 'Payload inválido', issues: docParse.error.issues },
        { status: 400 },
      );
    }

    // Validação SOFT de refs de catálogo — coletada antes do persist, mas
    // NUNCA bloqueia a escrita (frente-A: refs sem FK rígida).
    const warnings = await collectProductRefWarnings(
      docParse.data.contractRefs,
      docParse.data.entityRefs,
      docParse.data.metricRefs,
    );
    if (warnings.length > 0) {
      console.warn(`[POST /api/products] ${idParse.data}:`, warnings);
    }

    const ref = firestore().collection('products').doc(idParse.data);
    const existing = await ref.get();
    await ref.set(
      {
        ...docParse.data,
        ...auditFields(email, !existing.exists),
      },
      { merge: false },
    );

    invalidateProductCache(idParse.data);
    // `warnings` só aparece quando há algo a sinalizar (happy-path inalterado).
    return NextResponse.json({
      ok: true,
      id: idParse.data,
      ...(warnings.length > 0 ? { warnings } : {}),
    });
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

    const db = firestore();

    // Guards independentes — rodam em paralelo:
    //  (a) clientes com bindings para este produto (filtro in-code, nested);
    //  (b) dashboard templates com productRefs apontando para este produto.
    const [clientsSnap, templatesSnap] = await Promise.all([
      db.collection('clients').get(),
      db.collection('dashboardTemplates').where('productRefs', 'array-contains', idParse.data).get(),
    ]);

    const dependentClients = clientsSnap.docs
      .filter((c) => {
        const bindings = (c.data().productBindings ?? []) as Array<{ productId: string }>;
        return bindings.some((b) => b.productId === idParse.data);
      })
      .map((c) => c.id);

    const dependentTemplates = templatesSnap.docs.map((d) => d.id);

    if (dependentClients.length > 0 || dependentTemplates.length > 0) {
      return NextResponse.json(
        {
          error: 'Produto referenciado',
          dependentClients,
          dependentTemplates,
        },
        { status: 422 },
      );
    }

    await db.collection('products').doc(idParse.data).delete();
    invalidateProductCache(idParse.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao excluir';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
