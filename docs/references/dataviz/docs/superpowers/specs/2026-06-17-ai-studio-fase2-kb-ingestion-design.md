# AI Studio — Fase 2: Knowledge Base Upload & RAG Escopado

**Date:** 2026-06-17
**Status:** Draft
**Fase de:** `docs/superpowers/specs/2026-06-17-ai-studio-agents-skills-kb-workflows-design.md` (spec da plataforma)
**Depende de:** Fase 0 + início Fase 1 (PR #10 — coleções, `AiStudioRepo`, KB schema, descriptive agent atrás de flag)
**Relacionado:** ADR-0016 (AI Studio — implementa o que a ADR já decidiu; **não gera ADR nova**), ADR-0013 (Firestore), ADR-0011 (PII scrub), ADR-0005 (embedding Vertex), ADR-0006 (multi-tenancy), ADR-0012 (reranking).

## Goal

Permitir que o administrador **suba documentos** (mercado, produto, negócio) numa Knowledge Base pela UI da admin, e fechar o loop até o agente **consultar esses documentos no chat** — com RAG escopado por KB e por cliente, atrás de feature flag, sem regressão.

Ao fim da Fase 2:

1. O admin abre uma KB no AI Studio, sobe um `.md`/`.txt`/`.pdf`, e o doc é extraído → chunked → PII-scrubbed → embeddado → gravado, com status visível (pending→processing→ready/error).
2. Com a flag `useAiStudioKb` ligada, o agente `descriptive` passa a recuperar trechos **apenas** das KBs que ele referencia (`knowledgeBaseRefs ∩ {globais ∪ cliente ativo}`) ao responder no chat.
3. O corpus legado de `embeddingsDocs` é migrado para a KB de sistema `default`, preservando o comportamento de busca atual.

## Problem

A Fase 0/1 criou as KBs como entidades CRUD (metadados) e o agente lendo config do Firestore, mas:

- **Não há upload pela UI** — o RAG só é alimentado por `scripts/ingest-rag.ts`. O pedido original é subir docs de conhecimento pela admin.
- **O `upsertDoc` existente não serve para KBs**: exige `clientId` não-vazio (lança se falsy) e chaveia o id do chunk em `sha256(clientId:sourcePath:chunkIndex)` — incompatível com KB global (`clientId=null`).
- **Não há filtro por KB no retrieval** — `queryDocs` filtra por `clientId`/`product`/`persona`/`docType`, não por KB.
- **Não há extração de PDF nem parsing de multipart** no projeto hoje.
- **A tool de retrieval do agente** não está vinculada às `knowledgeBaseRefs`.

## Decisões (do brainstorming)

1. **Escopo:** Fase 2 fecha o loop — ingestão + retrieval escopado + wiring no agente descriptive.
2. **Execução da ingestão:** **síncrona inline** no POST de upload (status final na resposta); sem fila de jobs. Teto **10 MB/arquivo**.
3. **Formatos MVP:** `.md`, `.txt`, `.pdf` (via `pdf-parse`, só texto; PDF sem texto extraível → erro claro). Sem `.docx`/OCR/tabelas.
4. **KB como namespace:** chunks em `embeddingsDocs` taggeados com `knowledgeBaseId`+`sourceDocId`; id do chunk = `sha256(knowledgeBaseId:sourceDocId:chunkIndex)`. Tenancy resolvida pela **visibilidade da KB**, não por clientId no chunk.
5. **Retrieval:** novo `queryKbDocs` ao lado do `queryDocs` legado (não tocar no chat atual); `vectorSearch` ganha suporte a filtro `in`.
6. **Wiring:** tool de retrieval KB-scoped injetada no agente **atrás da flag `useAiStudioKb`**, com fallback ao `vector-query` legado quando off. Zero regressão.
7. **Re-upload por filename substitui** (id determinístico). **Delete de doc** remove seus chunks.

## Reaproveitamento (intocado)

Reusados sem alteração: `chunkMarkdown` (`src/shared/lib/rag/chunker.ts`), `scrubPii` (`pii-scrubber.ts`), `embedTexts` (`embeddings.ts`), `rerank` (`reranker.ts`), `vectorSearch` (só **estendido** com `in`), `hashId`/`contentHash` (`hash.ts`/`pii-scrubber.ts`). O `upsertDoc`/`queryDocs`/`vector-query` legados **não são alterados**.

## Data Model

### Nova coleção `knowledgeBaseSources/{id}`

1 doc por arquivo enviado. Usa o schema **já existente** `KnowledgeBaseSourceDoc` (`src/shared/schemas/ai-studio/knowledge-base-doc.ts`):

```
id            = hashId(`${knowledgeBaseId}:${filename}`)   // re-upload do mesmo nome substitui
knowledgeBaseId, filename, mimeType, sizeBytes,
status: 'pending'|'processing'|'ready'|'error',
chunkCount, error?, uploadedBy,
createdAt, updatedAt                                       // server
```

### Extensão de `embeddingsDocs` (retrocompatível)

Chunks de KB ganham dois campos novos + `clientId` copiado da KB:

```
knowledgeBaseId: string          // a qual KB o chunk pertence
sourceDocId: string              // qual knowledgeBaseSources originou
clientId: string | null          // copiado da KB (null = global) — defense-in-depth
// + os campos já existentes: content, contentHash, embedding, embeddingModel, metadata, createdAt
```

Chunk id determinístico = `sha256(${knowledgeBaseId}:${sourceDocId}:${chunkIndex})`. Re-upload reescreve os mesmos ids (idempotente); chunks órfãos de um re-upload menor (chunkIndex ≥ novo total) são removidos.

> Chunks legados (sem `knowledgeBaseId`) seguem válidos; são migrados para `knowledgeBaseId='default'` (ver §Migração). O `queryDocs` legado, que não filtra por KB, continua enxergando-os como hoje.

### Contadores da KB

`docCount` = nº de `knowledgeBaseSources` com status `ready`; `chunkCount` = soma dos chunks. Atualizados ao concluir cada ingestão/delete (recomputados a partir dos source docs para evitar drift).

## Componentes

```
src/features/ai-studio/kb/
  extract.ts          // extractText(buffer, mimeType/ext) → string  (.md/.txt passthrough; .pdf via pdf-parse)
  ingest.ts           // ingestKbFile({ kb, filename, mimeType, bytes, uploadedBy }) → KnowledgeBaseSourceDoc
  kb-upsert.ts        // upsertKbChunk(...) + deleteKbDocChunks(sourceDocId)  (KB-scoped, id por knowledgeBaseId)
  query-kb.ts         // queryKbDocs({ embedding, topK, knowledgeBaseIds }) + resolveVisibleKbs(agent, clientId)
  sources-repo.ts     // CRUD de knowledgeBaseSources + recompute de contadores
src/features/ai-studio/runtime/
  kb-retrieval-tool.ts // tool injetada no agente atrás de useAiStudioKb (embed → queryKbDocs(visíveis) → rerank)
src/shared/lib/firestore/
  vector-search.ts     // ESTENDIDO: filtro `in` além de `==`
app/api/ai-studio/kb/[id]/docs/
  route.ts             // GET (lista) / POST (upload multipart, síncrono) / DELETE (?docId=)
src/features/ai-studio/admin/ui/
  KnowledgeBasesTab.tsx // seção "Documentos" no form de KB existente
  KbDocUploader.tsx     // dropzone + validação client-side
  KbDocList.tsx         // lista de docs + status + excluir/reenviar
scripts/
  migrate-embeddings-to-kb.ts  // chunks sem knowledgeBaseId → 'default'  (pnpm migrate:embeddings-kb)
```

## Data Flow

### Upload (síncrono inline)
```
POST /api/ai-studio/kb/[id]/docs (multipart)  [requireAdmin, nodejs]
  → valida: KB existe; ext ∈ {md,txt,pdf}; sizeBytes ≤ 10MB         (senão 400)
  → sources-repo.upsert(status:'processing')
  → extract.extractText(bytes, ext)                                  (.pdf sem texto → throw → status:'error')
  → chunkMarkdown(text) → scrubPii(chunk) por chunk → embedTexts(chunks)
  → kb-upsert.upsertKbChunk por chunk (id por knowledgeBaseId:sourceDocId:idx)
  → remove chunks órfãos (idx ≥ novo total)
  → sources-repo.upsert(status:'ready', chunkCount) + recompute contadores da KB
  → 200 { data: sourceDoc }     // status final na resposta
```

### Retrieval no chat (atrás de `useAiStudioKb`)
```
agente descriptive (flag on)
  → kb-retrieval-tool: embed(query)
     → resolveVisibleKbs(agent.knowledgeBaseRefs, clientIdAtivo)
        = refs ∩ { KB.clientId=null (global) ∪ KB.clientId=clienteAtivo }
     → queryKbDocs({ embedding, topK=RAG_TOPK_RETRIEVE, knowledgeBaseIds (in, lotes de 30) })
     → rerank(query, hits, RAG_TOPK_RERANK)
     → trechos { content, sourcePath/filename, similarity }
  (flag off) → vector-query legado, inalterado
```

## Error handling

- **Validação de upload (fail-loud):** ext inválida ou > 10MB → **400** com mensagem clara (erro do usuário).
- **Extração/embed por-doc (fail-soft):** falha em um doc → `status:'error'` + `error` nele; outros docs/uploads seguem. Nunca lança 500 genérico que perca o estado.
- **PDF sem texto extraível:** `status:'error'`, mensagem "PDF sem texto extraível (escaneado/imagem não suportado)".
- **Tenancy (fail-closed):** `resolveVisibleKbs` só inclui KBs globais ∪ do cliente ativo; uma `knowledgeBaseRef` para KB de outro cliente é **silenciosamente excluída** da busca (não vaza), e logada como aviso.
- **Flag off (fail-soft):** retrieval legado intacto; KB upload ainda funciona (ingestão não depende da flag — a flag só governa o consumo no agente).
- **`in` > 30 KBs:** particiona em lotes de 30, une e re-ordena por similaridade; loga o nº de lotes (sem cap silencioso).

## Testing

- **extract.ts:** unit — `.md`/`.txt` passthrough; `.pdf` com texto → string; `.pdf` sem texto → erro.
- **kb-upsert.ts:** unit (fake Firestore) — id determinístico por `knowledgeBaseId:sourceDocId:chunkIndex`; re-upload reescreve mesmos ids; re-upload menor remove órfãos; `deleteKbDocChunks` remove só os do `sourceDocId`.
- **vectorSearch `in`:** unit — filtro `in` retorna só docs com `knowledgeBaseId` no conjunto; coexiste com `==`.
- **query-kb / resolveVisibleKbs:** unit — global ∪ cliente ativo; exclui KB de outro cliente; partição > 30; KB inexistente ignorada.
- **kb-retrieval-tool:** unit — flag off → não chamado/legado; flag on → busca só nas KBs visíveis.
- **route (multipart):** integração — upload md→ready+chunks; ext inválida→400; >10MB→400; delete remove chunks + decrementa contadores; GET lista status.
- **migração:** unit — chunk sem `knowledgeBaseId` → `'default'`; idempotente (2ª passada não duplica/realtera).
- **Não-regressão:** `vector-query`/`queryDocs` legado e o chat com flag off inalterados; suíte AI Studio existente verde.

## Migração

`scripts/migrate-embeddings-to-kb.ts` (`pnpm migrate:embeddings-kb`): para cada doc em `embeddingsDocs` sem `knowledgeBaseId`, set `knowledgeBaseId='default'` (preserva `clientId`). A KB `default` (seed Fase 0) passa a ser o lar do corpus legado. Idempotente. Operacional (roda no dev/prod com ADC — atenção ao pitfall de `GOOGLE_APPLICATION_CREDENTIALS` global).

## Dependência nova

`pdf-parse` (extração de texto de PDF). Única adição ao `package.json`. Instalada via pnpm.

## Out of scope (YAGNI)

- OCR, tabelas e imagens de PDF (só texto corrido).
- `.docx` e outros formatos.
- Fila de jobs / processamento background real (decidido: síncrono inline).
- Reindexação em massa ao trocar `embeddingModel` de uma KB.
- Quota por-KB ou por-tenant além do teto de 10 MB/arquivo.
- Alterar `upsertDoc`/`queryDocs`/`vector-query` legados ou o pipeline de `scripts/ingest-rag.ts`.
- Wiring de KB em agentes além do `descriptive` (os outros entram quando forem migrados ao runtime data-driven).

## Open questions

- Nenhuma bloqueante. `pdf-parse` vs `pdfjs-dist`: escolhido `pdf-parse` por ser mais leve para extração de texto puro; se a instalação/manutenção falhar, `pdfjs-dist` é o fallback (decisão de implementação, não de design).
