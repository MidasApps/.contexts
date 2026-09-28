# AI Studio — Fase 4A: Migração dos 7 sub-agentes para Mastra Agent

**Date:** 2026-06-18
**Status:** Draft
**Sub-projeto de:** Fase 4 (workflows no runtime). 4A (este) é pré-requisito de 4B (supervisor Mastra + roteador de workflows).
**Depende de:** Fase 1 (`resolveAgentInstructions` + `AI_STUDIO_AGENTS`), Fase 2 (`createKbRetrievalTool` + `AI_STUDIO_KB`), Fase 3 (`resolveAgentCapabilities`/`buildToolsFromKeys` + `AI_STUDIO_SKILLS`) — o wiring que o helper genérico encapsula.
**Relacionado:** **ADR-0014** (Mastra runtime full — esta fase completa a migração que a ADR iniciou pelo descriptive; **não gera ADR nova**), ADR-0016 (AI Studio config data-driven), ADR-0006 (multi-tenancy).

## Goal

Migrar os 7 sub-agentes legados (`diagnostic`, `predictive`, `prescriptive`, `monitoring`, `simulation`, `external`, `cashflow`) de AI SDK v6 (`createXAgent` + `createAgentTool`) para **Mastra Agent**, espelhando o `descriptive` já migrado. Extrair o wiring repetido (Fases 1/2/3) num **helper genérico** único, refatorar o `descriptive` para usá-lo, e registrar os 8 agentes no `buildMastraInstance`.

Ao fim do 4A: os 8 agentes existem como Mastra Agents construídos por um caminho de código compartilhado. **O `/api/chat` continua rodando só o `descriptive`** — os 7 ficam registrados mas dormentes até o supervisor do 4B os invocar.

## Problem

Pós-ADR-0014, só o `descriptive` foi migrado para Mastra (`descriptive-agent-mastra.ts`). Os outros 7 seguem no caminho legado (`createXAgent(ctx)` → `createAgentTool`), usados apenas pelo `orchestrator.ts` legado — que **não** é mais o caminho do `/api/chat`. Para o 4B construir um supervisor Mastra que compõe os sub-agentes nativamente, os 7 precisam existir como Mastra Agents.

Além disso, o `descriptive-agent-mastra.ts` acumulou o wiring das Fases 1/2/3 (instruções do Firestore, KB tool, capacidades de skills). Migrar os 7 por cópia desse wiring duplicaria ~70% do código 7×. A migração deve **extrair** esse wiring num helper compartilhado.

## Decisões (do brainstorming)

1. **Helper genérico** `createMastraAgentFromConfig` encapsula o wiring Fases 1/2/3; cada agente é um adaptador fino. Refatorar o `descriptive` para usá-lo.
2. **Fatorar `buildXAgentTools(ctx)`** de cada `createXAgent` legado (sem tocar o `createXAgent`, que o orchestrator legado ainda usa).
3. **Paridade Fases 1/2/3** via o helper — gated pelas envs existentes; com flags off = prompt de código + tools hardcoded (equivalente ao legado).
4. **Registrar os 8** no `buildMastraInstance`, com **fail-soft por agente** (um defeituoso não impede os outros).
5. **`/api/chat` inalterado** — segue chamando `mastra.getAgent('descriptive')`; os 7 dormentes até o 4B.
6. **Sem ADR nova** (completa ADR-0014); **sem flag nova** (4B traz `AI_STUDIO_WORKFLOWS`).
7. **`maxSteps`/thinking-budget afinados fora de escopo** (Mastra default).

## Reaproveitamento (intocado / estendido)

- **Intocado:** os `createXAgent` legados (orchestrator legado segue funcionando), os prompt builders (`build*AgentPrompt`), os factories de tools individuais, os runtime helpers das Fases 1/2/3 (já recebem `systemKey`).
- **Estendido:** cada agente legado ganha um `buildXAgentTools(ctx)` exportado (fatorado do `createXAgent`); `descriptive-agent-mastra.ts` refatorado para o helper; `instance.ts` registra os 8 com fail-soft.

## Componentes

```
src/features/ai-agents/mastra/
  create-mastra-agent-from-config.ts   CREATE — helper genérico (wiring Fases 1/2/3)
  descriptive-agent-mastra.ts          MODIFY — delega ao helper (não-regressão)
  diagnostic-agent-mastra.ts           CREATE — adaptador fino
  predictive-agent-mastra.ts           CREATE
  prescriptive-agent-mastra.ts         CREATE
  monitoring-agent-mastra.ts           CREATE
  simulation-agent-mastra.ts           CREATE
  external-agent-mastra.ts             CREATE
  cashflow-agent-mastra.ts             CREATE
  instance.ts                          MODIFY — registra os 8 (fail-soft por agente)
src/features/ai-agents/agents/
  {diagnostic,predictive,prescriptive,monitoring,simulation,external,cashflow}-agent.ts  MODIFY — exporta buildXAgentTools(ctx)
```

### Helper genérico

```
createMastraAgentFromConfig(input: {
  systemKey: string;                              // 'diagnostic' etc. — resolve config no Firestore
  name: string; description: string;
  model: LanguageModelV2;                         // vertex('gemini-2.5-pro' | 'gemini-2.5-flash')
  buildSystemPrompt: (ctx: AgentDynamicContext) => string;   // fallback (Fase 1)
  buildToolsFactory: (ctx: AgentDynamicContext) => Record<string, unknown>; // base tools
  ctx: AgentDynamicContext;
}): Promise<Agent>
```
Sequência (idêntica ao descriptive de hoje):
1. `tools = buildToolsFactory(ctx)` (base hardcoded).
2. Fase 3: `caps = resolveAgentCapabilities(systemKey, AI_STUDIO_SKILLS==='on')`; `Object.assign(tools, buildToolsFromKeys(caps.toolKeys, ctx))` (aditivo).
3. Fase 2: se `AI_STUDIO_KB==='on'` → `loadAgentConfig(systemKey)`, `kbRefs = agentRefs ∪ caps.kbRefs`, `tools.kb_retrieval = createKbRetrievalTool({clientId, knowledgeBaseRefs})` (try/catch fail-soft).
4. Fase 1: `instructions = resolveAgentInstructions({systemKey, fallback: buildSystemPrompt(ctx), flagOn: AI_STUDIO_AGENTS==='on'})`.
5. `return new Agent({ id: `${systemKey}_agent`, name, description, instructions, model: model as never, tools: tools as never })`.

### Adaptadores (exemplo: diagnostic)

```
createDiagnosticAgentMastra({ ctx }): Promise<Agent> =
  createMastraAgentFromConfig({
    systemKey: 'diagnostic',
    name: 'Diagnostic Agent',
    description: '…',
    model: vertex('gemini-2.5-pro'),
    buildSystemPrompt: buildDiagnosticAgentPrompt,
    buildToolsFactory: buildDiagnosticAgentTools,
    ctx,
  })
```

Models por agente (espelham os tiers legados):
- **`gemini-2.5-pro`** (reasoning): diagnostic, predictive, prescriptive, monitoring, simulation.
- **`gemini-2.5-flash`** (fast): external, cashflow, descriptive.

### `buildMastraInstance` (fail-soft por agente)

```
const defs = [
  ['descriptive', createDescriptiveAgentMastra], ['diagnostic', createDiagnosticAgentMastra], …
];
const agents = {};
for (const [key, factory] of defs) {
  try { agents[key] = await factory({ ctx }); }
  catch (e) { console.error(`[mastra] agente ${key} falhou ao construir — pulado`, e); }
}
return new Mastra({ agents });
```
Garante que um agente defeituoso não impeça o registro dos demais; no mínimo o `descriptive` (caminho do `/api/chat`) sempre sobe se construído com sucesso.

## Data flow

```
/api/chat → buildMastraInstance({ctx}) → constrói os 8 (flags off → sem I/O) → mastra.getAgent('descriptive') → stream
                                          ↑ os 7 registrados mas NÃO invocados (dormentes até 4B)
```
Único efeito no chat ao vivo: o refactor do descriptive (comportamento preservado). Com flags off, as 8 factories só montam tools em memória (sem leitura Firestore).

## Error handling

- **Fail-soft do wiring (herdado):** falha de leitura de config/skills/KB → fallback (prompt de código + tools hardcoded); flags off → fallback imediato sem I/O.
- **Fail-soft por agente (novo):** factory que lança no `buildMastraInstance` → agente pulado + logado; os demais registram.
- **Tenancy (ADR-0006):** os `buildXAgentTools` preservam a exposição condicional por `clientId`/`personaId` (ex. `list_validated_queries`/`save_validated_query` só com tenancy), idêntica ao `createXAgent` legado.

## Testing

- **`createMastraAgentFromConfig` (central):** unit (mock dos runtime helpers + `Agent` + `vertex`) — flags off → instructions = `buildSystemPrompt`, tools = base; SKILLS on → tools aditivas via `buildToolsFromKeys`; KB on → `kb_retrieval` com `agent ∪ skill` kbRefs; AGENTS on → instruções do Firestore; erro em qualquer fase → fallback.
- **7 adaptadores:** unit leve (helper mockado) — cada um chama o helper com `systemKey`/model/`buildSystemPrompt`/`buildToolsFactory` corretos.
- **`buildXAgentTools` fatorado (7):** unit — conjunto de tools idêntico ao que o `createXAgent` legado montava, incluindo condicionais por tenancy.
- **Não-regressão (crítica):** `descriptive-agent.test.ts` + `descriptive-agent-mastra.skills.test.ts` verdes (descriptive via helper = comportamento idêntico).
- **`buildMastraInstance`:** unit — registra os 8; `getAgent('descriptive'|'diagnostic'|…)` retornam Agents; um factory que lança não impede os outros (fail-soft por agente).
- **Build:** `pnpm build` + `tsc` verde.

## Out of scope (YAGNI)

- Supervisor Mastra + roteador de workflows + `AI_STUDIO_WORKFLOWS` + enforcement de 1-default → **Fase 4B**.
- Tornar os 7 alcançáveis pelo `/api/chat` (só o supervisor do 4B os invoca).
- Aposentar o `orchestrator.ts` legado ou os `createXAgent` (permanecem; não são o caminho do `/api/chat`).
- Alterar quais tools cada agente tem (migração fiel; mudança de capacidade é via Firestore/Fase 3).
- Afinar `maxSteps`/thinking-budget por agente (Mastra default; o `maxSteps` legado vivia no `AgentConfig` do `createAgentTool`).
- Memória `@mastra/memory` por agente (segue como hoje no descriptive — follow-up de ADR própria).

## Open questions

- Nenhuma bloqueante. Descrições/nomes dos adaptadores podem reusar os do seed manifest dos agentes (já existentes), mantendo consistência com a admin.
