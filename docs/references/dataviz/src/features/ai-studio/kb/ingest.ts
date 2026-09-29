import 'server-only';
import { chunkMarkdown } from '@/shared/lib/rag/chunker';
import { scrubPii } from '@/shared/lib/rag/pii-scrubber';
import { embedTexts } from '@/shared/lib/rag/embeddings';
import { extractText, extFromFilename } from './extract';
import { upsertKbChunks, pruneKbChunks, type KbChunkInput } from './kb-upsert';
import { upsertSource, recomputeKbCounters, sourceDocId, type KbSourceRecord, getSource } from './sources-repo';

const EMBEDDING_MODEL = process.env.RAG_EMBEDDING_MODEL ?? 'gemini-embedding-001';

type Db = FirebaseFirestore.Firestore;

export interface IngestInput {
  kb: { id: string; clientId: string | null };
  filename: string;
  mimeType: string;
  bytes: Buffer;
  uploadedBy?: string;
}

export async function ingestKbFile(input: IngestInput, db?: Db): Promise<KbSourceRecord> {
  const ext = extFromFilename(input.filename);
  if (!ext) throw new Error(`Formato não suportado: ${input.filename} (use .md, .txt ou .pdf)`);

  const sdId = sourceDocId(input.kb.id, input.filename);

  // marca processing
  await upsertSource({
    knowledgeBaseId: input.kb.id, filename: input.filename, mimeType: input.mimeType,
    sizeBytes: input.bytes.length, status: 'processing', uploadedBy: input.uploadedBy,
  }, db);

  try {
    const text = await extractText(input.bytes, ext);
    const chunks = chunkMarkdown(text);
    const scrubbed = chunks.map((c) => scrubPii(c.text));
    const embeddings = scrubbed.length > 0 ? await embedTexts(scrubbed) : [];

    const kbChunks: KbChunkInput[] = embeddings.map((embedding, i) => ({
      knowledgeBaseId: input.kb.id,
      sourceDocId: sdId,
      chunkIndex: i,
      content: scrubbed[i] ?? '',
      embedding,
      embeddingModel: EMBEDDING_MODEL,
      clientId: input.kb.clientId,
      metadata: { ...(chunks[i]?.metadata ?? {}), filename: input.filename },
    }));

    await upsertKbChunks(kbChunks, db);
    await pruneKbChunks(input.kb.id, sdId, kbChunks.length, db); // remove órfãos de re-upload menor

    await upsertSource({
      knowledgeBaseId: input.kb.id, filename: input.filename, mimeType: input.mimeType,
      sizeBytes: input.bytes.length, status: 'ready', chunkCount: kbChunks.length, uploadedBy: input.uploadedBy,
    }, db);
    await recomputeKbCounters(input.kb.id, db);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha na ingestão';
    await upsertSource({
      knowledgeBaseId: input.kb.id, filename: input.filename, mimeType: input.mimeType,
      sizeBytes: input.bytes.length, status: 'error', error: message, uploadedBy: input.uploadedBy,
    }, db);
    await recomputeKbCounters(input.kb.id, db);
  }

  const result = await getSource(sdId, db);
  if (!result) throw new Error('Source doc não encontrado após ingestão');
  return result;
}
