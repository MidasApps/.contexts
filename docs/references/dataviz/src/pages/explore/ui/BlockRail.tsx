'use client';

import { GripVertical, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { blockSpec, type WidthRange } from '@/features/report-authoring/schema/block-specs';
import { WidthRuler } from './WidthRuler';
import type { CanvasBlock } from '@/shared/config/agents/types';
import type { Metric } from '@/shared/schemas/metric';

/**
 * De onde vem o número deste bloco.
 *
 * É a única coisa que o card NÃO mostra. O rótulo já está desenhado dentro dele
 * ("Índice Recebível", em 12px, no topo); repeti-lo no trilho gastaria a única
 * faixa de texto disponível com informação que o olho já tem. A métrica, não:
 * hoje ela só aparece abrindo o inspetor, um bloco por vez — e é justamente o
 * que se quer conferir ao editar uma página.
 *
 * Quem não consome métrica (texto) mostra o nome do TIPO, porque aí não há
 * fonte de dado a nomear. Quem consome e está sem métrica diz isso em âmbar: é
 * o mesmo estado que o renderizador já desenha como fantasma, dito antes de o
 * bloco precisar falhar para ser notado.
 */
export function blockProvenance(
  block: CanvasBlock,
  metrics: Metric[],
): { text: string; missing: boolean } {
  const spec = blockSpec(block.type);
  if (spec.accepts.length === 0) return { text: spec.label, missing: false };
  if (!block.metricId) return { text: 'sem métrica', missing: true };
  const metric = metrics.find((m) => m.id === block.metricId);
  return { text: metric?.label ?? block.metricId, missing: false };
}

/**
 * Altura do trilho — quem decide de que lado ele cabe precisa desta medida, e
 * ela não pode ser adivinhada em outro arquivo.
 *
 * 30px para alvos de 24px: 3px de folga em cima e embaixo. Não há folga até o
 * card porque o trilho ENCOSTA nele (ver a docstring do componente).
 */
export const RAIL_HEIGHT = 30;

/**
 * A barra de controles do bloco no canvas de edição — o chapéu.
 *
 * ─── Três versões até aqui, e o que cada uma ensinou ───
 *
 * A original era `left-0 right-0 bottom-full mb-1` com `justify-between`: uma
 * barra da largura do bloco — 445px medidos — carregando 131px de controle
 * espalhados por três cantos. Setenta por cento dela era ar, e barra quase
 * vazia não lê como ferramenta, lê como elemento quebrado.
 *
 * A segunda encostou no card, mas com a conta errada: 30px de altura com 12px
 * de `padding-bottom` davam caixa de conteúdo de 18px para itens de 24px, que
 * desenhavam PARA FORA da própria borda; e o fundo opaco sobre o topo do card
 * apagava a moldura e os cantos do bloco que ela comandava.
 *
 * Esta encosta de novo, agora com a geometria certa e — o que resolve de vez —
 * uma SUPERFÍCIE própria: cinza (`bg-muted`) contra o branco do card. A
 * separação deixa de depender de distância ou de traço extra; quem faz o
 * trabalho é a cor. O bloco lê como um card que ganhou cabeçalho.
 *
 * ─── O que cada peça resolve ───
 *
 * A pega ocupa toda a sobra à esquerda: a área de arrasto passou de 22px para
 * a largura que sobrar, e virou `<button>` — a anterior era um `<div
 * draggable>`, invisível ao teclado, e sem mouse não havia como reordenar
 * bloco. A régua substitui o botão que ciclava. E o X virou lixeira: X promete
 * fechar, e a ação é excluir.
 */
export function BlockRail({
  block,
  metrics,
  side,
  visible,
  selected,
  selectionPosition,
  width,
  range,
  widthRationale,
  draggable,
  onToggleSelection,
  onEditContent,
  onDelete,
  onChooseWidth,
  onDragStart,
  onDragEnd,
  onNudge,
}: {
  block: CanvasBlock;
  metrics: Metric[];
  /** De que lado do card o trilho cabe. Ver `railSide` no `CanvasPanel`. */
  side: 'acima' | 'abaixo';
  visible: boolean;
  selected: boolean;
  /** Ordem de entrada na seleção — o que o quadrado mostra quando marcado. */
  selectionPosition: number | null;
  width: number;
  range: WidthRange;
  widthRationale: string;
  /** Falso durante o streaming da IA: mover bloco que está sendo escrito. */
  draggable: boolean;
  onToggleSelection: () => void;
  /** Ausente ⇒ não há edição manual de conteúdo, e o lápis não aparece. */
  onEditContent?: (() => void) | undefined;
  onDelete: () => void;
  onChooseWidth: (columns: number) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onNudge: (direction: -1 | 1) => void;
}) {
  const provenance = blockProvenance(block, metrics);
  const name = ('title' in block && block.title)
    || ('label' in block && block.label)
    || blockSpec(block.type).label;

  const action = 'flex h-6 min-w-6 items-center justify-center rounded text-muted-foreground '
    + 'transition-colors hover:bg-foreground/10 hover:text-foreground '
    + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

  return (
    <div
      className={cn(
        /*
         * ─── O chapéu ───
         *
         * O trilho não pousa sobre o bloco: ele CRESCE dele. Encosta no topo
         * sem folga, divide a silhueta (mesma largura, mesmas bordas laterais,
         * cantos de cima com o raio do card) e é a SUPERFÍCIE que separa as
         * duas partes — `bg-muted` cinza contra o `bg-popover` do card. No
         * escuro a relação inverte sozinha, porque ali `--muted` é mais CLARO
         * que `--popover`: o chapéu ganha luz em vez de perder.
         *
         * O que sobra visível entre os dois é a borda de topo do PRÓPRIO card
         * — daí `border-b-0` aqui. É ela o traço que separa cabeçalho de
         * corpo, e é por existir que a moldura do bloco continua legível sem o
         * trilho precisar se afastar.
         *
         * ─── A conta da altura ───
         *
         * 30px para conteúdo de 24px: 3px de folga em cima e embaixo, sem
         * padding vertical. A primeira versão tinha 30px COM 12px de
         * `padding-bottom` — caixa de conteúdo de 18px para itens de 24px, que
         * então desenhavam 3px PARA FORA da própria borda. Alvo de 24px é piso
         * da WCAG 2.5.8: quem cede é a barra, não o alvo.
         *
         * `@container`: num bloco de 1/6 o trilho tem ~213px, e aí a
         * procedência viraria três letras e reticências — ruído, não
         * informação. Abaixo de 200px ela sai. Consulta de container, não
         * media query: o que decide é a largura DESTE bloco, não a da janela.
         */
        '@container absolute inset-x-0 z-30 flex h-[30px] items-center gap-1.5',
        'border bg-muted pl-2 pr-1.5',
        'transition-opacity duration-150 ease-out',
        // Vira para baixo quando não há 30px acima: o canvas rola dentro de um
        // `overflow-y-auto`, e trilho que sai por cima do limite é RECORTADO —
        // o bloco encostado no topo ficava sem controle nenhum. Virado, é o
        // card que volta a arredondar em cima e o chapéu que arredonda embaixo.
        side === 'acima'
          ? 'bottom-full rounded-t-2xl border-b-0'
          : 'top-full rounded-b-2xl border-t-0',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0',
        selected ? 'border-primary' : 'border-border',
      )}
    >
      {/* Pega: o nome do bloco no rótulo acessível, a procedência na tela. */}
      <button
        type="button"
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onKeyDown={(e) => {
          // `Delete` abre a confirmação, não exclui: a tecla é fácil de tocar
          // sem querer, e o diálogo já existe para o clique na lixeira.
          if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            onDelete();
            return;
          }
          const direction = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : null;
          if (direction === null) return;
          e.preventDefault();
          onNudge(direction);
        }}
        aria-label={`Mover ${name}. Arraste, use as setas para trocar de posição, ou Delete para excluir.`}
        className={cn(
          'flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded px-1 text-left',
          'transition-colors hover:bg-foreground/10',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
        )}
      >
        <GripVertical
          className={cn('h-3 w-3 shrink-0', draggable ? 'text-muted-foreground' : 'text-muted-foreground/30')}
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <span
          className={cn(
            'truncate font-mono text-[11px] @max-[200px]:hidden',
            provenance.missing ? 'text-warning' : 'text-foreground/75',
          )}
        >
          {provenance.text}
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={onToggleSelection}
          aria-pressed={selected}
          aria-label={selected
            ? `Tirar ${name} da seleção do assistente`
            : `Selecionar ${name} para o assistente ajustar`}
          className={cn(action, 'hover:bg-transparent')}
        >
          {/*
            Alvo de 24px, caixa desenhada de 15px. Os dois não precisam ter o
            mesmo tamanho — e é exatamente por terem que nenhum controle da
            barra anterior chegava ao mínimo da WCAG 2.5.8.
          */}
          <span
            className={cn(
              'flex h-[15px] w-[15px] items-center justify-center rounded-[4px] border-[1.5px]',
              'text-[9px] font-bold leading-none transition-colors',
              selected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-muted-foreground/45 text-transparent',
            )}
          >
            {selected ? selectionPosition : ''}
          </span>
        </button>

        <WidthRuler
          width={width}
          range={range}
          widthRationale={widthRationale}
          side={side}
          onChoose={onChooseWidth}
        />

        {onEditContent && (
          <button
            type="button"
            onClick={onEditContent}
            aria-label={`Editar conteúdo de ${name}`}
            className={action}
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />
          </button>
        )}

        {/* A destrutiva é a única separada — e a única que muda de cor. */}
        <span className="mx-0.5 h-3.5 w-px shrink-0 bg-border" aria-hidden="true" />
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Excluir ${name}`}
          className={cn(action, 'hover:bg-destructive/10 hover:text-destructive')}
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
