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
  type MetricExecResult,
} from '@/shared/lib/metrics/execute-metric';
import type { PageFilterValue } from '@/shared/lib/metrics/resolve-metric';
import type { Relation } from '@/shared/schemas/relation';
import { AmbientFilter } from '@/shared/lib/metrics/ambient-filter';

/**
 * Endpoint bulk (G9-B): resolve N métricas de uma página numa chamada,
 * fazendo o trabalho compartilhável (bindings, metrics, relations) uma vez.
 * Falha parcial → resultados por métrica @ HTTP 200.
 */

function firestore() {
  return getAdminFirestore(DATAVIZ_DATABASE_ID);
}

const PageFilterValueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('date_range'), start: z.string(), end: z.string(), attribute: z.string() }),
  z.object({ kind: z.literal('snapshot'), value: z.string(), attribute: z.string() }),
  // `ate` (<=) é a posição VIGENTE ao fim do período. Sem esta entrada o
  // schema rejeita a requisição inteira — e o sintoma é uma resposta
  // vazia, não um erro que aponte o filtro desconhecido.
  z.object({ kind: z.literal('ate'), value: z.string(), attribute: z.string() }),
  // `attribute` é opcional desde a ADR-0026: filtro declarado sobre o campo do
  // indicador não tem coluna de entidade — quem diz o que comparar é a métrica,
  // em `filterFields`. Exigi-lo aqui rejeitava o lote inteiro.
  z.object({ kind: z.literal('in'), values: z.array(z.union([z.string(), z.number()])), attribute: z.string().optional() }),
]);

const RequestSchema = z.object({
  clientId: z.string().min(1),
  productId: z.string().min(1).optional(),
  metricIds: z.array(z.string().min(1)).min(1).max(50),
  pageFilters: z.record(z.string(), PageFilterValueSchema).optional(),
  ambientFilters: z.array(AmbientFilter).optional(),
});

export async function POST(req: NextRequest) {
  const email = await verifyAuthToken(req);
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

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
    const uniqueIds = Array.from(new Set(body.metricIds));

    // Bindings do cliente — uma vez. Falha aqui afeta o batch inteiro (topo).
    const bindings = await loadClientBindings(body.clientId);
    if (!bindings.ok) {
      return NextResponse.json({ error: bindings.error }, { status: bindings.status });
    }

    // Métricas — uma leitura batch.
    const db = firestore();
    const refs = uniqueIds.map((id) => db.collection('metrics').doc(id));
    const snaps = await db.getAll(...refs);

    const results: Record<string, MetricExecResult> = {};
    const metrics: Metric[] = [];
    for (const snap of snaps) {
      if (!snap.exists) {
        results[snap.id] = { ok: false, metricId: snap.id, status: 404, error: `Métrica "${snap.id}" não encontrada` };
        continue;
      }
      /*
       * O motivo da recusa vai para o LOG, não para a resposta: o cliente
       * recebe só "inválida" (não vaza shape de schema), mas quem investiga
       * precisa saber qual campo. Este catch era mudo, e uma métrica que
       * parou de validar por mudança de biblioteca custou meia hora de
       * bisecção — o erro dizia "inválida" e mais nada.
       */
      const parsed = Metric.safeParse({ id: snap.id, ...snap.data() });
      if (parsed.success) {
        metrics.push(parsed.data);
      } else {
        console.error(JSON.stringify({
          level: 'error',
          msg: 'metrica_invalida',
          metricId: snap.id,
          issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code, message: i.message })),
        }));
        results[snap.id] = { ok: false, metricId: snap.id, status: 422, error: `Métrica "${snap.id}" inválida` };
      }
    }

    // Relations — uma vez, só se alguma métrica é derived.
    let relations: Relation[] = [];
    if (metrics.some((m) => m.recipe?.kind === 'derived')) {
      const relSnap = await db.collection('relations').get();
      relations = relSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Relation[];
    }

    // Fan-out: queries BQ em paralelo; caches deduplicam DataSource/access-check.
    const caches = newMetricExecCaches();
    await Promise.all(
      metrics.map(async (metric) => {
        results[metric.id] = await executeMetric({
          metric,
          parsedBindings: bindings.bindings,
          clientId: body.clientId,
          productId: body.productId,
          email,
          relations,
          pageFilters: body.pageFilters as Record<string, PageFilterValue> | undefined,
          ambientFilters: body.ambientFilters,
          caches,
        });
      }),
    );

    return NextResponse.json({ results });
  } catch (err) {
    console.error('[Metrics Batch API Error]', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
