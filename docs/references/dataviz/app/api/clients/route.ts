import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getDb } from '@/shared/lib/firebase/admin';
import { isAdminEmail } from '@/shared/lib/runtime-config';
import { verifyAuthToken } from '@/shared/lib/api-auth';
import { ClientDoc } from '@/shared/schemas/client';
import { invalidateBusinessProfileCache } from '@/shared/repositories/client-business-profile';
import { Slug } from '@/shared/schemas/identifier';
import { auditFields } from '@/shared/lib/firestore/audit';

async function getAllowedClientIds(email: string): Promise<Set<string>> {
  if (isAdminEmail(email)) return new Set();

  const db = getDb();
  const usersSnap = await db.collection('users').where('email', '==', email).limit(1).get();
  if (usersSnap.empty) return new Set();

  const userData = usersSnap.docs[0].data();
  const clientAccess: { clientId: string }[] = userData.clientAccess ?? [];
  return new Set(clientAccess.map((ca) => ca.clientId));
}

export async function GET(req: NextRequest) {
  const email = await verifyAuthToken(req);
  if (!email) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const db = getDb();
    const snap = await db.collection('clients').get();
    const allowedClientIds = await getAllowedClientIds(email);

    const clients = snap.docs
      .map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }))
      .filter((client) => isAdminEmail(email) || allowedClientIds.has(client.id));

    return NextResponse.json({ data: clients });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao carregar clientes';
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
    const rawBody = await req.json();

    // Determine which creation model is being used.
    const hasProductBindings =
      Array.isArray(rawBody?.productBindings) && rawBody.productBindings.length > 0;

    // --- Validate with Zod (both paths) ---
    // Pass sentinel timestamps so the schema doesn't reject missing Firestore fields.
    const parsed = ClientDoc.safeParse({
      ...rawBody,
      createdAt: rawBody.createdAt ?? 0,
      updatedAt: rawBody.updatedAt ?? 0,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Payload inválido', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    // Validate the document ID (kebab-case slug, used as Firestore doc ID).
    const idResult = Slug.safeParse(rawBody?.id);
    if (!idResult.success) {
      return NextResponse.json({ error: 'ID do cliente inválido (kebab-case).' }, { status: 400 });
    }
    const clientId = idResult.data;

    // --- Legacy guard: dataset is required only when no productBindings are provided ---
    if (!hasProductBindings && !parsed.data.dataset?.trim()) {
      return NextResponse.json({ error: 'Dataset é obrigatório.' }, { status: 400 });
    }

    const hexColorRegex = /^#[0-9a-fA-F]{6}$/;
    if (parsed.data.color && !hexColorRegex.test(parsed.data.color)) {
      return NextResponse.json({ error: 'Cor inválida. Use formato hex (#RRGGBB).' }, { status: 400 });
    }

    const db = getDb();
    const ref = db.collection('clients').doc(clientId);
    const existing = await ref.get();
    const now = Timestamp.now();

    // Merge-friendly payload — persiste apenas os campos enviados.
    type ClientPayload = {
      name: string;
      color: string;
      initial: string;
      updatedAt: FirebaseFirestore.Timestamp;
      createdAt?: FirebaseFirestore.Timestamp;
      dataset?: string | null;
      schema?: Record<string, Record<string, string | null>> | null;
      lastSchemaSync?: FirebaseFirestore.Timestamp;
      productBindings?: unknown;
      businessProfile?: unknown;
    };

    const payload: ClientPayload = {
      name: parsed.data.name,
      color: parsed.data.color,
      initial: parsed.data.initial,
      ...auditFields(email, !existing.exists),
    };

    if (typeof parsed.data.dataset === 'string') payload.dataset = parsed.data.dataset;
    if (parsed.data.schema !== undefined) {
      payload.schema = parsed.data.schema as Record<string, Record<string, string | null>> | null;
      if (parsed.data.schema) payload.lastSchemaSync = now;
    }
    if (hasProductBindings) {
      payload.productBindings = parsed.data.productBindings;
    }
    // `undefined` = campo não enviado (não mexe); `null` = administrador limpou
    // o perfil. Sob merge:true os dois precisam ser distinguidos, senão limpar
    // o perfil pela tela não teria efeito.
    if (parsed.data.businessProfile !== undefined) {
      payload.businessProfile = parsed.data.businessProfile;
      invalidateBusinessProfileCache(clientId);
    }

    await ref.set(payload, { merge: true });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao salvar cliente';
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
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'ID é obrigatório' }, { status: 400 });
    }

    const db = getDb();
    await db.collection('clients').doc(id).delete();

    // After deleting the client doc, clean user references
    const usersSnap = await db.collection('users').get();
    const batch = db.batch();
    for (const userDoc of usersSnap.docs) {
      const userData = userDoc.data();
      const clientAccess: Array<{ clientId: string }> = userData.clientAccess ?? [];
      if (clientAccess.some((ca) => ca.clientId === id)) {
        batch.update(userDoc.ref, {
          clientAccess: clientAccess.filter((ca: { clientId: string }) => ca.clientId !== id),
        });
      }
    }
    await batch.commit();

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao excluir cliente';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
