import { NextRequest, NextResponse } from 'next/server';
import { generateObject } from 'ai';
import { vertex } from '@ai-sdk/google-vertex';
import { z } from 'zod';
import { ensureAdminApp, getDb } from '@/shared/lib/firebase/admin';
import { getBigQueryClientFor } from '@/shared/lib/bigquery/client';
import { safeDatasetRef, safeIdentifier } from '@/shared/lib/bigquery/identifier';
import { getProduct } from '@/shared/repositories/product-repo';
import { Slug, SqlIdentifier } from '@/shared/schemas';
import { collectBindingGaps, type CoverageGap } from '@/shared/lib/metrics/coverage';
import type { SemanticSchemaBinding } from '@/shared/schemas/client-binding';
import {
  isAdminEmail,
} from '@/shared/lib/runtime-config';
import { verifyAuthToken } from '@/shared/lib/api-auth';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';

/**
 * Schema-detect contract-driven (G7). Recebe { productId, contractRef,
 * dataSourceId, datasetId }, lê entities+attributes de dataContracts/{contractRef},
 * pede ao Gemini para mapear colunas reais do BigQuery → entity.attribute, e
 * devolve SemanticSchemaBinding flat + cobertura advisory das métricas contratadas.
 */

ensureAdminApp();

const RequestBody = z.object({
  productId: Slug,
  contractRef: Slug,
  dataSourceId: Slug,
  datasetId: SqlIdentifier,
});

/**
 * A oitava cópia do R13, com outro nome. Reescrita sobre `verifyAuthToken`
 * para que a resolução de identidade seja a mesma de todas as rotas — aqui só
 * fica o que é específico: exigir admin.
 */
async function verifyAdmin(req: NextRequest): Promise<boolean> {
  const email = await verifyAuthToken(req);
  return email ? isAdminEmail(email) : false;
}

interface ColumnRow { table_name: string; column_name: string; data_type: string }
interface ContractEntity { id: string; attributes: { id: string; type?: string }[] }

export async function POST(req: NextRequest) {
  try {
    if (!(await verifyAdmin(req))) {
      return NextResponse.json({ error: 'Apenas administradores.' }, { status: 403 });
    }

    const parsed = RequestBody.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Payload inválido', issues: parsed.error.issues }, { status: 400 });
    }
    const { productId, contractRef, dataSourceId, datasetId } = parsed.data;

    const product = await getProduct(productId);
    if (!product) {
      return NextResponse.json({ error: `Produto "${productId}" não encontrado.` }, { status: 404 });
    }

    const entities = await loadContractEntities(contractRef);
    if (entities.length === 0) {
      return NextResponse.json(
        { error: `O contrato "${contractRef}" não tem entidades/atributos. Configure o Data Contract antes de detectar.` },
        { status: 422 },
      );
    }

    const entityIds = entities.map((e) => safeIdentifier(e.id, 'table'));
    const safeDataset = safeDatasetRef(datasetId);
    const bq = await getBigQueryClientFor(dataSourceId);
    const [rows] = await bq.query({
      query: buildColumnsQuery(safeDataset, entityIds),
      maximumBytesBilled: String(maxBytesBilled()),
    });
    const actualColumns = groupColumnsByTable(rows as ColumnRow[], entityIds);

    const schemaBindings = await detectWithGemini({ entities, actualColumns });
    const coverage = await computeCoverage(product.metricRefs ?? [], schemaBindings, contractRef);

    return NextResponse.json({ data: { contractRef, schemaBindings, actualColumns, coverage } });
  } catch (error) {
    console.error('[Schema Detect] Error', error);
    const message = error instanceof Error ? error.message : 'Erro interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── helpers ──────────────────────────────────────────────────────

async function loadContractEntities(contractRef: string): Promise<ContractEntity[]> {
  const db = getDb();
  const entitiesSnap = await db.collection('dataContracts').doc(contractRef).collection('entities').get();
  const out: ContractEntity[] = [];
  for (const eDoc of entitiesSnap.docs) {
    const attrsSnap = await db
      .collection('dataContracts').doc(contractRef)
      .collection('entities').doc(eDoc.id)
      .collection('attributes').get();
    const attributes = attrsSnap.docs
      .filter((d) => d.data()?.deprecated !== true)
      .map((d) => {
        const a = d.data() ?? {};
        return { id: d.id, type: typeof a.type === 'string' ? a.type : undefined };
      });
    if (attributes.length > 0) out.push({ id: eDoc.id, attributes });
  }
  return out;
}

function buildColumnsQuery(ds: { projectId?: string; datasetId: string }, tables: string[]): string {
  const ref = ds.projectId
    ? `\`${ds.projectId}.${ds.datasetId}.INFORMATION_SCHEMA.COLUMNS\``
    : `\`${ds.datasetId}.INFORMATION_SCHEMA.COLUMNS\``;
  const inList = tables.map((t) => `'${t}'`).join(', ');
  return `SELECT table_name, column_name, data_type FROM ${ref} WHERE table_name IN (${inList}) ORDER BY table_name, ordinal_position`;
}

function groupColumnsByTable(rows: ColumnRow[], tableIds: string[]): Record<string, { column_name: string; data_type: string }[]> {
  const grouped: Record<string, { column_name: string; data_type: string }[]> = {};
  for (const id of tableIds) grouped[id] = [];
  for (const row of rows) {
    if (row.table_name in grouped) grouped[row.table_name].push({ column_name: row.column_name, data_type: row.data_type });
  }
  return grouped;
}

async function detectWithGemini(params: {
  entities: ContractEntity[];
  actualColumns: Record<string, { column_name: string; data_type: string }[]>;
}): Promise<SemanticSchemaBinding> {
  const { entities, actualColumns } = params;
  const shape: Record<string, z.ZodObject<Record<string, z.ZodNullable<z.ZodString>>>> = {};
  for (const e of entities) {
    const fieldShape: Record<string, z.ZodNullable<z.ZodString>> = {};
    for (const a of e.attributes) fieldShape[a.id] = z.string().nullable();
    shape[e.id] = z.object(fieldShape);
  }
  const model = vertex('gemini-2.5-flash');
  const { object } = await generateObject({ model, schema: z.object(shape), prompt: buildPrompt(entities, actualColumns) });
  // Achata { entity: { attr: col } } → { "entity.attr": col }
  const flat: SemanticSchemaBinding = {};
  for (const [entityId, attrs] of Object.entries(object as Record<string, Record<string, string | null>>)) {
    for (const [attrId, col] of Object.entries(attrs)) flat[`${entityId}.${attrId}`] = col;
  }
  return flat;
}

function buildPrompt(
  entities: ContractEntity[],
  actualColumns: Record<string, { column_name: string; data_type: string }[]>,
): string {
  const actualText = Object.entries(actualColumns)
    .map(([t, cols]) => `Tabela "${t}":\n${cols.map((c) => `  - ${c.column_name} (${c.data_type})`).join('\n') || '  (nenhuma coluna)'}`)
    .join('\n\n');
  const expectedText = entities
    .map((e) => `Entidade "${e.id}":\n${e.attributes.map((a) => `  - ${a.id}${a.type ? ` (${a.type})` : ''}`).join('\n')}`)
    .join('\n\n');
  return `Você é um especialista em dados. Mapeie as colunas reais de um dataset BigQuery para os atributos esperados de cada entidade.
- Use apenas nomes de colunas que existam na lista de colunas reais.
- Se não houver correspondência clara, retorne null.
- Considere sinônimos e variações (dt_apuracao ↔ data_apuracao) e tipos compatíveis.

## Colunas reais encontradas:
${actualText}

## Atributos esperados (por entidade):
${expectedText}

Retorne o mapeamento estruturado conforme o schema.`;
}

async function computeCoverage(
  metricRefs: string[],
  schemaBindings: SemanticSchemaBinding,
  contractRef: string,
): Promise<CoverageGap[]> {
  if (metricRefs.length === 0) return [];
  const db = getDb();
  const requires = new Set<string>();
  for (const id of metricRefs) {
    try {
      const snap = await db.collection('metrics').doc(id).get();
      if (!snap.exists) continue;
      const reqs = snap.data()?.requires;
      if (Array.isArray(reqs)) for (const r of reqs) if (typeof r === 'string') requires.add(r);
    } catch { /* métrica ilegível ⇒ ignora (best-effort) */ }
  }
  const binding = { schemaBindings } as Parameters<typeof collectBindingGaps>[1];
  return collectBindingGaps([...requires], binding, contractRef);
}
