/**
 * ─── A paleta de séries ───
 *
 * Laranja e oliva são da MARCA e não se mexem. As outras seis são pigmento
 * natural — ardósia, ocre, argila, ameixa, sálvia, verde-mar — escolhidas para
 * conviver com as duas primeiras sem competir com elas.
 *
 * **A ordem é a regra, não a decoração.** Um gráfico de N séries usa as N
 * PRIMEIRAS cores, então o que precisa ser distinguível é cada PREFIXO: as
 * duas primeiras acima de tudo, depois as três, e assim por diante. A paleta
 * anterior era ordenada por nada (`primary, chart3, chart4…`) e punha dois
 * laranjas quase iguais nas posições 1 e 2 — `#F3A169` e `#D4976A`, distância
 * OKLab de 0,060, indistinguíveis num quadrado de 8px de legenda. O caso mais
 * comum do produto, duas séries, era o pior atendido.
 *
 * Toda cor daqui atende, medido em `palette.test.ts`:
 * - distância mínima entre quaisquer duas do prefixo, inclusive sob
 *   deuteranopia e protanopia — 4 das 8 antigas colapsavam entre si (ΔE 0,011);
 * - contraste nos DOIS temas. Um hex só serve a fundo branco e a fundo quase
 *   preto, o que obriga luminância média: o amarelo `#F2CB6E` que saiu tinha
 *   1,55:1 no claro, ou seja, uma linha invisível.
 *
 * ⚠️ Cor com SIGNIFICADO não sai daqui. Vermelho de queda e verde de melhora
 * são `destructive`/`success` — tomar emprestado um slot categórico faz a
 * quinta série de um empilhado nascer vermelha sem nada ter piorado.
 */
export const CHART_COLORS = {
  /** Laranja da marca. */
  primary: '#F3A169',
  /*
   * Grafite quente — o contrapeso da marca.
   *
   * Era a oliva `#576558`. Ela NAO foi escolhida por gosto: numa paleta onde
   * a serie 1 e laranja, o verde-oliva era o ponto mais distante em OKLab
   * (0,314), e o caso mais comum do produto e o grafico de DUAS series. Trocar
   * por gosto quase sempre piora — a ardosia, por exemplo, cai para 0,242 e
   * reprova o portao de 0,25 em `palette.test.ts`.
   *
   * Este hex e o melhor substituto nao-verde que passa em TODOS os portoes
   * medidos: 0,283 de distancia do laranja, 3,42 de contraste no tema escuro
   * (minimo 3,2) e 5,86 no claro. Foi encontrado por varredura do espaco de
   * cor contra as mesmas asercoes do teste, nao a olho.
   */
  secondary: '#76614C',
  /** Ardósia — o contrapeso frio, e por isso a segunda cor de apoio. */
  slate: '#5F9BCA',
  /** Ocre profundo. Substitui o amarelo claro, que sumia no tema claro. */
  ochre: '#AC8500',
  /** Argila. */
  clay: '#AC7365',
  /** Ameixa acinzentada. */
  plum: '#816289',
  /** Sálvia. */
  sage: '#939E8C',
  /** Verde-mar. */
  teal: '#4C8F8C',
} as const;

/**
 * A ordem em que as séries recebem cor — a ÚNICA. Antes cada bloco tinha a
 * sua (o gráfico começava em laranja/tan, a dispersão em laranja/sálvia), e a
 * mesma métrica trocava de cor ao mudar de formato de bloco.
 */
export const CHART_PALETTE = [
  CHART_COLORS.primary,
  CHART_COLORS.secondary,
  CHART_COLORS.slate,
  CHART_COLORS.ochre,
  CHART_COLORS.clay,
  CHART_COLORS.plum,
  CHART_COLORS.sage,
  CHART_COLORS.teal,
] as const;

/** A cor da série `i`, com a paleta girando quando as séries passam de oito. */
export function seriesColor(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length]!;
}

// RATING_CHART_COLORS (A–H) e FAIXA_COLORS (adimplente/1-30/31-60/61-90/90+)
// saíram com as páginas fixas que os usavam: eram as paletas de rating e de
// faixa de atraso do Play. Os gráficos de hoje pegam cor do CHART_PALETTE.

/**
 * ─── Como a tipografia de gráfico acompanha o tema ───
 *
 * O Recharts recebe cor por prop/atributo, não por classe CSS, então nada aqui
 * troca sozinho com `data-theme`. Duas técnicas, escolhidas pela natureza do
 * nó que recebe a cor:
 *
 * 1. **Nó SVG** (tick de eixo, grid, cursor, linha de referência):
 *    `currentColor`. Atributo de apresentação SVG NÃO resolve `var(--token)`
 *    — a substituição de custom property só acontece em declaração CSS de
 *    verdade — mas `currentColor` resolve contra o `color` herdado. Por isso o
 *    gráfico precisa ser montado dentro de um elemento com `CHART_INK_CLASS`.
 * 2. **Nó HTML** (tooltip e legenda, que o Recharts renderiza como `<div>`):
 *    `var(--color-…)` no style inline, que é declaração CSS e troca junto com
 *    o `data-theme` do `<html>`.
 *
 * A alternativa era ler `resolvedTheme` do next-themes e escolher a paleta em
 * JS. Foi descartada: exigiria hook em todo bloco de gráfico, re-render a cada
 * troca de tema e conviveria com o `resolvedTheme === undefined` do primeiro
 * paint — que é exatamente o momento em que a cor errada aparece. Cor por CSS
 * não tem nenhum desses problemas.
 */
export const CHART_INK_CLASS = 'text-muted-foreground';

export const CHART_AXIS_STYLE = {
  fontSize: 11,
  fontFamily: 'var(--font-sans)',
  tickLine: false,
  axisLine: false,
  /**
   * A cor do rótulo vive em `tick`, não em `fill` no nível do eixo: o Recharts
   * monta o `<text>` do tick com `fill: <stroke do eixo>` (CartesianAxis.js) e
   * só depois aplica o objeto `tick`. O `fill: 'rgba(255,255,255,0.50)'` que
   * estava aqui nunca chegou à tela — o que se via era o `#666` default da lib.
   */
  tick: { fill: 'currentColor', fontSize: 11 },
};

export const CHART_GRID_STYLE = {
  strokeDasharray: '3 6',
  stroke: 'currentColor',
  // Alpha separado da cor porque `currentColor` já traz o tom do tema; a grade
  // é estrutura, tem que ficar abaixo do rótulo em ambos os temas.
  strokeOpacity: 0.15,
  vertical: false,
};

export const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: 'var(--color-popover)',
    backdropFilter: 'blur(12px)',
    border: '1px solid var(--color-border)',
    borderRadius: '10px',
    fontSize: '12px',
    color: 'var(--color-popover-foreground)',
    padding: '10px 14px',
    // Fallback explícito: sombra não é legibilidade, mas um `var()` sem valor
    // invalida a declaração inteira e o tooltip ficaria sem elevação nenhuma.
    boxShadow: 'var(--shadow-card, 0 8px 32px rgba(0,0,0,0.24))',
  },
  labelStyle: {
    color: 'var(--color-muted-foreground)',
    fontSize: '11px',
    marginBottom: '6px',
    fontWeight: 500,
  },
  cursor: { fill: 'currentColor', fillOpacity: 0.06 },
};

export const CHART_LEGEND_STYLE = {
  wrapperStyle: {
    fontSize: '11px',
    color: 'var(--color-muted-foreground)',
    paddingTop: '12px',
  },
};
