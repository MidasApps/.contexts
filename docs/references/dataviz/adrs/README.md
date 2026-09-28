# Architecture Decision Records — liquid-play-dataviz

Este diretório consolida as **decisões arquiteturais** do projeto no formato Michael Nygard
(adaptado, em PT-BR), além de documentos auxiliares de stack e referência.

---

## Estrutura

```
adrs/
├── README.md                 ← este arquivo: índice + processo + roadmap
├── _template.md              ← template canônico para novas ADRs
├── decisions/                ← ADRs propriamente ditas (Nygard-style, numeradas 0001..NNNN)
│   ├── 0001-record-architecture-decisions.md
│   ├── 0002-mastra-as-library-sobre-ai-sdk.md
│   ├── 0003-mini-state-machine-vs-mastra-core.md
│   ├── 0004-cloud-sql-pgvector-storage-unico.md
│   ├── 0005-embedding-vertex-com-fallback-openai.md
│   ├── 0006-multi-tenancy-strict-isolation.md
│   ├── 0007-bqml-dataset-dedicado-por-tenant.md
│   ├── 0008-phase-based-tool-gating-prepare-step.md
│   ├── 0009-sql-reuse-hierarchy-catalog-recall-fresh.md
│   ├── 0010-eval-harness-proprio.md
│   ├── 0011-semantic-recall-ttl-pii-scrubbing.md
│   ├── 0012-reranking-gemini-flash.md
│   ├── 0013-firestore-storage-config-metadata.md
│   ├── 0014-mastra-runtime-full.md          (superseded pela 0019)
│   ├── 0015-semantic-layer-data-contract.md
│   ├── 0016-ai-studio-config-data-driven.md
│   ├── 0017-ai-studio-config-canonica.md
│   ├── 0018-tenancy-por-usuario-conjunto-clientids.md
│   ├── 0019-runtime-mastra-estado-real.md
│   ├── 0020-assistente-unico-aposentadoria-do-canvas.md
│   ├── 0021-gemini-geracao-3-endpoint-global.md
│   ├── 0022-contrato-de-bloco-como-regua-unica-de-layout.md
│   ├── 0023-ia-cria-metrica.md
│   ├── 0024-metrica-corrige-para-todos-com-historico.md
│   ├── 0025-filtro-so-quando-pedido.md
│   ├── 0026-filtro-sobre-o-campo-do-indicador.md
│   ├── 0027-a-carteira-e-temporal.md
│   ├── 0028-conformidade-com-o-contrato-do-firestore.md
│   ├── 0032-escala-do-percentual-e-da-metrica.md
│   └── 0033-todo-bloco-le-a-escala-da-metrica.md
├── stack/   (futuro)         ← tech guides extensos (research-style); ainda em legacy/raiz
├── reference/  (futuro)      ← documentação importada (Mastra, AI SDK, UI Elements)
└── (legacy raiz)             ← arquivos atuais a migrar — ver §"Roadmap de migração"
```

> **Importante:** os arquivos em `adrs/` na raiz hoje (`claude-code.md`, `firebase-firestore.md`,
> `tailwind-css.md`, `vercel-ai-sdk.md`, `gemini-api.md`, `yaml.md`, `mastra/`, `vercel-ai-sdk/`,
> `vercel-ui-elements/`, etc.) **não são ADRs** no sentido estrito. São **research notes / tech
> guides / referência importada**. Serão movidos para `stack/` e `reference/` em uma migração
> dedicada (ver §Roadmap). Até lá, convivem com `decisions/` sem prefixo numérico.

---

## O que é uma ADR neste projeto

Uma ADR documenta **uma decisão arquitetural** — uma escolha entre alternativas com
consequências de longo prazo — em formato curto, rastreável e versionado em git.

Não é ADR:

- Tutorial de stack ou guia de uso (vai para `stack/`).
- Documentação de API externa importada (vai para `reference/`).
- Feature spec, plano de implementação ou roadmap (vão para `docs/superpowers/{plans,specs}/`).

Critério: se outro engenheiro precisar entender **por que** o sistema é desse jeito (e não
de outro razoável), há uma ADR. Se precisar entender **como usar** uma stack, há tech guide.

---

## Processo

1. **Identificar a decisão.** Surge no brainstorm, no plano (`docs/superpowers/plans/`) ou
   numa code review. Se há ≥2 opções com trade-offs reais, vira ADR.
2. **Copiar `_template.md`** para `decisions/NNNN-slug-em-kebab-case.md`. Numeração
   sequencial em 4 dígitos.
3. **Escrever** com status inicial `Proposed`. Tamanho típico: 200-500 linhas.
4. **Revisar** em PR. Pelo menos um deciders + um consultado (ver YAML frontmatter).
5. **Aceitar** alterando status para `Accepted` no merge. **Não editar** o conteúdo
   histórico depois — supersedências e mudanças vão em **nova** ADR que referencia a
   antiga via `supersedes:` e atualiza o status da antiga para `Superseded by ADR-NNNN`.
6. **Linkar** a ADR de planos/specs/PRs relacionados — engenharia de contexto é o
   diferencial: a ADR existe para que humanos **e Claude Code** tomem a mesma decisão
   no futuro sem alucinar.

---

## Status possíveis

- **Proposed** — escrita, ainda em discussão.
- **Accepted** — decisão em vigor.
- **Deprecated** — não recomendada para novo código, mas o existente permanece.
- **Superseded by ADR-NNNN** — substituída; sempre apontar para a sucessora.

---

## Índice de ADRs

| ID | Título | Status | Tags |
|---|---|---|---|
| [0001](decisions/0001-record-architecture-decisions.md) | Adotar Architecture Decision Records | Accepted | meta, processo |
| [0002](decisions/0002-mastra-as-library-sobre-ai-sdk.md) | Mastra-as-Library sobre AI SDK v6 (vs Mastra Agent runtime) | Accepted | ai, mastra, ai-sdk |
| [0003](decisions/0003-mini-state-machine-vs-mastra-core.md) | Mini state-machine interna vs `@mastra/core` workflows | Accepted | ai, workflow, canvas-orchestrator |
| [0004](decisions/0004-cloud-sql-pgvector-storage-unico.md) | Cloud SQL Postgres + pgvector como storage único (memory + RAG) | Superseded by [0013](decisions/0013-firestore-storage-config-metadata.md) | infra, memory, rag, postgres, superseded |
| [0005](decisions/0005-embedding-vertex-com-fallback-openai.md) | Embedding model: Vertex `gemini-embedding-001` com fallback OpenAI | Accepted | ai, rag, embeddings, vertex |
| [0006](decisions/0006-multi-tenancy-strict-isolation.md) | Multi-tenancy strict isolation em RAG e Memory | Accepted | seguranca, multi-tenancy, rag, memory |
| [0007](decisions/0007-bqml-dataset-dedicado-por-tenant.md) | BQML: dataset dedicado por tenant + cache per-tenant | Accepted | bqml, bigquery, iam, multi-tenancy |
| [0008](decisions/0008-phase-based-tool-gating-prepare-step.md) | Phase-based tool gating no orchestrator analítico via `prepareStep` | Accepted | ai, ai-sdk, orchestrator |
| [0009](decisions/0009-sql-reuse-hierarchy-catalog-recall-fresh.md) | SQL reuse hierarchy: catalog curated > recall semântico > fresh | Accepted | sql, rag, catalog, bigquery |
| [0010](decisions/0010-eval-harness-proprio.md) | Eval harness próprio (sem `@mastra/core/evals`) + drift detection | Accepted | evals, qualidade, llm-as-judge |
| [0011](decisions/0011-semantic-recall-ttl-pii-scrubbing.md) | Semantic recall — TTL 90d, PII scrubbing, draft-as-hint, cross-agent readOnly | Accepted | rag, memory, semantic-recall, lgpd, pii, ttl |
| [0012](decisions/0012-reranking-gemini-flash.md) | Reranking RAG via Gemini Flash com structured output | Accepted | rag, reranking, vertex, ai-sdk |
| [0013](decisions/0013-firestore-storage-config-metadata.md) | Firestore como storage único para configuração + metadados + memória de IA | Accepted | infra, firestore, memory, rag, semantic-recall, evals, multi-tenancy |
| [0014](decisions/0014-mastra-runtime-full.md) | Mastra Runtime full — Agent + Memory + RAG (substitui ADR-0002) | Superseded por [0019](decisions/0019-runtime-mastra-estado-real.md) | ai, mastra, runtime, agent, memory, arquitetura |
| [0015](decisions/0015-semantic-layer-data-contract.md) | Camada semântica — Data Contract + Metric Catalog separados do Product | Proposed | arquitetura, data-model, semantic-layer, admin, multi-tenancy |
| [0016](decisions/0016-ai-studio-config-data-driven.md) | AI Studio — Configuração de IA data-driven (Agents/Skills/Workflows/KB) | Accepted | ai, studio, config, data-driven, agents, skills, workflows, kb, arquitetura |
| [0017](decisions/0017-ai-studio-config-canonica.md) | AI Studio — Config Canônica (prompts data-driven, fim das flags) | Accepted | ai, studio, config, flags, mastra, arquitetura |
| [0018](decisions/0018-tenancy-por-usuario-conjunto-clientids.md) | Tenancy por-usuário como conjunto (clientIds[]) + provisionamento self-service e papel clientAdmin | Proposed | seguranca, multi-tenancy, rbac, provisionamento, firestore, rules |
| [0019](decisions/0019-runtime-mastra-estado-real.md) | Runtime Mastra — estado real (supervisor via agents, memória própria em Firestore) | Accepted | ai, mastra, runtime, agent, memory, arquitetura |
| [0020](decisions/0020-assistente-unico-aposentadoria-do-canvas.md) | Assistente único — tools de autoria no supervisor e aposentadoria da pilha de canvas | Accepted | ai, mastra, agent, arquitetura, produto, ui |
| [0021](decisions/0021-gemini-geracao-3-endpoint-global.md) | Gemini geração 3 no endpoint global — migração dos quatro tiers antes da aposentadoria do 2.5 | Accepted | ai, vertex, modelos, latencia, residencia-de-dados, arquitetura |
| [0022](decisions/0022-contrato-de-bloco-como-regua-unica-de-layout.md) | Contrato de bloco como régua única de layout, e forma declarada na métrica | Accepted | canvas, layout, autoria, schema, metricas, ai |
| [0023](decisions/0023-ia-cria-metrica.md) | A IA cria métrica — SQL de LLM validado por dry-run e variante em vez de edição compartilhada | Accepted | ai, metricas, catalogo, bigquery, seguranca, arquitetura |
| [0024](decisions/0024-metrica-corrige-para-todos-com-historico.md) | Correção de métrica vale para todas as páginas — intenção declarada, histórico e desfazer | Accepted | ai, metricas, catalogo, versionamento, auditoria, arquitetura |
| [0025](decisions/0025-filtro-so-quando-pedido.md) | Filtro só quando pedido — painel global enxuto e filtro de página criado pela IA | Accepted | produto, ui, filtros, ai, arquitetura |
| [0026](decisions/0026-filtro-sobre-o-campo-do-indicador.md) | Filtro de página se declara sobre o campo do indicador, não sobre a coluna da entidade | Accepted | filtros, semantica, metricas, ai, arquitetura |
| [0027](decisions/0027-a-carteira-e-temporal.md) | A carteira é temporal — todo indicador segue o mês escolhido, e todo KPI mostra sua trajetória | Accepted | periodo, metricas, kpi, comparativo, arquitetura |
| [0028](decisions/0028-conformidade-com-o-contrato-do-firestore.md) | O código se conforma ao contrato do Firestore — migração em quatro fases, sem big-bang | Proposed | firestore, data-model, naming, migracao, governanca, contratos |
| [0032](decisions/0032-escala-do-percentual-e-da-metrica.md) | A escala do percentual é metadado da métrica — KPI e tabela respeitam as colunas em pontos | Accepted | metricas, percentual, formato, kpi, tabela, schema |
| [0033](decisions/0033-todo-bloco-le-a-escala-da-metrica.md) | Todo bloco lê a escala do percentual da métrica — e o chat a declara | Accepted | metricas, percentual, formato, blocos, ia, schema |

---

## Conexão com `docs/superpowers/`

- **Planos macro** (`docs/superpowers/plans/2026-05-04-*.md`) descrevem a estratégia de uma
  iniciativa de 4-6 semanas. Várias ADRs nascem de um plano.
- **Specs sprint** (`docs/superpowers/specs/2026-05-04-sprint*.md`) são planos de
  implementação concretos com tasks. Cada spec implementa uma ou mais ADRs.
- ADRs são **mais estáveis** que planos — não são reescritas; supersedidas.

Mapeamento atual:

| Plano macro | ADRs derivadas |
|---|---|
| `2026-05-04-mastra-memory-rag.md` | 0002, 0004, 0005, 0006, 0011 |
| `2026-05-04-mastra-workflows-network.md` | 0002, 0003, 0008 |
| `2026-05-04-mastra-tools-sql-bqml.md` | 0007, 0009 |
| `2026-05-04-business-context-personas-evals.md` | 0006, 0010 |

---

## Roadmap de reorganização (legacy → estrutura nova)

Pendente para um PR dedicado, **não bloqueia** este lote inicial de ADRs:

1. **Mover para `adrs/stack/`** (research notes / tech guides):
   - `claude-code.md`, `contratos-api.md`, `firebase-firestore.md`, `firecrawl.md`,
     `fsd-atomic-design.md`, `gemini-api.md`, `gen-ai.md`, `jsonata.md`,
     `multi-product-dataset-integration.md`, `tailwind-css.md`, `vercel-ai-sdk.md`,
     `vertex-ai.md`, `yaml.md`
2. **Mover para `adrs/reference/`** (importações de docs externos):
   - `mastra/`, `vercel-ai-sdk/`, `vercel-ui-elements/`
3. **Reescrever um subset como ADRs reais** quando aplicável. Exemplos prováveis:
   - "Adotar Vercel AI SDK v6 como runtime LLM" — extrair do `vercel-ai-sdk.md` em ADR curta.
   - "Adotar Firebase Auth + Firestore para clientes/perfis" — extrair de `firebase-firestore.md`.
   - "Adotar Tailwind v4 com OKLch theme custom" — extrair de `tailwind-css.md`.
4. **Atualizar `CLAUDE.md`** apontando para `adrs/decisions/` como fonte de verdade
   arquitetural; `adrs/stack/` como referência operacional.

A migração não move arquivos automaticamente — sempre acompanha PR humano para evitar
quebrar links em commits e PRs históricos.

---

## Convenções

- **Idioma**: português técnico, alinhado com `CLAUDE.md` do projeto.
- **Nomenclatura**: `NNNN-slug-em-kebab-case.md`, 4 dígitos, sem espaços, sem acentos.
- **Frontmatter YAML obrigatório** (ver `_template.md`).
- **Datas**: ISO `YYYY-MM-DD`.
- **Links para código**: usar caminhos `@/`, `@app/` ou absolutos do repo (`src/...`).
- **Links para docs**: relativos ao próprio repositório quando possível.
