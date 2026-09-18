---
name: using-ddc
description: >
  Bootstrap obrigatório de toda conversa no projeto DDC. Use ao iniciar sessão,
  após compactação, ou quando for agir em feature/bug/docs/governance — exige
  mapear o pedido a @.contexts reais e invocar skills/processos antes de codar.
  Keywords: ddc, contexts, bootstrap, grounding, ssot, using-ddc.
---

# Using DDC

Estabelece **como** trabalhar neste repositório. O conteúdo de verdade vive em
`.contexts/`. Skills e rules em `.claude/` **operacionalizam** — não duplicam.

<SUBAGENT-STOP>
Se você foi despachado como subagent com brief fechado e lista explícita de
`@.contexts/...` already-read, ignore este skill e siga o brief.
</SUBAGENT-STOP>

<EXTREMELY-IMPORTANT>
Se houver **qualquer chance** (mesmo ~1%) de um pedido tocar domínio, produto,
engenharia, governança ou código de app, você **DEVE** seguir o protocolo abaixo
**antes** de Write/Edit em código de aplicação e **antes** de inventar paths.

Você **não** tem a opção de “ir direto ao código”. Ler o SSOT não é opcional.
</EXTREMELY-IMPORTANT>

## Iron laws

1. **`.contexts/` é a single source of truth.** Atualize lá; referencie via `@.contexts/...`.
2. **Verify, don't assume** (rule `grounding`): path, símbolo, versão e contrato
   existem no disco — Read/Glob/Grep antes de afirmar.
3. **Process / doctrine first, stack second:** se o pedido é “como construir” ou
   “o que o projeto exige”, abra rule/contract/practice; só então skill de
   Next/Zod/Postgres.
4. **Não invente** `@.contexts/...` plausível. Se não achar: diga “não encontrei”.
5. **Não duplique** doutrina de engineering/business/product em skill, rule ou
   comentário longo — link `@`.

## Protocolo (antes de agir)

Execute mentalmente (e com tools quando o pedido for de implementação):

### 1. Classificar o pedido

| Classe | Exemplos | Always-read / first open |
|---|---|---|
| **Produto / UX / copy** | tela, onboarding, tom | `@.contexts/product/*` (+ policies se consent/PII) |
| **Negócio / compliance** | monetização, LGPD, ICP | `@.contexts/business/*` |
| **Engenharia feature** | API, schema, job, UI app | MEMORY matrix + rules always-on relevantes + contract/stack |
| **Governança Claude** | rule, skill, agent, hook | agents `claude-*` / `ddc-engineering`; **não** recriar doutrina em `.claude` |
| **Ops** | deploy, rollback, release | skills `deploy` / `rollback` / `release` + processes em `.contexts` |

### 2. Mapear para paths reais

Preferência de leitura (ajuste ao caso):

```
.contexts/engineering/MEMORY.md          → pins e índice
.contexts/engineering/rules/<tema>.md    → imperativos
.contexts/engineering/contracts/<tema>.md
.contexts/engineering/stacks/<...>.md
.contexts/engineering/practices|architecture|processes/...
.contexts/business/*  |  .contexts/product/*
```

Confirme existência com Glob/Read. Caminhos canônicos de stack (exemplos):

- `@.contexts/engineering/stacks/language/typescript@7.md`
- `@.contexts/engineering/stacks/runtime/node@24.md`
- `@.contexts/engineering/stacks/frontend/next@16.md`
- `@.contexts/engineering/stacks/validation/zod@4.md`

### 3. Invocar skill quando couber

Se uma skill de `.claude/skills/` cobre o trabalho (tdd, zod-4, database-postgres,
api, decisions…): **carregue-a** (Skill tool ou Read do `SKILL.md`) antes de
implementar. Skills de **processo** (tdd, sdd, decisions, using-ddc) têm
prioridade sobre skills de stack.

Anuncie em uma linha: `Using <skill|context> to <purpose>`.

### 4. Só então implementar

Auth → validate → authorize → act; schemas Zod; pins da MEMORY; sem path inventado.

## Matriz mínima de pins (produção)

Consulte sempre a tabela em `@.contexts/engineering/MEMORY.md`. Snapshot:

| Camada | Baseline |
|---|---|
| Runtime | Node 24 LTS |
| Language | TypeScript 7 |
| App | Next 16.2 + React 19.2 |
| Validation | Zod 4.4 |
| OLTP | Postgres 18 (`uuidv7()` PKs) |
| Serverless | firebase-functions@7 / nodejs24 |
| Unit | Vitest 4 |
| E2E | Playwright 1.61 |

## Red flags — PARE

| Pensamento | Realidade |
|---|---|
| “É um fix simples, não preciso de context” | Fix também obedece rules always-on e contracts |
| “Já sei a rule de API” | Rules/contracts evoluem — leia a versão no disco |
| “Exploro o código do app primeiro” | Mapeie SSOT **antes** ou em paralelo; não pule |
| “Vou inventar `src/lib/foo.ts` típico” | Glob o layout real do projeto |
| “Skill é overkill” | Skill existe = use; se errada, descarte depois |
| “Duplico o trecho da rule no código” | Referencie `@.contexts/...` |
| “Claim: testes passam / conforme contrato” | Evidência fresca (comando + output) no mesmo turn |

## Prioridade de instruções

1. Pedido **explícito** do humano neste turn  
2. Este skill + rules always-on + `.contexts`  
3. Skills de stack  
4. Default do modelo  

Só pule o protocolo se o humano disser explicitamente para ignorar DDC/contexts.

## Integração com hooks

- **SessionStart / PreCompact:** este skill é reinjetado — releia o espírito após compactação.
- **suggest-skills:** sugestões de skill e de `@.contexts` são **dicas**, não substituto de Read.
- **Agents:** ao despachar subagent, passe lista explícita de `@.contexts/...` no brief.

## Mini checklist (todo turn de implementação)

- [ ] Pedido classificado (produto / negócio / eng / ops / claude)
- [ ] Pelo menos um path `.contexts` **lido** quando a mudança não é puramente tipográfica
- [ ] Skill de processo/stack relevante considerada
- [ ] Nenhum `@.contexts/...` inventado
- [ ] Pins compatíveis com MEMORY

## ADR

Política de bootstrap + baseline: `@.contexts/engineering/decisions/0001-ddc-engineering-baseline-and-harness-enforcement.md`
