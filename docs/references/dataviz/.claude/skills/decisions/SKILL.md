---
name: decisions
description: Use para criar ou atualizar ADRs (Architecture Decision Records). Keywords: ADR, decisão arquitetural, registrar decisão, trade-off.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Architecture Decision Records (ADR)

Registra decisões arquiteturais relevantes em arquivos curtos, versionados, imutáveis após aceitos. Cada ADR captura **contexto**, **opções consideradas**, **decisão tomada** e **consequências**.

## Essência
- Uma decisão = um arquivo. Imutável após status "Accepted"; mudanças vêm como ADR novo que **supersedes** o anterior.
- **Numeração:** `NNNN-kebab-case-title.md` com **4 dígitos** sequenciais (`0001-`, `0042-`).
- **Formato MADR (Markdown Any Decision Record)** é o padrão recomendado:
  - `# <NNNN>. <title>`
  - **Status:** `proposed` | `accepted` | `rejected` | `deprecated` | `superseded by NNNN`
  - **Date** (YYYY-MM-DD)
  - **Context:** problema, restrições, forças em jogo (sem mencionar solução ainda).
  - **Decision Drivers:** critérios para escolher (lista curta).
  - **Considered Options:** 2-5 alternativas reais (não palhas).
  - **Decision Outcome:** opção escolhida + justificativa.
  - **Consequences:** positivas + negativas + riscos + ações de follow-up.
  - **Pros/Cons of Options** (opcional, recomendado).
- ADR é **sobre decisão**, não sobre design detalhado. Design técnico pode ir em RFC/spec separada.
- ADR ruim: "vamos usar X porque é bom". ADR bom: alternativas comparadas com critérios.
- Mover para `deprecated`/`superseded` em vez de editar/deletar — histórico importa.
- Pasta canônica: `docs/adr/` ou `engineering/decisions/` no projeto.

## Procedimento mínimo
1. Identificar próximo número (próximo da maior numeração existente).
2. Criar `NNNN-kebab-title.md` com template MADR.
3. Preencher Context sem antecipar solução.
4. Listar 2+ opções reais com prós/contras.
5. Decision: opção + 1-3 frases de justificativa amarrando aos drivers.
6. Consequences: o que melhora, o que piora, follow-ups (issues a criar).
7. PR para review. Status `proposed` → `accepted` no merge.
8. Cross-link: rule/skill/código que aplicam a decisão referenciam o ADR.

## Anti-patterns
- ADR depois do fato, "para documentar" → vira teatro; capture decisão antes de implementar quando possível.
- "Opções consideradas" com 1 real e 2 absurdas → não é trade-off real.
- Editar ADR aceito → quebra histórico; faça superseding ADR.
- ADR para qualquer escolha pequena → ruído; só decisões com impacto não-trivial e duráveis.

## Mini-exemplo
```markdown
# 0007. Adopt cursor-based pagination for v1 list endpoints

- Status: accepted
- Date: 2026-05-25

## Context
Offset pagination produces inconsistent results when items shift (insertions/deletions)
and degrades on large offsets (O(N) at the DB). Mobile clients report duplicate items.

## Decision Drivers
- Consistency under concurrent writes.
- Performance at >1M rows.
- Client implementation complexity.

## Considered Options
1. Keep offset pagination (status quo).
2. Cursor-based with opaque base64 cursor.
3. Time-based (`createdAt`) cursor.

## Decision Outcome
**Option 2** — opaque cursor. Wins consistency + perf without leaking schema.

## Consequences
+ Stable under concurrent writes; O(log N) reads.
+ Clients treat cursor as opaque (no schema coupling).
− Random-jump pagination ("page 50") no longer possible — acceptable per UX research.
Follow-up: deprecate `?page` over 2 releases; SDK exposes `nextCursor` helper.
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/decisions/README.md`
