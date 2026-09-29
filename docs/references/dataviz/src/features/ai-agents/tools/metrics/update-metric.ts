import { tool } from 'ai';
import { z } from 'zod';
import { getDb } from '@/shared/lib/firebase/admin';
import { MetricShapeEnum, type MetricShape } from '@/shared/schemas/metric';
import { saveChatMetric, nextVersion } from '@/shared/lib/metrics/chat-metric';
import { validateDraft } from './validate-draft';
import { blockKeysHint } from './columns-by-shape';
import { metricUsages, usedOutside, type MetricUsage } from './metric-usages';
import type { ServerContext } from '../server-context';

/**
 * Altera uma métrica — corrigindo para todo mundo, ou criando uma variação.
 *
 * ─── Por que a intenção é declarada, e não inferida ─────────────────────────
 *
 * A primeira versão desta ferramenta decidia sozinha, pelo uso: métrica que
 * aparecia em outra página virava variação, sempre. Conservador e errado, e o
 * erro é o caso mais comum de todos — a **correção**.
 *
 * Quando o SQL somava errado, variar é o pior resultado possível: a métrica
 * errada continua viva nas três páginas onde estava e nasce uma quarta, certa.
 * Duas telas passam a mostrar números diferentes sob o mesmo nome, e não há
 * como saber em qual acreditar. Métrica é compartilhada justamente para que a
 * correção chegue a todos.
 *
 * Só que existe a outra metade: "quero por mês em vez de posição" não é
 * melhoria, é OUTRA medida com o mesmo nome — e aí editar quebra quem usava a
 * definição anterior.
 *
 * As duas são indistinguíveis olhando o SQL. Quem sabe é quem pediu, e o
 * modelo lê isso no enunciado. Por isso `intencao` é obrigatória:
 *
 * | | métrica do cliente | métrica global (Liquid) |
 * |---|---|---|
 * | `corrigir`  | edita no lugar e vale para TODAS as páginas | recusa: atravessa clientes, é da administração |
 * | `redefinir` | variação (ou edição, se só a página aberta usa) | variação |
 *
 * Correção que alcança página que não está aberta pede confirmação: a
 * ferramenta devolve o alcance e não grava, o assistente conta ao usuário, e a
 * segunda chamada executa. É o mesmo contrato de dois passos da construção de
 * página.
 *
 * O que torna isso reversível é o histórico: toda reescrita arquiva o
 * documento anterior em `revisions`, e `revert_metric` volta.
 */
export function createUpdateMetricTool(ctx: ServerContext) {
  return tool({
    description:
      'Altera uma métrica existente. Declare a intenção: corrigir um cálculo errado (a correção vale '
      + 'para TODAS as páginas que usam a métrica, que é o ponto de ela ser compartilhada) ou redefinir '
      + 'a medida (nasce uma variação e a original fica intacta). Quando devolver uma variação, aponte o '
      + 'bloco para o novo metricId com update_*_block e conte isso ao usuário.',
    inputSchema: z.object({
      metricId: z.string().describe('Id da métrica a alterar, como aparece no catálogo'),
      intencao: z.enum(['corrigir', 'redefinir']).describe(
        'corrigir = o cálculo está errado e a métrica continua medindo a MESMA coisa; a correção vale '
        + 'para todas as páginas que a usam. redefinir = passa a medir OUTRA coisa (outro recorte, outro '
        + 'período, outra base) — nasce uma variação e quem já usava não muda. Na dúvida entre as duas, '
        + 'pergunte ao usuário: é a única pergunta sobre métrica que vale a pena fazer a ele.',
      ),
      confirmado: z.boolean().optional().describe(
        'Só para corrigir métrica que outras páginas usam: a primeira chamada devolve o alcance sem '
        + 'gravar; chame de novo com true depois de contar ao usuário quais páginas mudam.',
      ),
      sql: z.string().optional().describe(
        'A nova consulta, com {entidade} e {entidade.atributo}. Omita para mudar só rótulo/descrição.',
      ),
      shape: MetricShapeEnum.optional().describe('Nova forma do resultado, quando a consulta muda o formato'),
      requires: z.array(z.string()).optional().describe('Novas refs "contrato.entidade.atributo"'),
      label: z.string().optional().describe('Novo nome do indicador'),
      description: z.string().optional().describe('Nova descrição de uma linha'),
      unit: z.string().optional().describe('Nova unidade'),
      percentPointColumns: z.array(z.string()).optional().describe(
        'Nova declaração das colunas do SELECT que saem em PONTOS percentuais (82,27 para 82,27%). O padrão é devolver '
        + 'percentual como FRAÇÃO (0,8227) e não declarar nada; declare só quando o dado já vem em '
        + 'pontos (ex.: avanço de obra em %). Omita para manter a atual; [] limpa.',
      ),
    }),
    execute: async (input) => {
      const { clientId, userEmail } = ctx;
      if (!clientId || !userEmail) {
        return { ok: false as const, error: 'SEM_TENANT' as const, message: 'Nenhum cliente ativo.' };
      }

      const db = getDb();
      const snap = await db.collection('metrics').doc(input.metricId).get();
      if (!snap.exists) {
        return {
          ok: false as const,
          error: 'METRIC_NOT_FOUND' as const,
          message: `A métrica "${input.metricId}" não existe. Para um indicador novo, use create_metric.`,
        };
      }
      const currentData = (snap.data() ?? {}) as Record<string, unknown>;
      const current = currentData as {
        label?: string; description?: string | null; unit?: string | null;
        requires?: string[]; recipe?: { kind?: string; template?: string };
        shape?: MetricShape; version?: unknown; createdAt?: unknown; ownerClientId?: string | null;
        percentPointColumns?: string[];
      };

      if (current.recipe?.kind !== 'sql' && !input.sql) {
        return {
          ok: false as const,
          error: 'RECEITA_NAO_TEXTUAL' as const,
          message:
            'Esta métrica não é feita de consulta escrita, então não há texto para ajustar. '
            + 'Mande a consulta completa em sql, ou crie uma métrica nova.',
        };
      }

      const shape = input.shape ?? current.shape;
      if (!shape) {
        return {
          ok: false as const,
          error: 'FORMA_DESCONHECIDA' as const,
          message:
            'A métrica não declara a forma do resultado, e sem ela o bloco escolhido pode exibir '
            + 'o dado errado. Informe shape.',
        };
      }

      const draft = {
        clientId,
        label: input.label ?? current.label ?? input.metricId,
        description: input.description ?? current.description ?? null,
        unit: input.unit ?? current.unit ?? null,
        sql: input.sql ?? current.recipe?.template ?? '',
        requires: input.requires ?? current.requires ?? [],
        shape,
        // Sem declaração nova, a do documento segue — podada ao que o SQL novo
        // ainda devolve (ADR-0033).
        percentPointColumns: input.percentPointColumns ?? current.percentPointColumns ?? [],
        percentPointColumnsInherited: input.percentPointColumns === undefined,
      };

      const fromClient = (current.ownerClientId ?? null) === clientId;

      /*
       * Corrigir métrica global é o único pedido que esta ferramenta não
       * atende. Não é conservadorismo: a correção estaria certa, e é justamente
       * por isso que ela não pode sair daqui — `covenants.*` é catálogo da
       * Liquid, e o alcance da mudança é toda a base de clientes, não a deste
       * usuário. Variação silenciosa também não serve: deixaria o número errado
       * de pé para todos os outros.
       */
      if (!fromClient && input.intencao === 'corrigir') {
        return {
          ok: false as const,
          error: 'CORRECAO_EM_METRICA_GLOBAL' as const,
          message:
            `"${input.metricId}" é do catálogo compartilhado da Liquid, não deste cliente — corrigi-la `
            + 'mudaria o número de todos os clientes que a usam, e isso é da administração. Diga isso ao '
            + 'usuário. Se ele precisa do número certo agora, você pode criar uma versão corrigida só para '
            + 'este cliente com intencao "redefinir" — deixando claro que a original segue como está.',
        };
      }

      const uses: MetricUsage[] = fromClient ? await metricUsages(db, clientId, input.metricId) : [];
      const reachesOtherPage = usedOutside(uses, {
        groupId: ctx.activeGroupId,
        reportId: ctx.activeReportId,
      });
      const isFix = fromClient && input.intencao === 'corrigir';

      /*
       * Confirmação só quando a correção sai da página aberta. Corrigir a
       * métrica do que se está olhando não precisa de cerimônia; mexer no
       * relatório de outra pessoa precisa — e quem avisa é o assistente, antes,
       * não o log, depois.
       */
      if (isFix && reachesOtherPage && !input.confirmado) {
        return {
          ok: false as const,
          error: 'CONFIRMACAO_NECESSARIA' as const,
          usos: uses,
          message:
            `A correção vale para as ${uses.length} página(s) que usam esta métrica `
            + `(${uses.map((u) => u.reportName).join(', ')}) — é o esperado quando o cálculo estava errado. `
            + 'Conte isso ao usuário e chame de novo com confirmado: true se ele concordar. '
            + 'Se a intenção era mudar a definição só aqui, chame com intencao "redefinir".',
        };
      }

      /*
       * Redefinir sem alcançar ninguém edita no lugar de propósito: criar
       * variação aqui deixaria para trás uma métrica órfã, que o bloco deixa de
       * apontar no passo seguinte e ninguém mais usa.
       */
      const editsInPlace = fromClient && (isFix || !reachesOtherPage);

      const validation = await validateDraft({
        draft,
        email: userEmail,
        metricId: editsInPlace ? input.metricId : undefined,
      });
      if (!validation.ok) {
        return {
          ok: false as const,
          error: 'METRICA_INVALIDA' as const,
          etapa: validation.etapa,
          message:
            `A métrica não foi alterada (${validation.etapa}): ${validation.error} `
            + 'Corrija e chame de novo, ou conte ao usuário o que faltou.',
        };
      }

      const { percentPointColumnsInherited: _inherited, ...fields } = draft;
      const metric = { ...fields, outputColumns: validation.outputColumns, percentPointColumns: validation.percentPointColumns };

      if (editsInPlace) {
        const saved = await saveChatMetric({
          db,
          metric,
          email: userEmail,
          metricId: input.metricId,
          createdAt: current.createdAt,
          version: nextVersion(current.version),
          // O que ela era vai para o histórico antes de deixar de existir.
          previousDoc: currentData,
        });
        if (!saved) {
          return { ok: false as const, error: 'FALHA_AO_GRAVAR' as const, message: 'A alteração não pôde ser gravada.' };
        }
        return {
          action: 'metric_updated' as const,
          metricId: input.metricId,
          shape,
          outputColumns: validation.outputColumns,
          aviso: [
            reachesOtherPage
              ? `Corrigida no lugar — o número muda também em: ${uses.map((u) => u.reportName).join(', ')}. `
                + 'Diga isso ao usuário. Se piorou, revert_metric desfaz.'
              : 'Editada no lugar: nenhuma outra página usa esta métrica. O bloco continua apontando para o mesmo id.',
            blockKeysHint(validation.outputColumns),
            validation.aviso,
          ].filter(Boolean).join(' '),
        };
      }

      const variant = await saveChatMetric({
        db,
        email: userEmail,
        metric: {
          ...metric,
          label: input.label ?? `${draft.label} (variação)`,
          // Linhagem no DOCUMENTO: até aqui ela só voltava no resultado da
          // ferramenta e morria junto com a conversa.
          derivedFrom: input.metricId,
        },
      });
      if (!variant) {
        return { ok: false as const, error: 'FALHA_AO_GRAVAR' as const, message: 'A variante não pôde ser gravada.' };
      }
      ctx.registerMetric?.(variant.metricId);

      const motivo = fromClient
        ? `a definição mudou e a métrica original alimenta ${uses.length} página(s) `
          + `(${uses.map((u) => u.reportName).join(', ')}), que continuam medindo o que mediam`
        : 'a métrica original é do catálogo compartilhado, e não deste cliente';

      return {
        action: 'metric_variant_created' as const,
        metricId: variant.metricId,
        baseMetricId: input.metricId,
        shape,
        outputColumns: validation.outputColumns,
        motivo,
        usosDaOriginal: uses,
        aviso: [
          `Criei uma variante porque ${motivo} — a original ficou intacta. `
          + 'Aponte o bloco para o novo metricId com update_*_block e diga isso ao usuário.',
          blockKeysHint(validation.outputColumns),
          validation.aviso,
        ].filter(Boolean).join(' '),
      };
    },
  });
}
