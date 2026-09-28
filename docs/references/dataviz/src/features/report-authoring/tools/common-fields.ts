import { z } from 'zod';
import {
  widthOf, normalizeWidth, perRow, blockSpec,
  type BlockType, type WidthContext,
} from '../schema/block-specs';

/**
 * Campos que as tools de autoria compartilham.
 *
 * Existem separados porque `add_*` e `update_*` precisam descrever a MESMA
 * largura para o modelo. Quando a descrição vivia duplicada nos dois arquivos,
 * `update_kpi_block` continuou dizendo `.max(3)` depois de o resto migrar — o
 * modelo aprendia uma régua ao criar e outra ao editar.
 */

export const pageField = z.number().optional()
  .describe('Índice da página no canvas. Omita — a página aberta é sempre a única.');

export const metricField = z.string()
  .describe('Id da métrica que alimenta o bloco, no formato "dominio.slug". Use APENAS ids da seção "Métricas já disponíveis para este cliente" do seu prompt — nunca peça ids ao usuário.');

/**
 * Marca o bloco como PROJEÇÃO: ele deixa de obedecer ao filtro de período.
 *
 * Existe porque o filtro recorta a consulta ao intervalo escolhido, e a linha
 * do futuro é justamente o que cai fora dele — o gráfico chega truncado no
 * último mês do filtro, sem nada na tela explicando por quê. Marcado, o bloco
 * busca a série inteira e exibe o selo "Projeção".
 */
export const projectionField = z.boolean().optional()
  .describe(
    'Marque true APENAS quando o bloco mostra PROJEÇÃO/previsão (dados além do mês atual). '
    + 'O bloco passa a ignorar o filtro de período e desenha a série inteira, incluindo o futuro. '
    + 'Para dado histórico deixe fora: recortar pelo período é o comportamento correto.',
  );

/**
 * A série que o ASSISTENTE calculou, para o trecho futuro do gráfico.
 *
 * É a exceção deliberada à regra "não passe dados": nenhuma consulta devolve
 * um contrato que ainda não foi assinado, então projeção não tem de onde vir
 * senão de quem projetou. Sem este campo o assistente conseguia calcular o
 * esgotamento do estoque e não conseguia desenhá-lo — escrevia os números num
 * texto ao lado de um gráfico que parava no último mês real.
 */
export const seriesProjectionField = z.array(z.record(z.string(), z.union([z.string(), z.number()])))
  .max(120)
  .optional()
  .describe(
    'Pontos do FUTURO que VOCÊ calculou, um objeto por período, no mesmo formato das linhas do gráfico: '
    + 'a chave do eixo X mais UMA série própria — ex.: [{ "mes": "2026-07", "projetado": 190 }]. '
    + 'Regras: (1) a série projetada deve ter nome DIFERENTE da série real e entrar em dataKeys e em dashedKeys, '
    + 'para o futuro sair tracejado e nunca se confundir com dado medido; '
    + '(2) repita o ÚLTIMO ponto real com o nome da série projetada, senão a linha nasce solta, desconectada do histórico; '
    + '(3) use apenas para projeção que você calculou e explicou na conversa — nunca para preencher dado histórico ausente.',
  );

/**
 * "Este bloco entra no lugar daquele."
 *
 * Sem isto, substituir era remover e adicionar — e adicionar põe no FIM da
 * página. O usuário pedia para trocar o indicador do topo e recebia o novo lá
 * embaixo, depois de tudo, enquanto o buraco ficava no lugar de origem.
 */
export const replaceField = z.string().optional()
  .describe(
    'Id do bloco que este substitui. O antigo some e o novo ocupa EXATAMENTE a mesma posição, '
    + 'mantendo a largura se você não informar outra. Use sempre que a intenção for trocar um '
    + 'bloco por outro — sem isto o novo bloco vai para o fim da página.',
  );

/**
 * Onde o bloco entra na página.
 *
 * As tools só sabiam acrescentar no fim. "Ponha como primeiro indicador" era
 * um pedido que o assistente aceitava, respondia que tinha feito, e o bloco
 * aparecia no rodapé — ele não tinha como dizer outra coisa.
 */
export const positionField = z.enum(['topo', 'fim']).optional()
  .describe('"topo" põe o bloco como o PRIMEIRO da página; "fim" (default) acrescenta no final.');

/**
 * A sparkline do card de KPI, alimentada por uma métrica de SÉRIE.
 *
 * O card sempre soube desenhá-la — `sparklineMetricId` já era buscado pelo
 * pipeline. O que faltava era a tool expor o campo: sem ele, o assistente
 * concluía que "a engenharia precisa converter a métrica para timeseries",
 * quando a arquitetura é outra — o número vem de uma métrica escalar e a
 * curva de outra, de série.
 */
export const sparklineMetricField = z.string().optional()
  .describe(
    'Id de uma métrica de SÉRIE (`timeseries`) para desenhar a mini-curva de tendência no fundo do card. '
    + 'É uma métrica DIFERENTE da do número: o valor vem da escalar, a curva vem desta. '
    + 'Use quando existir no catálogo uma série do mesmo assunto do KPI.',
  );

/** Pontos da sparkline calculados pelo próprio assistente, quando não há série no catálogo. */
export const sparklineDataField = z.array(z.number()).min(2).max(60).optional()
  .describe(
    'Valores da mini-curva, do mais ANTIGO para o mais recente, quando você mesmo apurou a série '
    + '(ex.: por execute_sql) e não existe métrica de série no catálogo. '
    + 'Prefira sparklineMetricId quando houver: dado do catálogo acompanha filtro e atualização; '
    + 'estes números ficam congelados no bloco.',
  );

/** Campo `colSpan` com os limites e o default que o contrato do tipo define. */
export function widthField(type: BlockType) {
  const { min, recommended, max } = widthOf(type);
  const fitCount = perRow(type);
  const perRowText = fitCount > 1 ? ` — ${fitCount} cabem lado a lado` : ' — ocupa a linha toda';
  return z.number().min(min).max(max).optional()
    .describe(
      'Largura em colunas do grid de 6 (1 = 1/6 da linha, 6 = linha inteira). '
      + `Aceita de ${min} a ${max}. Default: ${recommended}${perRowText}. `
      + blockSpec(type).widthRationale,
    );
}

export interface ResolvedWidth {
  colSpan: number;
  widthWarning?: string;
}

/**
 * Devolve a largura efetiva e, quando ela difere do pedido, o aviso que o modelo
 * lê no resultado da tool.
 *
 * A faixa do Zod é a do tipo em geral; algumas opções apertam o mínimo (barra
 * horizontal reserva 120px fixos no eixo de categoria, tabela de 4+ colunas não
 * cabe abaixo da linha inteira). Ajustar em silêncio ensinaria o modelo errado —
 * ele repetiria o mesmo pedido no próximo bloco.
 */
export function resolveWidth(
  type: BlockType,
  requested: number | undefined,
  ctx: WidthContext,
): ResolvedWidth {
  const effective = normalizeWidth(type, requested, ctx);
  if (requested === undefined || requested === effective) return { colSpan: effective };
  return {
    colSpan: effective,
    widthWarning:
      `Largura ajustada de ${requested} para ${effective}: ${blockSpec(type).widthRationale}`,
  };
}
