'use client';

import { CHART_TOOLTIP_STYLE } from '@/shared/config/chart-theme';
import { humanizeColumnName } from '@/shared/lib/format';

/**
 * O tooltip dos gráficos cartesianos — um só, para todos.
 *
 * O padrão do Recharts escreve `Nome : valor`, uma linha por série, com o
 * separador " : " e sem alinhar coisa nenhuma. Num empilhado de cinco faixas
 * isso vira um bloco de texto em que os números não se comparam entre si, que é
 * justamente o que se foi ali fazer. Aqui: rótulo em cima, uma linha por série
 * com a cor que ela tem no desenho, nome à esquerda, número à DIREITA em
 * tabular — colunas de dígitos alinham, e a comparação sai de graça.
 *
 * ⚠️ Ao usar `content`, o Recharts IGNORA `contentStyle`/`labelStyle`. Os
 * estilos compartilhados são aplicados à mão aqui — é o mesmo caminho que o
 * heatmap e o waterfall já seguiam por conta própria.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseProps = any;

export interface TooltipOptions {
  /** Formata o número de uma série. Recebe a chave para resolver o eixo dela. */
  formatValue: (value: number, key: string) => string;
  /** Rótulo do ponto (o mês, a categoria). */
  formatLabel?: (label: unknown) => string;
  /**
   * Soma as séries numa linha de total. Só faz sentido no empilhado, onde a
   * altura da coluna É a soma e a pergunta seguinte é sempre "quanto no total".
   */
  showsTotal?: boolean;
  /**
   * Inverte a ordem das linhas para bater com o desenho. Num empilhado o
   * Recharts entrega o payload de baixo para cima, e a lista sai espelhada em
   * relação às faixas — o olho tem de refazer o pareamento a cada leitura.
   */
  topToBottom?: boolean;
  /**
   * Linha final, abaixo de um separador. Existe para o comparativo dizer de
   * QUE ponto do outro período veio o número: as duas séries são alinhadas por
   * posição, então o rótulo do eixo (o mês atual) não vale para a de lá.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  footer?: (props: any) => string | null;
}

const ROW: React.CSSProperties = {
  display: 'flex', alignItems: 'baseline', gap: '12px', justifyContent: 'space-between',
};
const NAME: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 };
const NUMBER: React.CSSProperties = { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };

function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 8, height: 8, borderRadius: 2, backgroundColor: color, flexShrink: 0,
        display: 'inline-block',
      }}
    />
  );
}

/**
 * Tooltip de UM valor por vez — rosca, treemap, funil, metas.
 *
 * Nesses blocos cada forma É um item: o ponteiro já aponta para o assunto, e o
 * que falta é o nome dele e o número. O caminho antigo era passar um
 * `formatter` devolvendo `[valor, '']`, e o Recharts imprimia o separador
 * mesmo com o nome vazio — todo tooltip da rosca e do treemap começava com um
 * `": "` órfão.
 */
export function valueContent(options: {
  /** O título da linha — normalmente o nome da fatia/etapa. */
  itemName: (props: LooseProps) => string;
  /** O número em destaque. */
  itemValue: (props: LooseProps) => string | null;
  /** Linhas de apoio (participação, meta, conversão). */
  details?: (props: LooseProps) => string[];
}) {
  return function ValueContent(props: LooseProps) {
    const { active, payload } = props;
    if (!active || !payload?.length) return null;

    const value = options.itemValue(props);
    if (value === null) return null;
    const name = options.itemName(props);
    const details = options.details?.(props) ?? [];

    return (
      <div style={CHART_TOOLTIP_STYLE.contentStyle}>
        {name && <div style={CHART_TOOLTIP_STYLE.labelStyle}>{name}</div>}
        <div style={NUMBER}>{value}</div>
        {details.map((row) => (
          <div key={row} style={{ color: 'var(--color-muted-foreground)', marginTop: '3px' }}>
            {row}
          </div>
        ))}
      </div>
    );
  };
}

/**
 * Devolve o `content` do `<Tooltip>`.
 *
 * Função e não componente porque o Recharts injeta as props do ponto ativo — o
 * chamador só configura o formato.
 */
export function tooltipContent(options: TooltipOptions) {
  const { formatValue, formatLabel, showsTotal, topToBottom, footer } = options;

  return function TooltipContent(props: LooseProps) {
    const { active, payload, label } = props;
    if (!active || !payload?.length) return null;

    // Série escondida pela legenda sai do payload com `value` nulo: mostrá-la
    // contradiria o clique que acabou de escondê-la.
    const items = payload.filter(
      (p: LooseProps) => p?.value !== undefined && p?.value !== null && !p?.hide,
    );
    if (items.length === 0) return null;

    const rows = topToBottom ? [...items].reverse() : items;
    const total = items.reduce((sum: number, p: LooseProps) => sum + Number(p.value ?? 0), 0);
    const totalKey = String(items[0]?.dataKey ?? '');

    /*
     * Série única não repete o nome: ele já está no título do card, e a linha
     * "Inadimplência 4,81%" logo abaixo de um card chamado "Inadimplência" só
     * gasta espaço. Com várias séries o nome é a informação.
     */
    const isSingleSeries = rows.length === 1;
    const note = footer?.(props) ?? null;

    return (
      <div style={CHART_TOOLTIP_STYLE.contentStyle}>
        {label !== undefined && label !== '' && (
          <div style={CHART_TOOLTIP_STYLE.labelStyle}>
            {formatLabel ? formatLabel(label) : String(label)}
          </div>
        )}

        {isSingleSeries ? (
          <div style={NUMBER}>
            {formatValue(Number(rows[0].value), String(rows[0].dataKey ?? ''))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {rows.map((p: LooseProps, i: number) => (
              <div key={`${p.dataKey}-${i}`} style={ROW}>
                <span style={NAME}>
                  <Swatch color={p.color ?? p.stroke ?? p.fill ?? 'currentColor'} />
                  {/* `name` já vem pronto de quem declarou a série — humanizar
                      de novo re-capitaliza o que já foi tratado ("90+ dias"
                      virava "90+ Dias"). Só a chave crua precisa da tradução. */}
                  <span>{p.name ? String(p.name) : humanizeColumnName(String(p.dataKey ?? ''))}</span>
                </span>
                <span style={NUMBER}>
                  {formatValue(Number(p.value), String(p.dataKey ?? ''))}
                </span>
              </div>
            ))}

            {showsTotal && (
              <div
                style={{
                  ...ROW,
                  marginTop: '4px', paddingTop: '5px',
                  borderTop: '1px solid var(--color-border)',
                  color: 'var(--color-muted-foreground)',
                }}
              >
                <span>Total</span>
                <span style={NUMBER}>{formatValue(total, totalKey)}</span>
              </div>
            )}
          </div>
        )}

        {note && (
          <div
            style={{
              marginTop: '5px', paddingTop: '5px',
              borderTop: '1px solid var(--color-border)',
              color: 'var(--color-muted-foreground)',
              fontSize: '11px',
            }}
          >
            {note}
          </div>
        )}
      </div>
    );
  };
}
