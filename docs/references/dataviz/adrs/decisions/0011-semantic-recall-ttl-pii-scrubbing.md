---
id: 0011
title: Semantic recall — TTL 90d, PII scrubbing obrigatório, draft-as-hint, cross-agent readOnly
status: Accepted
date: 2026-05-04
deciders: [giulliano.soares]
consulted: [time-ai, time-data]
informed: [time-eng]
tags: [rag, memory, semantic-recall, lgpd, pii, ttl, multi-tenancy]
supersedes: []
related: [0004, 0006, 0009]
---

# ADR-0011 — Semantic recall: TTL 90d, PII scrubbing, draft-as-hint, cross-agent readOnly

## Status

`Accepted` — desde 2026-05-04.

Histórico:
- 2026-05-04 — proposta e aceita simultaneamente; promove a decisão arquitetural já
  implementada na spec `2026-05-04-sprint3-A-semantic-recall.md` para ADR canônica.
  Diferenciada de ADR-0009 (hierarquia de reuso) por focar em **disciplina de ciclo
  de vida e privacidade** das memórias semânticas, não na ordem de consulta.

## Contexto

Sprint 3.A (`docs/superpowers/specs/2026-05-04-sprint3-A-semantic-recall.md`)
introduz **memória semântica de longo prazo** sobre Cloud SQL + pgvector
(ADR-0004), via duas tabelas:

- `embeddings_sql` — `(intent, sql, schemaSnapshot, success, clientId,
  glossaryVersion, last_used_at)` populada após cada `query_data` bem-sucedido.
- `embeddings_blocks` — bloco-specs Canvas Builder bem-sucedidos
  `(blockType, query, dataShape, vizConfig, clientId, version)` para reuso entre
  sessões pelos sub-agentes.

Tools `recall_similar_sql` e `recall_similar_block` (em
`src/features/canvas-orchestrator/tools/recall-similar-block.ts`) consultam essas
tabelas via embedding cosine + `clientId` server-bound (ADR-0006).

Forças concretas levantadas no review da spec:

- **Vazamento PII em embeddings**: SQLs reais frequentemente carregam literais
  com CPF, CNPJ, e-mail e IDs de mutuário em filtros (`WHERE cpf = '...'`).
  Embedar texto cru implica **persistir PII tanto no `text_content` quanto no
  espaço vetorial** — vetores não são reversíveis, mas o texto associado é, e
  fica indexado e exportável. LGPD exige minimização.
- **Crescimento ilimitado**: embeddings sem TTL ⇒ storage cresce linearmente
  com uso, custo de pgvector index degrada (HNSW não tolera bem datasets
  >10M vetores), e drift de schema acumula recall de SQLs obsoletos que
  passariam dry_run mas geram resultados errados.
- **Draft como comando**: se `recall_similar_sql` retorna `{sql}` plano, o
  modelo tende a executar diretamente (path-of-least-resistance), enviesando
  geração e ignorando schema atual. Em multi-cliente com schemas divergentes
  (OM/BRZ/CONX/IMCASA), reuso cego é um vetor de regressão.
- **Sub-agentes como escritores**: o pipeline analítico
  `descriptive → diagnostic → predictive` (Sprint 1.B + 3.B) precisa **ler**
  memória semântica para reaproveitar, mas se qualquer sub-agente puder
  **escrever** em `embeddings_sql`/`embeddings_blocks` ou em
  `working_memory`, o contrato de "Orchestrator é único escritor"
  (Sprint 1.A) quebra e a ordem causal vira race condition.

A pergunta arquitetural: **qual é a disciplina de ciclo de vida, privacidade e
acesso para que `embeddings_sql` e `embeddings_blocks` sejam memória útil sem
virar passivo regulatório nem fonte de regressão silenciosa?**

## Decisão

**Adotamos quatro regras inegociáveis para semantic recall:**

### 1. TTL de 90 dias sem reuso, com cron de eviction diário

```
embeddings_sql:
  DELETE WHERE last_used_at < NOW() - INTERVAL '90 days';

embeddings_blocks:
  DELETE WHERE version != 'template'  -- templates originais nunca expiram
    AND last_used_at < NOW() - INTERVAL '90 days';
```

- Cron: `scripts/evict-recall.ts` agendado diário às 03:00 UTC via Cloud
  Scheduler → Cloud Run job (mesmo runtime de outros crons do projeto).
- `last_used_at` atualizado pelo hook em `query_data` quando hash do SQL final
  bate uma entrada de recall (mesmo hook de ADR-0009 para `useCount` no
  catálogo).
- **Versionamento de blocos**: bloco-spec original (template) tem
  `version='template'` e fica imune; variações geradas em sessão recebem
  `version='v{N}'` e estão sujeitas a TTL. Garante que o ponto de partida
  curado nunca seja deletado por desuso.
- 90 dias escolhido como balanço: trimestre fiscal cobre sazonalidade
  típica de relatórios de securitização; abaixo disso perde reuso entre
  fechamentos; acima disso, drift de schema e custo de storage saem do
  controle.

### 2. PII scrubbing obrigatório antes de embedar

- Função compartilhada `scrubPii(text: string): string` em
  `src/shared/lib/rag/pii-scrubber.ts` (criada na Sprint 2.A para ingest RAG;
  reutilizada aqui).
- Padrões mínimos: CPF (`\d{3}\.?\d{3}\.?\d{3}-?\d{2}`), CNPJ
  (`\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}`), e-mail (RFC-light),
  telefone BR, IDs numéricos suspeitos em literais SQL (`= '\d{6,}'`).
- Substituição por placeholders semânticos: `{{CPF}}`, `{{CNPJ}}`,
  `{{EMAIL}}`, `{{ID}}`. Mantém significado para embedding sem reter PII.
- **Gate obrigatório**: antes de qualquer `INSERT INTO embeddings_*`,
  `scrubPii` é chamado e o resultado é o que vai tanto para `text_content`
  quanto para o cálculo do embedding. Texto cru não toca disco.
- **Regression suite adversarial**: 30 fixtures em
  `src/shared/lib/rag/__tests__/pii-scrubber.fixtures.ts` cobrindo CPFs com e
  sem máscara, CNPJs em texto livre, e-mails com `+tag`, IDs em joins, etc.
  Roda em CI como gate; falha em qualquer fixture **bloqueia merge**.

### 3. Draft é hint, não comando

`recall_similar_sql` e `recall_similar_block` retornam:

```ts
{
  sql_draft: string,         // ou block_draft, com placeholders já scrubbed
  source: 'recall',
  confidence: number,        // similarity cosine 0..1
  schemaSnapshot: string,    // schema do momento da ingestão
  glossaryVersion: string,
  last_used_at: string,
}
```

O orchestrator anexa o draft ao **system prompt** como `<recall-hint>...</recall-hint>`
com instrução explícita:

> "Use o draft como ponto de partida. Antes de executar:
> (1) compare `schemaSnapshot` com o schema atual (`bq.describe_table`);
> (2) rode `bq.dry_run_sql`;
> (3) se bytes_processed > 5GB ou schema mudou, **gere fresh**.
> Você pode rejeitar o draft sem penalidade — o objetivo é resposta correta,
> não reuso."

O draft **nunca** é executado automaticamente. Sempre passa pela mesma janela
de tool-call que geração from-scratch (`bq.dry_run_sql` → aprovação implícita
do modelo → `query_data`).

### 4. Cross-agent readOnly via wrapper tipado

- Sub-agentes (`descriptiveAgent`, `diagnosticAgent`, `predictiveAgent` em
  `src/features/canvas-orchestrator/agents/`) recebem ferramentas de recall
  via `wrapToolReadOnly()` definido em `src/shared/lib/memory/`.
- Wrapper:
  - Permite `recall_*` (leitura em `embeddings_*`).
  - Bloqueia `save_*` / `updateWorkingMemory` / qualquer `INSERT/UPDATE/DELETE`
    em `working_memory`, `embeddings_sql`, `embeddings_blocks`.
  - Tentativa de escrita lança `ReadOnlyMemoryError` (classe tipada exportada
    de `src/shared/lib/memory/errors.ts`).
- O Orchestrator (`src/features/canvas-orchestrator/orchestrator.ts`) é o
  **único** escritor — chama `updateWorkingMemory` e os hooks `saveSqlEmbedding`
  / `saveBlockEmbedding` após validação de sucesso.
- `ReadOnlyMemoryService` é a classe injetada nos sub-agentes; expõe somente
  métodos de leitura. Reflexão/`as any` para burlar é proibido em CI via
  ESLint custom rule (a definir em Sprint 3.A).

## Consequências

### Positivas

- **LGPD-compliance por construção**: PII nunca persiste em embeddings nem em
  `text_content`. Auditável via fixtures adversariais em CI.
- **Storage controlado**: TTL + eviction diário mantém `embeddings_*` em
  steady-state proporcional à atividade real, não ao histórico total.
- **Sem regressão por reuso cego**: draft-as-hint força revalidação contra
  schema atual; mudanças de schema disparam fresh sem intervenção humana.
- **Determinismo causal**: orchestrator-único-escritor elimina race
  conditions e mantém working_memory como source-of-truth da sessão.
- **Templates curados sobrevivem**: blocos com `version='template'` (Sprint
  3.A admin path) ficam imunes a TTL — capital intelectual preservado.

### Negativas / Trade-offs

- **Custo de cron**: job diário de eviction. Mitigação: query barata, scan
  limitado a `last_used_at` index; <1s de execução esperado.
- **Risco de scrubbing agressivo demais**: regex pode mascarar IDs legítimos
  (ex: códigos de produto). Mitigação: placeholders semânticos preservam
  estrutura; fixtures incluem casos negativos (não-PII que não deve ser
  mascarado).
- **Reuso reduzido**: hint + revalidação ⇒ menos hits diretos do recall.
  Mitigação: ainda assim economiza geração de schema discovery e draft
  estrutural; medido em `liquid_meta.recall_usage` (Sprint 3.A).
- **TTL pode descartar SQL valioso pouco usado**: query de fechamento anual
  expira antes do próximo uso. Mitigação: fluxo de promoção para
  `liquid_meta.sql_catalog` (ADR-0009) — SQL crítico vira catálogo curado e
  fica imune.

### Neutras

- Cron compartilha runtime com outros jobs Cloud Scheduler do projeto; sem
  nova infra.
- `pii-scrubber.ts` já existe (criado em Sprint 2.A para ingest RAG); aqui é
  reuso, não criação.
- `ReadOnlyMemoryError` é classe nova; impacto isolado em testes de
  sub-agentes.

## Alternativas consideradas

### Alternativa A — TTL 30 dias
**Pros**: storage mais enxuto; drift mais agressivo.
**Cons**: perde reuso entre fechamentos mensais (relatórios trimestrais
nunca pegam recall); reaprende todo trimestre.
**Por que rejeitada**: ROI do recall colapsa; perde-se valor de Sprint 3.A
inteira.

### Alternativa B — TTL 180/365 dias
**Pros**: máxima retenção de reuso.
**Cons**: drift de schema acumula; embeddings de SQLs que apontam para
colunas renomeadas viram trapdoors; storage cresce sem ceiling.
**Por que rejeitada**: 180+ dias sem `last_used_at` é forte sinal de
obsolescência; manter é dívida.

### Alternativa C — Sem TTL, eviction por LRU com cap absoluto
**Pros**: ceiling determinístico (ex: 100k entries); simples.
**Cons**: cap arbitrário; queries valiosas podem ser despejadas por queries
ruidosas frequentes; não resolve drift temporal.
**Por que rejeitada**: TTL temporal alinha com frescor de schema, que é o
critério real de validade.

### Alternativa D — PII scrubbing apenas no recall (ofuscar na saída)
**Pros**: text_content original disponível para audit.
**Cons**: PII persiste em disco; embeddings são derivados de texto com PII;
LGPD não aceita "ofuscado na borda"; backup/replica vaza.
**Por que rejeitada**: minimização requer scrubbing **antes** da
persistência. Audit trail vai para `liquid_meta.sql_generations` (logs
estruturados, fora do RAG).

### Alternativa E — Draft como comando (executar automaticamente se confidence > 0.9)
**Pros**: latência menor; hits mais óbvios.
**Cons**: schema drift invisível; um SQL com `glossaryVersion` antigo passa
dry_run mas semântica está errada; modelo perde gate de revalidação.
**Por que rejeitada**: regressão silenciosa é o pior modo de falha em
analytics; latência é otimização secundária.

### Alternativa F — Sub-agentes como co-escritores (cada um persiste seu recall)
**Pros**: paralelismo de escrita.
**Cons**: ordem causal vira race; working_memory fica inconsistente;
debugging vira inferno.
**Por que rejeitada**: contrato Sprint 1.A (orchestrator-único-escritor) é
fundação da memória causal; relaxar aqui propaga inconsistência.

## Implementação

- **Plano macro**: `docs/superpowers/plans/2026-05-04-mastra-memory-rag.md` §5
  Fase 3.
- **Spec implementadora**:
  `docs/superpowers/specs/2026-05-04-sprint3-A-semantic-recall.md` (cobre
  todas as 4 regras desta ADR end-to-end).
- **Código existente reaproveitado**:
  - `src/shared/lib/rag/pii-scrubber.ts` — função `scrubPii` (Sprint 2.A).
  - `src/shared/lib/memory/` — `ReadOnlyMemoryService`, `wrapToolReadOnly`,
    `ReadOnlyMemoryError` (Sprint 1.A para working_memory; estendido aqui
    para embeddings).
  - `src/features/canvas-orchestrator/orchestrator.ts` — único escritor.
- **Código a criar (Sprint 3.A)**:
  - `src/features/canvas-orchestrator/tools/recall-similar-block.ts` — tool
    de recall com retorno `{block_draft, source, confidence, ...}`.
  - `src/features/ai-agents/tools/recall-similar-sql.ts` — análogo para SQL.
  - `scripts/evict-recall.ts` — cron diário de TTL.
  - `src/shared/lib/rag/__tests__/pii-scrubber.fixtures.ts` — 30 fixtures
    adversariais.
  - DDL: `embeddings_sql`, `embeddings_blocks` com índice em
    `(client_id, last_used_at)` para eviction barato.
- **Schedule**: Cloud Scheduler `liquid-recall-eviction-daily` → Cloud Run
  job → `pnpm tsx scripts/evict-recall.ts`.
- **Observabilidade**:
  - Tabela `liquid_meta.recall_usage` registra cada hit (
    `recall_kind, confidence, used_by_model, regenerated_after_dry_run`).
  - Métrica derivada: `recall_acceptance_rate` = aceitos / oferecidos.
- **Multi-tenancy** (ADR-0006): toda query a `embeddings_*` tem
  `WHERE client_id = $clientId` server-bound; nunca derivado de input do
  modelo.
- **Conexão com ADR-0009**: SQL com alta `useCount` em recall é candidato
  natural para promoção a `liquid_meta.sql_catalog` via UI admin
  `/admin/sql-catalog` — fluxo de "graduação" de memória ad-hoc para
  conhecimento curado.

## Referências

- `docs/superpowers/plans/2026-05-04-mastra-memory-rag.md` §5 Fase 3 —
  origem das decisões de TTL e draft-as-hint.
- `docs/superpowers/specs/2026-05-04-sprint3-A-semantic-recall.md` — spec
  implementadora completa, incluindo fixtures adversariais e DDL.
- `docs/superpowers/specs/2026-05-04-sprint2-A-rag-ingest.md` — origem de
  `pii-scrubber.ts` reaproveitado.
- `docs/superpowers/specs/2026-05-04-sprint1-A-cloud-sql-working-memory.md`
  — origem de `ReadOnlyMemoryService` e contrato orchestrator-único-escritor.
- ADR-0004 — Cloud SQL pgvector como storage único (substrato físico de
  `embeddings_*`).
- ADR-0006 — Multi-tenancy strict isolation (clientId server-bound em todo
  recall).
- ADR-0009 — SQL reuse hierarchy (recall é tier 2; promoção para catálogo
  curado é graduação).
- LGPD Lei 13.709/2018 Art. 6º (princípio da necessidade) — fundamento
  jurídico do scrubbing antes de persistir.
