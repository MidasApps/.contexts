# AI Studio — Fase 3: Skills no Runtime (capacidades efetivas)

**Date:** 2026-06-18
**Status:** Draft
**Fase de:** `docs/superpowers/specs/2026-06-17-ai-studio-agents-skills-kb-workflows-design.md` (spec da plataforma)
**Depende de:** Fase 0/1 (config data-driven + descriptive no Mastra atrás de `AI_STUDIO_AGENTS`; `resolveAgentInstructions`/`loadSkillPlaybooks`) e Fase 2 (KB retrieval atrás de `AI_STUDIO_KB`; `createKbRetrievalTool`/`resolveVisibleKbs`).
**Relacionado:** ADR-0016 (AI Studio — implementa o que a ADR já decidiu; **não gera ADR nova**), ADR-0014 (Mastra runtime), ADR-0008 (phase-based tool gating), ADR-0006 (multi-tenancy).

## Goal

Fazer as **capacidades declaradas por uma skill valerem no runtime**. Hoje (Fase 1) anexar uma skill a um agente só injeta o **texto** do `playbook` na instrução; os `toolRefs` e `knowledgeBaseRefs` da skill são ignorados. A Fase 3 faz com que, ao anexar uma skill ao agente `descriptive`:

- as **tools** declaradas pela skill (e pelos `toolRefs` do próprio agente) entrem no conjunto de tools do agente;
- as **knowledge bases** declaradas pela skill ampliem a visibilidade de retrieval do agente.

Tudo **aditivo** sobre o conjunto hardcoded atual (a base é o piso garantido), atrás da flag `AI_STUDIO_SKILLS`, com fallback fail-soft ao comportamento atual (zero regressão).

## Problem

Estado atual confirmado por exploração (file:line):

1. **Skill = só texto.** `resolveAgentInstructions` (`src/features/ai-studio/runtime/resolve-agent.ts:13-25`) concatena apenas `[instructions, ...playbooks]`. `loadSkillPlaybooks` (`config-loader.ts:18-39`) extrai só `skill.playbook`. Os `skill.toolRefs`/`skill.knowledgeBaseRefs` **nunca são lidos**.
2. **Tools hardcoded.** `buildDescriptiveAgentTools(ctx)` (`src/features/ai-agents/agents/descriptive-agent.ts:24-78`) retorna um conjunto fixo. Nem os `toolRefs` do próprio agente são usados.
3. **Sem registry.** `tools-manifest.ts` é só metadados (validação/UI); **não há** mapa de tool KEY → factory AI SDK. Não existe como construir tools a partir de uma lista de keys.
4. **KB só do agente.** `createKbRetrievalTool` (`kb-retrieval-tool.ts`) recebe só `agent.knowledgeBaseRefs` (`descriptive-agent-mastra.ts:46-59`); kbRefs de skills não são unidas.

Consequência: a skill, que deveria empacotar conhecimento procedural **+ as ferramentas/fontes que ele usa**, hoje só entrega prosa. O pedido é completar o conceito.

## Decisões (do brainstorming)

1. **Escopo:** fazer as capacidades da skill (toolRefs + kbRefs) valerem no agente `descriptive`. Migrar os outros 7 agentes ao Mastra fica fora (ADR-0014, fases próprias).
2. **Modelo de tools:** **aditivo** sobre a base hardcoded. A base continua sendo o piso; `agent.toolRefs ∪ skill.toolRefs` são adicionados via registry. Refs órfãs/erradas nunca removem tools.
3. **Registry:** novo mapa key→factory cobrindo as keys do manifest com factory real; key sem entrada → pulada + logada (soft).
4. **KB:** quando `AI_STUDIO_SKILLS` on, a visibilidade de KB passa a unir `agent.kbRefs ∪ skill.kbRefs`.
5. **Fail-soft total:** qualquer erro preserva a base hardcoded; nunca derruba o chat.
6. **Flag:** `AI_STUDIO_SKILLS` (env, SoT) + `useAiStudioSkills` no app-store (paridade).
7. **Sem ADR nova** (implementa ADR-0016).

## Reaproveitamento (intocado / estendido)

- **Intocado:** `buildDescriptiveAgentTools` (a base hardcoded permanece o piso), `resolveAgentInstructions` (texto de playbooks — Fase 1), `createKbRetrievalTool`/`resolveVisibleKbs` (Fase 2 — recebem refs efetivas, sem mudar a lógica interna), os factories de tools já existentes em código.
- **Estendido (DRY):** `config-loader.ts` ganha `loadSkills(skillRefs)` (docs completos, cacheado); `loadSkillPlaybooks` passa a derivar dele (mesma busca alimenta texto e capacidades).

## Componentes

```
src/features/ai-studio/runtime/
  tool-registry.ts        CREATE — KEY→factory; buildToolsFromKeys(keys, ctx)
  resolve-capabilities.ts CREATE — resolveAgentCapabilities(systemKey, flagOn) → {toolKeys, kbRefs}
  config-loader.ts        MODIFY — extrai loadSkills(skillRefs); loadSkillPlaybooks reusa
src/features/ai-agents/mastra/
  descriptive-agent-mastra.ts  MODIFY — injeta tools concedidas (aditivo) + KB refs efetivas, atrás de AI_STUDIO_SKILLS
src/shared/stores/app-store.ts  MODIFY — flag useAiStudioSkills (paridade)
```

### tool-registry.ts

```
type ToolFactory = (ctx: AgentDynamicContext) => Tool | null
const TOOL_REGISTRY: Record<string /* manifest key */, ToolFactory>
buildToolsFromKeys(keys: string[], ctx): Record<string, Tool>
```
- Mapeia cada key do manifest que tem factory reutilizável (ex.: `execute_sql`→`createExecuteSqlTool`, `vector_query`→`createVectorQueryTool`, etc.) para o factory, recebendo `ctx` (clientId/persona).
- `buildToolsFromKeys` resolve cada key; key ausente no registry ou factory que devolve `null` → **pulada + `console.warn`** (soft). Retorna `Record<toolName, Tool>` pronto p/ `Object.assign` no conjunto do agente.
- Cobre o subconjunto de keys do manifest aplicável ao `descriptive`. Keys do manifest sem factory (ainda) simplesmente não entram no registry — referenciá-las é no-op logado, não erro.

### resolve-capabilities.ts

```
interface AgentCapabilities { toolKeys: string[]; kbRefs: string[] }
resolveAgentCapabilities(systemKey: string, flagOn: boolean): Promise<AgentCapabilities>
```
- `flagOn === false` → `{ toolKeys: [], kbRefs: [] }` (sem carregar nada).
- `flagOn === true`: `loadAgentConfig(systemKey)` + `loadSkills(agent.skillRefs)`; retorna:
  - `toolKeys` = união de `agent.toolRefs` + cada `skill.toolRefs` (dedup).
  - `kbRefs` = união de `agent.knowledgeBaseRefs` + cada `skill.knowledgeBaseRefs` (dedup).
- Qualquer throw → `{ toolKeys: [], kbRefs: [] }` (fail-soft).

### Wiring (descriptive-agent-mastra.ts)

```
const tools = buildDescriptiveAgentTools(ctx);            // base hardcoded — piso, intocado
const skillsOn = process.env.AI_STUDIO_SKILLS === 'on';
const caps = await resolveAgentCapabilities('descriptive', skillsOn);  // {} se off/erro
Object.assign(tools, buildToolsFromKeys(caps.toolKeys, ctx));          // aditivo (união por key)

// KB (Fase 2): refs efetivas
if (process.env.AI_STUDIO_KB === 'on') {
  const agentRefs = (await loadAgentConfig('descriptive'))?.knowledgeBaseRefs ?? [];
  const kbRefs = Array.from(new Set([...agentRefs, ...caps.kbRefs]));  // une skill kbRefs quando skillsOn
  if (kbRefs.length > 0) tools.kb_retrieval = createKbRetrievalTool({ clientId: ctx.clientId, knowledgeBaseRefs: kbRefs });
}
```
Observação: quando `AI_STUDIO_SKILLS` off, `caps` é vazio → KB usa só `agentRefs` (comportamento Fase 2 inalterado).

## Composição das 3 flags (independentes)

| Flag | Efeito |
|---|---|
| `AI_STUDIO_AGENTS` | Instruções do Firestore + **texto** dos playbooks das skills (Fase 1) |
| `AI_STUDIO_KB` | Tool de retrieval; refs = agente (∪ skills se `SKILLS` on) |
| `AI_STUDIO_SKILLS` | **Tools** concedidas (agente ∪ skills) entram no conjunto; amplia KB com kbRefs das skills |

Cada flag off → comportamento anterior. Todas off → `descriptive` idêntico ao atual.

## Data Flow (com as 3 flags on)

```
/api/chat → createDescriptiveAgentMastra(ctx)
  instructions = resolveAgentInstructions('descriptive', fallback, AGENTS_on)   // texto + playbooks
  tools        = buildDescriptiveAgentTools(ctx)                                // base
               ∪ buildToolsFromKeys(resolveAgentCapabilities(...).toolKeys, ctx) // skills/agent grants (SKILLS_on)
  kb_retrieval = createKbRetrievalTool({ kbRefs: agent ∪ skill kbRefs })         // (KB_on)
  → new Agent({ instructions, tools, model })
```

## Error handling

- **Refs órfãs (soft):** já barradas como warning na admin; no runtime, key sem registry → pulada + logada; skill inexistente → ignorada. Nunca lança.
- **Fail-soft:** erro em qualquer etapa de capacidades → base hardcoded intacta; chat segue.
- **Flag off:** nenhuma capacidade adicionada; independente das outras flags.
- **Dedup:** tools são objeto keyed; concessão redundante sobrescreve idempotente.
- **Tool gating (ADR-0008):** concessões ampliam o que o agente tem; o gate por fase do supervisor continua por cima.

## Testing

- **tool-registry:** unit — keys conhecidas → tools certas; key desconhecida → pulada (sem throw); ctx repassado.
- **resolve-capabilities:** unit (mock config-loader) — off → vazio sem carregar; on → união de toolRefs/kbRefs (agente + N skills); skill sem refs → nada; dedup; erro → vazio.
- **config-loader refactor:** unit — `loadSkillPlaybooks` mantém saída (Fase 1 intacta); `loadSkills` cacheado não busca a mesma skill 2×.
- **Wiring:** unit — `AI_STUDIO_SKILLS` off → tools = só base (não-regressão); on com skill concedendo `execute_sql`+KB → base permanece + tools concedidas aparecem; KB tool recebe `agent ∪ skill kbRefs`.
- **Não-regressão (crítica):** `descriptive-agent.test.ts` verde com todas as flags off.
- **Build:** `pnpm build` + type-check verde (lição da Fase 2: rodar build, não só `pnpm test`).

## Out of scope (YAGNI)

- Migrar os outros 7 agentes ao Mastra (ADR-0014 — fases próprias).
- Modelo **replace** de tools (escolhido aditivo); tornar `agent.toolRefs` autoritativos sobre a base.
- Skills compostas de skills; prioridade/ordem entre skills.
- Expandir o registry além das keys do manifest (canvas/BQML-create/etc.).
- Painel client-side das flags (`useAiStudio*` seguem como paridade/futuro).
- Alterar `buildDescriptiveAgentTools`, `resolveAgentInstructions`, ou a lógica interna de `createKbRetrievalTool`/`resolveVisibleKbs`.

## Open questions

- Nenhuma bloqueante. Quais keys exatas do manifest entram no registry na primeira leva: as que já têm factory reutilizável e fazem sentido para o `descriptive` (ex.: `execute_sql`, `bq_dry_run_sql`, `vector_query`, `calculate_statistics`, `lookup_glossary`); keys sem factory pronto ficam fora do registry (no-op logado) — decisão de implementação, não de design, guiada pelos factories existentes.
