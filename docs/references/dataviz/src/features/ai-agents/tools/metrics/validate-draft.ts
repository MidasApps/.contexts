import 'server-only';
import { MetricDoc, type Metric, type MetricShape } from '@/shared/schemas/metric';
import {
  executeMetric,
  loadClientBindings,
  newMetricExecCaches,
} from '@/shared/lib/metrics/execute-metric';
import type { PageFilterValue } from '@/shared/lib/metrics/resolve-metric';
import { formatToolError } from '@/features/ai-agents/lib/format-error';
import { guardMetricTemplate } from './guard-metric-template';
import { checkPercentScale } from './percent-scale-guard';
import { checkColumns } from './columns-by-shape';

/**
 * Prova que a métrica funciona ANTES de ela entrar no catálogo.
 *
 * Uma métrica não é uma resposta: é um documento que fica, e que outras páginas
 * podem passar a usar. Gravar primeiro e descobrir depois significa o usuário
 * abrindo um relatório com um bloco vazio — e o assistente tendo anunciado
 * sucesso.
 *
 * São quatro portas, nesta ordem, e cada uma responde a uma pergunta diferente:
 *
 * 1. **template** — é leitura, e fala pela entidade do contrato? (nada de
 *    tabela literal, nada que escreva)
 * 2. **documento** — o doc é válido para `MetricDoc`? (refs em forma de ref,
 *    template dentro do limite, forma conhecida)
 * 3. **compilação** — resolvido contra o binding REAL do cliente, o BigQuery
 *    aceita a query? O dry-run não lê byte nenhum e devolve o schema previsto.
 * 4. **colunas** — os nomes que a query devolve servem à forma declarada?
 *
 * Sem a 3, a única validação possível seria de texto, e um `{contratos.saldo}`
 * inexistente passaria; sem a 4, a métrica roda e o bloco renderiza vazio.
 *
 * Depois das quatro, uma execução de verdade — que NÃO reprova, só avisa. Ver
 * `sampleWarning`.
 */

export interface MetricDraft {
  clientId: string;
  label: string;
  description?: string | null;
  unit?: string | null;
  /** Template com placeholders do contrato. */
  sql: string;
  requires: string[];
  shape: MetricShape;
  /** Colunas que a consulta devolve em pontos percentuais (ADR-0033). */
  percentPointColumns?: string[];
  /** A declaração veio do documento, não do modelo — ver `checkPercentScale`. */
  percentPointColumnsInherited?: boolean;
}

export type ValidationStep = 'template' | 'documento' | 'compilacao' | 'colunas' | 'escala';

export type MetricValidation =
  | { ok: true; outputColumns: string[]; percentPointColumns: string[]; sql: string; aviso?: string }
  | { ok: false; etapa: ValidationStep; error: string };

/**
 * O que a amostra revela e a compilação não revelaria.
 *
 * Compilar prova que a query é SQL válido contra o schema; não prova que ela
 * devolve número. Visto acontecer no primeiro uso real desta ferramenta: um
 * `SAFE_CAST(coluna_texto AS FLOAT64)` compila, roda, e devolve `null` em toda
 * linha — a métrica entra no catálogo, o gráfico aparece, e não há o que
 * desenhar. É a mesma falha silenciosa que a checagem de colunas evita, uma
 * camada abaixo.
 *
 * Avisa, não reprova: métrica legitimamente vazia existe (nenhum contrato em
 * atraso ainda), e transformar isso em erro impediria de criar o indicador que
 * se quer justamente para acompanhar.
 */
function sampleWarning(rows: unknown[], columns: string[]): string | undefined {
  if (rows.length === 0) {
    return 'A consulta não devolveu nenhuma linha — confira os filtros do WHERE. '
      + 'A métrica foi criada assim mesmo; se o indicador deveria ter dado, corrija-a.';
  }
  const measures = columns.slice(1).length > 0 ? columns.slice(1) : columns;
  const allNull = rows.every((row) => {
    const record = (row ?? {}) as Record<string, unknown>;
    return measures.every((c) => record[c] === null || record[c] === undefined);
  });
  if (allNull) {
    return `A consulta roda, mas ${measures.join('/')} veio nulo em todas as linhas — `
      + 'quase sempre é conversão de tipo (SAFE_CAST sobre coluna de texto com máscara devolve null). '
      + 'A métrica foi criada assim mesmo; confira o tipo das colunas e corrija com update_metric.';
  }
  return undefined;
}

/** Id provisório: nada é gravado com ele, mas `MetricDoc` exige forma válida. */
const DRAFT_ID = 'chat.rascunho';

/**
 * Os filtros de página que a validação simula.
 *
 * Sem eles, `{filter.date_range}` vira `1=1` e a cláusula de data NUNCA é
 * resolvida — uma métrica com o atributo de data errado passaria na validação e
 * quebraria só ao abrir a página. Com eles, a resolução da coluna acontece
 * agora, que é fail-loud.
 *
 * As chaves e os atributos espelham o que `useReportData` manda de verdade
 * (`DEFAULT_PAGE_FILTERS` + o `ate` derivado do recorte); as datas são um
 * intervalo aberto, porque o que se valida aqui é a FORMA da consulta, não o
 * número que ela devolve — e o dry-run não lê linha nenhuma.
 */
const VALIDATION_FILTERS: Record<string, PageFilterValue> = {
  date_range: { kind: 'date_range', start: '1900-01-01', end: '2999-12-31', attribute: 'contratos.data_base_report' },
  snapshot: { kind: 'snapshot', value: '2999-12-31', attribute: 'contratos.data_base_report' },
  ate: { kind: 'ate', value: '2999-12-31', attribute: 'contratos.data_base_report' },
};

export async function validateDraft(opts: {
  draft: MetricDraft;
  email: string;
  /** Id do documento sob validação (a criação usa o provisório). */
  metricId?: string;
}): Promise<MetricValidation> {
  const { draft, email } = opts;

  const template = guardMetricTemplate(draft.sql);
  if (!template.ok) return { ok: false, etapa: 'template', error: template.error };

  const doc = MetricDoc.safeParse({
    label: draft.label,
    description: draft.description ?? null,
    type: 'kpi',
    unit: draft.unit ?? null,
    requires: draft.requires,
    recipe: { kind: 'sql', template: draft.sql },
    shape: draft.shape,
    status: 'active',
    ownerClientId: draft.clientId,
  });
  if (!doc.success) {
    return {
      ok: false,
      etapa: 'documento',
      error: doc.error.issues.map((i) => `${i.path.join('.') || 'doc'}: ${i.message}`).join('; '),
    };
  }

  const bindings = await loadClientBindings(draft.clientId);
  if (!bindings.ok) return { ok: false, etapa: 'compilacao', error: bindings.error };

  const metric = { ...doc.data, id: opts.metricId ?? DRAFT_ID } as Metric;
  const dry = await executeMetric({
    metric,
    parsedBindings: bindings.bindings,
    clientId: draft.clientId,
    email,
    relations: [],
    caches: newMetricExecCaches(),
    pageFilters: VALIDATION_FILTERS,
    dryRun: true,
  });
  if (!dry.ok) return { ok: false, etapa: 'compilacao', error: formatToolError(dry.error) };

  const columns = checkColumns(draft.shape, dry.outputColumns);
  if (!columns.ok) return { ok: false, etapa: 'colunas', error: columns.error };

  const scale = checkPercentScale({
    sql: draft.sql,
    outputColumns: dry.outputColumns,
    declared: draft.percentPointColumns ?? [],
    inherited: draft.percentPointColumnsInherited,
  });
  if (!scale.ok) return { ok: false, etapa: 'escala', error: scale.error };

  /*
   * Uma execução de verdade, uma vez. Custa uma query (com o mesmo teto de
   * bytes das demais) e é o que separa "compila" de "devolve número".
   */
  const sample = await executeMetric({
    metric,
    parsedBindings: bindings.bindings,
    clientId: draft.clientId,
    email,
    relations: [],
    caches: newMetricExecCaches(),
    pageFilters: VALIDATION_FILTERS,
  });
  const aviso = sample.ok
    ? sampleWarning(sample.data, dry.outputColumns)
    : 'A consulta compila, mas falhou ao executar uma vez para amostra. A métrica foi criada assim mesmo.';

  return {
    ok: true,
    outputColumns: dry.outputColumns,
    percentPointColumns: scale.percentPointColumns,
    sql: dry.sql,
    ...(aviso ? { aviso } : {}),
  };
}
