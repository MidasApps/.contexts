/**
 * Padrões de afirmação que EXIGEM fonte, conforme o prompt em produção
 * (`aiWorkflows/default`): "citações de fonte quando houver afirmação numérica
 * ou regulatória".
 *
 * Fonte única, compartilhada por dois consumidores com propósitos diferentes:
 *  - o scorer offline `evals/scorers/citation-grounding.ts` (mede qualidade);
 *  - o guardrail de runtime `ai-agents/lib/require-citation.ts` (marca a
 *    resposta antes de o usuário vê-la).
 *
 * Ficam aqui, e não dentro de um dos dois, porque divergir os padrões faria o
 * eval aprovar o que o runtime marca — e vice-versa.
 */

export const CLAIM_PATTERNS: RegExp[] = [
  /\bLei\s+\d+(?:\.\d+)?(?:\s+art\.?\s*\d+)?/gi,
  /\bCMN\s+\d+(?:\.\d+)?/gi,
  /\bCVM\s+\d+/gi,
  /\bRes\.?\s*\d+(?:\.\d+)?/gi,
  /\bArt\.?\s*\d+/gi,
  /\b\d+(?:[.,]\d+)?\s*%/g,
  /R\$\s*[\d.,]+/g,
  /\b\d{2,}\s*bps\b/gi,
  /\b\d+(?:[.,]\d+)?\s*p\.?p\.?\b/gi,
];

/** Afirmações numéricas/regulatórias encontradas no texto, sem repetição. */
export function parseClaims(text: string): string[] {
  const claims = new Set<string>();
  for (const re of CLAIM_PATTERNS) {
    re.lastIndex = 0; // regex global é stateful — sem isto a 2ª chamada pula matches
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      claims.add(m[0].trim());
    }
  }
  return [...claims];
}
