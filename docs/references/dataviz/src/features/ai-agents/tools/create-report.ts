import { tool } from 'ai';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '@/shared/lib/firebase/admin';
import { uniqueSlug } from '@/shared/lib/slug';

/**
 * Cria um RELATÓRIO — documento em `clients/{id}/groups/{g}`, o container que
 * aparece no seletor no topo da barra lateral e agrupa páginas.
 *
 * Existia só `create_report_page`, que cria PÁGINA (`groups/{g}/reports/{r}`).
 * Quem pedia "crie um novo relatório chamado Teste, depois vou criar as
 * páginas" recebia uma página chamada Teste dentro do relatório aberto: o
 * modelo não errou de tool, ele usou a única que havia. A palavra "relatório"
 * não tinha porta de entrada.
 *
 * Nasce VAZIO, como pelo botão "Novo relatório" da barra lateral
 * (`PagesSidebar.handleCriarRelatorio`) — criar página junto seria decidir pelo
 * usuário o passo que ele disse que ia dar.
 *
 * O `clientId` vem do contexto do SERVIDOR, nunca do input (ADR-0006).
 */
export function createCreateReportTool(ctx: { clientId?: string }) {
  return tool({
    description:
      'Cria um RELATÓRIO novo (vazio) para o cliente ativo — o container que aparece no seletor no '
      + 'topo da barra lateral e que agrupa páginas. NÃO é a mesma coisa que create_report_page, '
      + 'que cria uma página DENTRO de um relatório. Use quando o usuário disser "relatório"; se o '
      + 'pedido não deixar claro se ele quer um relatório ou uma página, pergunte antes de criar.',
    inputSchema: z.object({
      name: z.string().describe('Nome do relatório, como aparecerá no seletor (ex.: "Covenants")'),
    }),
    execute: async ({ name }) => {
      const clientId = ctx.clientId;
      if (!clientId) {
        return { ok: false as const, error: 'SEM_TENANT' as const, message: 'Nenhum cliente ativo — não há onde criar o relatório.' };
      }
      const trimmedName = name?.trim();
      if (!trimmedName) {
        return { ok: false as const, error: 'NOME_OBRIGATORIO' as const, message: 'O relatório precisa de um nome. Pergunte ao usuário como quer chamá-lo.' };
      }

      const db = getDb();
      const groupsCol = db.collection('clients').doc(clientId).collection('groups');
      const existing = await groupsCol.get();
      const highestOrder = existing.docs.reduce(
        (max, d) => Math.max(max, Number(d.data().order ?? 0)),
        0,
      );

      // Slug em vez de id gerado: o id é o segmento da URL (`/g/{groupId}`).
      // `set()` sobre id existente SUBSTITUI o documento — a desambiguação do
      // `uniqueSlug` é o que impede apagar o relatório de um homônimo e deixar
      // as páginas dele órfãs.
      const groupId = uniqueSlug(trimmedName, existing.docs.map((d) => d.id), 'relatorio');

      await groupsCol.doc(groupId).set({
        name: trimmedName,
        order: highestOrder + 1,
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        action: 'report_created' as const,
        groupId,
        name: trimmedName,
      };
    },
  });
}
