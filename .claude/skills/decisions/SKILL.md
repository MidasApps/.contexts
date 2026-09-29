---
name: decisions
description: Use para criar ou atualizar ADRs (Architecture Decision Records). Keywords: ADR, decisão arquitetural, registrar decisão, trade-off, supersede, exceção de versão, pin atrás do latest.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Architecture Decision Records (ADR)

Registra decisões arquiteturais relevantes em arquivos curtos, versionados, imutáveis após aceitos. Cada ADR captura **contexto**, **opções consideradas**, **decisão tomada** e **consequências**. SSOT: `.contexts/engineering/decisions/`.

## Essência
- Uma decisão = um arquivo em `.contexts/engineering/decisions/` (não `docs/adr/`). Índice obrigatório em `decisions/README.md`.
- **Numeração:** `NNNN-kebab-case-title.md`, 4 dígitos sequenciais sem pular (existentes: `0001`–`0004`; próximo = maior + 1).
- **Formato real dos ADRs 0001–0004 (MADR com header em bullets):**
  ```markdown
  # NNNN. Título

  - **Status:** proposed | accepted | rejected | deprecated | superseded by NNNN
  - **Date:** YYYY-MM-DD
  - **Deciders:** ...
  - **Tags:** `engineering`, `stacks`, ...
  - **Supersedes:** / **Superseded in part by:** / **Complements:** [NNNN](NNNN-slug.md) (o que exatamente)
  ```
  Seções: `## Context` → `## Decision Drivers` → `## Considered Options` → `## Decision Outcome` → `## Consequences` → `## References`. ADR curto de desempate/política (0003, 0004) pode usar `## Decision` direto no lugar de Drivers/Options/Outcome. Opcionais: `## Pros and Cons of the Options`, `## Notes`, `## Amendments`.
- **Imutável após `accepted`.** Mudou a decisão → ADR novo com `Supersedes:` (total ou parcial, dizendo qual parte) e o antigo ganha só a linha `Superseded in part by:` / status. `## Amendments` datado só para correção de conformidade que não altera a decisão (ver 0001). Única adição de conteúdo prevista pela própria decisão: linha nova na tabela de exceções do 0004.
- **Versões (ADR 0004):** baseline = última estável; canary/beta/rc não é versão e não pede ADR. Pacote que precisa ficar atrás do `latest` por incompatibilidade comprovada → **linha nova na tabela de exceções do 0004** (`E6`…, com fato, data e gatilho de revisão) quando é a mesma política; mudança de política ou de baseline → ADR novo que supersede. Exceção sem linha no 0004 é bug de documentação. Atualizar `MEMORY.md` e `stacks/VERSIONS.md` junto.
- **Conflito entre documentos:** a regra de desempate está no 0003 (vence o doc mais específico do assunto); conflito novo que exige decisão → ADR, não edição silenciosa.
- ADR é **sobre decisão**, não design detalhado. ADR bom compara alternativas reais com critérios e registra o rejeitado e por quê (rule `governance`).

## Procedimento mínimo
1. Ler `decisions/README.md` e o ADR mais recente do mesmo tema (pode ser caso de supersede parcial ou de linha de exceção no 0004).
2. Criar `NNNN-kebab-title.md` com o header em bullets acima.
3. Context sem antecipar solução; Drivers; 2+ opções reais.
4. Decision Outcome: opção + justificativa amarrada aos drivers.
5. Consequences: o que melhora, o que piora, arquivos que passam a mudar (rules/skills/MEMORY).
6. Adicionar linha no índice do README (`# | Título | Status | Data`) e, se supersede, a linha `Superseded in part by:` no ADR antigo.
7. PR antes da implementação (rule `governance`). `proposed` → `accepted` no merge.
8. Cross-link: rule/skill/MEMORY que aplicam a decisão referenciam o ADR pelo path real (`.contexts/engineering/decisions/<número>-<slug>.md`; nunca um placeholder).

## Anti-patterns
- ADR depois do fato, "para documentar" → capture antes de implementar.
- "Opções consideradas" com 1 real e 2 absurdas → não é trade-off real.
- Editar o corpo de ADR aceito → supersede; só header de status, `Amendments` de conformidade e linha de exceção no 0004.
- Pin atrás do `latest` "por cautela", sem incompatibilidade comprovada nem linha no 0004.
- ADR para escolha trivial → ruído.

## Mini-exemplo
```markdown
# NNNN. Adopt cursor-based pagination for v1 list endpoints

- **Status:** proposed
- **Date:** 2026-09-28
- **Deciders:** tech lead / time de API
- **Tags:** `engineering`, `api`

## Context
Offset pagination returns duplicates when rows shift and degrades on large offsets.

## Decision Drivers
- Consistency under concurrent writes.
- Performance at >1M rows.

## Considered Options
1. Keep offset pagination (status quo).
2. Opaque cursor (`meta.page: { cursor, hasMore, limit }`).
3. Raw `createdAt` cursor exposed to clients.

## Decision Outcome
**Option 2.** Consistent and O(log N) without leaking schema.

## Consequences
+ Stable under concurrent writes.
− No random page jump; offset stays only for UI with page-jump.
Follow-up: `contracts/api.md` já descreve `meta.page`; nenhum doc muda de forma.

## References
- `contracts/api.md`
```

---
**Formato, índice e numeração:** `@.contexts/engineering/decisions/README.md` · política de versões: `@.contexts/engineering/decisions/0004-latest-stable-baseline-and-documented-exceptions.md`
