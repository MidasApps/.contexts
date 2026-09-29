import { tool } from 'ai';
import { z } from 'zod';
import type { ClientSemanticContext } from '@/shared/repositories/client-semantic-context';

/**
 * As entidades e atributos que uma métrica nova pode usar.
 *
 * É tool, e não seção de prompt, por causa do tamanho: o contrato deste cliente
 * tem mais de cem atributos, e colá-los no prompt custaria cerca de 10% dele em
 * TODO turno — inclusive nos que só respondem uma pergunta. Criar métrica é
 * raro; pagar por ela só quando acontece é a troca certa.
 *
 * Não faz I/O: o contexto semântico já veio resolvido com a requisição.
 */
export function createListMetricFieldsTool(ctx: { semanticContext?: ClientSemanticContext }) {
  return tool({
    description:
      'Lista as entidades e atributos do contrato de dados deste cliente — o vocabulário '
      + 'que o template de uma métrica pode usar (`{entidade}` para a tabela, '
      + '`{entidade.atributo}` para a coluna). Chame ANTES de create_metric ou update_metric.',
    /*
     * O filtro por entidade é útil (o contrato tem mais de cem atributos), mas
     * o motivo de o schema não ser vazio é outro: `z.object({})` vira uma
     * declaração de função sem propriedade nenhuma, e nem todo provedor aceita
     * isso — quando recusa, ele recusa o registro do CONJUNTO de ferramentas, e
     * o turno inteiro morre por causa da tool mais inofensiva da lista.
     */
    inputSchema: z.object({
      entidade: z.string().optional().describe('Filtra por uma entidade (ex.: "contratos"). Omita para ver todas.'),
    }),
    execute: async ({ entidade: entity }) => {
      const contracts = ctx.semanticContext?.dataContracts ?? [];
      if (contracts.length === 0) {
        return {
          ok: false as const,
          error: 'SEM_CONTRATO' as const,
          message:
            'Não há contrato de dados resolvido para este cliente — não é possível criar métrica agora. '
            + 'Diga isso ao usuário em vez de inventar nomes de coluna.',
        };
      }

      const filter = entity?.trim().toLowerCase();
      const all = contracts.flatMap((c) =>
        c.entities.map((e) => ({
          contrato: c.contractId,
          entidade: e.entityId,
          /** Ref completa para `requires` — a PRIMEIRA decide o dataset da métrica. */
          refDeExemplo: `${c.contractId}.${e.entityId}.${e.attributes[0]?.attributeId ?? ''}`,
          atributos: e.attributes.map((a) => a.attributeId),
        })),
      );
      // Filtro que não casa devolve tudo: lista vazia levaria o modelo a
      // concluir que o cliente não tem dado nenhum.
      const filtered = filter ? all.filter((e) => e.entidade.toLowerCase() === filter) : [];
      const entities = filtered.length > 0 ? filtered : all;

      return {
        ok: true as const,
        entidades: entities,
        comoUsar:
          'No template use {entidade} onde iria a tabela e {entidade.atributo} onde iria a coluna — '
          + 'nunca escreva nome de tabela ou de coluna física. Em requires, mande as refs completas '
          + '"contrato.entidade.atributo"; a primeira decide de qual dataset a métrica lê.',
      };
    },
  });
}
