import { tool } from 'ai';
import { z } from 'zod';
import { getDb } from '@/shared/lib/firebase/admin';
import type { ServerContext } from '../server-context';
import { pageFilterableFields, metricsHonoringKey } from './page-filter';

/**
 * Declara um filtro na página aberta — a pedido, nunca por padrão.
 *
 * ─── Por que o vocabulário é o campo do indicador (ADR-0026) ────────────────
 * A ferramenta recebia `entidade.atributo`, vocabulário do contrato de dados.
 * Nele o nome do banco não existe: a tela mostra "BANCO INTER" porque a métrica
 * faz `LEFT JOIN ba_bancos`, e `ba_bancos` não é entidade de contrato nenhum.
 * Pedido "quero o filtro pelo nome, não pelo número", o modelo escolheu o menos
 * ruim que a lista oferecia — `transacoes.pagador_banco`, NULL em 418 de 418
 * linhas — e o seletor nasceu com uma opção: `77`.
 *
 * Agora ele escolhe entre os campos que os indicadores DESTA página declaram
 * filtráveis. O seletor lê as opções do resultado da própria métrica, então
 * mostra o mesmo texto da tela; e a chave do filtro vem da declaração, não de
 * um palpite sobre o rótulo digitado.
 *
 * ─── Por que escreve direto no Firestore ────────────────────────────────────
 * O `handleSave` do relatório grava só `blockMap` e `layout`. Um filtro que
 * viajasse pelo canvas se perderia no salvamento — some sem erro.
 *
 * ─── Por que o resultado fala de quem HONRA o filtro ────────────────────────
 * Declarar não recorta nada: a métrica precisa citar `{filter.X}` no template.
 * Um dropdown que não alcança bloco nenhum é o defeito que a ADR-0025 removeu
 * do painel — então a ferramenta confere e devolve quem reage, para o
 * assistente poder dizer a verdade ao usuário.
 */
export function createAddPageFilterTool(ctx: ServerContext) {
  return tool({
    description:
      'Adiciona um filtro à página aberta — um seletor no topo, alimentado por um campo de um '
      + 'indicador DESTA página, com os mesmos valores que aparecem na tela. Use APENAS quando o '
      + 'usuário pedir um filtro; página não nasce com filtro. Chame list_page_fields antes para '
      + 'ver os campos disponíveis. Devolve quais blocos da página realmente reagem a ele.',
    inputSchema: z.object({
      campo: z.string().describe(
        'Campo filtrável de um indicador da página (ex.: "banco", "categoria"). '
        + 'Use list_page_fields para ver os disponíveis.',
      ),
      label: z.string().optional().describe(
        'Como o filtro aparece na tela. Omita para usar o rótulo que a métrica sugere.',
      ),
    }),
    execute: async ({ campo: field, label }) => {
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

      const db = getDb();
      const ref = db
        .collection('clients').doc(clientId)
        .collection('groups').doc(activeGroupId)
        .collection('reports').doc(activeReportId);
      const snap = await ref.get();
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
      const existing = data.filters?.metricPageFilters ?? {};
      const available = pageFilterableFields(
        ctx.semanticContext,
        data.blockMap,
        Object.keys(existing),
      );

      const chosen = available.find((c) => c.campo === field);
      if (!chosen) {
        /*
         * A lista marca quem já é seletor. Sem a marca, o modelo se corrigia
         * escolhendo um campo desta mesma lista e levava um segundo "não" —
         * agora `FILTRO_JA_EXISTE` —, gastando dois turnos numa pergunta.
         */
        const list = available
          .map((c) => (c.jaDeclarado ? `${c.campo} (já é filtro desta página)` : c.campo))
          .join(', ');
        return {
          ok: false as const,
          error: 'CAMPO_DESCONHECIDO' as const,
          camposDisponiveis: available,
          message: available.length > 0
            ? `Nenhum indicador desta página oferece o campo "${field}". Os que existem são: ${list}. `
              + 'Escolha um deles — é o que o usuário vê na tela; os marcados já são seletores e a '
              + 'ferramenta recusa criá-los de novo. Se nenhum serve, diga ao usuário que o dado '
              + 'pedido não está nos indicadores desta página.'
            : `Nenhum indicador desta página declara campo filtrável, então não há filtro a criar `
              + 'aqui. Diga isso ao usuário: filtrar exigiria ajustar a métrica do bloco para '
              + 'declarar o campo (filterFields), o que em métrica do catálogo compartilhado é da '
              + 'administração.',
        };
      }

      /*
       * Chave ocupada não vira `banco_2`.
       *
       * O renomeio silencioso criava um seletor que nenhuma métrica cita —
       * decorativo por construção. Recusar devolve a decisão a quem sabe: ou o
       * filtro já existe e não há o que fazer, ou o usuário quer trocá-lo, e aí
       * é remove_page_filter antes.
       */
      if (chosen.jaDeclarado) {
        return {
          ok: false as const,
          error: 'FILTRO_JA_EXISTE' as const,
          key: chosen.chave,
          message:
            `Esta página já tem o filtro "${chosen.chave}" (campo "${field}"). Se o usuário quer `
            + 'trocá-lo, remova com remove_page_filter e declare de novo; se ele só não está vendo o '
            + 'seletor, o problema é outro — não crie um segundo.',
        };
      }

      await ref.update({
        [`filters.metricPageFilters.${chosen.chave}`]: {
          kind: 'in',
          control: 'dropdown',
          label: label ?? chosen.label ?? field,
          source: { metricId: chosen.metricId, field },
        },
      });

      const { honoring, ignoring, withoutComparison } = metricsHonoringKey(
        ctx.semanticContext,
        data.blockMap,
        chosen.chave,
      );

      const remaining = available.filter((c) => c.campo !== field && !c.jaDeclarado);
      return {
        action: 'page_filter_added' as const,
        key: chosen.chave,
        label: label ?? chosen.label ?? field,
        campo: field,
        metricId: chosen.metricId,
        groupId: activeGroupId,
        reportId: activeReportId,
        blocosQueReagem: honoring,
        blocosQueIgnoram: ignoring,
        /** Citam a chave e não sabem comparar — a seleção passa por elas em branco. */
        blocosQueCitamSemComparar: withoutComparison,
        /** Outros campos que esta página poderia filtrar e ninguém declarou. */
        camposDisponiveis: remaining,
        aviso: [
          honoring.length > 0
            ? `O filtro vale para: ${honoring.join(', ')}.`
            : `Atenção: NENHUMA métrica desta página recorta por {filter.${chosen.chave}}, então o `
              + 'seletor aparece e não filtra nada. Diga isso ao usuário.',
          ignoring.length > 0
            ? `Não alcança ${ignoring.join(', ')} — essas métricas não citam {filter.${chosen.chave}} `
              + 'na consulta. Conte ao usuário o que ficou de fora.'
            : '',
          withoutComparison.length > 0
            ? `${withoutComparison.join(', ')} cita {filter.${chosen.chave}} mas não declara o campo, `
              + 'então ignora a seleção em silêncio. Para valer nesses blocos a métrica precisa '
              + 'declarar filterFields — em métrica do catálogo compartilhado, isso é da administração.'
            : '',
        ].filter(Boolean).join(' '),
      };
    },
  });
}
