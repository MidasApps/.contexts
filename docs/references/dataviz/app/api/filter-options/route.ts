import { NextRequest, NextResponse } from 'next/server';
import { queryFilterOptions } from '@/shared/lib/bigquery/queries';
import { getDb } from '@/shared/lib/firebase/admin';
import { isAdminEmail } from '@/shared/lib/runtime-config';
import { verifyAuthToken } from '@/shared/lib/api-auth';
import { FieldUnavailableError } from '@/shared/lib/bigquery/schema-resolver';
import { matchClientDataset } from './match-client-dataset';
import { resolveDateSource } from './date-source';
import { parseClientDoc } from './parse-client-doc';
import { listUnavailableFields } from './unavailable-fields';

/**
 * `/api/filter-options` — metadata dos filtros (data-bases/projetos distintos da
 * tabela que o binding do cliente declara — `contratos` por padrão; ver
 * `resolveDateSource`) que o `DataProvider` consome para montar o filtro de
 * período/projeto. É dado VIVO do BigQuery (não config), por isso vive aqui e
 * não na camada semântica/Firestore. Substitui a antiga rota `/api/bigquery`
 * (que havia sido reduzida a esta única responsabilidade).
 */

/** Look up the client document for a given dataset (multi-dataset array + legacy field + new productBindings). */
async function findClientByDataset(dataset: string) {
  const db = getDb();
  const allClients = await db.collection('clients').get();
  for (const doc of allClients.docs) {
    const lookup = parseClientDoc(doc.id, doc.data());
    if (matchClientDataset(lookup, dataset)) return { id: doc.id, lookup };
  }
  return null;
}

async function canAccessDataset(email: string, dataset: string, clientDoc?: { id: string } | null): Promise<boolean> {
  if (isAdminEmail(email)) return true;
  const db = getDb();
  const usersSnap = await db.collection('users').where('email', '==', email).limit(1).get();
  if (usersSnap.empty) return false;
  const userData = usersSnap.docs[0].data();
  const clientAccess: { clientId: string }[] = userData.clientAccess ?? [];
  if (!clientDoc) return false;
  return clientAccess.some((ca) => ca.clientId === clientDoc.id);
}

export async function POST(req: NextRequest) {
  try {
    const email = await verifyAuthToken(req);
    if (!email) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { dataset } = await req.json();
    if (!dataset?.trim()) {
      return NextResponse.json({ error: 'Dataset inválido.' }, { status: 400 });
    }

    const clientDoc = await findClientByDataset(dataset);

    const allowed = await canAccessDataset(email, dataset, clientDoc);
    if (!allowed) {
      return NextResponse.json({ error: 'Sem permissão para este cliente' }, { status: 403 });
    }

    const clientSchema = clientDoc?.lookup.schema;
    const source = resolveDateSource(clientDoc?.lookup, dataset);
    const result = await queryFilterOptions(dataset, clientSchema ?? null, source);
    const unavailableFields = listUnavailableFields(clientSchema);

    return NextResponse.json({ data: result, unavailableFields });
  } catch (error) {
    if (error instanceof FieldUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    console.error('[FilterOptions API Error]', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
