# Plano: Memória, RAG e Vetorização para liquid-play-dataviz

**Data:** 2026-05-04
**Escopo:** Orchestrator analítico (`src/features/ai-agents/orchestrator.ts`) e Canvas Builder (`src/features/canvas-orchestrator/orchestrator.ts`).
**Stack alvo:** Next.js 16 + Vercel AI SDK v6 + Vertex Gemini, com primitives de Mastra (`@mastra/memory`, `@mastra/rag`, `@mastra/pg`) usadas como bibliotecas.

---

## 1. Diagnóstico

Hoje os dois orchestrators são **stateless**. O analítico expõe **10 tools** (8 sub-agentes + `generate_pdf` + `generate_csv`) e os sub-agentes consomem internamente ~44 tools concretas em `src/features/ai-agents/tools/`. O Canvas Builder roda **23 tools** com `stepCountIs(30)`. Limitações:

- Sem **working memory** por sessão: o builder não lembra cliente ativo, briefing, decisões de layout nem blocos já criados. Cada turno o LLM redescobre o contexto via histórico bruto compactado por `compactMessages`.
- Sem **memória longa**: SQLs validados, schemas BQ recorrentes, blocos reusáveis e dashboards anteriores não são recuperáveis. `query_data` regenera SQL do zero a cada pergunta similar.
- Sem **RAG**: 31 docs em `docs/benchmarking/` (MCMV, CRI/CRA, SBPE, LCI, SPE/RET, distratos, CVM 60, LTV/DSCR, PDD BACEN, Selic, INCC, SINAPI, ABRAINC/CBIC, Open Finance, personas, ICPs, Plano Empresário, etc.) são invisíveis ao agente. Glossário e personas idem. Resultado: respostas genéricas, sem ancoragem regulatória/de mercado.
- Sem **compartilhamento entre sub-agentes**: descriptive→diagnostic→predictive não passam findings; cada um reconsulta BQ.
- Sem **personalização por cliente** (OM/BRZ/CONX/IMCASA) ou por **persona** (originador, securitizadora, gestor de fundo).

---

## 2. Modelo de memória proposto

Três camadas, espelhando `Memory` de Mastra (`adrs/mastra/memory/memory-class.mdx`):

### 2.1 Working memory (curta, por sessão)

Estado estruturado por **thread de builder**, escopo `thread`. Schema Zod com **limites explícitos** para evitar inflar contexto:

```ts
{ clientId, personaId, icpId, productType, briefing, activeDashboardId,
  pages: z.array(...).max(10),
  blocks: z.array(...).max(40),
  decisions: z.array({ts,kind,rationale}).max(50),
  pendingQuestions: z.array(z.string()).max(10) }
```

`personaId` e `icpId` são consumidos pelo retrieval contextual do plano de personas (Plano 4 §3) e pelos scorers — fazem parte do shape canônico desde a Fase 1.

Mapeamento Mastra: `workingMemory: { enabled: true, schema, scope: 'thread' }` (memory-class.mdx:97-104). A atualização é feita pelo agente chamando a tool **`updateWorkingMemory`** (memory-class.mdx:84) — não existe método imperativo `memory.update(...)`. Política de eviction: arrays caparam por tamanho, `decisions` e `pendingQuestions` por idade (LRU em janela de 24h).

### 2.2 Semantic recall (longa, por resource)

Resource = `${clientId}:${userId}`. `semanticRecall: { topK: 5, messageRange: {before:1,after:2}, scope: 'resource' }` (recall.mdx:26-46). Casos: "Qual SQL usei pra inadimplência por safra mês passado?", "Reusar bloco de curva-S que fiz pra OM".

### 2.3 Memória compartilhada entre sub-agentes

`readOnly` é flag **global** de `MemoryConfig` (memory-class.mdx:81-87), não parâmetro per-call. Implicação: cada sub-agente precisa de **sua própria instância `Memory`** com `readOnly: true`, apontando para o mesmo storage que o orchestrator escreve, OU isolamento manual por convenção (sub-agente nunca chama `updateWorkingMemory`).

Fluxo:
1. `descriptive_agent` retorna `{summary, anomalies}` → orchestrator chama `updateWorkingMemory` registrando `findings.descriptive`.
2. `diagnostic_agent` (instância `Memory` readOnly) lê o working memory no system prompt.
3. Evita reprocessar BQ.

Equivalente AI SDK v6 puro: `findings` propagado via `experimental_context` ou closure compartilhada do `streamText`.

### 2.4 Observational memory (fase 3, experimental)

`observationalMemory: { scope: 'resource', model: 'google/gemini-2.5-flash' }` (observational-memory.mdx:11-30). **Atenção:** `scope: 'resource'` é marcado como experimental em observational-memory.mdx:63 — adotar com feature flag.

---

## 3. RAG sobre docs/benchmarking + glossário + schemas BQ

### 3.1 Corpus

| Fonte | Volume | Estratégia |
|---|---|---|
| `docs/benchmarking/*.md` (31 docs) | ~800KB md | `strategy:'markdown'`, headers `[['#','title'],['##','section']]` + `extract:{summary,keywords}` (chunk.mdx:32-43) |
| `src/shared/config/glossary.ts` | termos curtos | `strategy:'json'`, 1 chunk por termo |
| Schemas BQ (`get_table_schema`) | ~50 tabelas | `strategy:'json'`, metadata `{client,dataset,table}` |
| SQLs validados (fase 3) | crescente | `strategy:'recursive'`, maxSize 1500, metadata `{client,intent,success:true}` |
| Blocos reusáveis (fase 3) | crescente | 1 chunk = 1 bloco-spec serializado |

### 3.2 Embedding model

**Vertex `gemini-embedding-001`** (3072d, multilíngue, alinhado com a conta GCP do BigQuery e Vertex Gemini). Via AI SDK: `embedMany({ model: vertex.textEmbeddingModel('gemini-embedding-001'), values })` (embeddings.mdx).

> Validar suporte exato no `@ai-sdk/google-vertex` da versão instalada antes da Fase 2. Alternativa: OpenAI `text-embedding-3-small` (1536d) caso Vertex não atenda em latência/qualidade.

### 3.3 Vector store

**pgvector em Cloud SQL Postgres**. Postgres serve dupla função: storage de threads/working memory **e** vector store. `PgVector` Mastra-compat (pg.mdx:11-13) com HNSW + dotproduct.

> A doc Mastra alterna entre `PgStore` (memory-class.mdx:182-189) e `PostgresStore` (pg.mdx:669-679). Confirmar nome do export real em `@mastra/pg` antes de codificar.

Schema lógico:
```
threads(id, resource_id, client_id, metadata jsonb)
messages(id, thread_id, role, parts jsonb, created_at)
working_memory(resource_id, scope, payload jsonb)
embeddings_docs(id, content, embedding vector(3072), metadata jsonb)
embeddings_sql(id, sql_text, embedding vector(3072), metadata jsonb)
```

### 3.4 Pipeline de ingestão

```ts
const doc = MDocument.fromMarkdown(content);
const chunks = await doc.chunk({ strategy: 'markdown', extract: { summary: true, keywords: true } });
const { embeddings } = await embedMany({
  model: vertex.textEmbeddingModel('gemini-embedding-001'),
  values: chunks.map(c => c.text),
});
await pgVector.upsert({
  indexName: 'docs_benchmarking',
  vectors: embeddings,
  metadata: chunks.map(c => ({ ...c.metadata, clientId, docType, product })),
});
```

### 3.5 Metadata filters & reranking

Sintaxe MongoDB-like (metadata-filters.mdx:14-31):
```ts
{ clientId: { $in: ['OM','BRZ'] }, docType: 'regulatory',
  product: { $in: ['MCMV','CRI'] }, persona: 'originador' }
```

Toda query RAG injeta `clientId` do request — isolamento multi-tenant é hard requirement. Rerank em duas fases: topK=20 → `rerank({semantic:0.6, vector:0.3, position:0.1})` → topK=5 (rerank.mdx:23-36). Para SQL/blocos validados, `semantic:0.8`.

### 3.6 Runtime Next.js 16 / Cloud SQL serverless

`@mastra/pg` usa `pg` (driver Node-only). Routes `/api/*` que tocarem memory/RAG **devem declarar** `export const runtime = 'nodejs'` (incompatível com Edge). Risco de cold start + esgotamento de connection pool em ambiente serverless: usar **Cloud SQL Auth Proxy** ou **Cloud SQL Node.js Connector** com pool externo (pgbouncer / Cloud SQL pgbouncer-sidecar) e configurar `max` conservador no `pg.Pool`.

### 3.7 Custo de embeddings

Estimativa inicial: 31 docs × ~30 chunks/doc + ~50 schemas BQ + glossário ≈ **~1500 embeddings**. Re-ingest mensal disparado por mudanças regulatórias. Dimensão impacta storage: 3072d em pgvector ≈ 12KB/vetor → ~18MB para o corpus inicial, viável. Custo Vertex `gemini-embedding-001` na ordem de centavos para ingest completo; reranking com Gemini Flash domina o OPEX recorrente.

### 3.8 TTL / invalidação de RAG

Docs regulatórios mudam (CVM 60, BACEN, Selic). Pipeline grava `contentHash` (sha256) em metadata; cron mensal reprocessa só arquivos com hash diferente. Schemas BQ revalidados semanalmente comparando `INFORMATION_SCHEMA`. SQLs validados expiram após 90 dias sem reuso.

### 3.9 Multi-tenancy + LGPD

- Filtro obrigatório `clientId` em **toda** query vector (enforced em `MemoryService`, não em chamada).
- PII scrubbing antes de embedar SQLs: regex para CPF/CNPJ, IDs de mutuário, e-mail; substituir por placeholder.
- Retention de working memory: 30 dias por padrão, purga automática via job.
- Working memory e embeddings em rows com `client_id` indexado; row-level security opcional no Postgres.

---

## 4. Compartilhamento entre sub-agentes

Padrão recomendado: **supervisor com working memory compartilhada** (não `Agent.network`, deprecated em network.mdx:14-17).

Fluxo:
1. Orchestrator cria/retoma thread (`memory.createThread({resourceId, metadata:{clientId}})`, createThread.mdx:14).
2. Sub-agentes recebem `thread`/`resource` em `toolCallOptions` e usam instância `Memory` com `readOnly: true`.
3. Cada sub-agente expõe seu output como tool-result; orchestrator chama `updateWorkingMemory` consolidando.
4. `stepCountIs` + `experimental_prepareStep` garantem propagação sem reembedding.

No Canvas Builder: `plan_analysis` escreve `pages[]`; `add_*_block` lê plano e atualiza `blocks[]`; `fill_block` recupera schema do bloco da working memory.

---

## 5. Plano de adoção em 3 fases

### Fase 1 — Working memory + persistência (≤2 semanas)

- Provisionar Cloud SQL Postgres (dev + prod) + extensão `pgvector` + Cloud SQL Auth Proxy.
- Criar tabelas `threads`, `messages`, `working_memory`.
- `MemoryService` em `src/shared/lib/memory/` espelhando interface mínima Mastra (`createThread`, `recall`, tool `updateWorkingMemory`).
- Integrar nos dois orchestrators; front passa `threadId` no body do `/api/ai`. Garantir `runtime = 'nodejs'`.
- Schema Zod do working memory do Canvas Builder com limites de eviction.
- Métrica: redução de tokens de prompt ≥30% em sessões >3 turnos.

### Fase 2 — RAG sobre docs/benchmarking (≤2 semanas)

- Script `scripts/ingest-rag.ts`: `MDocument.fromMarkdown` → `chunk` → **`embedMany`** → `pgVector.upsert`.
- Metadata extractor classifica `docType`, `product`, `persona` via Gemini (extract-params.mdx).
- Hashing por arquivo para re-ingest incremental.
- Tool `vector_query({query, filters})` exposta nos dois orchestrators; topK=20 → rerank → topK=5.
- Glossário e schemas BQ no mesmo job.
- Métrica: respostas do diagnostic_agent citam fonte regulatória em ≥80% dos casos aplicáveis.

### Fase 3 — Semantic recall de SQLs/blocos + cross-agent memory (≤2 semanas)

- Após `query_data` bem-sucedido com PII scrub, persistir `{intent, sql, schemaSnapshot, clientId}` em `embeddings_sql`.
- Após bloco aceito no Canvas, persistir bloco-spec + descrição em `embeddings_blocks`.
- Tools `recall_similar_sql`, `recall_similar_block`.
- `semanticRecall: {scope:'resource', topK:5}` no analítico.
- Sub-agentes consumindo working memory readOnly via instância `Memory` própria.
- (Opcional, behind flag) `observationalMemory` com `scope:'resource'` (experimental).
- Métrica: cache hit de SQL ≥40%, redução de chamadas BQ redundantes.

---

## 6. Decisão: Mastra-as-lib vs Mastra-Agent

**Manter Vercel AI SDK v6 (`streamText`/`generateText`) como runtime dos orchestrators.** Importar `@mastra/rag` (`MDocument`, `chunk`, `rerank`, helpers de `embedMany`), `@mastra/pg` (`PgVector` + store) e `@mastra/memory` (`Memory` + `workingMemory` + tool `updateWorkingMemory`) **como bibliotecas**. Não migrar para `new Agent()` nem subir Mastra server — evita conflito com App Router, mantém integração nativa com `customProvider`/Vertex e preserva a arquitetura de tools atual.

| Critério | Mastra full | AI SDK + primitives |
|---|---|---|
| Lock-in | alto | baixo |
| Vertex / `customProvider` | precisa adapter | nativo |
| Memory/RAG out-of-the-box | sim | precisa wrapper fino |
| Server (Next.js routes) | conflita | nativo |
| Curva de adoção | reescrever 2 orchestrators | incremental |

Reavaliar adoção full em 6 meses se observability/workflows justificarem.

---

## Referências lidas

- `adrs/mastra/memory/memory-class.mdx` (constructor, semanticRecall, workingMemory, readOnly, PgStore exemplo)
- `adrs/mastra/memory/recall.mdx` (vectorSearchString, scope, pagination)
- `adrs/mastra/memory/createThread.mdx` (resourceId, metadata)
- `adrs/mastra/memory/observational-memory.mdx` (Observer/Reflector, scope resource experimental)
- `adrs/mastra/agents/getMemory.mdx`, `adrs/mastra/agents/network.mdx` (deprecated → supervisor)
- `adrs/mastra/rag/chunk.mdx` (markdown strategy, extract)
- `adrs/mastra/rag/embeddings.mdx` (embed/embedMany via AI SDK)
- `adrs/mastra/rag/metadata-filters.mdx` (sintaxe MongoDB)
- `adrs/mastra/rag/rerank.mdx` (weights semantic/vector/position)
- `adrs/mastra/vectors/pg.mdx` (PgVector connection, HNSW, PostgresStore)
