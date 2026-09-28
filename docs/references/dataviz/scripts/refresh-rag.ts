#!/usr/bin/env tsx
// Operational job; guarded until it is scheduled. When wiring it to a scheduler against dataviz, pass --allow-prod.
/**
 * Cron mensal de refresh do RAG (Sprint 2.A Task 11).
 *
 * `ingest-rag` já é incremental via hash diff — refresh apenas re-invoca.
 * Cloud Scheduler sugerido: `0 3 1 * *` (mensal, 03h UTC dia 1).
 *
 * Sprint 2.B abrirá uma fase paralela para revalidar schemas BQ via
 * INFORMATION_SCHEMA diff (TODO no fim da função).
 *
 * Uso: RAG_CLIENT_ID=<id> [RAG_KB_ID=<id>] pnpm rag:refresh [--allow-prod]
 * `RAG_KB_ID` é a base de conhecimento dos trechos (padrão `default`).
 * Every run counts as a write; on `dataviz` it needs `--allow-prod`.
 */
import { assertRagWriteAllowed, ingestDocs, DEFAULT_KNOWLEDGE_BASE_ID } from './ingest-rag';

async function main() {
  const docsDir = process.env.RAG_DOCS_DIR ?? 'docs/benchmarking';
  // Mesmo motivo do ingest: sem default de tenant.
  const clientId = process.env.RAG_CLIENT_ID;
  if (!clientId) {
    console.error('RAG_CLIENT_ID é obrigatório (id do cliente cadastrado).');
    process.exit(1);
  }
  const t0 = Date.now();
  const knowledgeBaseId = process.env.RAG_KB_ID?.trim() || DEFAULT_KNOWLEDGE_BASE_ID;
  await ingestDocs({ docsDir, clientId, knowledgeBaseId });
  // TODO Sprint 2.B: revalidar schemas BQ via INFORMATION_SCHEMA diff.
  console.log(
    JSON.stringify({
      component: 'rag-refresh',
      event: 'done',
      durationMs: Date.now() - t0,
    }),
  );
}

if (require.main === module) {
  assertRagWriteAllowed('rag:refresh');
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
