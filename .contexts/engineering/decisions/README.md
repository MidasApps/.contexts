# Decisions

Architecture Decision Records (ADRs) do DDC. Formato **MADR**. Numeração **4 dígitos**: `NNNN-titulo-em-kebab.md`.

Cada ADR é **imutável** após accepted. Decisões superadas geram ADR nova com `status: superseded by NNNN` (ou referência explícita no outcome).

## Índice

| # | Título | Status | Data |
|---|---|---|---|
| [0001](0001-ddc-engineering-baseline-and-harness-enforcement.md) | Baseline de engenharia 2026-07 e enforcement do harness DDC | accepted | 2026-07-14 |

## Como criar

1. Próximo número livre na tabela.
2. Seguir skill `decisions` / template MADR (Context → Drivers → Options → Outcome → Consequences).
3. Cross-link: rules/skills/MEMORY que aplicam a decisão referenciam `@.contexts/engineering/decisions/NNNN-...`.
4. Não editar ADR accepted — supersede.

## Relação com o resto do DDC

- **SSOT técnica de stacks/processos:** `.contexts/engineering/**` (e business/product).
- **ADR:** *por que* escolhemos e *o que* foi descartado — não substitui stack docs nem MEMORY.
- **Harness (`.claude/`):** implementa enforcement; mudanças de política de bootstrap/hooks relevantes → ADR.
