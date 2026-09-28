/**
 * O número por trás de um texto em pt-BR ("1.500,0%", "R$ 1.234,50", "-8,5%").
 *
 * Existe porque o pipeline entrega o percentual já FORMATADO no bloco
 * (`deltaPercent: "12,3%"`, escrito por `formatNumber`) e o card precisa do
 * número de volta para decidir sinal e cor. Havia três leituras dessa mesma
 * string na pasta, e duas estavam erradas do mesmo jeito: trocavam a vírgula
 * por ponto SEM remover o ponto de milhar antes. `parseFloat("1.500.0")` para
 * no segundo ponto e devolve **1,5** — um salto de 1.500% virava "+1,5%" na
 * tela, ruído com cara de estabilidade.
 *
 * A ordem importa e é a única correta: descarta o que não é número, remove o
 * separador de milhar, e só então promove a vírgula a ponto decimal.
 */
export function parsePtBrNumber(text: string | undefined): number | null {
  if (!text) return null;
  const cleaned = text
    .replace(/[^0-9,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const parsed = parseFloat(cleaned);
  return Number.isNaN(parsed) ? null : parsed;
}
