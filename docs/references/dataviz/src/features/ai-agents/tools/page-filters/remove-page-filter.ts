import { tool } from 'ai';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '@/shared/lib/firebase/admin';
import type { ServerContext } from '../server-context';

/** Filtros que definem o eixo de tempo da página, não a escolha do usuário. */
const TIME_AXIS = new Set(['date_range', 'snapshot', 'ate']);

/**
 * Tira um filtro da página aberta.
 *
 * Não mexe nos filtros de TEMPO (`date_range`, `snapshot`, `ate`): eles não são
 * seletores, são o contrato da página com o período escolhido no painel. Remover
 * um deles não tiraria um controle da tela — faria as métricas da página
 * pararem de responder ao período, silenciosamente.
 */
export function createRemovePageFilterTool(ctx: ServerContext) {
  return tool({
    description:
      'Remove um filtro da página aberta, pelo rótulo ou pela chave. Use quando o usuário disser '
      + 'que não quer mais aquele seletor.',
    inputSchema: z.object({
      filtro: z.string().describe('Rótulo ou chave do filtro a remover (ex.: "Banco" ou "banco")'),
    }),
    execute: async ({ filtro: filter }) => {
      const { clientId, activeGroupId, activeReportId } = ctx;
      if (!clientId || !activeGroupId || !activeReportId) {
        return {
          ok: false as const,
          error: 'SEM_PAGINA_ABERTA' as const,
          message: 'Não há página de relatório aberta.',
        };
      }

      const db = getDb();
      const ref = db
        .collection('clients').doc(clientId)
        .collection('groups').doc(activeGroupId)
        .collection('reports').doc(activeReportId);
      const snap = await ref.get();
      if (!snap.exists) {
        return { ok: false as const, error: 'PAGINA_NAO_ENCONTRADA' as const, message: 'Página não encontrada.' };
      }

      const data = (snap.data() ?? {}) as {
        filters?: { metricPageFilters?: Record<string, { label?: string; kind?: string; control?: string }> };
      };
      const declared = data.filters?.metricPageFilters ?? {};

      const target = Object.keys(declared).find(
        (k) => k === filter || declared[k]?.label?.toLowerCase() === filter.toLowerCase(),
      );
      const selectors = Object.entries(declared)
        .filter(([k, cfg]) => cfg?.control === 'dropdown' && !TIME_AXIS.has(k))
        .map(([k, cfg]) => cfg?.label ?? k);

      if (!target) {
        return {
          ok: false as const,
          error: 'FILTRO_NAO_ENCONTRADO' as const,
          message: selectors.length > 0
            ? `Esta página não tem o filtro "${filter}". Tem: ${selectors.join(', ')}.`
            : 'Esta página não tem nenhum filtro para remover.',
        };
      }

      if (TIME_AXIS.has(target) || declared[target]?.control !== 'dropdown') {
        return {
          ok: false as const,
          error: 'FILTRO_DE_TEMPO' as const,
          message:
            `"${target}" não é um seletor da página: é como as métricas dela recebem o período escolhido `
            + 'no painel. Removê-lo faria os blocos pararem de responder ao filtro de data. '
            + 'Diga isso ao usuário.',
        };
      }

      await ref.update({ [`filters.metricPageFilters.${target}`]: FieldValue.delete() });

      return {
        action: 'page_filter_removed' as const,
        key: target,
        label: declared[target]?.label ?? target,
        groupId: activeGroupId,
        reportId: activeReportId,
        aviso:
          'Filtro removido da página. As métricas que o citavam voltam a considerar tudo — o '
          + 'placeholder sem filtro declarado vira `1=1` na consulta.',
      };
    },
  });
}
