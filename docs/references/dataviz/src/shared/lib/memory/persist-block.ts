import { embedMany } from 'ai';
import { vertex } from '@ai-sdk/google-vertex';
import { upsertBlockEmbedding } from './recall-store';
import { scrubPii } from '@/shared/lib/rag/pii-scrubber';

export interface PersistBlockInput {
  clientId: string;
  blockType: 'kpi' | 'chart' | 'table';
  spec: Record<string, unknown>;
  description: string;
  templateId?: string;
  /** Métrica do cliente materializada deste bloco (G4); alimenta o dedup. */
  metricId?: string | null;
}

/**
 * Persiste spec de bloco aceito no Canvas para recall semântico.
 * Multi-tenancy fail-closed (ADR-0006). Best-effort: erros não bloqueiam.
 * `templateId`, quando presente, vincula esta entrada como variação de um
 * template canônico (versionamento de templates).
 */
export async function persistBlockSpec(input: PersistBlockInput): Promise<void> {
  if (!input.clientId) return; // ADR-0006
  try {
    // ADR-0011 §2: PII scrubbing é gate obrigatório antes de qualquer INSERT em
    // embeddings_* (mesmo gate de persistSqlGeneration). O `description` é o
    // intent NL do usuário e pode conter PII (CPF, nomes, etc.).
    const content = `${scrubPii(input.description)}\n\n${scrubPii(JSON.stringify(input.spec))}`;
    const { embeddings } = await embedMany({
      model: vertex.textEmbeddingModel('gemini-embedding-001'),
      values: [content],
    });
    await upsertBlockEmbedding({
      embedding: embeddings[0],
      clientId: input.clientId,
      blockType: input.blockType,
      content,
      blockSpec: input.spec,
      templateId: input.templateId ?? null,
      metricId: input.metricId ?? null,
    });
  } catch {
    // Best-effort: persistência de recall nunca bloqueia o Canvas.
  }
}
