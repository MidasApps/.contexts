# Proposta: Superpowers → harness DDC (respeito a `.contexts`)

**Referência local:** `docs/references/superpowers/` (clone de [obra/superpowers](https://github.com/obra/superpowers))  
**Data:** 2026-07-13 (Fases A–C implementadas; ADR 2026-07-14)  
**Escopo:** melhorar `.claude/` deste projeto sem copiar Superpowers “de carona”; adaptar o que **força** o agente a seguir o SSOT em `.contexts/`.

**Decisão formal:** `@.contexts/engineering/decisions/0001-ddc-engineering-baseline-and-harness-enforcement.md`

---

## 1. O que o Superpowers faz de bom (mecanismos, não features)

### 1.1 Bootstrap injetado no SessionStart (o “coração”)

No Superpowers, o hook `SessionStart` **não lista um catálogo de nomes** — ele injeta o conteúdo **completo** de `using-superpowers/SKILL.md` dentro de tags `<EXTREMELY_IMPORTANT>`, com a regra:

> Se há 1% de chance de uma skill aplicar, você **deve** invocá-la **antes** de qualquer resposta ou ação.

Sem esse bootstrap, as skills no disco são “peso morto” (documentado em `docs/porting-to-a-new-harness.md`).

**Hoje no DDC:** `session-start-announce.cjs` só injeta 2 linhas (rules + agents). Isso **lembra** que existem rules, mas **não força** o fluxo “ler skill / ler `.contexts` antes de codar”.

### 1.2 Skills de *processo* com hard-gates e anti-racionalização

| Skill Superpowers | Papel | Gatilho |
|---|---|---|
| `using-superpowers` | Meta: sempre checar skills | SessionStart |
| `brainstorming` | Spec antes de código | Feature nova |
| `writing-plans` | Plano bite-sized + Global Constraints | Pós-spec |
| `subagent-driven-development` | 1 subagent/task + review | Executar plano |
| `test-driven-development` | Red-green real | Implementação |
| `verification-before-completion` | Evidência antes de “done” | Antes de claim/PR |
| `requesting-code-review` | Reviewer com contexto curado | Pós-task / pré-merge |
| `systematic-debugging` | Causa raiz, não chute | Bugs |
| `using-git-worktrees` | Isolamento de branch | Feature work |

O poder está no **texto comportamental**: tabelas de “Red Flags / Rationalizations”, iron laws, checklists, templates de subagent — não só em “descrição keyword-dense”.

**Hoje no DDC:** skills de stack/domínio são excelentes manuais; skills de *processo* existem (`tdd`, `sdd`, `decisions`) mas **não têm hard-gate de sessão** nem “using-ddc” meta-skill.

### 1.3 Cadeia Spec → Plan → Execute → Review

Fluxo canônico Superpowers:

```
brainstorming → writing-plans → SDD/executing-plans
     → review por task → verification-before-completion → finishing branch
```

Artefatos em `docs/superpowers/specs/` e `plans/` com templates rígidos (sem TBD, código nos steps, Global Constraints).

**Hoje no DDC:** `.contexts/` *é* a camada de verdade (business / product / engineering), mas o harness não **obriga** o agente a mapear o pedido do usuário a paths `@.contexts/...` antes de editar código de app.

### 1.4 Subagents com contexto *construído*, não herdado

SDD Superpowers: brief em arquivo, report em arquivo, progress ledger, review package, modelo barato vs caro, “não cole histórico de 42k chars”.

**Hoje no DDC:** agents ricos (`backend`, `frontend`, `code-reviewer`…) com skills preload — bom — mas falta **protocolo de dispatch** (brief path + always-read de `.contexts` + ledger de progresso) como skill operacional.

### 1.5 Verification gate

`verification-before-completion`: proíbe claims de sucesso sem comando fresco e output lido.

**Hoje no DDC:** rule `testing` + skill `vitest`/`playwright`; sem iron law de sessão.

### 1.6 O que *não* copiar cegamente

| Evitar | Por quê |
|---|---|
| Pasta `docs/superpowers/` paralela a `.contexts` | Quebra o princípio “`.contexts` = SSOT” |
| Visual companion / brainstorm server | Complexidade alta, ROI baixo para harness de contextos |
| Port multi-harness (Codex/Cursor/pi) | Fora do escopo atual (Claude Code + DDC) |
| Instalar o plugin Superpowers *em cima* sem adaptação | Duplica workflow e compete com rules/skills DDC |
| Reescrever skills DDC no tom Superpowers sem eval | Risco de “slop” e perda de precisão de stack |

---

## 2. Diagnóstico: o que falta para o agente *respeitar* `.contexts`

| Camada | Estado DDC | Gap vs Superpowers |
|---|---|---|
| Conteúdo SSOT (`.contexts/engineering|business|product`) | Forte | — |
| Rules sempre-ativas (`.claude/rules/`) | Forte | Não lembram *quando* abrir `@.contexts/...` profundo |
| Skills de stack | Forte | Já apontam para `@.contexts/...` no final; invocação não é mandatória |
| SessionStart | Fraco (2 linhas) | Falta bootstrap com iron laws + mapa `.contexts` |
| Processo Spec→Plan→Build | Parcial (`sdd`, `tdd`, agents) | Falta cadeia com hard-gates e templates de plano |
| Grounding de paths | Rule `grounding` | Não bloqueia Write que inventa path fora do layout |
| Review | Agent `code-reviewer` | Falta skill de *quando* disparar + template de brief |
| Verificação | Implícita | Falta skill “evidence before done” |
| Progress pós-compactação | Só re-announce | Falta ledger (ex. `.claude/agent-memory` ou `.contexts`-adjacent) |
| `suggest-skills.cjs` | Bom esboço | Stale (`typescript-6`); não sugere **context paths** |

---

## 3. Proposta de incorporação (priorizada)

### P0 — Bootstrap “using-ddc” (equivalente a `using-superpowers`)

**Criar** skill operacional:

`.claude/skills/processes/using-ddc/SKILL.md`

Conteúdo-chave (inspirado no Superpowers, DDC-native):

1. **Antes de qualquer ação** em feature/bug/docs: identificar se o pedido toca domínio, produto, engenharia ou Claude-primitives.
2. **Mapear** para paths `@.contexts/...` **existentes** (Read/Glob; se não existe → dizer “não encontrei”, não inventar).
3. **Process skills first**, depois stack skills (igual Superpowers).
4. **Nunca** duplicar doutrina de `.contexts` em código de app ou em skill sem `@` de volta.
5. Red flags: “é só um fix rápido”, “já sei a rule”, “exploro o código primeiro”, “não preciso abrir engineering/…”.

**Alterar** `session-start-announce.cjs` (ou novo `bootstrap-ddc.cjs`):

- Injetar o **corpo inteiro** de `using-ddc` via `additionalContext` / `hookSpecificOutput` (padrão multi-plataforma do Superpowers se quiser Grok/Cursor depois).
- Manter 1 linha de catálogo (agents + reminder “skills via description”) **depois** do bootstrap, não no lugar dele.
- Reusar no `PreCompact` (como Superpowers em `compact`) para o modelo não “esquecer” a lei após compactação.

**Aceite (teste Superpowers adaptado):**  
Prompt: *“Cria um endpoint de orders com paginação”*  
→ Deve **ler** `@.contexts/engineering/rules/api-design`, `contracts/api`, `stacks/...` (ou anunciar) **antes** de Write em `src/`.

### P1 — Skill de processo “grounding-contexts” (hard-gate de leitura)

Não só rule `grounding` (passiva). Skill:

- Checklist: Glob paths → Read relevant → Confirmar versões no stack pinado (MEMORY matrix) → Só então editar.
- Para mudanças em `.claude/`: sempre cruzar com `ddc-builder` / agents `claude-*` e **não** inventar rule/skill duplicando `.contexts`.
- Para feature de produto: always-read vision/persona/policies quando UI/copy/consentimento.

Opcional **hook PreToolUse Write|Edit** (leve, não banir `.env`):

- Se `file_path` está em `app/`, `src/`, `functions/` **e** a sessão não registrou leitura de nenhum `@.contexts/engineering/**` no turno, emitir `systemMessage` (async, não-bloqueante) ou bloquear só em modo strict.
- Começar **não-bloqueante** (como Superpowers: bootstrap é soft-hard via prompt, não exit 2).

### P2 — Cadeia Spec → Plan → Execute alinhada a `.contexts`

| Superpowers | DDC adaptado |
|---|---|
| `brainstorming` → `docs/superpowers/specs/` | Skill `brainstorming-ddc`: explore **business/product/engineering** primeiro; design short; se decisão arquitetural → skill `decisions` + ADR em `engineering/decisions/` |
| `writing-plans` → `docs/superpowers/plans/` | Skill `writing-plans-ddc`: plano em `docs/plans/` **ou** issue; cada task lista **Contexts obrigatórios** (`@.contexts/...`) + stack pins + testes |
| Global Constraints no plano | Copiar da matriz `engineering/MEMORY.md` + compliance + rules always-on relevantes |
| SDD subagents | Protocolo nos agents existentes: brief file + “always-read: [lista `.contexts`]” + “não herdar chat” + review com `code-reviewer` |

**Não** criar segunda SSOT. Specs de produto longas vão para `.contexts/product` só se o usuário pedir persistência de produto; plans de implementação ficam em `docs/plans/` (efêmero) com links `@.contexts`.

### P3 — Verification + Review como skills de processo

1. **`verification-before-completion`** (port quase direto, renomeado se quiser): iron law + tabela claim→comando. No DDC, claim “conforme contracts” exige Grep/Read nos arquivos de contrato, não só testes verdes.
2. **`requesting-context-review`**: template de dispatch para `code-reviewer` com:
   - diff package
   - lista de rules/contracts que deveriam aplicar
   - pergunta: “alguma citação `@.contexts` inventada ou path legado?”
3. Integrar no fluxo pós-task dos agents `full-stack` / `backend` (description: “após feature material, request review”).

### P4 — Melhorar hooks existentes (baixo custo, alto impacto)

| Hook | Melhoria |
|---|---|
| `suggest-skills.cjs` | Corrigir `typescript-6` → `typescript-7`; mapear paths `\.contexts/` e `.claude/rules` → skills/agents corretos; **sugerir contexts**: ex. edit em `**/orders/**` → `@contracts/api`, `@rules/api-design` |
| `UserPromptSubmit` | Keywords: “endpoint”, “schema”, “migration”, “firestore” → lista de **@paths** + skills |
| `Stop` | Além de tamanho do CLAUDE.md: se houve Write em código e zero Read em `.contexts` no turn, `systemMessage` de aviso grounding |
| Commit guard | Manter (já bom) |

### P5 — Progress ledger (anti-amnésia pós-compact)

Inspirado no `.superpowers/sdd/progress.md`:

- Path: `.claude/agent-memory/progress.md` (já existe pasta `agent-memory/`)
- SessionStart / PreCompact: se o arquivo existe, incluir últimas N linhas no bootstrap
- SDD/plan execution: append “Task N complete + commits”

### P6 — (Opcional) Plugin-style packaging

Superpowers é plugin instalável multi-harness. Para DDC, o equivalente maduro seria:

- Empacotar `using-ddc` + process skills + hooks como **plugin interno** do monorepo (não marketplace), ou
- Manter tudo em `.claude/` (status quo) com bootstrap robusto.

Prioridade baixa enquanto o projeto é o próprio framework DDC.

---

## 4. Mapa “não duplicar”

| Superpowers skill | Já coberto no DDC? | Ação |
|---|---|---|
| using-superpowers | Não | **Criar** using-ddc |
| brainstorming | Parcial (sdd, tech-lead) | Skill processo leve + hard-gate |
| writing-plans | Parcial (sdd) | Template + Global Constraints = MEMORY |
| TDD | `practices/tdd` + rule testing | Endurecer description / red flags (opcional) |
| verification-before-completion | Fraco | **Portar** |
| requesting-code-review | Agent code-reviewer | Skill “quando/como dispatch” |
| SDD | Agents + memory | Protocolo de brief + ledger |
| worktrees | Process git | Opcional skill fina |
| systematic-debugging | — | Portar se bugs forem frequentes |
| finishing-a-development-branch | pull-requests, release | Opcional |
| writing-skills | claude-skills agent | Manter DDC; pegar só “pressure-test” idea |

---

## 5. Plano de implementação sugerido (fases)

### Fase A (1–2h) — Bootstrap mínimo viável — **FEITO (2026-07-13)**

1. ✅ Criar `using-ddc/SKILL.md` em `.claude/skills/processes/using-ddc/`.
2. ✅ `session-start-announce.cjs` injeta skill completo + catálogo (SessionStart + PreCompact).
3. Aceite manual: prompt de feature deve citar/ler `.contexts` antes de código (validar em sessão real).
4. ✅ Fix `suggest-skills` (`typescript-7` + map `.contexts` + keywords de endpoint/API).

### Fase B (meio dia) — Processo — **FEITO (2026-07-13)**

1. ✅ `verification-before-completion` skill.
2. ✅ `writing-plans-ddc` + templates implementer/task-reviewer.
3. ✅ Agents `full-stack` / `backend`: process first + MEMORY always-read + skills de processo.

### Fase C (1 dia) — SDD light — **FEITO (2026-07-13)**

1. ✅ Progress ledger `.claude/agent-memory/progress.md` + tail no SessionStart.
2. ✅ Templates `implementer-brief.md` / `task-reviewer-brief.md`.
3. ✅ Hook Stop `grounding-warn.cjs` (aviso best-effort).

### Fase D (opcional)

1. Brainstorming hard-gate para features net-new.
2. Systematic-debugging.
3. Eval harness (prompts de aceite) como Superpowers `tests/explicit-skill-requests/`.

---

## 6. Critérios de sucesso

| Métrica | Como medir |
|---|---|
| Bootstrap carregado | SessionStart imprime using-ddc (log/transcript) |
| Grounding | Em 5 prompts de feature, ≥4 leem path real em `.contexts` antes do 1º Write |
| Sem path inventado | Grep de refs `@.contexts` no diff bate com arquivos existentes |
| Verificação | Claims “tests pass” sempre acompanhados de output no mesmo turn |
| Compact recovery | Após compact, agente ainda cita using-ddc / lê ledger |

---

## 7. Recomendação final

**Incorpore a *lógica de enforcement* do Superpowers, não o produto inteiro.**

O maior ROI para “respeitar `.contexts`” é:

1. **Bootstrap SessionStart com iron laws DDC** (P0),  
2. **Cadeia process skills** com Global Constraints = MEMORY + contracts (P2),  
3. **Verification + review com contexto curado** (P3),  
4. **Hooks que sugerem @paths**, não só skills de stack (P4).

O DDC já vence o Superpowers em **conteúdo de domínio/stack**. O Superpowers vence em **disciplina de processo e injeção de comportamento**. Juntar os dois: `.contexts` manda *o quê*; o bootstrap+process skills mandam *quando e como ler*.

---

## 8. Referências no disco

- Clone analisado: `docs/references/superpowers/`
- Bootstrap original: `docs/references/superpowers/hooks/session-start`
- Meta-skill: `docs/references/superpowers/skills/using-superpowers/SKILL.md`
- Port guide: `docs/references/superpowers/docs/porting-to-a-new-harness.md`
- Harness atual: `.claude/settings.json`, `.claude/hooks/session-start-announce.cjs`
