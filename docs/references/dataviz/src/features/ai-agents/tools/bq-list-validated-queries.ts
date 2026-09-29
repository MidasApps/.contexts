import { tool } from 'ai';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '@/shared/lib/firebase/admin';
import { createRepository, QUALITY_SCORE_MIN } from '@/features/sql-catalog/repository';
import { canonicalSqlHash } from '@/features/sql-catalog/hash';
import { recallSqlFallback } from './recall-fallback';
import type { ToolContext } from './tool-context';
import { withoutRefusedSql } from '@/features/ai-agents/lib/recalled-sql';

/**
 * Fire-and-forget log de hits do catálogo (Sprint 3.C Task 10) — agora em
 * Firestore (`sqlCatalogEvents`). Falhas silenciadas — telemetria nunca pode
 * quebrar a tool.
 */
async function logCatalogEvent(input: {
  clientId: string;
  intent: string;
  curatedHits: number;
  recallHits: number;
}): Promise<void> {
  try {
    const intentHash = canonicalSqlHash(input.intent);
    const totalHits = input.curatedHits + input.recallHits;
    await getDb().collection('sqlCatalogEvents').add({
      ts: FieldValue.serverTimestamp(),
      clientId: input.clientId,
      intentHash,
      curatedHits: input.curatedHits,
      recallHits: input.recallHits,
      totalHits,
    });
  } catch {
    // swallow — fire-and-forget
  }
}

/**
 * `bq.list_validated_queries` — tool primária do flow agentic (ADR-0009).
 *
 * Hierarquia: catálogo curado (`approved` + `quality_score >= 0.7`) > recall
 * semântico (Sprint 3.A) > vazio. `clientId` server-bound via `ToolContext`
 * (ADR-0006).
 */

const InputSchema = z
  .object({
    intent: z.string().min(1),
    tags: z.array(z.string()).nullable(),
    topK: z.number().int().min(1).max(20).default(5),
  })
  .strict();

interface ResultItem {
  id?: string;
  sql: string;
  intent: string;
  score: number;
  source: 'curated' | 'recall';
  tags?: string[];
  qualityScore?: number;
}

export interface ListValidatedQueriesOutput {
  items: ResultItem[];
  curatedHits: number;
  recallHits: number;
}

export function createBqListValidatedQueriesTool(ctx: ToolContext) {
  if (!ctx.clientId) {
    throw new Error(
      'createBqListValidatedQueriesTool: clientId obrigatório em ToolContext (ADR-0006).',
    );
  }
  const clientId = ctx.clientId;
  const ctxPersonaId = ctx.personaId;

  const repo = createRepository();

  return tool({
    description:
      'Retorna queries SQL validadas (catálogo curado humano > recall semântico) para o intent dado, filtradas por cliente e persona. Use ANTES de gerar SQL novo.',
    inputSchema: InputSchema,
    execute: async ({ intent, topK }): Promise<ListValidatedQueriesOutput> => {
      // personaId é server-bound (ADR-0006), igual ao tier de recall — o modelo
      // NÃO pode escolher/anular a persona via input (antes `personaId ?? ...`
      // deixava o input sobrescrever o contexto, permitindo cross-persona).
      const effectivePersonaId = ctxPersonaId ?? null;
      // Curated tier — repository already filters status='approved'.
      const curatedRows = await repo.listByClient({
        clientId,
        status: 'approved',
        personaId: effectivePersonaId,
        limit: topK,
      });

      const curated: ResultItem[] = withoutRefusedSql(curatedRows, (r) => r.sql)
        .filter((r) => (r.quality_score ?? 0) >= QUALITY_SCORE_MIN)
        .map((r) => ({
          id: r.id,
          sql: r.sql,
          intent: r.intent,
          score: r.quality_score ?? 0,
          source: 'curated' as const,
          tags: r.tags ?? undefined,
          qualityScore: r.quality_score ?? undefined,
        }));

      const slotsLeft = topK - curated.length;
      let recall: ResultItem[] = [];
      // Only attempt recall if we have a personaId target (recall-store requires it).
      if (slotsLeft > 0 && ctxPersonaId) {
        const recallMatches = await recallSqlFallback({
          intent,
          clientId,
          personaId: ctxPersonaId,
          topK: slotsLeft,
        });
        recall = recallMatches.map((m) => ({
          id: m.id,
          sql: m.sql,
          intent: m.intent,
          score: m.score,
          source: 'recall' as const,
        }));
      }

      const result = {
        items: [...curated, ...recall],
        curatedHits: curated.length,
        recallHits: recall.length,
      };

      // Fire-and-forget telemetry (Task 10).
      void logCatalogEvent({
        clientId,
        intent,
        curatedHits: result.curatedHits,
        recallHits: result.recallHits,
      });

      return result;
    },
  });
}
