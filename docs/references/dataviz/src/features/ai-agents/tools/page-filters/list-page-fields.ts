import { tool } from 'ai';
import { z } from 'zod';
import { getDb } from '@/shared/lib/firebase/admin';
import type { ServerContext } from '../server-context';
import { pageFilterableFields } from './page-filter';

/**
 * Os campos que a página aberta sabe filtrar.
 *
 * É a lista que faltava (ADR-0026). Para escolher o campo de um filtro, o
 * assistente tinha à mão `list_metric_fields` — o contrato de dados do cliente
 * inteiro, com mais de cem atributos, a maioria dos quais não aparece em
 * indicador nenhum daquela página. Pedido um "filtro pelo nome do banco", ele
 * escolheu dali `transacoes.pagador_banco` (NULL em 418 de 418 linhas) para uma
 * tela que mostra "BANCO INTER" — nome que nasce de um JOIN da métrica e não
 * existe no contrato.
 *
 * O que sai daqui é o vocabulário certo: o que os indicadores DESTA página
 * exibem e sabem recortar.
 */
export function createListPageFieldsTool(ctx: ServerContext) {
  return tool({
    description:
      'Lista os campos que os indicadores da página aberta sabem filtrar — o vocabulário de '
      + 'add_page_filter. Chame ANTES de criar filtro: o campo precisa ser um destes, e não um '
      + 'atributo qualquer do contrato de dados.',
    /*
     * Schema não-vazio de propósito: `z.object({})` vira declaração de função
     * sem propriedade, e provedor que recusa isso derruba o registro do
     * CONJUNTO de ferramentas — o turno inteiro morre pela tool mais inofensiva.
     */
    inputSchema: z.object({
      motivo: z.string().optional().describe('Opcional: o que o usuário pediu, para registro.'),
    }),
    execute: async () => {
      const { clientId, activeGroupId, activeReportId } = ctx;
      if (!clientId || !activeGroupId || !activeReportId) {
        return {
          ok: false as const,
          error: 'SEM_PAGINA_ABERTA' as const,
          message:
            'Não há página de relatório aberta — filtro pertence a uma página. '
            + 'Peça ao usuário para abrir a página onde ele quer o filtro.',
        };
      }

      const snap = await getDb()
        .collection('clients').doc(clientId)
        .collection('groups').doc(activeGroupId)
        .collection('reports').doc(activeReportId)
        .get();
      if (!snap.exists) {
        return {
          ok: false as const,
          error: 'PAGINA_NAO_ENCONTRADA' as const,
          message: 'A página aberta não foi encontrada no banco. Recarregue e tente de novo.',
        };
      }

      const data = (snap.data() ?? {}) as {
        blockMap?: Record<string, unknown>;
        filters?: { metricPageFilters?: Record<string, unknown> };
      };
      const declared = Object.keys(data.filters?.metricPageFilters ?? {});
      const fields = pageFilterableFields(ctx.semanticContext, data.blockMap, declared);

      const indicators = [...new Set(
        Object.values(data.blockMap ?? {})
          .map((b) => (b as { metricId?: unknown }).metricId)
          .filter((id): id is string => typeof id === 'string'),
      )];

      return {
        ok: true as const,
        groupId: activeGroupId,
        reportId: activeReportId,
        indicadoresDaPagina: indicators,
        campos: fields,
        comoUsar: fields.length > 0
          ? 'Passe o `campo` a add_page_filter. O seletor lê as opções do resultado do próprio '
            + 'indicador, então mostra o mesmo texto que está na tela — inclusive quando esse texto '
            + 'vem de um JOIN da métrica. Campo com jaDeclarado: true já é seletor nesta página, e '
            + 'add_page_filter recusa criá-lo de novo: para trocá-lo, remove_page_filter antes.'
          : 'Nenhum indicador desta página declara campo filtrável (filterFields), então não há '
            + 'filtro a criar aqui. Diga isso ao usuário: filtrar exigiria a métrica do bloco '
            + 'declarar o campo, o que em métrica do catálogo compartilhado é da administração.',
      };
    },
  });
}
