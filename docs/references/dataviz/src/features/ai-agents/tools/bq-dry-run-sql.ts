import { tool } from 'ai';
import { z } from 'zod';
import { maxBytesBilled } from '@/shared/lib/bigquery/cost-guard';
import { checkTenantQuery, type PredictedField, type TenantQueryRefusalCode } from '@/features/ai-agents/lib/tenant-query';
import { lazyClientQueryScope } from '@/features/ai-agents/lib/client-query-scope';
import type { ToolContext } from './tool-context';

/**
 * `dry_run_sql`: diz ao modelo se a query DELE compila e quanto ela custa.
 *
 * Passa pela mesma porta do `execute_sql` (`checkTenantQuery`): guarda de
 * texto, dry-run com o dataset da rota como padrão, `statementType === SELECT`
 * e escopo dos datasets do cliente. Antes, era uma regex no texto cru e um
 * dry-run de qualquer coisa — e o dry-run é um oráculo: o schema previsto e os
 * bytes de `SELECT * FROM outro_tenant.tabela`, e a mensagem crua do BigQuery
 * ("Not found: Table <projeto>:outro.x"), diziam o que existe em outro cliente
 * e qual é o id do projeto.
 *
 * O que o modelo vê numa recusa é o código estável e a mensagem genérica de
 * `checkTenantQuery`; schema e bytes só saem para query dentro do escopo.
 */

export type DryRunErrorClass = 'syntax' | 'reference' | 'forbidden' | 'unknown';

export interface DryRunSuccess {
  valid: true;
  schema: PredictedField[];
  bytesProcessed: number;
  statementType: 'SELECT';
  /** A estimativa passa do teto de bytes: o `execute_sql` seria recusado pelo BigQuery. */
  exceedsByteCap: boolean;
}

export interface DryRunFailure {
  valid: false;
  code: TenantQueryRefusalCode;
  error: string;
  errorClass: DryRunErrorClass;
}

export type DryRunResult = DryRunSuccess | DryRunFailure;

/** Classe legada, derivada do código estável — nunca do texto do BigQuery. */
function errorClassOf(code: TenantQueryRefusalCode): DryRunErrorClass {
  switch (code) {
    case 'SQL_RECUSADO':
    case 'NAO_E_SELECT':
      return 'forbidden';
    case 'FORA_DO_TENANT':
      return 'reference';
    case 'DRY_RUN_FALHOU':
      return 'syntax'; // só erro de sintaxe mantém o código DRY_RUN_FALHOU
  }
}

const InputSchema = z.object({ sql: z.string().min(1) }).strict();

export function createBqDryRunSqlTool(ctx: ToolContext) {
  // Datasets vinculados ao cliente, lidos do Firestore no servidor (ADR-0006).
  const scope = lazyClientQueryScope({ clientId: ctx.clientId, dataset: ctx.dataset });
  return tool({
    description:
      'Valida SQL no BigQuery via dry-run (custo zero), com as mesmas regras do execute_sql: um único SELECT '
      + 'sobre as tabelas do cliente. Retorna schema previsto e bytes a processar. SEMPRE chame antes de execute_sql.',
    inputSchema: InputSchema,
    execute: async ({ sql }): Promise<DryRunResult> => {
      const check = await checkTenantQuery(sql, scope);
      if (!check.ok) {
        return { valid: false, code: check.code, error: check.error, errorClass: errorClassOf(check.code) };
      }
      return {
        valid: true,
        schema: check.schema,
        bytesProcessed: check.bytes,
        statementType: 'SELECT',
        exceedsByteCap: check.bytes > maxBytesBilled(),
      };
    },
  });
}
