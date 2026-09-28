import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/shared/lib/firebase/admin';
import { isAdminEmail } from '@/shared/lib/runtime-config';
import { verifyAuthToken } from '@/shared/lib/api-auth';
import { GroupUpsertInput, formatIssues } from '@/shared/schemas/access';
import { auditFields } from '@/shared/lib/firestore/audit';
import { FirestoreDocId } from '@/shared/schemas/identifier';

export async function GET(req: NextRequest) {
  const email = await verifyAuthToken(req);
  if (!email) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
  if (!isAdminEmail(email)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  try {
    const db = getDb();
    const snap = await db.collection('groups').get();

    const groups = snap.docs.map((docSnap) => ({
      id: docSnap.id,
      name: docSnap.data().name ?? '',
      description: docSnap.data().description ?? '',
      routes: docSnap.data().routes ?? [],
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
  if (!isAdminEmail(email)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  try {
    // `routes[]` define acesso: é a lista que `canAccessRoute` consulta. Entrava
    // aqui por cast — que não valida nada em runtime. O `id` também não era
    // validado, e vira path de `.doc()` logo abaixo (mesma path-injection que a
    // rota de usuários já fecha com UserDocId).
    const parsed = GroupUpsertInput.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Payload inválido.', issues: formatIssues(parsed.error) },
        { status: 400 },
      );
    }
    const body = parsed.data;

    const db = getDb();
    const allGroupsSnap = await db.collection('groups').get();

    const normalizedName = body.name.toLowerCase();
    const duplicate = allGroupsSnap.docs.find(
      (doc) => doc.data().name?.trim().toLowerCase() === normalizedName && doc.id !== (body.id ?? ''),
    );
    if (duplicate) {
      return NextResponse.json({ error: 'Já existe um grupo com este nome.' }, { status: 400 });
    }

    const payload = {
      name: body.name,
      description: body.description,
      routes: body.routes,
    };

    if (body.id) {
      await db
        .collection('groups')
        .doc(body.id)
        .set({ ...payload, ...auditFields(email, false) }, { merge: true });
    } else {
      await db.collection('groups').add({ ...payload, ...auditFields(email, true) });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao salvar grupo';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const email = await verifyAuthToken(req);
  if (!email) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
  if (!isAdminEmail(email)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    // Valida antes de virar path de `.doc()`: `/` seria separador de subcoleção.
    const idResult = FirestoreDocId.safeParse(searchParams.get('id'));
    if (!idResult.success) {
      return NextResponse.json({ error: 'ID é obrigatório' }, { status: 400 });
    }
    const id = idResult.data;

    const db = getDb();
    await db.collection('groups').doc(id).delete();

    // After deleting the group doc, clean user references
    const usersSnap = await db.collection('users').get();
    const batch = db.batch();
    for (const userDoc of usersSnap.docs) {
      const userData = userDoc.data();
      const groups: string[] = userData.groups ?? [];
      if (groups.includes(id)) {
        batch.update(userDoc.ref, { groups: groups.filter((g: string) => g !== id) });
      }
    }
    await batch.commit();

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao excluir grupo';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
