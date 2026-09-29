import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { ensureAdminApp, getAdminFirestore } from '@/shared/lib/firebase/admin';
import { AttributeDoc, Slug, SqlIdentifier } from '@/shared/schemas';
import {
  DATAVIZ_DATABASE_ID,
  isAdminEmail,
} from '@/shared/lib/runtime-config';
import { verifyAuthToken } from '@/shared/lib/api-auth';
import { auditFields } from '@/shared/lib/firestore/audit';

/**
 * CRUD para attributes de uma entity (ADR-0015).
 * Path: dataContracts/{id}/entities/{entityId}/attributes/{attrId}
 *
 * Delete é soft (deprecated:true) — imutabilidade light para preservar
 * métricas que dependem do attribute.
 */

ensureAdminApp();

function firestore() {
  return getAdminFirestore(DATAVIZ_DATABASE_ID);
}


type RouteParams = Promise<{ id: string; entityId: string }>;

function parseContractAndEntity(p: { id: string; entityId: string }) {
  const contractParse = Slug.safeParse(p.id);
  if (!contractParse.success) return { error: 'Contract ID inválido' as const };
  const entityParse = SqlIdentifier.safeParse(p.entityId);
  if (!entityParse.success) return { error: 'Entity ID inválido' as const };
  return { contractId: contractParse.data, entityId: entityParse.data };
}

function attributesCol(contractId: string, entityId: string) {
  return firestore()
    .collection('dataContracts')
    .doc(contractId)
    .collection('entities')
    .doc(entityId)
    .collection('attributes');
}

export async function GET(req: NextRequest, { params }: { params: RouteParams }) {
  const email = await verifyAuthToken(req);
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const parsed = parseContractAndEntity(await params);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const snap = await attributesCol(parsed.contractId, parsed.entityId).get();
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao listar';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: RouteParams }) {
  const email = await verifyAuthToken(req);
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!isAdminEmail(email)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const parsed = parseContractAndEntity(await params);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const rawBody = await req.json();
    const attrIdParse = SqlIdentifier.safeParse(rawBody?.id);
    if (!attrIdParse.success) {
      return NextResponse.json({ error: 'Attribute ID inválido (SqlIdentifier)' }, { status: 400 });
    }

    const docParse = AttributeDoc.omit({ createdAt: true, updatedAt: true }).safeParse({
      entityId: parsed.entityId,
      label: rawBody.label,
      description: rawBody.description ?? '',
      type: rawBody.type,
      unit: rawBody.unit ?? null,
      isKey: rawBody.isKey ?? false,
      required: rawBody.required ?? false,
      deprecated: rawBody.deprecated ?? false,
      deprecatedReason: rawBody.deprecatedReason ?? null,
    });
    if (!docParse.success) {
      return NextResponse.json(
        { error: 'Payload inválido', issues: docParse.error.issues },
        { status: 400 },
      );
    }

    const ref = attributesCol(parsed.contractId, parsed.entityId).doc(attrIdParse.data);
    const existing = await ref.get();
    await ref.set(
      {
        ...docParse.data,
        ...auditFields(email, !existing.exists),
      },
      { merge: false },
    );

    return NextResponse.json({ ok: true, id: attrIdParse.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao salvar';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Soft-delete: marca attribute como deprecated em vez de remover do Firestore.
 * Métricas que dependem dele continuam funcionando até serem migradas.
 */
export async function DELETE(req: NextRequest, { params }: { params: RouteParams }) {
  const email = await verifyAuthToken(req);
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!isAdminEmail(email)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const parsed = parseContractAndEntity(await params);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const url = new URL(req.url);
    const attrId = url.searchParams.get('attributeId');
    const reason = url.searchParams.get('reason');
    const hard = url.searchParams.get('hard') === 'true';
    const attrIdParse = SqlIdentifier.safeParse(attrId);
    if (!attrIdParse.success) {
      return NextResponse.json({ error: 'Attribute ID inválido' }, { status: 400 });
    }

    const ref = attributesCol(parsed.contractId, parsed.entityId).doc(attrIdParse.data);
    if (hard) {
      // Hard delete — usado pelo fluxo de rename (POST novo + DELETE antigo).
      await ref.delete();
    } else {
      await ref.update({
        deprecated: true,
        deprecatedReason: reason ?? 'Removido via admin',
        updatedAt: Timestamp.now(),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao depreciar';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
