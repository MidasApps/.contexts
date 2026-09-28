/**
 * Limites "redondos" para um eixo que não parte do zero.
 *
 * Quem corta o zero precisa escolher onde o eixo começa, e a escolha ingênua —
 * `min - folga` — produz marcações como 23%, 43%, 63%: números que ninguém lê
 * de relance porque não são múltiplos de nada. O eixo é régua; régua tem traço
 * em número redondo.
 *
 * Só faz sentido onde a área NÃO é a mensagem (dispersão, faixa, banda). Numa
 * barra, cortar o zero mente sobre a proporção — ali o piso é zero e ponto.
 */

/** O passo "humano" mais próximo abaixo de `bruto`: 1, 2 ou 5 × potência de 10. */
function roundStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / power;
  if (normalized >= 5) return 5 * power;
  if (normalized >= 2) return 2 * power;
  return power;
}

/**
 * Domínio arredondado que CONTÉM `[min, max]` com uma folga de respiro.
 *
 * @param divisions quantas marcações se pretende no eixo — define o passo.
 */
export function axisDomain(
  min: number,
  max: number,
  divisions = 4,
): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  // Série constante: sem amplitude não há o que arredondar, mas o eixo precisa
  // de altura — senão a caixa vira uma linha colada na borda.
  if (max === min) {
    const padding = Math.abs(max) * 0.1 || 1;
    return [min - padding, max + padding];
  }

  const step = roundStep((max - min) / divisions);
  return [
    snapToStep(Math.floor(min / step), step),
    snapToStep(Math.ceil(max / step), step),
  ];
}

/**
 * `multiplos * passo` sem o resíduo binário.
 *
 * `3 * 0.1` é 0.30000000000000004 em ponto flutuante, e esse número vira o
 * limite do eixo e o rótulo do primeiro traço. Arredondar na casa do próprio
 * passo devolve o número que se pretendia.
 */
function snapToStep(multiple: number, step: number): number {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  return Number((multiple * step).toFixed(decimals));
}
