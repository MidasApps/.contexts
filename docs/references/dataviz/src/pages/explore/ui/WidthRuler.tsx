'use client';

import { useRef, useState } from 'react';
import { cn } from '@/shared/lib/utils';
import { GRID_COLUMNS, type WidthRange } from '@/features/report-authoring/schema/block-specs';
import { columnOnRuler } from './pointer-width';

/**
 * A largura do bloco, em seis segmentos.
 *
 * ─── Por que não é mais um botão que cicla ───
 *
 * O controle anterior avançava uma coluna por clique e voltava ao 1 depois do
 * 6. Levar um bloco de 2/6 a 6/6 custava quatro cliques e quatro recomposições
 * da página, e não havia como ESCOLHER uma largura — só como passar por ela.
 * Seis segmentos respondem em um clique, e de quebra mostram que a página tem
 * seis colunas, coisa que o rótulo "2/6" dizia sem deixar ver.
 *
 * ─── Por que é um slider, e não seis botões ───
 *
 * Seis alvos de 8px encostados falham o alvo mínimo de 24px da WCAG 2.5.8 —
 * inclusive pela exceção de espaçamento, que exige 24px entre os centros. Como
 * controle ÚNICO com trilha contínua, o alvo é a régua inteira (24px de altura),
 * e o teclado opera pelas setas como em qualquer slider. Os segmentos viram
 * desenho (`aria-hidden`), não seis coisas clicáveis.
 *
 * A faixa vem do contrato do bloco (`widthOf`), não de 1–6 fixo: um gráfico
 * não desenha abaixo de 3/6, e a régua não deixa pedir o que a tool recusaria.
 *
 * ─── O que a régua responde antes do clique ───
 *
 * Faltavam as duas perguntas que se faz ao mirar num controle de faixa: "até
 * onde posso ir" e "o que acontece se eu clicar aqui". A primeira era só
 * opacidade — segmento fora da faixa parecia desligado, não indisponível — e a
 * segunda não tinha resposta nenhuma: o cursor atravessava a régua sem nada
 * mudar até o clique consumar a largura.
 *
 * Agora o próprio DESENHO declara a faixa (fora dela o segmento é um toco de
 * 4px, então a corrida alta é exatamente o que se pode pedir) e o ponteiro
 * mostra o resultado antes: a largura sob o cursor acende à frente da atual, ou
 * apaga o que seria perdido ao encolher, e o segmento mirado cresce um pouco —
 * o `scaleY(1.18)` do protótipo. O número, com o mínimo e o máximo, sai numa
 * etiqueta que só existe enquanto se mira: ela é absoluta de propósito, porque
 * ocupar largura no trilho empurraria o lápis e a lixeira a cada passagem de
 * mouse.
 */
export function WidthRuler({
  width,
  range,
  /** Por que o mínimo é esse — o mesmo texto que a tool cita ao recusar. */
  widthRationale,
  /** De que lado do card o trilho coube — a etiqueta vai para o OUTRO. */
  side = 'acima',
  onChoose,
  disabled = false,
}: {
  width: number;
  range: WidthRange;
  widthRationale: string;
  side?: 'acima' | 'abaixo';
  onChoose: (columns: number) => void;
  disabled?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  /** A coluna sob o ponteiro — o que ACONTECERIA, ainda não o que é. */
  const [hovered, setHovered] = useState<number | null>(null);
  const [hasFocus, setHasFocus] = useState(false);

  const columnAt = (clientX: number): number | null => {
    const track = trackRef.current;
    if (!track) return null;
    const r = track.getBoundingClientRect();
    return columnOnRuler(clientX - r.left, r.width, range);
  };

  const chooseByPointer = (clientX: number) => {
    const chosen = columnAt(clientX);
    if (chosen !== null && chosen !== width) onChoose(chosen);
  };

  const move = (passos: number) => {
    const target = Math.min(Math.max(width + passos, range.min), range.max);
    if (target !== width) onChoose(target);
  };

  const onKeyboard = (e: React.KeyboardEvent) => {
    const actions: Record<string, () => void> = {
      ArrowRight: () => move(1),
      ArrowUp: () => move(1),
      ArrowLeft: () => move(-1),
      ArrowDown: () => move(-1),
      Home: () => onChoose(range.min),
      End: () => onChoose(range.max),
    };
    const action = actions[e.key];
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();
    action();
  };

  /** O bloco só cabe numa fatia das seis colunas — é isso que a faixa diz. */
  const hasLimit = range.min > 1 || range.max < GRID_COLUMNS;
  const target = hovered ?? width;
  const visibleTag = hovered !== null || hasFocus;

  /*
   * O `title` não repete o número: quem o mostra é a etiqueta, na hora. Aqui
   * fica o que ela não cabe dizer — POR QUE a faixa é essa —, e só quando há
   * faixa a explicar. Bloco sem restrição não ganha tooltip nenhum.
   */
  const description = hasLimit
    ? `Este bloco aceita de ${range.min} a ${range.max} colunas. ${widthRationale}`
    : undefined;

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="Largura do bloco, em colunas"
      aria-valuemin={range.min}
      aria-valuemax={range.max}
      aria-valuenow={width}
      aria-valuetext={`${width} de ${GRID_COLUMNS} colunas`}
      aria-disabled={disabled || undefined}
      title={description}
      onKeyDown={disabled ? undefined : onKeyboard}
      onFocus={() => setHasFocus(true)}
      onBlur={() => setHasFocus(false)}
      onPointerDown={disabled ? undefined : (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        setIsDragging(true);
        chooseByPointer(e.clientX);
      }}
      onPointerMove={disabled ? undefined : (e) => {
        setHovered(columnAt(e.clientX));
        if (isDragging) chooseByPointer(e.clientX);
      }}
      onPointerLeave={() => { if (!isDragging) setHovered(null); }}
      onPointerUp={(e) => {
        setIsDragging(false);
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      }}
      onPointerCancel={() => { setIsDragging(false); setHovered(null); }}
      className={cn(
        'relative flex h-6 shrink-0 items-center gap-0.5 rounded px-1 transition-colors',
        disabled
          ? 'cursor-not-allowed opacity-40'
          : 'cursor-pointer hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
      )}
    >
      {Array.from({ length: GRID_COLUMNS }, (_, i) => i + 1).map((column) => {
        const isAvailable = column >= range.min && column <= range.max;
        /* Encolheria: está aceso hoje e ficaria de fora da largura mirada. */
        const wouldLose = column > target && column <= width;
        const wouldGain = column > width && column <= target;
        return (
          <span
            key={column}
            data-coluna={column}
            data-estado={
              !isAvailable ? 'indisponivel'
                : wouldLose ? 'perderia'
                : wouldGain ? 'ganharia'
                : column <= target ? 'aceso' : 'apagado'
            }
            aria-hidden="true"
            className={cn(
              'w-2 rounded-[2px] transition-all duration-100',
              /*
               * Fora da faixa vira TOCO, não segmento esmaecido. Opacidade lê
               * como "desligado" — e desligado é o estado de quem está dentro
               * da faixa e não foi escolhido. A altura separa as duas coisas
               * sem gastar cor: a corrida alta é a faixa, e o toco é o batente.
               */
              isAvailable ? 'h-3' : 'h-1',
              !isAvailable && 'bg-muted-foreground/20',
              isAvailable && column <= target && !wouldGain && 'bg-primary',
              // Prévia: o que a largura mirada acrescenta ainda não é escolha.
              wouldGain && 'bg-primary/45',
              // …e o que ela tira sai do cheio, mas não some: ainda é o valor
              // corrente, e desfazer é soltar o mouse fora.
              wouldLose && 'bg-primary/20',
              isAvailable && column > target && !wouldLose && 'bg-muted-foreground/25',
              // O `scaleY(1.18)` do protótipo, agora na coluna mirada — que é a
              // que RECEBE o clique, não a que está sob o pixel do cursor: fora
              // da faixa o ponteiro é levado ao batente, e o retorno tem de
              // acompanhar para onde a largura vai.
              hovered === column && 'scale-y-[1.18]',
            )}
          />
        );
      })}

      {/*
        A etiqueta: número corrente e, quando o tipo restringe, a faixa inteira.
        `absolute` para não empurrar os vizinhos do trilho — ganhar e perder
        largura a cada passagem de mouse faria o lápis e a lixeira dançarem.

        Sai pelo lado OPOSTO ao card: julgar uma largura é olhar para o bloco, e
        a etiqueta pousada no canto dele cobria justamente a variação que fica
        ali. Com o trilho acima, ela sobe; com o trilho virado para baixo (bloco
        no topo da rolagem), ela desce.
      */}
      {visibleTag && (
        <span
          className={cn(
            'pointer-events-none absolute left-1/2 z-40 -translate-x-1/2',
            side === 'acima' ? 'bottom-full mb-1' : 'top-full mt-1',
            'whitespace-nowrap rounded border border-border bg-popover px-1.5 py-0.5',
            'font-mono text-[10px] leading-none text-foreground shadow-sm',
          )}
        >
          {target}/{GRID_COLUMNS}
          {hasLimit && (
            <span className="ml-1 text-muted-foreground">
              mín {range.min} · máx {range.max}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
