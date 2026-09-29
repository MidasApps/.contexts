import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '@/shared/lib/firebase/admin';
import { verifyAuthToken, verifyClientAccess } from '@/shared/lib/api-auth';

export async function GET(req: NextRequest) {
  const email = await verifyAuthToken(req);
  if (!email) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get('clientId');
    if (!clientId) {
      return NextResponse.json({ error: 'clientId é obrigatório' }, { status: 400 });
    }

    const access = await verifyClientAccess(email, clientId);
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const db = getDb();
    const snap = await db
      .collection('clients')
      .doc(clientId)
      .collection('groups')
      .orderBy('order')
      .get();

    const groups = snap.docs.map((d) => ({
      id: d.id,
      name: d.data().name ?? '',
      order: d.data().order ?? 0,
    }));

    return NextResponse.json({ data: groups });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao carregar grupos';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const email = await verifyAuthToken(req);
  if (!email) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { clientId: string; name: string };
    if (!body.clientId || !body.name?.trim()) {
      return NextResponse.json({ error: 'clientId e name são obrigatórios' }, { status: 400 });
    }

    const access = await verifyClientAccess(email, body.clientId);
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const db = getDb();
    const groupsRef = db.collection('clients').doc(body.clientId).collection('groups');
    const snap = await groupsRef.get();
    const maxOrder = snap.docs.reduce((max, d) => Math.max(max, d.data().order ?? 0), 0);

    const ref = await groupsRef.add({
      name: body.name.trim(),
      order: maxOrder + 1,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ data: { id: ref.id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao criar grupo';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const email = await verifyAuthToken(req);
  if (!email) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { clientId: string; groupId: string; name: string };
    if (!body.clientId || !body.groupId || !body.name?.trim()) {
      return NextResponse.json(
        { error: 'clientId, groupId e name são obrigatórios' },
        { status: 400 },
      );
    }

    const access = await verifyClientAccess(email, body.clientId);
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const db = getDb();
    await db
      .collection('clients')
      .doc(body.clientId)
      .collection('groups')
      .doc(body.groupId)
      .update({ name: body.name.trim() });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao renomear grupo';
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
    if (!clientId || !groupId) {
      return NextResponse.json({ error: 'clientId e groupId são obrigatórios' }, { status: 400 });
    }

    const access = await verifyClientAccess(email, clientId);
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const db = getDb();
    const groupRef = db.collection('clients').doc(clientId).collection('groups').doc(groupId);

    // Cascade delete all reports in this group
    const reportsSnap = await groupRef.collection('reports').get();
    if (!reportsSnap.empty) {
      const batch = db.batch();
      for (const reportDoc of reportsSnap.docs) {
        batch.delete(reportDoc.ref);
      }
      await batch.commit();
    }

    await groupRef.delete();

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao excluir grupo';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
