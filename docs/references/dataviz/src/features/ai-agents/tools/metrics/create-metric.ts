import { tool } from 'ai';
import { z } from 'zod';
import { getDb } from '@/shared/lib/firebase/admin';
import { MetricShapeEnum } from '@/shared/schemas/metric';
import { saveChatMetric } from '@/shared/lib/metrics/chat-metric';
import { validateDraft } from './validate-draft';
import { blockKeysHint } from './columns-by-shape';
import type { ServerContext } from '../server-context';

/**
 * Cria uma métrica NOVA no catálogo do cliente.
 *
 * Sempre nova, nunca uma alteração em métrica existente: as 64 métricas
 * `covenants.*` são globais (catálogo da Liquid, compartilhado entre clientes),
 * e mesmo uma métrica do próprio cliente costuma alimentar mais de uma página.
 * Alterar é a outra ferramenta, e ela decide entre editar e variar depois de
 * olhar quem usa.
 *
 * O que a torna segura o bastante para existir:
 *
 * - o template é somente leitura e fala pela entidade do contrato — nenhum
 *   nome de tabela escrito à mão (`guard-metric-template`);
 * - nada é gravado sem compilar contra o binding real do cliente, por dry-run,
 *   que não lê byte nenhum (`validate-draft`);
 * - as colunas que a query devolve têm de servir à forma declarada, senão o
 *   bloco montaria vazio;
 * - o documento vive no Firestore e é do cliente (`ownerClientId`), com posse,
 *   gate de rota e teto de bytes já aplicados na execução.
 *
 * Nada é criado ou alterado no BigQuery — a métrica só o consulta.
 */
export function createCreateMetricTool(ctx: ServerContext) {
  return tool({
    description:
      'Cria uma métrica nova no catálogo deste cliente, a partir de uma consulta que você escreve. '
      + 'Use quando o indicador pedido não existe no catálogo — em vez de dizer que não é possível, '
      + 'ou de apontar o bloco para uma métrica parecida. Chame list_metric_fields antes, para saber '
      + 'as entidades e atributos disponíveis. A métrica é validada no BigQuery (sem executar) antes '
      + 'de ser gravada, e passa a valer para todos os relatórios deste cliente.',
    inputSchema: z.object({
      label: z.string().describe('Nome do indicador, como a pessoa o chamaria (ex.: "Vendas por mês")'),
      description: z.string().optional().describe('Uma linha explicando o que a métrica mede'),
      unit: z.string().optional().describe('Unidade, quando ajuda a ler o número (ex.: "R$", "%", "un")'),
      sql: z.string().describe(
        'A consulta, usando {entidade} onde iria a tabela e {entidade.atributo} onde iria a coluna. '
        + 'Contagem/soma de eventos ("do mês", "no período"): {filter.date_range:entidade.atributo_de_data} '
        + '— a página recorta ao mês do fim do período no modo "Último mês"; não escreva o mês na consulta. '
        + 'Posição numa foto (saldo, estoque, covenant): data = (SELECT MAX(data) FROM {entidade} '
        + 'WHERE {filter.ate:entidade.data}) — {filter.ate} sozinho é "até o fim" e soma o histórico. '
        + 'Os nomes das colunas do SELECT precisam casar com a forma: scalar ⇒ value; '
        + 'timeseries ⇒ bucket, value; breakdown ⇒ <dimensão>, value. '
        + 'Percentual sai como fração (0–1), sem multiplicar por 100.',
      ),
      requires: z.array(z.string()).min(1).describe(
        'Refs "contrato.entidade.atributo" que a métrica usa. A PRIMEIRA decide de qual dataset ela lê.',
      ),
      shape: MetricShapeEnum.describe('Forma do resultado — é ela que decide qual bloco pode exibir a métrica'),
      percentPointColumns: z.array(z.string()).optional().describe(
        'Colunas do SELECT que saem em PONTOS percentuais (82,27 para 82,27%). O padrão é devolver '
        + 'percentual como FRAÇÃO (0,8227) e não declarar nada; declare só quando o dado já vem em '
        + 'pontos (ex.: avanço de obra em %). Todo bloco lê isto para exibir o número certo.',
      ),
    }),
    execute: async (input) => {
      const { clientId, userEmail } = ctx;
      if (!clientId || !userEmail) {
        return {
          ok: false as const,
          error: 'SEM_TENANT' as const,
          message: 'Nenhum cliente ativo — não há catálogo onde criar a métrica.',
        };
      }

      const draft = {
        clientId,
        label: input.label,
        description: input.description ?? null,
        unit: input.unit ?? null,
        sql: input.sql,
        requires: input.requires,
        shape: input.shape,
        ...(input.percentPointColumns ? { percentPointColumns: input.percentPointColumns } : {}),
      };

      const validation = await validateDraft({ draft, email: userEmail });
      if (!validation.ok) {
        return {
          ok: false as const,
          error: 'METRICA_INVALIDA' as const,
          etapa: validation.etapa,
          message:
            `A métrica não foi criada (${validation.etapa}): ${validation.error} `
            + 'Corrija e chame de novo. Se não conseguir, diga ao usuário o que faltou — '
            + 'não crie bloco apontando para outra métrica no lugar.',
        };
      }

      const saved = await saveChatMetric({
        db: getDb(),
        email: userEmail,
        metric: { ...draft, outputColumns: validation.outputColumns, percentPointColumns: validation.percentPointColumns },
      });
      if (!saved) {
        return {
          ok: false as const,
          error: 'FALHA_AO_GRAVAR' as const,
          message: 'A consulta é válida, mas o documento da métrica não pôde ser gravado. Avise o usuário.',
        };
      }

      // Sem isto, o `add_*_block` seguinte recusaria o id como inexistente: o
      // catálogo que as tools de bloco conferem é o retrato de quando a
      // requisição chegou.
      ctx.registerMetric?.(saved.metricId);

      return {
        action: 'metric_created' as const,
        metricId: saved.metricId,
        shape: input.shape,
        outputColumns: validation.outputColumns,
        aviso: [
          'Métrica criada no catálogo deste cliente — ela fica disponível para qualquer relatório dele. '
          + 'Use este metricId no bloco e diga ao usuário que o indicador é novo.',
          blockKeysHint(validation.outputColumns),
          validation.aviso,
        ].filter(Boolean).join(' '),
      };
    },
  });
}
