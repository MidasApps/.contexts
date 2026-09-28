/**
 * Sprint 3.C — Task 5
 *
 * Fire-and-forget helper que incrementa `use_count` em `liquid_meta.sql_catalog`
 * para a entrada cujo `sql_hash` (canônico) bate com o SQL executado com sucesso.
 *
 * Uso esperado: chamado a partir de `execute-sql.ts` após execução BigQuery
 * bem-sucedida. Falhas são engolidas — métrica de uso é best-effort e jamais
 * deve afetar o caminho do agente.
 */
import { createRepository } from './repository';

export interface IncrementCatalogUseInput {
  sqlHash: string;
  clientId: string;
}

export async function incrementCatalogUse(input: IncrementCatalogUseInput): Promise<void> {
  if (!input.clientId || !input.sqlHash) return;
  try {
    const repo = createRepository();
    await repo.incrementUse({ sqlHash: input.sqlHash, clientId: input.clientId });
  } catch {
    // Swallow — best-effort telemetry.
  }
}
