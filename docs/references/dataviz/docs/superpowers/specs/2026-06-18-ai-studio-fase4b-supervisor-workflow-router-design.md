# AI Studio — Fase 4B: Supervisor Mastra + Roteador de Workflows

**Date:** 2026-06-18
**Status:** Draft
**Sub-projeto de:** Fase 4 (workflows no runtime). 4B (este) depende de **4A** (os 7 sub-agentes migrados para Mastra + registrados no `buildMastraInstance`). Fecha a iniciativa AI Studio.
**Depende de:** Fase 4A (8 Mastra Agents registrados), Fase 0 (workflows CRUD + seed default), e o padrão de flags das Fases 1/2/3.
**Relacionado:** **ADR-0016** (AI Studio — implementa o runtime de workflows que a ADR decidiu; **não gera ADR nova**), ADR-0014 (Mastra runtime), ADR-0008 (tool gating).

## Goal

Fechar o "workflows no runtime": atrás de `AI_STUDIO_WORKFLOWS`, ao receber um comando no `/api/chat`, um **roteador** escolhe o workflow pela descrição "quando usar", e um **supervisor Mastra** — compondo os 8 sub-agentes (migrados na 4A) como sub-agentes nativos — roda com `buildOrchestratorPrompt + workflow.instruction` como system prompt, delegando aos sub-agentes. Inclui o enforcement de **exatamente-1-default** no CRUD de workflows. Flag off → comportamento atual (descriptive solo); fail-soft em qualquer falha.

## Problem

Pós-ADR-0014 o `/api/chat` roda só o `descriptive` (4A registrou os outros 7, mas dormentes). Os Workflows existem como CRUD (Fase 0) mas **não valem no runtime**: não há roteador, não há supervisor que os consuma, e o `isDefault` é um booleano sem enforcement de unicidade. A Fase 4B liga essa última camada.

Gaps confirmados por exploração (file:line):
- `@mastra/core` Agent suporta `agents?: DynamicArgument<Record<string, Agent>>` nativamente (sub-agentes auto-expostos como tools via `listAgentTools()`) — `@mastra/core/dist/agent/types.d.ts:276`. **Sem necessidade de wrap manual.**
- Não há `loadWorkflows()` nem `select-workflow` — `config-loader.ts`.
- `isDefault` está em `editableOnPatch` (`entity-config.ts:51`) mas **sem enforcement de unicidade** no `AiStudioRepo`.
- `/api/chat` (`app/api/chat/route.ts`) constrói o Mastra e faz `getAgent('descriptive')`; o handling de stream é agent-agnóstico (troca de agente é transparente).
- `getModel('router')` = gemini-2.5-flash-lite (`model-registry.ts:11`).
- A última mensagem do usuário vive em `body.messages` na rota (não no `AgentDynamicContext`).

## Decisões (do brainstorming)

1. **Supervisor via `agents` nativo do Mastra** (os 8 sub-agentes), sem agent-as-tool manual.
2. **System prompt do supervisor = compor** `buildOrchestratorPrompt(ctx)` + `workflow.instruction` (a base de roteamento sempre presente; o workflow é a camada específica). Mesmo padrão das Fases 1/3.
3. **Supervisor construído na rota** após o roteamento (instruções dependem do workflow runtime), não no `buildMastraInstance`. Model `router` (espelha o supervisor legado).
4. **Roteador LLM** (`getModel('router')`) casa comando→workflow pela `description`; fallback ao default.
5. **Enforcement de 1-default no `AiStudioRepo`** (patch **e** upsert): `isDefault:true` desmarca os demais (batch); proibir desmarcar o único default. Só `type==='workflow'`.
6. **Sem estado multi-turno** de workflow (roteia a cada request).
7. **Flag** `AI_STUDIO_WORKFLOWS` (env, SoT) + `useAiStudioWorkflows` (app-store, paridade). **Sem ADR nova.**

## Reaproveitamento (intocado / estendido)

- **Intocado:** os 8 Mastra agent factories (4A), `buildOrchestratorPrompt` (`@/shared/config/agents`), `orchestrator.ts` legado (permanece, não é o caminho do chat), `createKbRetrievalTool`/etc.
- **Estendido:** `config-loader.ts` (+`loadWorkflows`), `AiStudioRepo` (enforcement 1-default), `app/api/chat/route.ts` (wiring atrás de flag), `app-store.ts` (flag paridade).

## Componentes

```
src/features/ai-studio/runtime/config-loader.ts        MODIFY — + loadWorkflows() (active, cached)
src/features/ai-studio/runtime/select-workflow.ts      CREATE — selectWorkflow(command, workflows)
src/features/ai-agents/mastra/build-supervisor-agent.ts CREATE — buildSupervisorAgent({instruction, ctx, subAgents})
src/features/ai-studio/repo.ts                         MODIFY — enforcement 1-default (workflow) em patch+upsert
app/api/chat/route.ts                                  MODIFY — wiring atrás de AI_STUDIO_WORKFLOWS
src/shared/stores/app-store.ts                         MODIFY — flag useAiStudioWorkflows (paridade)
```

### loadWorkflows (config-loader.ts)

```
loadWorkflows(): Promise<AiStudioRecord[]>   // workflows status==='active', cacheado TTL 30s (chave fixa '__workflows__')
```

### select-workflow.ts

```
selectWorkflow(command: string, workflows: AiStudioRecord[]): Promise<AiStudioRecord>
```
- Vazio → lança (a rota só chama com workflows não-vazio).
- Um único workflow → retorna-o sem chamar LLM.
- Vários → `getModel('router')` (generateObject com schema `{ id: enum(activeIds) }`, temperature 0) lê o comando + `{id, description}` de cada; retorna o escolhido.
- Falha/sem-match/id inválido → o `isDefault` (ou, se não houver default, o primeiro ativo, logado). **Fail-soft** (try/catch → default).

### build-supervisor-agent.ts

```
buildSupervisorAgent(input: { instruction: string; ctx: AgentDynamicContext; subAgents: Record<string, Agent> }): Agent
```
```
new Agent({
  id: 'supervisor', name: 'Supervisor Analítico',
  description: 'Orquestra os sub-agentes analíticos conforme o workflow ativo.',
  instructions: [buildOrchestratorPrompt(ctx), input.instruction].join('\n\n'),
  model: getModel('router'),
  agents: input.subAgents,   // os 8, via agents nativo (auto-tools)
})
```
Síncrono (não faz I/O; os sub-agentes já vêm construídos). `subAgents` montados na rota a partir do `mastra` (ver wiring).

### Enforcement 1-default (AiStudioRepo)

No `patch(id, updates)` e no `upsert(id, body)`, quando `this.cfg.type === 'workflow'`:
- Se o doc resultante tem `isDefault === true`: batch que seta `isDefault:false` em todos os outros workflows com `isDefault:true` (≠ id) + grava este como default. Atômico.
- Se uma operação tenta `isDefault:false` num doc que é o default atual: checar se há outro workflow `isDefault:true`; se não houver, **rejeitar** (`Error`/422-equivalente) — não deixar o sistema sem default.
- `type !== 'workflow'` → caminho atual inalterado.

### Wiring /api/chat (atrás de AI_STUDIO_WORKFLOWS)

Após construir `ctx`/`mastra` e `modelMessages`, antes de `getAgent('descriptive')`:
```
let agent = mastra.getAgent('descriptive');                       // default
if (process.env.AI_STUDIO_WORKFLOWS === 'on') {
  try {
    const workflows = await loadWorkflows();
    if (workflows.length > 0) {
      const command = lastUserText(body.messages);                // última msg do usuário
      const wf = await selectWorkflow(command, workflows);
      const subAgents = collectSubAgents(mastra);                 // os 8 do mastra.getAgent(key)
      agent = buildSupervisorAgent({ instruction: wf.instruction, ctx, subAgents });
    }
  } catch (e) {
    console.error('[chat] workflow routing falhou — usando descriptive', e);  // fail-soft
  }
}
const stream = await agent.stream(modelMessages, { runId: sessionId });
// resto idêntico (conversão Mastra→UI agent-agnóstica)
```
`lastUserText` extrai o texto da última `UIMessage` de role `user`. `collectSubAgents` chama `mastra.getAgent(key)` para os 8 keys (pulando ausentes — fail-soft da 4A).

### Flag

`AI_STUDIO_WORKFLOWS` (env, server-side). `useAiStudioWorkflows`/`setUseAiStudioWorkflows` no app-store (paridade/futuro painel), espelhando `useAiStudioSkills`.

## Cadeia de fallback (fail-soft)

| Situação | Resultado |
|---|---|
| flag off | descriptive solo (inalterado) |
| flag on, sem workflows ativos | descriptive solo |
| flag on, roteador falha/sem-match | workflow `default` (ou 1º ativo) |
| flag on, select/build lança | descriptive solo (try/catch na rota) |

## Error handling

- **Roteamento (fail-soft):** `selectWorkflow` nunca lança para a rota (try/catch interno → default); a rota também envolve tudo num try/catch → descriptive. O chat nunca quebra por workflow.
- **Enforcement 1-default (fail-loud no CRUD):** desmarcar o único default → erro claro no PATCH/upsert (não deixa o sistema sem default). Setar default extra → silenciosamente desmarca os outros (comportamento esperado, batch atômico).
- **Sub-agente ausente:** `collectSubAgents` pula keys que `getAgent` não retorna (4A já é fail-soft por agente); o supervisor roda com os que existirem.
- **Flag off:** zero efeito; `/api/chat` idêntico.

## Testing

- **loadWorkflows:** unit — só `active`; cacheado (2ª chamada no TTL não re-busca).
- **selectWorkflow:** unit (mock router) — casa pela melhor `description`; 1 workflow → sem LLM; sem-match/erro/id-inválido → default; sem default → 1º ativo (logado). Nunca lança.
- **buildSupervisorAgent:** unit (mock `Agent` + `buildOrchestratorPrompt`) — instructions = base+'\n\n'+instruction; `agents` = os subAgents; id 'supervisor'; model router.
- **Enforcement 1-default:** unit (fake Firestore + batch) — set true desmarca os outros (resta 1); desmarcar o único default → erro; vale em patch E upsert; type≠workflow não dispara.
- **Wiring /api/chat:** unit/integração — flag off → getAgent('descriptive') (não-regressão); flag on+workflows → buildSupervisorAgent chamado + stream do supervisor; flag on sem workflows → descriptive; erro → descriptive (fail-soft); lastUserText extrai a última msg de user.
- **app-store:** flag + setter (paridade).
- **Não-regressão (crítica):** `AI_STUDIO_WORKFLOWS` off → `/api/chat` idêntico (route test existente verde).
- **Build:** `pnpm build` + `tsc` verde.
- **Stream do supervisor (plano):** confirmar que o stream do supervisor (delega→chunks de tool-call) passa pela conversão Mastra→UI sem quebrar; ajuste, se houver, no handler de stream.

## Out of scope (YAGNI)

- Aposentar `orchestrator.ts` legado / os `createXAgent` (permanecem; não são o caminho do chat).
- `@mastra/memory` no supervisor (segue memory-service atual; ADR futura).
- Estado multi-turno de workflow (roteia a cada request; sem persistir workflow ativo na thread).
- Per-workflow model/maxSteps tuning (supervisor usa `router` + default Mastra).
- UI nova de admin (workflows já têm CRUD + `isDefault` no form, Fase 0).
- Seleção manual de workflow pelo usuário no chat (design é roteador automático por descrição).
- Reintroduzir o phase-based tool gating (ADR-0008) do supervisor legado — o supervisor Mastra delega via `agents`; sub-agentes mantêm seus tool sets.

## Open questions

- Nenhuma bloqueante. Caso o stream do supervisor (sub-agente delegado) precise de tratamento adicional na conversão Mastra→UI, é um ajuste localizado no handler do `/api/chat` (verificável no plano/execução); a arquitetura não muda.
