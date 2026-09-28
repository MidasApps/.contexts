/**
 * Parser/validador SEGURO da `expression` de um recipe `derived` (R2).
 * Gramática restrita: identificadores (ids de termos), números e `+ - * / ( )`.
 * Nunca aceita coluna/SQL cru — `.` e `;` não são tokenizáveis (anti-injeção).
 */
const ID = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NUM = /^\d+(\.\d+)?$/;
const OPS = new Set(['+', '-', '*', '/']);

/** Quebra a expressão em tokens; lança em caractere fora da gramática. */
export function tokenizeExpression(expr: string): string[] {
  const tokens: string[] = [];
  const re = /\s*([A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|[()+\-*/])/y;
  let pos = 0;
  while (pos < expr.length) {
    if (/\s/.test(expr[pos])) {
      pos++;
      continue;
    }
    re.lastIndex = pos;
    const m = re.exec(expr);
    if (!m || m.index !== pos) {
      throw new Error(`Expressão inválida: caractere inesperado em "${expr.slice(pos)}"`);
    }
    tokens.push(m[1]);
    pos = re.lastIndex;
  }
  return tokens;
}

export function validateExpression(expr: string, allowedIds: string[]): void {
  const allowed = new Set(allowedIds);
  const tokens = tokenizeExpression(expr);
  if (tokens.length === 0) throw new Error('Expressão vazia');
  let depth = 0;
  for (const t of tokens) {
    if (t === '(') {
      depth++;
    } else if (t === ')') {
      depth--;
      if (depth < 0) throw new Error('Parênteses desbalanceados');
    } else if (OPS.has(t) || NUM.test(t)) {
      // ok
    } else if (ID.test(t)) {
      if (!allowed.has(t)) throw new Error(`Termo desconhecido na expressão: "${t}"`);
    } else {
      throw new Error(`Token inválido: "${t}"`);
    }
  }
  if (depth !== 0) throw new Error('Parênteses desbalanceados');
}

export function renderExpression(expr: string, sqlById: Record<string, string>): string {
  const tokens = tokenizeExpression(expr);
  return tokens.map((t) => (ID.test(t) && t in sqlById ? sqlById[t] : t)).join(' ');
}
