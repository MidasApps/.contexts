'use client';

import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { Skeleton } from '@/shared/ui/skeleton';
import { blockSpec, type BlockType } from '@/features/report-authoring/schema/block-specs';

/**
 * A casca de indicador — a régua única de aparência dos blocos.
 *
 * É o mesmo movimento que `block-specs.ts` fez com a largura: uma fonte, e
 * todos derivam dela. Antes deste arquivo cada bloco escolhia sozinho, e a
 * conta batia assim: o `KpiCard` e o `ChartWidget` em `rounded-2xl p-5`, o
 * `GaugeBlock` em `rounded-xl p-4`, os cards de legenda do donut em
 * `rounded-lg`. O valor aparecia em QUATRO tamanhos (36px com gradiente no kpi
 * compacto, 30px no rich, 30px no gauge, 15px na fatia do donut) e o rótulo em
 * três tratamentos (caixa baixa, CAIXA ALTA com tracking, 11px a 80% de
 * opacidade). Nenhum estava errado sozinho; lado a lado na mesma página liam
 * como três produtos.
 *
 * Quem consome: todo bloco de indicador de `blocks/`. Mudar a aparência de
 * bloco é mudar aqui — em nenhum outro lugar.
 */

/**
 * O veredito que a cor comunica.
 *
 * Deliberadamente não é "verde/âmbar/vermelho": o bloco declara o SIGNIFICADO
 * e a casca escolhe a tinta. Foi assim que o gauge acabou com
 * `amber-600 dark:amber-400` escrito à mão — ele pensava em cor, não em estado,
 * e o token de atenção (`--color-warning`) valia o laranja da marca.
 */
export type BlockTone = 'neutro' | 'positivo' | 'atencao' | 'ruptura';

/** Superfície, raio e respiro. Idênticos ao `KpiCard` rich e ao `ChartWidget`. */
export const BLOCK_SHELL = 'rounded-2xl bg-popover border p-5';

/**
 * A escala vertical — três degraus, e nenhum bloco inventa um quarto.
 *
 * A linha do relatório é `grid grid-cols-6 gap-4`, e grid estica todos os itens
 * até a altura do mais alto. Então altura de bloco não é decisão local: um
 * bloco 60px mais alto que o vizinho não fica 60px mais alto — ele obriga o
 * vizinho a crescer e a exibir 60px de vazio embaixo do conteúdo.
 *
 * Foi exatamente o que o gauge com arco provocou. O gauge antigo media ~110px,
 * a mesma altura de um KPI, e os dois dividiam linha sem sobra. O arco
 * empilhado sobre o valor levou o bloco a ~200px, e todo KPI ao lado passou a
 * esticar com um buraco embaixo do número.
 *
 * Os dois primeiros degraus são novos; o terceiro já era o do `ChartWidget`.
 */
export const HEIGHT = {
  /** Um número: kpi, gauge, progress, comparison. */
  indicador: 172,
  /** Conjunto ou composição: targets, sparkrows, donut, heatmap. */
  conjunto: 240,
  /** Área de plotagem cartesiana: chart, scatter. */
  grafico: 340,
} as const;

export type BlockFamily = keyof typeof HEIGHT;

/**
 * O degrau deste bloco — consultado por quem MONTA a linha, não pelo bloco.
 *
 * Recebe o bloco e não só o tipo porque a variante de desenho muda a família:
 * o donut em `display: 'bar'` é uma faixa de ~70px cuja razão de existir é
 * ocupar um terço da altura da rosca. Um piso de 240px o devolveria ao tamanho
 * de que ele veio fugindo — e `text` e `table` não têm piso nenhum, porque
 * crescem com o conteúdo e um mínimo só criaria vazio.
 *
 * `undefined` = sem piso.
 */
export function blockFamilyOf(block: { type: string; display?: string }): BlockFamily | undefined {
  if (block.type === 'donut' && block.display === 'bar') return undefined;
  // O gauge em arco não divide linha com KPIs: o semicírculo pede ~110px só
  // para si, e o contrato já o move para 3/6. Ele pertence ao degrau das
  // composições, com quem de fato vai dividir a linha.
  if (block.type === 'gauge' && block.display === 'arc') return 'conjunto';
  /*
   * O degrau do tipo vem do CONTRATO, não de um mapa próprio daqui.
   *
   * Havia dois: `heightFamily` no `block-specs.ts` (que o prompt do modelo
   * lê) e um `Record` neste arquivo (que o renderizador lê). Duas listas da
   * mesma decisão divergem — é o mesmo defeito de três-réguas que o contrato
   * de bloco veio eliminar. Aqui ficam só as exceções por variante, que
   * dependem de campo do bloco e não do tipo.
   */
  // A lista compacta de metas também é uma faixa: ela existe para caber mais
  // itens em menos altura, não para preencher um degrau.
  if (block.type === 'targets' && block.display === 'list') return undefined;
  return blockSpec(block.type as BlockType).heightFamily;
}

/** O número. 30px é o teto que "R$ 1.234,56 mi" respeita numa coluna de 2/6. */
export const BLOCK_VALUE = 'font-display text-3xl font-bold tracking-tight leading-none';

/**
 * O número quando são DOIS na mesma linha (comparação de período).
 *
 * 24px é o degrau abaixo, e não um tamanho escolhido no olho: a 3/6 sobram
 * ~190px por coluna, e "R$ 48,2 mi" a 30px mede ~200px. É a única exceção à
 * escala, e existe por medida.
 */
export const BLOCK_SECONDARY_VALUE = 'font-display text-2xl font-bold tracking-tight leading-none';

/** O que o número é. */
export const BLOCK_LABEL = 'text-xs font-medium text-muted-foreground';

/** Contexto do número: mínimo contratado, unidade, "de X previstos". */
export const BLOCK_SUPPORT = 'text-[11px] text-muted-foreground';

/*
 * O ENQUADRADO nao tem cor propria.
 *
 * E o mesmo argumento que ja tirou a cor da borda, algumas linhas abaixo:
 * numa pagina de covenants quase tudo esta enquadrado, entao o verde cobria a
 * tela inteira e parava de significar "esta bem". Cor aqui e excecao — atencao
 * e ruptura seguem pintadas, porque sao o que precisa saltar.
 */
const INK: Record<BlockTone, string> = {
  neutro: 'text-foreground',
  positivo: 'text-foreground',
  atencao: 'text-warning',
  ruptura: 'text-destructive',
};

/**
 * A borda do card.
 *
 * Era pintada pelo veredito: verde dentro do limite, âmbar em atenção. Numa
 * página de covenants onde quase tudo está enquadrado, isso deixa a tela
 * inteira verde — e aí a cor não diz mais "está bem", diz "isto é um card".
 * Cor que aparece em todo lugar não informa nada.
 *
 * O veredito continua onde ele é de fato lido: no número (`INK`) e na barra.
 * A borda volta a ser o que uma borda é — o limite do card.
 *
 * A ruptura é a única que mantém a cor, porque é a exceção que precisa saltar,
 * e anda junto do ponto vermelho pulsando.
 */
const BORDER: Record<BlockTone, string> = {
  neutro: 'border-border',
  positivo: 'border-border',
  atencao: 'border-border',
  ruptura: 'border-destructive/40',
};

/** A tinta do veredito, para quem desenha o próprio número (gauge, bullet). */
export function toneInk(tone: BlockTone): string {
  return INK[tone];
}

/**
 * Classifica um valor contra um mínimo — a regra de veredito compartilhada.
 *
 * Vivia dentro do `GaugeBlock`. Passou a ser exportada quando `targets` e
 * `progress` precisaram da MESMA regra: duas implementações da mesma
 * classificação é como `addBlock` e `moveBlock` chegaram a discordar sobre o
 * que cabe numa linha.
 */
export function classifyAgainstLimit(args: {
  valor: number;
  limit: number;
  warning?: number | undefined;
  /** `true` quando quanto MAIOR pior (inadimplência, concentração). */
  invertedScale?: boolean | undefined;
}): BlockTone {
  const { valor: value, limit, warning, invertedScale = false } = args;
  if (invertedScale) {
    if (value > limit) return 'ruptura';
    if (warning !== undefined && value > warning) return 'atencao';
    return 'positivo';
  }
  if (value < limit) return 'ruptura';
  if (warning !== undefined && value < warning) return 'atencao';
  return 'positivo';
}

interface BlockCardProps {
  children: ReactNode;
  /** Veredito — pinta a borda. Default `neutro`. */
  tone?: BlockTone;
  /** Ponto pulsante no canto e borda de ruptura. */
  alert?: boolean;
  /** Clicar abre o modal de análise. Sem isto o card não é focável. */
  onExpand?: (() => void) | undefined;
  /** Rótulo acessível do card clicável (ex: `Analisar Índice de Cobertura`). */
  expandLabel?: string;
  loading?: boolean;
  className?: string;
}

/**
 * A moldura. Todo bloco de indicador começa por ela.
 *
 * O card clicável vira `role="button"` com teclado — e não um `<div onClick>`,
 * que é inalcançável por Tab (WCAG 2.1.1). Blocos que contêm outros
 * interativos (link, tooltip) não podem usar `onExpand`: interativo aninhado é
 * HTML inválido — nesses casos o botão de expandir é próprio, como no
 * `KpiCard`.
 */
export function BlockCard({
  children,
  tone = 'neutro',
  alert = false,
  onExpand,
  expandLabel,
  loading = false,
  className,
}: BlockCardProps) {
  const effectiveTone: BlockTone = alert ? 'ruptura' : tone;
  // Sem valor não há veredito: durante o carregamento a borda fica neutra,
  // senão o `value: 0` do template acusa covenant rompido antes de saber.
  const border = loading ? BORDER.neutro : BORDER[effectiveTone];

  return (
    <div
      onClick={onExpand}
      role={onExpand ? 'button' : undefined}
      tabIndex={onExpand ? 0 : undefined}
      aria-label={onExpand ? expandLabel : undefined}
      aria-busy={loading || undefined}
      /*
       * O gancho da casca — quem precisa mexer no ARREDONDAMENTO dela de fora
       * mira aqui, não em `.rounded-2xl`.
       *
       * O trilho de controles do canvas encosta no topo do bloco e precisa que
       * ele perca o raio na junta, senão o card curva para dentro embaixo de
       * uma peça de canto reto. Como a casca é desenhada em vários lugares
       * (aqui, no `ChartWidget`, no `KpiCard` e no `GhostBlock`), o seletor de fora precisa
       * de um alvo estável: caçar pela classe pegaria junto todo `rounded-2xl`
       * aninhado, e quebraria no dia em que a régua virar `rounded-[18px]`.
       */
      data-casca=""
      onKeyDown={
        onExpand
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onExpand();
              }
            }
          : undefined
      }
      className={cn(
        BLOCK_SHELL,
        'relative flex h-full flex-col',
        border,
        onExpand
          /*
           * Hover é cinza, não laranja: o card não vira botão de marca só
           * porque o ponteiro passou por cima. `muted-foreground/40` escurece a
           * borda no tema claro e a clareia no escuro — em ambos, mais
           * contraste que o repouso, que é o que "está clicável" precisa dizer.
           * O anel de foco segue na cor de marca, de propósito: ele só aparece
           * na navegação por teclado, onde ser inconfundível é o requisito.
           */
          && 'cursor-pointer transition-colors hover:border-muted-foreground/40 focus-visible:outline-none '
            + 'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 '
            + 'focus-visible:ring-offset-background',
        className,
      )}
    >
      {alert && !loading && (
        <span
          aria-hidden="true"
          className="absolute right-3 top-3 z-10 h-2 w-2 animate-pulse rounded-full bg-destructive"
        />
      )}
      {children}
    </div>
  );
}

/** Cabeçalho: rótulo à esquerda, o que o bloco quiser à direita. */
export function BlockCardHead({
  label,
  support,
  right,
}: {
  label: string;
  /** Segunda linha, abaixo do rótulo. */
  support?: string | undefined;
  right?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className={cn(BLOCK_LABEL, 'leading-tight')}>{label}</p>
        {support && <p className={cn(BLOCK_SUPPORT, 'mt-0.5 opacity-70')}>{support}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

/** O número, com sufixo opcional e a tinta do veredito. */
export function BlockValue({
  children,
  tone = 'neutro',
  suffix,
  className,
}: {
  children: ReactNode;
  tone?: BlockTone;
  suffix?: string | undefined;
  className?: string;
}) {
  return (
    <p className={cn(BLOCK_VALUE, INK[tone], className)}>
      {children}
      {suffix && <span className="ml-0.5 text-xl">{suffix}</span>}
    </p>
  );
}

/**
 * Esqueleto do valor — na moldura real, nunca no lugar dela.
 *
 * O rótulo continua legível porque vem do template, não da consulta; só o
 * número é esqueleto. Assim o card não muda de altura quando o dado chega.
 */
export function BlockValueSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn('h-8 w-28 rounded-md bg-muted/60', className)} />;
}

/**
 * Vazio — e vazio NÃO é erro.
 *
 * Cada bloco tinha o seu: travessão no KPI, uma caixa de 180px no donut, outra
 * de 340px no gráfico, e nada no gauge. Alturas diferentes fazem a página pular
 * quando um bloco volta vazio e o vizinho não; e a mesma frase para "não
 * retornou linhas" e para "falhou" impede o usuário de saber qual dos dois
 * aconteceu.
 */
export function BlockEmpty({
  motivo = 'A consulta não retornou linhas',
  height = '100%',
}: {
  motivo?: string;
  height?: number | string;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-1.5 text-center"
      style={{ height, minHeight: 96 }}
    >
      <p className={cn(BLOCK_VALUE, 'text-muted-foreground/35')}>—</p>
      <p className="text-[11px] italic text-muted-foreground/60">{motivo}</p>
    </div>
  );
}
