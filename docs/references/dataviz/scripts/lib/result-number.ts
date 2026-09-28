/**
 * O número de uma célula de resultado do BigQuery — e `null` quando não há número.
 *
 * O cliente devolve INT64/FLOAT64 como `number`, NUMERIC/BIGNUMERIC como objeto
 * (`{ value }` ou `Big`), texto como string e NULL como `null`. Quem valida uma
 * migração contra o dado precisa dos casos separados: "vale zero" e "não tem
 * valor" levam a decisões opostas.
 *
 * ⚠️ `Number(null)` é 0, não NaN — e era por aí que a validação de
 * `add-kpi-sparklines.ts` (ADR-0027 §3, "o último ponto da série tem de ser
 * igual ao valor que o KPI exibe") deixava passar o que devia recusar: um KPI
 * sem valor virava 0 e batia com uma série terminada em zero real. A curva ia
 * para o catálogo carimbada como provada contra o dado.
 */
export function resultNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  // String vazia também vira 0 em `Number` — mesma armadilha, outro tipo.
  if (typeof raw === 'string' && raw.trim() === '') return null;

  const wrapped = (raw as { value?: unknown }).value;
  const rawValue = Number(wrapped ?? raw);
  return Number.isFinite(rawValue) ? rawValue : null;
}

/**
 * Dois resultados são o MESMO número.
 *
 * A folga é relativa (1e-9) porque NUMERIC atravessa o driver como double e o
 * último dígito não sobrevive; o piso absoluto cobre a comparação perto do zero.
 *
 * Ausência NUNCA é igualdade — nem dos dois lados. Provar uma série contra um
 * valor que não existe é não provar nada, e o relatório da migração precisa
 * dizer isso em vez de gravar.
 */
export function sameValue(expected: number | null, actual: number | null): boolean {
  if (expected === null || actual === null) return false;
  return Math.abs(expected - actual) <= Math.max(1e-9, Math.abs(expected) * 1e-9);
}
