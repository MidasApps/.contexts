---
name: writing-plans-ddc
description: >
  Use quando houver spec/requisitos multi-step antes de implementar — plano bite-sized
  com Global Constraints da MEMORY, contexts obrigatórios por task e steps testáveis.
  Keywords: plan, plano, implementation plan, writing plans, tasks, checklist.
---

# Writing Plans (DDC)

Escreve plano de implementação para um executor com **zero contexto** do monorepo e
gosto duvidoso: paths exatos, contexts a ler, código/testes onde couber, DRY, YAGNI, TDD.

**Announce:** “Using writing-plans-ddc to create the implementation plan.”

**Pré-requisito:** `using-ddc` — classifique o pedido e leia SSOT relevante antes de planejar.
Se ainda não há design/spec e a feature é net-new, alinhe escopo (e skill `sdd` / tech-lead) antes.

## Onde salvar

```
docs/plans/YYYY-MM-DD-<feature-kebab>.md
```

- Planos são **efêmeros** (execução). Não são SSOT.
- Doutrina durável (API, schema, produto) → `.contexts/` ou ADR em `engineering/decisions/`.
- Cada plano **linka** `@.contexts/...` em vez de copiar doutrina.

## Header obrigatório

```markdown
# [Feature] Implementation Plan

> **For agentic workers:** Use skill `using-ddc` before coding. Prefer subagent-per-task
> with templates in `writing-plans-ddc` (implementer + task-reviewer). Track progress in
> `.claude/agent-memory/progress.md`.

**Goal:** [uma frase]

**Architecture:** [2–3 frases]

**Tech Stack:** [pins — copiar de MEMORY, não inventar versões]

## Global Constraints

- Node 24 / TypeScript 7 / Next 16.2 / React 19.2 / Zod 4.4 (ver `@.contexts/engineering/MEMORY.md`)
- [contratos e rules que amarram o plano — paths @.contexts exatos]
- [compliance / multi-tenant / region se aplicável]

---
```

## Por task

```markdown
### Task N: [nome]

**Contexts (Read first):**
- `@.contexts/engineering/...`
- `@.contexts/engineering/...`

**Files:**
- Create: `exact/path`
- Modify: `exact/path`
- Test: `exact/path`

**Interfaces:**
- Consumes: ...
- Produces: ...

- [ ] **Step 1: Read contexts** — listar paths (não pular)
- [ ] **Step 2: Write failing test** (se comportamento novo)
- [ ] **Step 3: Run test — expect FAIL**
- [ ] **Step 4: Minimal implementation**
- [ ] **Step 5: Run test — expect PASS** (+ typecheck se TS)
- [ ] **Step 6: Append progress ledger**
- [ ] **Step 7: Commit** (Conventional Commits)

**Verify (verification-before-completion):**
- Comando(s): `...`
- Expected: ...
```

## Regras do plano

- Sem TBD / “add validation” / “similar to Task N” sem código
- Paths reais (Glob se incerto)
- Process skills first; stack skills depois
- Task = unidade com ciclo de teste e review possível
- Se o spec cobrir vários subsistemas independentes: **planos separados**

## Self-review do plano

1. Toda requirement do spec tem task?
2. Global Constraints batem com MEMORY (versões)?
3. Cada task tem Contexts obrigatórios?
4. Placeholders? Eliminar.

## Handoff

Após salvar o plano, oferecer:

1. **Subagent-driven** (recomendado) — 1 implementer por task + task-reviewer  
   Templates: `implementer-brief.md`, `task-reviewer-brief.md` nesta pasta.
2. **Inline** — executar na sessão com checkpoints e `verification-before-completion`.

## Progress ledger

Após cada task completa e review limpa, append em  
`.claude/agent-memory/progress.md`:

```markdown
- YYYY-MM-DD | Task N complete | plan: docs/plans/... | commits: abc..def | review: clean
```

## Referências

- `@.contexts/engineering/MEMORY.md`
- `@.contexts/engineering/decisions/0001-ddc-engineering-baseline-and-harness-enforcement.md`
- `@.contexts/engineering/practices/sdd.md` / skill `sdd`
- Skills: `using-ddc`, `verification-before-completion`, `tdd`
