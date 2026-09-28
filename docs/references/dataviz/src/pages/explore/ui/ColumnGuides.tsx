'use client';

import { GRID_COLUMNS } from '@/features/report-authoring/schema/block-specs';

/** Casa com o `gap-4` da grade do canvas. */
const GUTTER = 16;

/**
 * As divisões da grade, visíveis só enquanto se arrasta o puxador.
 *
 * Sem elas o redimensionamento é adivinhação: o bloco cresce aos saltos e não
 * há como antecipar onde o próximo salto cai. Com elas, o puxador passa a ser
 * um gesto contra uma referência — e, de graça, a página ensina que tem seis
 * colunas, que é a informação que o botão "2/6" anunciava sem deixar ver.
 *
 * Permanentes seriam papel quadriculado atrás de todo relatório. Só no arrasto,
 * são resposta ao gesto.
 *
 * ⚠️ `z-50`, ACIMA dos blocos. Em `z-10` elas ficavam por baixo: a célula sob o
 * ponteiro sobe para `z-20`, e um bloco de 3/6 engole as duas divisas que caem
 * dentro dele — justamente as que interessam a quem está esticando. Guia que só
 * aparece na calha, onde não há bloco, não guia nada. São linhas de 1px: passar
 * por cima não esconde conteúdo.
 */
export function ColumnGuides() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-50">
      {Array.from({ length: GRID_COLUMNS - 1 }, (_, i) => i + 1).map((divider) => (
        <span
          key={divider}
          /*
           * Tracejada, e não linha cheia: as séries dos gráficos são laranja, e
           * uma vertical laranja SÓLIDA atravessando uma área de plotagem lê
           * como dado. Tracejado é vocabulário de guia — ninguém confunde com
           * série.
           */
          className="absolute -top-2 -bottom-2 w-0 border-l border-dashed border-primary/70"
          // O centro da calha entre as colunas `divisa` e `divisa+1`: a grade
          // inteira mais uma calha, repartida em seis, menos meia calha.
          style={{ left: `calc((100% + ${GUTTER}px) * ${divider} / ${GRID_COLUMNS} - ${GUTTER / 2}px)` }}
        />
      ))}
    </div>
  );
}
