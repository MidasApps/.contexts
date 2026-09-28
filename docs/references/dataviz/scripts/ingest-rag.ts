#!/usr/bin/env tsx
// Operational job; guarded until it is scheduled. When wiring it to a scheduler against dataviz, pass --allow-prod.
/**
 * RAG ingest pipeline (Sprint 2.A Task 9).
 *
 * - Walks `docsDir` recursively, picks `.md`.
 * - chunkMarkdown -> scrubPii -> contentHash.
 * - Skips chunks whose hash matches `getExistingHashes(sourcePath)`.
 * - embedTexts in batch + extractChunkMetadata per chunk.
 * - upsertDoc per chunk with full metadata.
 *
 * Idempotent: re-running with no doc changes inserts 0 rows.
 *
 * Uso: RAG_CLIENT_ID=<id> pnpm rag:ingest [docsDir] [--kb=<id>] [--allow-prod]
 * `--kb` é a base de conhecimento dos trechos (padrão `default`); precisa
 * existir em `knowledgeBases`, senão nada é gravado.
 * Every CLI run counts as a write; on `dataviz` it needs `--allow-prod`.
 *
 * `rag-service` is imported lazily: it pulls in `firebase/admin`, which
 * initialises the Admin app on import. Importing this module (refresh-rag,
 * tests) stays side-effect-free, and the CLI guard runs before any init.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { chunkMarkdown } from '@/shared/lib/rag/chunker';
import { contentHash } from '@/shared/lib/rag/hash';
import { scrubPii } from '@/shared/lib/rag/pii-scrubber';
import { embedTexts } from '@/shared/lib/rag/embeddings';
import { extractChunkMetadata } from '@/shared/lib/rag/metadata-extractor';
import { DATAVIZ_DATABASE_ID } from '@/shared/lib/runtime-config';
import { assertSeedWriteAllowed } from './lib/production-guard.mjs';

function walkMd(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walkMd(p));
    else if (entry.endsWith('.md')) out.push(p);
  }
  return out;
}

export interface IngestDocsArgs {
  docsDir: string;
  clientId: string;
  /** Knowledge base of the chunks; without it the assistant never finds them. */
  knowledgeBaseId: string;
}

export const DEFAULT_KNOWLEDGE_BASE_ID = 'default';

/** `--kb=<id>` from the command line, or the default base. */
export const knowledgeBaseIdFromArgs = (argv: readonly string[]): string => {
  const arg = argv.find((a) => a.startsWith('--kb='));
  const id = arg?.slice('--kb='.length).trim();
  return id || DEFAULT_KNOWLEDGE_BASE_ID;
};

export async function ingestDocs(opts: IngestDocsArgs): Promise<void> {
  const { upsertDoc, getExistingHashes, knowledgeBaseExists } = await import('@/shared/lib/rag/rag-service');
  // A missing base would store the chunks under a base no agent lists, just as
  // invisible. Refuse before spending any embedding call.
  if (!(await knowledgeBaseExists(opts.knowledgeBaseId))) {
    throw new Error(`Base de conhecimento "${opts.knowledgeBaseId}" não existe em knowledgeBases. Crie-a na tela de Knowledge Bases ou passe --kb=<id>.`);
  }
  const t0 = Date.now();
  const files = walkMd(opts.docsDir);
  const model = process.env.RAG_EMBEDDING_MODEL ?? 'gemini-embedding-001';
  let inserted = 0;
  let skipped = 0;
  for (const file of files) {
    const raw = readFileSync(file, 'utf8');
    const chunks = chunkMarkdown(raw);
    const existing = await getExistingHashes(file);
    const newOnes: {
      idx: number;
      text: string;
      hash: string;
      metadata: Record<string, unknown>;
    }[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const scrubbed = scrubPii(chunks[i]!.text);
      const h = contentHash(scrubbed);
      if (existing.get(i) === h) {
        skipped++;
        continue;
      }
      newOnes.push({ idx: i, text: scrubbed, hash: h, metadata: chunks[i]!.metadata });
    }
    if (newOnes.length === 0) continue;
    const embeddings = await embedTexts(newOnes.map((n) => n.text));
    for (let k = 0; k < newOnes.length; k++) {
      const n = newOnes[k]!;
      const md = await extractChunkMetadata(n.text, { sourcePath: file });
      await upsertDoc({
        knowledgeBaseId: opts.knowledgeBaseId,
        sourcePath: file,
        chunkIndex: n.idx,
        content: n.text,
        contentHash: n.hash,
        embedding: embeddings[k]!,
        embeddingModel: model,
        clientId: opts.clientId,
        docType: md.docType,
        product: md.product,
        persona: md.persona,
        regulatoryArea: md.regulatoryArea,
        metadata: n.metadata,
      });
      inserted++;
    }
  }
  console.log(
    JSON.stringify({
      component: 'rag-ingest',
      event: 'docs.done',
      files: files.length,
      inserted,
      skipped,
      durationMs: Date.now() - t0,
    }),
  );
}

/**
 * Guard for the CLI entries of this job and of refresh-rag. Every run writes,
 * so the guard sees it as `--apply`.
 */
export function assertRagWriteAllowed(label: string): void {
  assertSeedWriteAllowed({ databaseId: DATAVIZ_DATABASE_ID, argv: [...process.argv, '--apply'], label });
}

if (require.main === module) {
  assertRagWriteAllowed('rag:ingest');
  const docsDir = process.argv.slice(2).find((arg) => !arg.startsWith('--')) ?? 'docs/benchmarking';
  const knowledgeBaseId = knowledgeBaseIdFromArgs(process.argv);
  // Sem default de tenant: ingerir a base de conhecimento no cliente errado é
  // silencioso — o RAG passa a responder com o contexto de outro.
  const clientId = process.env.RAG_CLIENT_ID;
  if (!clientId) {
    console.error('RAG_CLIENT_ID é obrigatório (id do cliente cadastrado).');
    process.exit(1);
  }
  ingestDocs({ docsDir, clientId, knowledgeBaseId }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
