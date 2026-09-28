import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '@/shared/lib/firebase/admin';
import { verifyAuthToken } from '@/shared/lib/api-auth';
import { isAdminEmail } from '@/shared/lib/runtime-config';
import { DashboardTemplateDoc, TemplateId } from '@/shared/schemas/dashboard-template';

const COLLECTION = 'dashboardTemplates';
function col() {
  return getDb().collection(COLLECTION);
}

function serialize(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    id,
    name: data.name ?? '',
    description: data.description ?? '',
    category: data.category ?? 'Carteira',
    productRefs: data.productRefs ?? [],
    segment: data.segment ?? undefined,
    blockMap: data.blockMap ?? {},
    layout: data.layout ?? [],
    filters: data.filters ?? undefined,
    queries: data.queries ?? undefined,
    metricRefs: data.metricRefs ?? [],
    status: data.status ?? 'active',
  };
}

export async function GET(req: Request) {
  if (!(await verifyAuthToken(req))) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (id) {
      const snap = await col().doc(id).get();
      if (!snap.exists) return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 });
      return NextResponse.json({ data: serialize(snap.id, snap.data()!) });
    }
    const snap = await col().get();
    const data = snap.docs.map((d) => serialize(d.id, d.data()));
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao carregar templates';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const email = await verifyAuthToken(req);
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!isAdminEmail(email)) return NextResponse.json({ error: 'Apenas admin' }, { status: 403 });
  try {
    const body = await req.json();

    // --- Duplicate ---
    if (body.action === 'duplicate') {
      const sourceId = body.id as string | undefined;
      if (!sourceId) return NextResponse.json({ error: 'id é obrigatório para duplicar' }, { status: 400 });
      const snap = await col().doc(sourceId).get();
      if (!snap.exists) return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 });
      const src = snap.data()!;
      // Gera um id livre, evitando sobrescrever cópias anteriores:
      // `${sourceId}-copia`, depois `-copia-2`, `-copia-3`, ... (cap de 50).
      let newId = `${sourceId}-copia`;
      for (let attempt = 2; attempt <= 50; attempt++) {
        const candidate = await col().doc(newId).get();
        if (!candidate.exists) break;
        newId = `${sourceId}-copia-${attempt}`;
      }
      await col().doc(newId).set({
        ...src,
        name: `${src.name} (cópia)`,
        status: 'draft',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ data: { id: newId } });
    }

    // --- Create / upsert ---
    const idResult = TemplateId.safeParse(body.id);
    if (!idResult.success) {
      return NextResponse.json({ error: 'id inválido (kebab-case)' }, { status: 400 });
    }
    const parsed = DashboardTemplateDoc.safeParse({
      ...body,
      createdAt: 0,
      updatedAt: 0,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: 'Payload inválido', issues: parsed.error.issues }, { status: 400 });
    }
    const { createdAt: _c, updatedAt: _u, ...doc } = parsed.data;

    // Validação SOFT (não-bloqueante) de productRefs órfãs. Frente-A escolheu
    // explicitamente NÃO ter FK em productRefs — refs inexistentes viram
    // `warnings` no 200, nunca bloqueiam a escrita.
    const db = getDb();
    const warnings: string[] = [];
    for (const slug of doc.productRefs ?? []) {
      const snap = await db.collection('products').doc(slug).get();
      if (!snap.exists) warnings.push(`productRefs "${slug}" inexistente`);
    }
    if (warnings.length > 0) {
      console.warn(`[POST /api/dashboard-templates] ${idResult.data}:`, warnings);
    }

    const ref = col().doc(idResult.data);
    const existing = await ref.get();
    await ref.set(
      {
        ...doc,
        updatedAt: FieldValue.serverTimestamp(),
        ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      },
      { merge: true },
    );
    // `warnings` só aparece quando há algo a sinalizar (happy-path inalterado).
    return NextResponse.json({
      data: { id: idResult.data, ...(warnings.length > 0 ? { warnings } : {}) },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao salvar template';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const email = await verifyAuthToken(req);
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!isAdminEmail(email)) return NextResponse.json({ error: 'Apenas admin' }, { status: 403 });
  try {
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 });
    const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    for (const key of ['name', 'description', 'category', 'productRefs', 'segment', 'blockMap', 'layout', 'filters', 'queries', 'metricRefs', 'status'] as const) {
      if (body[key] !== undefined) updates[key] = body[key];
    }
    await col().doc(body.id).update(updates);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao atualizar template';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const email = await verifyAuthToken(req);
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!isAdminEmail(email)) return NextResponse.json({ error: 'Apenas admin' }, { status: 403 });
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 });
    await col().doc(id).delete();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao excluir template';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
