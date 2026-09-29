import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminFirestore } from '@/shared/lib/firebase/admin';
import { DATAVIZ_DATABASE_ID } from '@/shared/lib/runtime-config';
import { verifyAuthToken } from '@/shared/lib/api-auth';
import { Metric } from '@/shared/schemas';
import {
  loadClientBindings,
  executeMetric,
  newMetricExecCaches,
} from '@/shared/lib/metrics/execute-metric';
import type { PageFilterValue } from '@/shared/lib/metrics/resolve-metric';
import type { Relation } from '@/shared/schemas/relation';
import { AmbientFilter } from '@/shared/lib/metrics/ambient-filter';

/**
 * Executa uma Metric resolvendo seu recipe contra o binding de um cliente
 * e retorna as linhas do BigQuery.
 *
 * Cadeia: Template (metricId) → Metric.recipe → Client binding → DataSource → BQ.
 * Orquestração por-métrica vive em `@/shared/lib/metrics/execute-metric`
 * (compartilhada com o endpoint bulk `/api/metrics/batch`, G9-B).
 */

function firestore() {
  return getAdminFirestore(DATAVIZ_DATABASE_ID);
}

const PageFilterValueSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('date_range'),
    start: z.string(),
    end: z.string(),
    attribute: z.string(),
  }),
  z.object({
    kind: z.literal('snapshot'),
    value: z.string(),
    attribute: z.string(),
  }),
  // `ate` (<=): a posição VIGENTE ao fim do período, para entidades cuja
  // cadência de snapshot difere da do filtro.
  z.object({
    kind: z.literal('ate'),
    value: z.string(),
    attribute: z.string(),
  }),
  // `attribute` é opcional desde a ADR-0026 — ver nota em /api/metrics/batch.
  z.object({
    kind: z.literal('in'),
    values: z.array(z.union([z.string(), z.number()])),
    attribute: z.string().optional(),
  }),
]);

const RequestSchema = z.object({
  clientId: z.string().min(1),
  productId: z.string().min(1).optional(),
  pageFilters: z.record(z.string(), PageFilterValueSchema).optional(),
  ambientFilters: z.array(AmbientFilter).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const email = await verifyAuthToken(req);
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { id: metricId } = await params;

  let body: z.infer<typeof RequestSchema>;
  try {
    body = RequestSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'Body inválido', issues: err instanceof z.ZodError ? err.issues : undefined },
      { status: 400 },
    );
  }

  try {
    // Carrega a métrica.
    const metricSnap = await firestore().collection('metrics').doc(metricId).get();
    if (!metricSnap.exists) {
      return NextResponse.json({ error: `Métrica "${metricId}" não encontrada` }, { status: 404 });
    }
    /*
     * Documento que não valida é dado ruim, não falha de servidor — mesmo
     * tratamento de `/api/metrics/batch`: 422 para quem chamou, motivo no log.
     * Isto era `Metric.parse`, e a exceção caía no catch geral como 500: a rota
     * de UM bloco escondia o que a rota do lote explicava.
     */
    const parsed = Metric.safeParse({ id: metricSnap.id, ...metricSnap.data() });
    if (!parsed.success) {
      console.error(JSON.stringify({
        level: 'error',
        msg: 'metrica_invalida',
        metricId: metricSnap.id,
        rota: 'metrics/[id]/data',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code, message: i.message })),
      }));
      return NextResponse.json({ error: `Métrica "${metricId}" inválida` }, { status: 422 });
    }
    const metric = parsed.data;

    // Carrega os bindings do cliente.
    const bindings = await loadClientBindings(body.clientId);
    if (!bindings.ok) {
      return NextResponse.json({ error: bindings.error }, { status: bindings.status });
    }

    // Relations só quando a métrica é derived.
    let relations: Relation[] = [];
    if (metric.recipe?.kind === 'derived') {
      const relSnap = await firestore().collection('relations').get();
      relations = relSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Relation[];
    }

    const result = await executeMetric({
      metric,
      parsedBindings: bindings.bindings,
      clientId: body.clientId,
      productId: body.productId,
      email,
      relations,
      pageFilters: body.pageFilters as Record<string, PageFilterValue> | undefined,
      ambientFilters: body.ambientFilters,
      caches: newMetricExecCaches(),
    });

    if (result.ok) {
      return NextResponse.json({ data: result.data, sql: result.sql, outputColumns: result.outputColumns });
    }
    return NextResponse.json(
      { error: result.error, ...(result.missing ? { missing: result.missing } : {}) },
      { status: result.status },
    );
  } catch (err) {
    console.error('[Metric Data API Error]', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
