import { tool } from 'ai';
import { z } from 'zod';
import { createRepository } from '@/features/sql-catalog/repository';
import { canonicalSqlHash } from '@/features/sql-catalog/hash';
import { checkTenantQuery, type TenantQueryRefusalCode } from '@/features/ai-agents/lib/tenant-query';
import { lazyClientQueryScope } from '@/features/ai-agents/lib/client-query-scope';
import type { ToolContext } from './tool-context';

/**
 * `bq.save_validated_query` (ADR-0009 §Implementação) — sugere um SQL
 * bem-sucedido ao catálogo curado.
 *
 * - Pré-validação obrigatória pela mesma porta do `execute_sql`
 *   (`checkTenantQuery`: guarda, dry-run SELECT, escopo do cliente). O
 *   `performDryRun` cru que ficava aqui fazia dry-run de qualquer tabela e
 *   devolvia ao modelo a mensagem do BigQuery — oráculo de existência de
 *   tabela de outro tenant, com o id do projeto junto.
 * - Dedup por `canonicalSqlHash` escopado por `clientId`.
 * - Insere como `status='draft'` — gate humano via UI admin.
 * - `needsApproval: true` — runtime pode propagar ao consumer (ADR-0009).
 * - Multi-tenancy strict (ADR-0006): `clientId`/`personaId` server-bound.
 */

const InputSchema = z
  .object({
    intent: z.string().min(1),
    sql: z.string().min(1),
    tags: z.array(z.string()).nullable(),
    schemaSnapshot: z.record(z.string(), z.unknown()).nullable(),
  })
  .strict();

export interface SaveValidatedQueryOutput {
  saved: boolean;
  id?: string;
  reason?: 'dry_run_failed' | 'duplicate';
  existingId?: string;
  code?: TenantQueryRefusalCode;
  error?: string;
}

export function createBqSaveValidatedQueryTool(ctx: ToolContext) {
  if (!ctx.clientId) {
    throw new Error(
      'createBqSaveValidatedQueryTool: clientId obrigatório em ToolContext (ADR-0006).',
    );
  }
  const clientId = ctx.clientId;
  const personaId = ctx.personaId ?? null;

  const repo = createRepository();
  // Datasets vinculados ao cliente, lidos do Firestore no servidor (ADR-0006).
  const scope = lazyClientQueryScope({ clientId, dataset: ctx.dataset });

  return tool({
    description:
      'Sugere SQL bem-sucedido para o catálogo curado. Requer aprovação humana via UI admin (gate ADR-0009).',
    inputSchema: InputSchema,
    needsApproval: true,
    execute: async ({ intent, sql, tags, schemaSnapshot }): Promise<SaveValidatedQueryOutput> => {
      // 1. Pré-validação: um SELECT só, dentro dos datasets do cliente.
      const check = await checkTenantQuery(sql, scope);
      if (!check.ok) {
        return {
          saved: false,
          reason: 'dry_run_failed',
          code: check.code,
          error: check.error,
        };
      }

      // 2. Dedup by canonical hash, scoped by clientId.
      const sqlHash = canonicalSqlHash(sql);
      const existing = await repo.findByHash({ sqlHash, clientId });
      if (existing) {
        return {
          saved: false,
          reason: 'duplicate',
          existingId: existing.id,
        };
      }

      // 3. Insert draft (clientId/personaId server-bound).
      const inserted = await repo.insertDraft({
        intent,
        sql,
        clientId,
        personaId,
        schemaSnapshot,
        tags: tags ?? null,
      });
      return { saved: true, id: inserted.id };
    },
  });
}
