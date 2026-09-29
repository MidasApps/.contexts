import { tool } from 'ai';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '@/shared/lib/firebase/admin';
import { uniqueSlug } from '@/shared/lib/slug';

/**
 * Cria uma página de relatório de verdade — documento em
 * `clients/{id}/groups/{g}/reports/{r}`, que aparece na navegação e sobrevive
 * ao reload.
 *
 * Existia um `create_page` no orquestrador de canvas, mas ele criava página no
 * store do navegador, e o `handleSave` do relatório grava só `pages[0]`: uma
 * página criada por ali nunca era persistida em lugar nenhum. Página é
 * documento de relatório; não há outro conceito de página.
 *
 * O `clientId` vem do contexto do SERVIDOR, nunca do input (ADR-0006) — o texto
 * do usuário chega ao modelo e não pode virar endereço de escrita em outro
 * tenant.
 */
export function createCreateReportPageTool(ctx: { clientId?: string; activeGroupId?: string }) {
  return tool({
    description:
      'Cria uma PÁGINA nova, vazia, DENTRO de um relatório do cliente ativo, e devolve os ids para '
      + 'navegar até ela. Use quando o usuário pedir uma página, tela ou aba nova. NÃO é create_report, '
      + 'que cria o relatório inteiro (o container que agrupa páginas); se o pedido não deixar claro qual '
      + 'dos dois níveis ele quer, pergunte antes de criar. Depois de criar, preencha-a com os blocos pedidos.',
    inputSchema: z.object({
      name: z.string().describe('Nome da página, como aparecerá na navegação (ex.: "Volumetria de Contratos")'),
      description: z.string().optional().describe('Uma linha explicando o que a página mostra'),
      groupId: z.string().optional().describe(
        'Relatório onde criar a página. OMITA para criar no relatório que o usuário está vendo — '
        + 'só informe quando ele pedir explicitamente outro relatório.',
      ),
    }),
    execute: async ({ name, description, groupId }) => {
      const clientId = ctx.clientId;
      if (!clientId) {
        return { ok: false as const, error: 'SEM_TENANT' as const, message: 'Nenhum cliente ativo — não há onde criar a página.' };
      }
      const trimmedName = name?.trim();
      if (!trimmedName) {
        return { ok: false as const, error: 'NOME_OBRIGATORIO' as const, message: 'A página precisa de um nome. Pergunte ao usuário como quer chamá-la.' };
      }

      const db = getDb();
      const groupsCol = db.collection('clients').doc(clientId).collection('groups');
      const grupos = await groupsCol.get();
      if (grupos.docs.length === 0) {
        return {
          ok: false as const,
          error: 'SEM_GRUPO' as const,
          message: 'Este cliente ainda não tem nenhum grupo de páginas. Criar a estrutura de grupos é decisão da administração — avise o usuário.',
        };
      }
      /*
       * Onde a página nasce, em ordem de autoridade.
       *
       * O padrão era `grupos.docs[0]` — o primeiro da coleção, que é ordem de
       * id no Firestore e não tem relação nenhuma com o que está na tela.
       * Quem estava em "Covenants" e pedia uma página recebia a página dentro
       * de outro relatório qualquer, e ainda por cima a resposta do assistente
       * dizia que estava pronta: dois lugares afirmando coisas diferentes.
       *
       * O relatório ABERTO é a resposta certa para o pedido sem endereço —
       * "crie uma página" significa "aqui". O primeiro da coleção sobra só
       * para quando não há relatório aberto (chat na home, por exemplo).
       */
      const exists = (id?: string) => !!id && grupos.docs.some((d) => d.id === id);
      const grupo = exists(groupId) ? groupId!
        : exists(ctx.activeGroupId) ? ctx.activeGroupId!
        : grupos.docs[0]!.id;

      const reportsCol = groupsCol.doc(grupo).collection('reports');
      const existing = await reportsCol.get();
      const highestOrder = existing.docs.reduce(
        (max, d) => Math.max(max, Number(d.data().order ?? 0)),
        0,
      );

      const reportId = uniqueSlug(trimmedName, existing.docs.map((d) => d.id));
      const doc: Record<string, unknown> = {
        name: trimmedName,
        order: highestOrder + 1,
        blockMap: {},
        layout: [],
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (description?.trim()) doc.description = description.trim();

      await reportsCol.doc(reportId).set(doc);

      return {
        action: 'report_page_created' as const,
        groupId: grupo,
        reportId,
        name: trimmedName,
      };
    },
  });
}
