# Frente C — Contexto semântico para a IA (reuso de métricas + criação a partir do data contract)

**Date:** 2026-06-16
**Status:** Draft
**Relacionado:** ADR-0014 (Mastra runtime), ADR-0015 (Semantic Layer), ADR-0006 (multi-tenant), spec `2026-06-16-template-product-refs-design.md` (frente A), revisão de conectividade do core.

## Goal

Dar ao agente de IA, por cliente, o **contexto semântico do que ele já tem contratado**: a lista de **métricas existentes** (dos produtos contratados) para que ele **reaproveite em vez de recriar**, e o **data contract** (entidades + atributos) para que ele **crie métricas novas** quando algo não existir — já que conhece o esquema. É **contexto/compreensão, não gating**: a IA escreve SQL livremente; o objetivo é qualidade e reuso, não bloqueio.

## O que esta frente NÃO é (decisão do usuário)

- **NÃO** há gate/403 de "métrica não pertence ao produto". Uma métrica fora dos produtos contratados não é erro — é simplesmente uma **métrica nova** que a IA gera via SQL a partir do data contract.
- O isolamento real **cross-tenant** já está fechado (WS1: `verifyDatasetAccess` por dataset/clientAccess). A IA já opera escopada a um único `dataset` (BigQuery), então não há vazamento entre clientes.
- Portanto o antigo item "gate de autorização de métrica em `/api/metrics/[id]/data`" está **fora de escopo** — descartado por decisão de produto.

## Contexto atual (mapeado)

- **`/api/chat`** (`app/api/chat/route.ts`) roda no **Mastra** (ADR-0014), com apenas o sub-agente `descriptive` ligado. Prompt em `buildDescriptiveAgentPrompt(ctx)` (`src/shared/config/agents/descriptive-agent.ts:4`). Hoje injeta schema estático (`buildSchemaContext`), business context estático (glossário/PDD/fórmulas) e filtros dinâmicos. **Não injeta nenhuma métrica específica do cliente.**
- **`/api/canvas-chat`** (`app/api/canvas-chat/route.ts`) ainda usa Vercel AI SDK via `createCanvasOrchestrator`; prompt em `buildCanvasOrchestratorPrompt` (`src/shared/config/agents/canvas-orchestrator.ts:12`). Frente C aplica-se aos **dois** caminhos.
- A IA consulta dados via `execute_sql`/`dry_run_sql` direto no `ctx.dataset` — **nunca** chama `/api/metrics/[id]/data`. Já existem tools de reuso de SQL validado: `recall_similar_sql`, `list_validated_queries`, `save_validated_query` (expostas só quando `clientId && personaId`).
- **`ctx.clientId` hoje cai para `body.dataset`** (`app/api/chat/route.ts:113`) porque o **AISidebar não envia `clientId`** (`src/widgets/ai-sidebar/ui/AISidebar.tsx:441-477` envia só `dataset/filters/personaId/icpId`). Pré-requisito desta frente: plumbar o `clientId` real (`clients/{id}`) ponta-a-ponta.
- Config de cliente vive em **duas fontes complementares**: JSON estático `ClientProfile` (hints de comportamento da IA — `src/shared/config/business-context/clients/*.json`) e Firestore `clients/{id}` (estrutural — `productBindings[]`). Frente C lê o **Firestore** para derivar métricas; o JSON estático permanece como hints (não unificar).
- `enabledIndicators`/`enabledRoutes` em `ClientProductBinding` existem no schema mas são sempre `null` (admin hardcoda). Frente C dá semântica ao `enabledIndicators` como **override opcional** de quais métricas surfaçar.

## Decisões

1. **Resolver server-side** `getClientSemanticContext(clientId)` — fonte única para qualquer caminho da IA.
2. **Injetar no prompt** (descriptive + canvas): (a) **métricas existentes** do cliente (reusar), (b) **data contract** (entidades/atributos) dos produtos contratados (criar novas).
3. **Plumbar `clientId` real** ponta-a-ponta no AISidebar e nos dois route handlers. Sem clientId resolvível → degrada para o comportamento atual (sem seção de métricas), sem quebrar.
4. **`enabledIndicators`**: `null`/ausente ⇒ **todas** as métricas dos produtos contratados; array ⇒ **subconjunto** (intersecção). Implementado agora (fecha o campo morto).
5. **Não** persistir métricas geradas pela IA no catálogo nesta frente (ver Boundaries). O reuso de SQL ad-hoc já é coberto pelas tools `save_validated_query`/`recall_similar_sql` existentes.

## Data Model / Componentes

### Resolver — `src/shared/repositories/client-semantic-context.ts` (novo)

```ts
export interface ClientSemanticContext {
  clientId: string;
  /** Métricas que o cliente já tem (dos produtos contratados), para reuso. */
  metrics: Array<{
    id: string;            // MetricId "domain.slug"
    name: string;
    description?: string;
    recipe?: unknown;      // o suficiente para a IA reconhecer/reusar (sem despejar SQL gigante)
    requires: string[];    // AttributeRef[] "contract.entity.attr"
    productId: string;     // de qual produto veio (rastreio)
  }>;
  /** Data contract dos produtos contratados, para a IA criar métricas novas. */
  dataContracts: Array<{
    contractId: string;
    entities: Array<{
      entityId: string;
      attributes: Array<{ attributeId: string; type?: string; description?: string }>;
    }>;
  }>;
}

export async function getClientSemanticContext(clientId: string): Promise<ClientSemanticContext | null>;
```

Algoritmo:
1. Lê `clients/{clientId}`. Sem doc ⇒ `null` (caller degrada).
2. Para cada `productBindings[]`: `getProduct(binding.productId)` (cache de `product-repo.ts`). Coleta `product.metricRefs` (aplicando `enabledIndicators` como intersecção quando não-null) e `product.entityRefs`.
3. Resolve as métricas (catálogo de métricas — repo de metrics) e os data contracts (repo de data-contracts) referenciados. Dedup por id. Ignora refs órfãs/deprecated graciosamente (loga, não quebra).
4. Retorna o `ClientSemanticContext`. TTL/cache curto alinhado ao `product-repo` (≈60s) é aceitável.

### Injeção no prompt

- `AgentDynamicContext` (`src/shared/config/agents/types.ts`) ganha campo opcional `semanticContext?: ClientSemanticContext`.
- `buildDescriptiveAgentPrompt` e `buildCanvasOrchestratorPrompt` ganham uma seção nova **"Métricas já disponíveis para este cliente"** (lista compacta: id — nome — o que mede; instrução: *"reutilize estas; não recrie equivalentes"*) e **"Data contract disponível"** (entidades/atributos; instrução: *"para o que não existir acima, gere SQL novo a partir deste contrato"*). Seções omitidas quando `semanticContext` ausente/vazio.
- Mantém schema/glossário estáticos atuais.

### Plumbing do clientId

- `AISidebar` passa a enviar `clientId` (o `clients/{id}` ativo do `app-store`) no body, separado de `dataset`.
- `/api/chat` e `/api/canvas-chat`: resolvem `clientId` do body (sem mais o fallback `?? dataset` para fins de contexto semântico — o `dataset` segue sendo usado para o BQ scope). Cada handler chama `getClientSemanticContext(clientId)` antes de montar o `ctx` e injeta em `semanticContext`.

## Data Flow

1. AISidebar envia `{ clientId, dataset, filters, personaId, icpId, ... }`.
2. Route handler resolve `getClientSemanticContext(clientId)` → injeta em `ctx.semanticContext`.
3. `buildDescriptiveAgentPrompt`/`buildCanvasOrchestratorPrompt` renderizam as seções de métricas existentes + data contract.
4. A IA responde reusando métricas existentes; quando precisa de algo novo, gera SQL a partir do data contract (comportamento atual de `execute_sql`, agora mais informado).

## Error handling / degradação

- `clientId` ausente, doc inexistente, ou produtos sem métricas ⇒ `getClientSemanticContext` retorna `null`/vazio; o prompt omite as seções e a IA opera como hoje. **Nunca** quebra o chat por falta de contexto.
- Refs órfãs/deprecated em `metricRefs`/`entityRefs` ⇒ ignoradas com log; não derrubam o resolver (consistente com a ausência de FK forte).

## Testing

- **Resolver:** `client-semantic-context.test.ts` — cliente com 2 bindings → união dedupada de métricas + contracts; `enabledIndicators` não-null restringe ao subconjunto; binding com produto inexistente é ignorado; cliente sem doc → `null`.
- **Prompt builders:** seção de métricas/contract aparece quando `semanticContext` presente; omitida quando ausente. Instruções de "reusar / criar do contrato" presentes.
- **Routes:** `/api/chat` e `/api/canvas-chat` chamam o resolver com o `clientId` do body e injetam o contexto; sem `clientId` o chat ainda responde (degrada).
- **AISidebar:** envia `clientId` no body (teste de request).

## Boundaries / YAGNI

- **Não** persistir métricas geradas pela IA no catálogo (`metrics`/`sqlCatalog`) — frente futura se desejado. Reuso ad-hoc segue via `save_validated_query`/`recall_similar_sql`.
- **Não** unificar `ClientProfile` estático com o Firestore Client — fontes complementares.
- **Não** implementar `enabledRoutes` (gating de navegação) aqui — só `enabledIndicators` para escopo de métricas. (Item separado.)
- **Não** migrar `/api/canvas-chat` para Mastra — só injetar o contexto no prompt atual.
- Sem hard-gate de métrica em endpoint algum.

## Arquivos afetados

**Novos**
- `src/shared/repositories/client-semantic-context.ts`
- `src/shared/repositories/__tests__/client-semantic-context.test.ts`

**Modificados**
- `src/shared/config/agents/types.ts` (`AgentDynamicContext.semanticContext`)
- `src/shared/config/agents/descriptive-agent.ts` (seção no prompt)
- `src/shared/config/agents/canvas-orchestrator.ts` (seção no prompt)
- `app/api/chat/route.ts` (resolve clientId + injeta contexto)
- `app/api/canvas-chat/route.ts` (idem)
- `src/widgets/ai-sidebar/ui/AISidebar.tsx` (envia clientId)
- testes correspondentes dos prompts/rotas

## Rollout

1. Resolver + testes.
2. `AgentDynamicContext` + seções nos dois prompt builders + testes.
3. Plumbing do clientId (AISidebar + 2 rotas) + injeção.
4. `enabledIndicators` como intersecção no resolver.

**Rollback:** reverter commits; sem migração de dados; campos `semanticContext` são opcionais e ausência degrada para o comportamento atual.
