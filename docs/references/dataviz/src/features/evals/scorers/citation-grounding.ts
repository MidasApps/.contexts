/**
 * Scorer `citation_grounding` (Task 7 / Sprint 3.D).
 *
 * - Parser regex captura claims regulatórios/numéricos no `narrative`:
 *     `(Lei|CMN|CVM|Res\.|Art\.|N% | R$ N | N bps | N pp)`
 * - Para cada claim, exige `agentOutput.citations[claimText]` apontando
 *   para um `doc_id` presente em `validDocIds` (espelho local do
 *   `embeddings_docs` — em produção, query pgvector).
 * - Whitelist: `PDD`/`DSCR` sem número específico ao redor.
 * - Score = `validClaims / totalClaims` (1.0 se nenhum claim).
 */

import { createScorer } from './create-scorer';
import type { Scorer, ScorerInput, ScoreResult } from './types';
// Padrões em módulo compartilhado com o guardrail de runtime
// (`ai-agents/lib/require-citation`). Divergir faria o eval aprovar o que o
// runtime marca — e vice-versa.
import { parseClaims } from '@/shared/lib/claims/claim-patterns';
export { parseClaims };


// A whitelist `['PDD','DSCR']` que ficava aqui era código morto: o próprio
// comentário registrava "Whitelist é um no-op aqui porque PDD/DSCR sozinhos não
// casam com CLAIM_PATTERNS". Saiu junto com o parseClaims local.

export interface CitationDeps {
  /** doc_ids válidos (mock do `embeddings_docs`). Em produção, função
   *  injetada que consulta pgvector. */
  validDocIds: string[];
}


function evaluateCitation(deps: CitationDeps) {
  return async (input: ScorerInput): Promise<ScoreResult> => {
    const narrative = typeof input.agentOutput.narrative === 'string'
      ? input.agentOutput.narrative
      : '';
    const citations = (input.agentOutput as Record<string, unknown>).citations as
      | Record<string, string>
      | undefined;

    const claims = parseClaims(narrative);
    if (claims.length === 0) {
      return {
        score: 1.0,
        rationale: 'Nenhum claim regulatório/numérico detectado.',
        metadata: { totalClaims: 0, validClaims: 0 },
      };
    }

    const validSet = new Set(deps.validDocIds);
    let valid = 0;
    const missingSources: string[] = [];
    const invalidSources: string[] = [];
    for (const claim of claims) {
      // Tenta match exato e, em fallback, busca chave que contenha o claim.
      const sourceDoc =
        citations?.[claim] ??
        Object.entries(citations ?? {}).find(([k]) =>
          claim.toLowerCase().includes(k.toLowerCase()) ||
          k.toLowerCase().includes(claim.toLowerCase()),
        )?.[1];
      if (!sourceDoc) {
        missingSources.push(claim);
      } else if (!validSet.has(sourceDoc)) {
        invalidSources.push(`${claim} -> ${sourceDoc}`);
      } else {
        valid += 1;
      }
    }

    const score = valid / claims.length;
    return {
      score,
      rationale: `validClaims=${valid}/${claims.length}; missing=${missingSources.length}; invalid=${invalidSources.length}`,
      metadata: {
        totalClaims: claims.length,
        validClaims: valid,
        missingSources,
        invalidSources,
      },
    };
  };
}

export interface CreateCitationGroundingOptions {
  validDocIds?: string[];
}

export function createCitationGrounding(
  opts: CreateCitationGroundingOptions = {},
): Scorer {
  return createScorer({
    name: 'citation_grounding',
    kind: 'function',
    run: evaluateCitation({ validDocIds: opts.validDocIds ?? [] }),
  });
}
