import { loadBusinessContext } from '@/shared/config/business-context';
import { getMacroSnapshot } from '@/shared/lib/macro/bcb-sgs';
import { embedTexts } from '@/shared/lib/rag/embeddings';
import { queryDocs } from '@/shared/lib/rag/rag-service';
import { rerank } from '@/shared/lib/rag/reranker';
import { GLOSSARY_VERSION } from '@/shared/config/glossary';
import { selectTemplate } from './select-template';
import { retrievePersonaThemes } from './retrieve-persona-themes';
import { hashKey, getCached, setCached } from './cache';
import { sanitizeWorkingMemory } from './pii-guard';
import { recordTelemetry } from './telemetry';
import type { BusinessContext, RetrievedChunk } from './types';

export interface RetrieveArgs {
  clientId: string;
  personaId: string;
  icpId?: string | null;
  briefing: string;
  workingMemory?: unknown;
  signal?: AbortSignal;
}

const TOPK_RETRIEVE = 20;
const TOPK_RERANK = 5;

export async function retrieveBusinessContext(
  args: RetrieveArgs,
): Promise<BusinessContext> {
  const t0 = performance.now();
  const key = hashKey({
    clientId: args.clientId,
    personaId: args.personaId,
    briefing: args.briefing,
  });
  const cached = getCached(key);
  if (cached) {
    const latencyMs = performance.now() - t0;
    recordTelemetry({
      clientId: args.clientId,
      personaId: args.personaId,
      latencyMs,
      cacheHit: true,
      source: cached.retrievalMeta.source,
      k: cached.retrieved.length,
      ok: true,
    });
    return {
      ...cached,
      retrievalMeta: { ...cached.retrievalMeta, cacheHit: true, latencyMs },
    };
  }

  let staticCtx: Record<string, unknown> = {};
  try {
    // Perfil do cliente vem do Firestore (administração); persona e ICP seguem
    // sendo catálogo estático de produto.
    const { getClientBusinessProfile } = await import(
      '@/shared/repositories/client-business-profile'
    );
    staticCtx = loadBusinessContext({
      clientProfile: await getClientBusinessProfile(args.clientId),
      personaId: args.personaId,
      icpId: args.icpId ?? null,
    }) as unknown as Record<string, unknown>;
  } catch {
    staticCtx = {};
  }

  const themes = retrievePersonaThemes(args.personaId);

  const ragPromise = (async (): Promise<RetrievedChunk[]> => {
    const [embedding] = await embedTexts([args.briefing]);
    if (!embedding) return [];
    const candidates = await queryDocs({
      embedding,
      topK: TOPK_RETRIEVE,
      clientId: args.clientId,
    });
    const reranked = await rerank({
      query: args.briefing,
      candidates: candidates.map((c) => ({ ...c })),
      topN: TOPK_RERANK,
    });
    return reranked.map((c, i) => ({
      id: `chunk-${i}`,
      score: c.similarity,
      text: c.content,
      metadata: {
        clientId: args.clientId as never,
        sourceDoc: c.sourcePath,
        themes,
      },
    }));
  })();

  const [chunksResult, macroResult] = await Promise.allSettled([
    ragPromise,
    getMacroSnapshot(),
  ]);

  const retrieved = chunksResult.status === 'fulfilled' ? chunksResult.value : [];
  const macro = macroResult.status === 'fulfilled' ? macroResult.value : {};
  const source: 'rag' | 'fallback' | 'partial' =
    chunksResult.status === 'fulfilled' && macroResult.status === 'fulfilled'
      ? 'rag'
      : chunksResult.status === 'rejected' && macroResult.status === 'rejected'
        ? 'fallback'
        : 'partial';

  const template = selectTemplate({
    personaId: args.personaId,
    clientId: args.clientId,
  });
  const sanitizedMemory = args.workingMemory
    ? sanitizeWorkingMemory(args.workingMemory)
    : undefined;

  const ctx: BusinessContext = {
    static: { ...staticCtx, workingMemory: sanitizedMemory ?? null },
    retrieved,
    macro,
    template,
    glossaryVersion: GLOSSARY_VERSION,
    retrievalMeta: {
      latencyMs: performance.now() - t0,
      cacheHit: false,
      source,
    },
  };
  setCached(key, ctx);
  recordTelemetry({
    clientId: args.clientId,
    personaId: args.personaId,
    latencyMs: ctx.retrievalMeta.latencyMs,
    cacheHit: false,
    source,
    k: retrieved.length,
    ok: source !== 'fallback',
  });
  return ctx;
}
