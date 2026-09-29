import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuthToken, verifyClientAccess } from '@/shared/lib/api-auth';
import { getAdminFirestore } from '@/shared/lib/firebase/admin';
import { DATAVIZ_DATABASE_ID } from '@/shared/lib/runtime-config';
import { Metric } from '@/shared/schemas';
import {
  loadClientBindings,
  executeMetric,
  newMetricExecCaches,
} from '@/shared/lib/metrics/execute-metric';
import type { Relation } from '@/shared/schemas/relation';
import { tableRef } from '@/shared/lib/metrics/resolve-metric';
import { resolveSchemaBindings } from '@/shared/lib/semantic/flatten-binding';
import { quoteIdentifier } from '@/shared/lib/bigquery/identifier';
import { getDataSource } from '@/shared/repositories/data-source-repo';
import { getBigQueryClientFor } from '@/shared/lib/bigquery/client';
import type { ClientDatasetBinding } from '@/shared/schemas';
import { FilterValuesBody } from './schema';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';

/**
 * `POST /api/metrics/filter-values`: as opções de um seletor de página
 * (`metricPageFilters[key].control === 'dropdown'`).
 *
 * **Modo campo do indicador** (`metricId` + `field`, ADR-0026): envolve a query
 * resolvida da métrica num `SELECT DISTINCT <field>`. As opções são, por
 * construção, o mesmo texto que a tela mostra — inclusive quando esse texto
 * nasce de um JOIN da métrica ("BANCO INTER" em vez de `77`). Só aceita campo
 * que a métrica declare em `filterFields`: sem declaração o WHERE não compara
 * nada, e o seletor nasceria decorativo.
 *
 * **Modo atributo** (`attribute`, anterior): lê a coluna crua da tabela da
 * entidade. Mantido para os filtros gravados antes da ADR-0026.
 * Fail-loud: attribute sem mapping em `schemaBindings` (nulo ou ausente) →
 * 422. Sem fallback legado — diferente de `resolveColumn` (resolve-metric.ts),
 * que assume `attributeId` como coluna p/ clientes não-migrados; aqui a rota
 * exige binding explícito para não arriscar montar dropdown com dado errado.
 */
export async function POST(req: NextRequest) {
  const email = await verifyAuthToken(req);
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  let body: FilterValuesBody;
  try {
    body = FilterValuesBody.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'Body inválido', issues: err instanceof z.ZodError ? err.issues : undefined },
      { status: 400 },
    );
  }

  const access = await verifyClientAccess(email, body.clientId);
  if (!access.allowed) {
    return NextResponse.json({ error: access.error ?? 'Sem permissão' }, { status: access.status ?? 403 });
  }

  if ('metricId' in body) {
    return indicatorFieldValues(body, email);
  }

  try {
    const bindingsResult = await loadClientBindings(body.clientId);
    if (!bindingsResult.ok) {
      return NextResponse.json({ error: bindingsResult.error }, { status: bindingsResult.status });
    }

    const entityId = body.attribute.split('.')[0];

    // Mesma ordem de preferência de execute-metric.ts: binding do productId
    // solicitado primeiro, demais como fallback (produto pode reusar dataset
    // de outro produto do cliente).
    const ordered = [
      ...bindingsResult.bindings.filter((b) => b.productId === body.productId),
      ...bindingsResult.bindings.filter((b) => b.productId !== body.productId),
    ];

    let dataset: ClientDatasetBinding | undefined;
    for (const b of ordered) {
      const d = b.datasets.find((ds) => {
        const flat = resolveSchemaBindings(ds);
        return Object.keys(flat).some((k) => k.startsWith(`${entityId}.`));
      });
      if (d) {
        dataset = d;
        break;
      }
    }
    if (!dataset) {
      return NextResponse.json(
        { error: `Cliente não cobre a entidade "${entityId}"` },
        { status: 422 },
      );
    }

    const flat = resolveSchemaBindings(dataset);
    const columnRaw = flat[body.attribute];
    if (typeof columnRaw !== 'string') {
      return NextResponse.json(
        { error: `Attribute "${body.attribute}" sem mapping neste cliente` },
        { status: 422 },
      );
    }
    const col = quoteIdentifier(columnRaw, 'column');

    // labelAttribute é best-effort: sem mapping, degrada para só `value`
    // (não falha a requisição inteira por causa de um rótulo cosmético).
    let labelCol: string | null = null;
    if (body.labelAttribute) {
      const labelRaw = flat[body.labelAttribute];
      if (typeof labelRaw === 'string') {
        labelCol = quoteIdentifier(labelRaw, 'column');
      }
    }

    const source = await getDataSource(dataset.dataSourceId);
    if (!source) {
      return NextResponse.json(
        { error: `DataSource "${dataset.dataSourceId}" não encontrada` },
        { status: 422 },
      );
    }

    const from = tableRef(dataset, entityId, source.projectId);
    const selectCols = labelCol ? `${col} AS value, ${labelCol} AS label` : `${col} AS value`;
    const sql = `SELECT DISTINCT ${selectCols} FROM ${from} WHERE ${col} IS NOT NULL ORDER BY 1 LIMIT 200`;

    const bq = await getBigQueryClientFor(dataset.dataSourceId);
    // DISTINCT de coluna inteira, disparado por qualquer usuário que abra o
    // seletor: teto de bytes como todo caminho (rules/cost.md).
    const [rows] = await bq.query({ query: sql, maximumBytesBilled: String(maxBytesBilled()) });

    const values = (rows as Array<Record<string, unknown>>).map((row) => ({
      value: String(row.value),
      ...(labelCol && row.label != null ? { label: String(row.label) } : {}),
    }));

    return NextResponse.json({ values });
  } catch (err) {
    console.error('[FilterValues API Error]', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

/**
 * Opções vindas do resultado da própria métrica (ADR-0026).
 *
 * Passa por `executeMetric` com `distinctField` em vez de montar SQL aqui: é o
 * mesmo caminho da execução do bloco, então posse da métrica, gate de rota,
 * acesso ao dataset, escolha de binding e teto de bytes valem igual para
 * listar valores e para exibi-los.
 */
async function indicatorFieldValues(
  body: { clientId: string; productId: string; metricId: string; field: string },
  email: string,
) {
  try {
    const db = getAdminFirestore(DATAVIZ_DATABASE_ID);
    const snap = await db.collection('metrics').doc(body.metricId).get();
    if (!snap.exists) {
      return NextResponse.json({ error: `Métrica "${body.metricId}" não encontrada` }, { status: 404 });
    }
    /*
     * Documento que não valida é dado ruim, não falha de servidor — mesmo
     * tratamento de `/api/metrics/batch`: 422 para quem chamou, motivo no log.
     * A resposta não diz qual campo reprovou (não vaza shape de schema), e sem
     * o log a investigação começa em "erro interno" e mais nada.
     */
    const parsed = Metric.safeParse({ id: snap.id, ...snap.data() });
    if (!parsed.success) {
      console.error(JSON.stringify({
        level: 'error',
        msg: 'metrica_invalida',
        metricId: snap.id,
        rota: 'filter-values',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code, message: i.message })),
      }));
      return NextResponse.json({ error: `Métrica "${body.metricId}" inválida` }, { status: 422 });
    }
    const metric = parsed.data;

    /*
     * Campo não declarado não vira seletor. A métrica pode até trazer a coluna
     * no SELECT, mas sem `filterFields` nada no WHERE a compara — o dropdown
     * apareceria e não recortaria coisa nenhuma, que é o defeito que a ADR-0025
     * tirou da tela.
     */
    const declared = Object.values(metric.filterFields ?? {});
    if (!declared.some((f) => f.field === body.field)) {
      const available = declared.map((f) => f.field).filter(Boolean);
      return NextResponse.json(
        {
          error: `Campo "${body.field}" não é filtrável em "${body.metricId}"`
            + (available.length > 0 ? `. Filtráveis: ${available.join(', ')}` : ''),
        },
        { status: 422 },
      );
    }

    const bindingsResult = await loadClientBindings(body.clientId);
    if (!bindingsResult.ok) {
      return NextResponse.json({ error: bindingsResult.error }, { status: bindingsResult.status });
    }

    let relations: Relation[] = [];
    if (metric.recipe?.kind === 'derived') {
      const relSnap = await db.collection('relations').get();
      relations = relSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Relation[];
    }

    const result = await executeMetric({
      metric,
      parsedBindings: bindingsResult.bindings,
      clientId: body.clientId,
      productId: body.productId,
      email,
      relations,
      caches: newMetricExecCaches(),
      distinctField: body.field,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const values = (result.data as Array<{ value?: unknown }>)
      .filter((row) => row.value != null)
      .map((row) => ({ value: String(row.value) }));
    return NextResponse.json({ values });
  } catch (err) {
    console.error('[FilterValues API Error]', err);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
