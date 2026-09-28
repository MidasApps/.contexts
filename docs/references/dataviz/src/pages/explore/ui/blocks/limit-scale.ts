import type { BlockTone } from './block-shell';

/**
 * A régua de "valor contra limite" — aritmética pura, compartilhada.
 *
 * Quem usa: o `gauge` (um indicador) e o `targets` (vários). São a mesma
 * pergunta em duas densidades, e duas implementações dela é como `addBlock` e
 * `moveBlock` chegaram a discordar sobre o que cabe numa linha.
 *
 * Chamava-se `gauge-arc` e exportava geometria de arco (caminho SVG,
 * comprimento, ponto no arco). O arco saiu: num card de 2/6 e 172px de altura,
 * um semicírculo grande o bastante para abrigar o número em 30px empurra o
 * bloco para ~190px e quebra a linha com os KPIs. O que sobrou é o que sempre
 * foi o miolo — escala, faixas e folga —, e o desenho passou a ser um medidor
 * horizontal, o mesmo do bullet.
 */

export interface LimitScale {
  min: number;
  max: number;
}

/**
 * A escala em que o valor é lido.
 *
 * Sem `scaleMin`/`scaleMax` declarados, o limite cai no MEIO da régua: ela vai
 * de 0 a 2× o limite. Isso dá uma propriedade útil — a marca do limite fica
 * sempre no mesmo ponto, então dois indicadores com limites diferentes ficam
 * comparáveis a olho.
 *
 * **Mas ela sozinha satura.** O Índice Recebível real é 8,31x contra um mínimo
 * de 1,20x: numa régua que termina em 2,4 o valor estoura o teto, o medidor
 * trava em 100% e o desenho passa a afirmar "no limite" sobre um indicador que
 * está sete vezes acima dele. Por isso a régua também acompanha o valor, com
 * 15% de folga visual — o ponteiro nunca encosta na borda, e a marca do limite
 * desliza para a esquerda, que é exatamente a leitura certa de "muito acima".
 */
export function limitScale(args: {
  limit: number;
  value: number;
  scaleMin?: number | undefined;
  scaleMax?: number | undefined;
}): LimitScale {
  const { limit, value, scaleMin, scaleMax } = args;
  const min = scaleMin ?? 0;
  if (scaleMax !== undefined && scaleMax > min) return { min, max: scaleMax };

  const byLimit = limit > min ? min + (limit - min) * 2 : 0;
  const byValue = Number.isFinite(value) ? min + Math.abs(value - min) * 1.15 : 0;
  const max = Math.max(byLimit, byValue);

  // Limite e valor ambos em zero (bloco recém-criado, antes do dado): sem isto
  // `max === min` e toda fração vira 0 — o medidor desaparece.
  return { min, max: max > min ? max : min + 1 };
}

/** Onde um valor cai na régua, de 0 (início) a 1 (fim). */
export function fractionOnScale(value: number, scale: LimitScale): number {
  const amplitude = scale.max - scale.min;
  if (amplitude <= 0) return 0;
  const raw = (value - scale.min) / amplitude;
  return Math.min(Math.max(raw, 0), 1);
}

export interface LimitBand {
  tone: BlockTone;
  /** Fração inicial na régua, 0..1. */
  de: number;
  /** Fração final na régua, 0..1. */
  ate: number;
}

/**
 * As faixas qualitativas de fundo, da esquerda para a direita.
 *
 * É o que o gauge antigo não tinha: sem faixa, 1,38x e 8,31x pintam o mesmo
 * verde e a tela não diz qual está raspando no limite.
 */
export function limitBands(args: {
  limit: number;
  warning?: number | undefined;
  invertedScale?: boolean | undefined;
  scale: LimitScale;
}): LimitBand[] {
  const { limit, warning, invertedScale = false, scale } = args;
  const limitFraction = fractionOnScale(limit, scale);

  if (invertedScale) {
    // Quanto MAIOR pior: positivo à esquerda, ruptura à direita.
    const warningFraction = warning !== undefined ? fractionOnScale(warning, scale) : limitFraction;
    return ([
      { tone: 'positivo', de: 0, ate: warningFraction },
      { tone: 'atencao', de: warningFraction, ate: limitFraction },
      { tone: 'ruptura', de: limitFraction, ate: 1 },
    ] as LimitBand[]).filter((f) => f.ate > f.de);
  }

  const warningFraction = warning !== undefined ? fractionOnScale(warning, scale) : limitFraction;
  return ([
    { tone: 'ruptura', de: 0, ate: limitFraction },
    { tone: 'atencao', de: limitFraction, ate: warningFraction },
    { tone: 'positivo', de: warningFraction, ate: 1 },
  ] as LimitBand[]).filter((f) => f.ate > f.de);
}

export interface LimitSlice {
  /** Chave estável para o React. */
  id: string;
  tone: BlockTone | 'marca';
  /** Largura angular da fatia, como fração de 0..1 do semicírculo. */
  size: number;
}

/**
 * A chave que o `<Pie dataKey>` do gauge lê nas fatias.
 *
 * O Recharts lê a fatia por STRING: renomear `size` sem mudar o `dataKey`
 * compila, passa no teste e apaga o arco. Com `satisfies`, renomear a
 * propriedade quebra a compilação aqui.
 */
export const SLICE_SIZE_KEY = 'size' satisfies keyof LimitSlice;

/** Largura da marca do limite, em fração do arco. ~1,4% ≈ 3px num arco de 216px. */
const MARK_WIDTH = 0.014;

/**
 * As faixas convertidas em FATIAS de um `<Pie>`, com a marca do limite embutida.
 *
 * Só o desenho em arco usa isto — o medidor horizontal posiciona a marca com
 * `ReferenceLine`, que é absoluta. O `<Pie>` desenha por largura angular
 * sucessiva, não por posição, então a marca do mínimo contratado não pode ser
 * um elemento sobreposto: ela é uma fatia fina que parte a faixa exatamente no
 * limite, participando do mesmo layout e da mesma animação.
 */
export function slicesWithMark(
  bands: LimitBand[],
  limitFraction: number,
): LimitSlice[] {
  const fatias: LimitSlice[] = [];
  const half = MARK_WIDTH / 2;

  for (const band of bands) {
    const markInside = limitFraction > band.de + half && limitFraction < band.ate - half;
    if (!markInside) {
      fatias.push({ id: `${band.tone}-${band.de}`, tone: band.tone, size: band.ate - band.de });
      continue;
    }
    fatias.push({ id: `${band.tone}-${band.de}-a`, tone: band.tone, size: limitFraction - half - band.de });
    fatias.push({ id: `marca-${band.de}`, tone: 'marca', size: MARK_WIDTH });
    fatias.push({ id: `${band.tone}-${band.de}-b`, tone: band.tone, size: band.ate - (limitFraction + half) });
  }

  // Fatia de largura zero ou negativa vira artefato de renderização no Recharts.
  return fatias.filter((f) => f.size > 0);
}

/**
 * Trilho e valor como duas fatias: a que se vê e o resto.
 *
 * A segunda é o vão, pintada com a cor do trilho e não transparente — um
 * `<Pie>` com fatia invisível ainda reserva o espaço, e o arco fica com um
 * degrau na ponta.
 */
export function valueSlices(fraction: number): Array<Pick<LimitSlice, 'id' | 'size'> & { filled: boolean }> {
  const full = Math.min(Math.max(fraction, 0), 1);
  return [
    { id: 'valor', filled: true, size: full },
    { id: 'resto', filled: false, size: 1 - full },
  ].filter((f) => f.size > 0);
}

export interface LimitDistance {
  /** Razão valor/limite. `null` quando o limite é zero. */
  ratio: number | null;
  /** Frase pronta para a linha de apoio. */
  text: string;
}

/**
 * A distância até o limite, já em palavras.
 *
 * Percentual é a forma certa PERTO do limite e ridícula longe dele: com o
 * Índice Recebível em 8,31x contra 1,20x, "folga de 592,3%" é um número
 * correto que ninguém processa. Acima do dobro, múltiplo comunica de imediato
 * — "6,9× o mínimo" — que é como a mesa de crédito fala.
 */
export function limitDistance(args: {
  value: number;
  limit: number;
  invertedScale?: boolean | undefined;
  formatNumber: (n: number, decimals: number) => string;
}): LimitDistance {
  const { value, limit, invertedScale = false, formatNumber } = args;
  if (limit === 0 || !Number.isFinite(value)) return { ratio: null, text: '' };

  const ratio = value / Math.abs(limit);
  const headroomPct = invertedScale
    ? ((limit - value) / Math.abs(limit)) * 100
    : ((value - limit) / Math.abs(limit)) * 100;

  // Numa escala invertida (limite é um teto), o múltiplo confunde: "0,56× o
  // máximo" não é frase de mesa. Ali o percentual serve bem, porque o valor
  // vive perto ou abaixo do limite por construção.
  if (!invertedScale && ratio >= 2) {
    return { ratio, text: `${formatNumber(ratio, 1)}× o mínimo` };
  }
  if (!invertedScale && ratio > 0 && ratio <= 0.5) {
    return { ratio, text: `${formatNumber(ratio, 2)}× o mínimo` };
  }
  return {
    ratio,
    text: `${headroomPct >= 0 ? 'folga de ' : 'abaixo em '}${formatNumber(Math.abs(headroomPct), 1)}%`,
  };
}
