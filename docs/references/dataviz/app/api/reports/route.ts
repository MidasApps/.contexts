import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '@/shared/lib/firebase/admin';
import { verifyAuthToken, verifyClientAccess } from '@/shared/lib/api-auth';
import { uniqueSlug } from '@/shared/lib/slug';

function reportsCol(clientId: string, groupId: string) {
  return getDb().collection('clients').doc(clientId).collection('groups').doc(groupId).collection('reports');
}

/**
 * O id do documento é o último segmento da URL da página
 * (`/g/{groupId}/r/{reportId}`), então ele é endereço, não detalhe interno.
 *
 * Antes era `col.add()`, que deixa o Firestore sortear 20 caracteres: página
 * criada pelo menu virava `/g/covenants/r/aB3xK9mQ2pLnR7vT4wYz`, enquanto as
 * criadas por seed — que gravavam com `.doc(slug).set()` — ficavam legíveis.
 * Mesma coleção, dois padrões de URL, dependendo de quem criou.
 *
 * As três operações que criam documento já liam a coleção inteira para
 * calcular `order`, então a lista de ids ocupados sai da leitura que já
 * existia: derivar o slug não custa uma ida a mais ao banco.
 */
function existingIds(snap: FirebaseFirestore.QuerySnapshot): string[] {
  return snap.docs.map((d) => d.id);
}

export async function GET(req: NextRequest) {
  const email = await verifyAuthToken(req);
  if (!email) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get('clientId');
    const groupId = searchParams.get('groupId');
    const reportId = searchParams.get('reportId');

    if (!clientId || !groupId) {
      return NextResponse.json({ error: 'clientId e groupId são obrigatórios' }, { status: 400 });
    }

    const access = await verifyClientAccess(email, clientId);
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const col = reportsCol(clientId, groupId);

    // Single report
    if (reportId) {
      const docSnap = await col.doc(reportId).get();
      if (!docSnap.exists) {
        return NextResponse.json({ error: 'Report não encontrado' }, { status: 404 });
      }
      const data = docSnap.data()!;
      return NextResponse.json({
        data: {
          id: docSnap.id,
          name: data.name ?? '',
          description: data.description ?? undefined,
          order: data.order ?? 0,
          blockMap: data.blockMap ?? {},
          layout: data.layout ?? [],
          filters: data.filters ?? undefined,
          queries: data.queries ?? undefined,
          templateId: data.templateId ?? undefined,
          productRefs: data.productRefs ?? undefined,
          metricRefs: data.metricRefs ?? undefined,
        },
      });
    }

    // List all reports in group
    const snap = await col.orderBy('order').get();
    const reports = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name ?? '',
        description: data.description ?? undefined,
        order: data.order ?? 0,
        blockMap: data.blockMap ?? {},
        layout: data.layout ?? [],
        filters: data.filters ?? undefined,
        queries: data.queries ?? undefined,
        templateId: data.templateId ?? undefined,
        productRefs: data.productRefs ?? undefined,
        metricRefs: data.metricRefs ?? undefined,
      };
    });

    return NextResponse.json({ data: reports });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao carregar reports';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const email = await verifyAuthToken(req);
  if (!email) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      action?: 'duplicate' | 'move';
      clientId: string;
      groupId: string;
      reportId?: string;
      name?: string;
      description?: string;
      blockMap?: Record<string, unknown>;
      layout?: unknown[];
      queries?: unknown[];
      filters?: Record<string, unknown>;
      templateId?: string;
      productRefs?: string[];
      metricRefs?: string[];
      toGroupId?: string;
    };

    if (!body.clientId || !body.groupId) {
      return NextResponse.json({ error: 'clientId e groupId são obrigatórios' }, { status: 400 });
    }

    const access = await verifyClientAccess(email, body.clientId);
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const col = reportsCol(body.clientId, body.groupId);

    // --- Duplicate ---
    if (body.action === 'duplicate') {
      if (!body.reportId) {
        return NextResponse.json({ error: 'reportId é obrigatório para duplicar' }, { status: 400 });
      }
      const docSnap = await col.doc(body.reportId).get();
      if (!docSnap.exists) {
        return NextResponse.json({ error: 'Report não encontrado' }, { status: 404 });
      }
      const data = docSnap.data()!;
      const snap = await col.get();
      const maxOrder = snap.docs.reduce((max, d) => Math.max(max, d.data().order ?? 0), 0);
      const dupName = `${data.name} (cópia)`;
      const dupData: Record<string, unknown> = {
        name: dupName,
        order: maxOrder + 1,
        blockMap: data.blockMap ?? {},
        layout: data.layout ?? [],
        filters: data.filters ?? null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (data.description) dupData.description = data.description;
      if (data.queries) dupData.queries = data.queries;
      if (data.templateId) dupData.templateId = data.templateId;
      if (data.productRefs?.length) dupData.productRefs = data.productRefs;
      if (data.metricRefs?.length) dupData.metricRefs = data.metricRefs;
      const dupId = uniqueSlug(dupName, existingIds(snap));
      await col.doc(dupId).set(dupData);
      return NextResponse.json({ data: { id: dupId } });
    }

    // --- Move ---
    if (body.action === 'move') {
      if (!body.reportId || !body.toGroupId) {
        return NextResponse.json(
          { error: 'reportId e toGroupId são obrigatórios para mover' },
          { status: 400 },
        );
      }
      const docSnap = await col.doc(body.reportId).get();
      if (!docSnap.exists) {
        return NextResponse.json({ error: 'Report não encontrado' }, { status: 404 });
      }
      const data = docSnap.data()!;
      const targetCol = reportsCol(body.clientId, body.toGroupId);
      const targetSnap = await targetCol.get();
      const maxOrder = targetSnap.docs.reduce((max, d) => Math.max(max, d.data().order ?? 0), 0);
      const moveData: Record<string, unknown> = {
        name: data.name,
        order: maxOrder + 1,
        blockMap: data.blockMap ?? {},
        layout: data.layout ?? [],
        filters: data.filters ?? null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (data.description) moveData.description = data.description;
      if (data.queries) moveData.queries = data.queries;
      if (data.templateId) moveData.templateId = data.templateId;
      if (data.productRefs?.length) moveData.productRefs = data.productRefs;
      if (data.metricRefs?.length) moveData.metricRefs = data.metricRefs;
      // Mover preserva o id quando ele está livre no grupo de destino: a URL da
      // página sobrevive à mudança de grupo, e link já compartilhado continua
      // valendo. Só quando há conflito o slug é derivado do nome.
      const occupiedAtTarget = existingIds(targetSnap);
      const moveId = occupiedAtTarget.includes(body.reportId)
        ? uniqueSlug(String(data.name ?? ''), occupiedAtTarget)
        : body.reportId;
      await targetCol.doc(moveId).set(moveData);
      // Delete from source group
      await col.doc(body.reportId).delete();
      return NextResponse.json({ data: { id: moveId } });
    }

    // --- Create ---
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'name é obrigatório' }, { status: 400 });
    }
    const snap = await col.get();
    const maxOrder = snap.docs.reduce((max, d) => Math.max(max, d.data().order ?? 0), 0);
    const docData: Record<string, unknown> = {
      name: body.name.trim(),
      order: maxOrder + 1,
      blockMap: body.blockMap ?? {},
      layout: body.layout ?? [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (body.description?.trim()) {
      docData.description = body.description.trim();
    }
    if (body.queries && body.queries.length > 0) {
      docData.queries = body.queries;
    }
    if (body.filters && Object.keys(body.filters).length > 0) {
      docData.filters = body.filters;
    }
    if (body.templateId) {
      docData.templateId = body.templateId;
    }
    if (body.productRefs && body.productRefs.length > 0) {
      docData.productRefs = body.productRefs;
    }
    if (body.metricRefs && body.metricRefs.length > 0) {
      docData.metricRefs = body.metricRefs;
    }
    const newId = uniqueSlug(body.name, existingIds(snap));
    await col.doc(newId).set(docData);

    return NextResponse.json({ data: { id: newId } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao criar/mover report';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const email = await verifyAuthToken(req);
  if (!email) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      clientId: string;
      groupId: string;
      reportId: string;
      name?: string;
      description?: string;
      blockMap?: Record<string, unknown>;
      layout?: unknown[];
      filters?: unknown;
    };

    if (!body.clientId || !body.groupId || !body.reportId) {
      return NextResponse.json(
        { error: 'clientId, groupId e reportId são obrigatórios' },
        { status: 400 },
      );
    }

    const access = await verifyClientAccess(email, body.clientId);
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description || FieldValue.delete();
    if (body.blockMap !== undefined) updates.blockMap = body.blockMap;
    if (body.layout !== undefined) updates.layout = body.layout;
    if (body.filters !== undefined) updates.filters = body.filters;

    await reportsCol(body.clientId, body.groupId).doc(body.reportId).update(updates);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao atualizar report';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const email = await verifyAuthToken(req);
  if (!email) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get('clientId');
    const groupId = searchParams.get('groupId');
    const reportId = searchParams.get('reportId');

    if (!clientId || !groupId || !reportId) {
      return NextResponse.json(
        { error: 'clientId, groupId e reportId são obrigatórios' },
        { status: 400 },
      );
    }

    const access = await verifyClientAccess(email, clientId);
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    await reportsCol(clientId, groupId).doc(reportId).delete();

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao excluir report';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
