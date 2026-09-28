import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { ensureAdminApp, getAdminFirestore } from '@/shared/lib/firebase/admin';
import { MetricDoc, MetricId } from '@/shared/schemas';
import {
  DATAVIZ_DATABASE_ID,
  isAdminEmail,
} from '@/shared/lib/runtime-config';
import { verifyAuthToken } from '@/shared/lib/api-auth';
import { auditFields } from '@/shared/lib/firestore/audit';

/**
 * Rename atômico de métrica — `POST /api/metrics/rename`.
 *
 * Substitui o antigo fluxo de dois passos (POST novo + DELETE antigo com
 * bypass), que deixava `metricRefs` órfãos em products/dashboardTemplates e
 * não tinha rollback. Aqui tudo roda numa única transação Firestore:
 *
 *   1. lê o doc antigo (oldId);
 *   2. escreve o novo doc (newId) — preserva createdAt, atualiza updatedAt;
 *   3. re-aponta `metricRefs` de cada products que contém oldId;
 *   4. re-aponta `metricRefs` de cada dashboardTemplates que contém oldId;
 *   5. deleta o doc antigo.
 *
 * Falha no meio → rollback completo (sem torn-state).
 */

ensureAdminApp();

function firestore() {
  return getAdminFirestore(DATAVIZ_DATABASE_ID);
}


/** Substitui oldId por newId num array de metricRefs (sem duplicar newId). */
function repointRefs(refs: unknown, oldId: string, newId: string): string[] {
  const arr = Array.isArray(refs) ? (refs as string[]) : [];
  const replaced = arr.map((r) => (r === oldId ? newId : r));
  // Dedup defensivo: se o doc já continha newId, evita ref duplicada.
  return Array.from(new Set(replaced));
}

export async function POST(req: NextRequest) {
  const email = await verifyAuthToken(req);
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!isAdminEmail(email)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  try {
    const rawBody = await req.json();

    const oldIdParse = MetricId.safeParse(rawBody?.oldId);
    if (!oldIdParse.success) {
      return NextResponse.json({ error: 'oldId inválido (esperado "domain.slug")' }, { status: 400 });
    }
    const newIdParse = MetricId.safeParse(rawBody?.newId);
    if (!newIdParse.success) {
      return NextResponse.json({ error: 'newId inválido (esperado "domain.slug")' }, { status: 400 });
    }
    const oldId = oldIdParse.data;
    const newId = newIdParse.data;
    if (oldId === newId) {
      return NextResponse.json({ error: 'oldId e newId são iguais' }, { status: 400 });
    }

    // Campos opcionais editados no mesmo gesto de rename. Se ausentes,
    // o doc antigo é copiado integralmente.
    const overrideDoc = rawBody?.doc
      ? MetricDoc.omit({ createdAt: true, updatedAt: true }).safeParse(rawBody.doc)
      : null;
    if (overrideDoc && !overrideDoc.success) {
      return NextResponse.json(
        { error: 'Payload doc inválido', issues: overrideDoc.error.issues },
        { status: 400 },
      );
    }

    const db = firestore();
    const oldRef = db.collection('metrics').doc(oldId);
    const newRef = db.collection('metrics').doc(newId);

    // Queries das refs fora da transação (Admin SDK não permite query dentro
    // de runTransaction sem transaction.get em query — usamos array-contains
    // antes e re-validamos a existência do oldDoc dentro da transação).
    const [productsSnap, templatesSnap] = await Promise.all([
      db.collection('products').where('metricRefs', 'array-contains', oldId).get(),
      db.collection('dashboardTemplates').where('metricRefs', 'array-contains', oldId).get(),
    ]);

    const result = await db.runTransaction(async (tx) => {
      const oldSnap = await tx.get(oldRef);
      if (!oldSnap.exists) {
        return { error: 'Métrica de origem não encontrada', status: 404 as const };
      }
      const newSnap = await tx.get(newRef);
      if (newSnap.exists) {
        return { error: 'newId já existe', status: 409 as const };
      }

      const oldData = oldSnap.data() ?? {};
      const now = Timestamp.now();

      // 2. Novo doc: campos editados (se enviados) ou cópia do antigo.
      //    Renomear é continuar o MESMO documento com outro id, então a autoria
      //    original é preservada — sobrescrevê-la com quem renomeou apagaria o
      //    dado que a trilha existe para guardar. Só `updatedBy` muda.
      const baseFields = overrideDoc ? overrideDoc.data : oldData;
      const {
        createdAt: _oldCreated,
        updatedAt: _oldUpdated,
        createdBy: _oldCreatedBy,
        updatedBy: _oldUpdatedBy,
        ...rest
      } = baseFields as Record<string, unknown>;
      tx.set(newRef, {
        ...rest,
        ...auditFields(email, false, now),
        createdAt: oldData.createdAt ?? now,
        ...(oldData.createdBy ? { createdBy: oldData.createdBy } : { createdBy: email }),
      });

      // 3 + 4. Re-aponta refs em products e dashboardTemplates.
      for (const doc of productsSnap.docs) {
        tx.update(doc.ref, { metricRefs: repointRefs(doc.data().metricRefs, oldId, newId) });
      }
      for (const doc of templatesSnap.docs) {
        tx.update(doc.ref, { metricRefs: repointRefs(doc.data().metricRefs, oldId, newId) });
      }

      // 5. Remove doc antigo.
      tx.delete(oldRef);

      return {
        ok: true,
        repointedProducts: productsSnap.docs.map((d) => d.id),
        repointedTemplates: templatesSnap.docs.map((d) => d.id),
      };
    });

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      ok: true,
      id: newId,
      repointedProducts: result.repointedProducts,
      repointedTemplates: result.repointedTemplates,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao renomear métrica';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
