import { parseClaims } from '@/shared/lib/claims/claim-patterns';

/**
 * Guardrail de runtime para a promessa de citação.
 *
 * Achado R7 da revisão: o prompt EM PRODUÇÃO (`aiWorkflows/default`) manda
 * "compor uma resposta clara com citações de fonte quando houver afirmação
 * numérica ou regulatória", e nada verificava. `require-citation` só existia em
 * spec; `validateAgentResult` nunca existiu. O scorer `citation-grounding` é
 * eval OFFLINE — mede qualidade depois, não protege o usuário agora.
 *
 * ─── MARCA, não recusa ──────────────────────────────────────────────────────
 * Recusar transformaria um problema de qualidade em indisponibilidade: uma
 * análise correta sem a palavra "fonte" viraria erro na tela. Marcar preserva a
 * resposta e transfere ao leitor a informação que ele precisa para decidir se
 * repassa o número adiante.
 *
 * ─── O que este check NÃO é ─────────────────────────────────────────────────
 * Não é grounding por afirmação. Verificar que CADA número veio de um documento
 * recuperado exige o retrieval set do turno, que não chega até aqui — é o que o
 * scorer offline faz. Este é o degrau mais fraco e verificável: havendo
 * afirmação numérica ou regulatória, o texto precisa citar ALGUMA fonte. É
 * exatamente a promessa que o prompt faz, nem mais nem menos.
 */

/**
 * Sinais de que o texto atribui origem ao dado. Cobre o que os prompts do
 * produto pedem e o que os modelos de fato produzem em markdown.
 */
const SOURCE_SIGNALS: RegExp[] = [
  /\bfontes?\s*:/i,
  /\bconforme\s+(a\s+)?(lei|resolu|circular|instru|norma|art)/i,
  /\bsegundo\s+(a|o)\s+\w+/i,
  /\[[^\]]+\]\([^)]+\)/, // link markdown
  /\bbase(ado)?\s+n[ao]s?\s+dados\b/i,
  /\bcarteira\s+d[eo]\s+\w+/i,
];

export const MISSING_SOURCE_WARNING =
  '> ⚠️ Números apresentados sem indicação de fonte. Confirme na base antes de repassar.';

export interface CitationCheck {
  /** Afirmações numéricas/regulatórias encontradas. */
  claims: string[];
  /** true quando há claim e nenhum sinal de fonte. */
  needsWarning: boolean;
}

export function checkCitations(text: string): CitationCheck {
  const claims = parseClaims(text ?? '');
  if (claims.length === 0) return { claims, needsWarning: false };
  const hasSource = SOURCE_SIGNALS.some((re) => re.test(text));
  return { claims, needsWarning: !hasSource };
}

/**
 * Devolve o texto com o aviso anexado quando faltou fonte. Idempotente: aplicar
 * duas vezes não empilha o aviso — o bloco pode ser regerado e reprocessado.
 */
export function annotateMissingCitations(text: string): string {
  if (!text?.trim()) return text;
  if (text.includes(MISSING_SOURCE_WARNING)) return text;
  const { needsWarning } = checkCitations(text);
  if (!needsWarning) return text;
  return `${text.trimEnd()}\n\n${MISSING_SOURCE_WARNING}`;
}
