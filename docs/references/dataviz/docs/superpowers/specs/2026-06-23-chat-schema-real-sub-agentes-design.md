# Sub-agentes operam contra o schema real do cliente (G5-sub-agentes) — Design

> **Status:** aprovado para plano. Extensão do G5 (PR #21): leva a substituição do
> schema hardcoded pelo schema real do cliente — feita no `buildCanvasOrchestratorPrompt`
> — aos prompts dos 8 sub-agentes que rodam `execute_sql`.

## Contexto

O G5 (PR #21) fez o **orchestrator do canvas** parar de injetar o schema BigQuery
hardcoded quando o cliente tem colunas físicas bound (`hasClientSchema`), passando a
escrever SQL contra as colunas reais (`renderDataContractSection`, via T2). Mas a
substituição ficou só no `buildCanvasOrchestratorPrompt`.

Quem de fato roda `execute_sql` para preencher os blocos é o **sub-agente** delegado
pelo `fill_block` (descriptive/diagnostic/predictive/simulation/prescriptive/
monitoring/cashflow/external) — e o `analyze` tool. Hoje esses prompts ainda injetam
o schema hardcoded; portanto o SQL gerado nos blocos continua mirando as colunas da OM,
não as do cliente (BRZ). Esta spec fecha esse gap.

### Dois pontos de injeção do schema hardcoded (exploração)

1. **Caminho legado — `build*AgentPrompt` (8 funções, `src/shared/config/agents/*.ts`).**
   É o que o `fill_block` roda hoje (`canvas-orchestrator/lib/fill-block-fn.ts:30` →
   `PROMPT_BUILDERS[agentType](ctx)`) e também o `analyze` tool (`tools/analyze.ts:18`).
   - `descriptive`: já renderiza `renderSemanticContextSections(ctx.semanticContext)`
     **e** `${buildSchemaContext()}` (dual-schema).
   - Os outros 7: renderizam **só** `${buildSchemaContext()}` — nunca injetam o
     contexto semântico do cliente.
   - `ctx.semanticContext` É populado nesse caminho (usado em `fill-block-fn.ts:100`),
     logo um gate aqui é vivo.

2. **Caminho Mastra — `composeCodeBaseline` (`create-mastra-agent-from-config.ts`).**
   Compartilhado pelos 8 sub-agentes (ADR-0014/0016), alimenta o chat multi-agente.
   Injeta `buildSchemaContext()` uma vez no baseline de código; `buildAgentDynamicContext(ctx)`
   (sempre anexado) já renderiza `renderSemanticContextSections`. Mesmo bug de dual-schema,
   no runtime do chat.

Decisão do usuário nesta rodada: cobrir **ambos** os caminhos, via **helper compartilhado**.

Referências: G5 (`docs/superpowers/specs/2026-06-23-chat-schema-real-cliente-design.md`,
PR #21), ADR-0015 (camada semântica), ADR-0014/0016 (runtime Mastra), auditoria
`docs/auditoria-arquitetura-camada-semantica.md` (G5; G7 fica para depois).

## Arquitetura

O padrão de substituição já validado no G5 é sempre o mesmo: **renderiza a seção
semântica do cliente** (`renderSemanticContextSections`, que já mostra as colunas
físicas reais via T2) **e gateia o hardcoded** — `hasClientSchema(sc) ? '' : buildSchemaContext()`.
Esta spec promove esse padrão a um helper compartilhado e o aplica nos dois caminhos.

### 1. Helper compartilhado em `shared-context.ts`

Promover `hasClientSchema` (hoje local e privado no `canvas-orchestrator.ts`) para
`shared-context.ts`, **exportado**:

```ts
export function hasClientSchema(sc: ClientSemanticContext | null | undefined): boolean {
  return !!sc?.dataContracts?.some((c) =>
    c.entities.some((e) =>
      e.attributes.some((a) => typeof a.column === 'string' && a.column.length > 0),
    ),
  );
}
```

`canvas-orchestrator.ts` passa a **importar** `hasClientSchema` e remove a cópia local —
DRY, sem mudança de comportamento.

### 2. Builders legados — os 8 `build*AgentPrompt`

- **`descriptive`**: já renderiza `renderSemanticContextSections`. Troca apenas
  `${buildSchemaContext()}` por uma variável gateada
  (`const schemaSection = hasClientSchema(ctx.semanticContext) ? '' : buildSchemaContext()`)
  — idêntico ao canvas no G5.
- **Os 7 restantes** (`diagnostic/predictive/simulation/prescriptive/monitoring/
  cashflow/external`): hoje só têm o hardcoded. Recebem (a) a injeção da seção semântica
  (`const semantic = renderSemanticContextSections(ctx.semanticContext)`, anexada quando
  não-vazia, no mesmo lugar onde o descriptive a injeta) **e** (b) o gate do hardcoded.
  Gatear sem (a) deixaria o agente sem schema nenhum — por isso (a) é obrigatório.

**Seção semântica completa (decisão aprovada):** nos 7, injeta-se a
`renderSemanticContextSections` **completa** (métricas-para-reuso + data-contract),
igual ao descriptive e ao canvas — uniformidade, e o agente analítico passa a conhecer
as métricas do cliente. A seção de métricas só aparece quando o cliente as tem, então o
custo é nulo caso contrário. (Alternativa rejeitada: injetar só a seção de colunas
físicas — exigiria função nova e criaria um 3º formato de render.)

### 3. Caminho Mastra — `composeCodeBaseline`

`buildAgentDynamicContext(ctx)` já anexa a seção semântica para os 8. Aqui basta **um
gate**: `composeCodeBaseline` passa a receber o `semanticContext` (de `ctx`) e troca
`buildSchemaContext()` por `hasClientSchema(sc) ? '' : buildSchemaContext()`.

## Error handling

- Sem `semanticContext` / sem colunas bound ⇒ `hasClientSchema` false ⇒ hardcoded
  mantido (comportamento atual, **zero regressão**).
- `getClientSemanticContext` permanece best-effort (degrada para null ⇒ hardcoded).
- Atributo sem coluna bound continua omitido da seção do cliente (regra do T2, herdada).

## Testes (TDD)

- **`hasClientSchema`** (novo, em `semantic-context-prompt.test.ts` ou
  `shared-context`): `true` com ≥1 atributo com `column`; `false` sem nenhum / com
  `dataContracts` vazio / com `sc` null/undefined.
- **Os 8 builders legados** (tabela parametrizada sobre `PROMPT_BUILDERS` ou casos
  individuais): com schema do cliente ⇒ a saída **não** contém o marcador hardcoded
  (`## Schema: Tabela contratos`) **e** contém a coluna física real; sem schema do
  cliente ⇒ **contém** o hardcoded (sem regressão).
- **`composeCodeBaseline` / `createMastraAgentFromConfig`**: com schema do cliente ⇒
  baseline sem o marcador hardcoded; sem ⇒ com. Estende
  `create-mastra-agent-from-config.test.ts`.
- **Canvas**: os testes do G5 seguem verdes após o refactor para o helper importado
  (sem alteração de asserção esperada).

## Não-objetivos (fora desta spec)

- **Schema entregue via skill-playbook de config (Mastra).** O gate atua no baseline de
  código. Se um agente tiver `instructions`/playbook salvos no Firestore com schema
  embutido, esse texto não é gateável aqui — é dado de config, não código. (A seção do
  cliente é sempre anexada via `buildAgentDynamicContext`.)
- **`get_table_schema` v2 / `expectedTables`** — alinhar a tool de schema ao binding é o
  **G7**, spec separada.
- **Popular os dados da BRZ** (contrato/entities/attributes/bindings) — configuração.
- Unificar `EXPECTED_SCHEMA` (duplicação D1); portabilidade/templatização (B).
