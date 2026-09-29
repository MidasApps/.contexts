---
title: Decisions
type: decisions
status: active
scope: engineering
last_updated: 2026-09-29
---

# Decisions

Architecture Decision Records (ADRs) do DDC. Formato **MADR**. Numeração **4 dígitos**: `NNNN-titulo-em-kebab.md`.

Cada ADR é **imutável** após accepted. Decisão superada gera ADR nova com `- **Supersedes:**` (total ou parcial, dizendo qual parte); a antiga só ganha a linha `- **Superseded in part by:**` ou o status `superseded by NNNN`. Correção de conformidade que não muda a decisão vai numa seção `## Amendments` datada (ver 0001).

## Índice

| # | Título | Status | Data |
|---|---|---|---|
| [0001](0001-ddc-engineering-baseline-and-harness-enforcement.md) | Baseline de engenharia 2026-07 e enforcement do harness DDC | accepted; matriz de versões superseded pela 0002; IDs do Firestore pela 0005 | 2026-07-14 |
| [0002](0002-baseline-2026-09-version-and-naming-alignment.md) | Baseline de setembro de 2026 e alinhamento de nomes entre camadas | accepted; linha de runtime superseded pela 0004; IDs do Firestore pela 0005 | 2026-09-28 |
| [0003](0003-cross-doc-convention-conflicts-resolved.md) | Conflitos de convenção entre documentos: qual vence | accepted | 2026-09-28 |
| [0004](0004-latest-stable-baseline-and-documented-exceptions.md) | Baseline na última versão estável, com exceções documentadas | accepted | 2026-09-28 |
| [0005](0005-firestore-document-ids-use-automatic-ids.md) | IDs de documento do Firestore usam o ID automático | accepted | 2026-09-28 |
| [0006](0006-monorepo-layout-and-package-boundaries.md) | Monorepo pnpm + Turborepo e mapeamento da doutrina `src/` para pacotes | accepted | 2026-09-29 |
| [0007](0007-desktop-and-mobile-shell-with-tauri-2.md) | Desktop e mobile com Tauri 2 desde a v1 | accepted | 2026-09-29 |
| [0008](0008-data-stores-split-firestore-postgres-storage-bigquery.md) | Divisão de dados: Firestore, Postgres + pgvector, Cloud Storage e BigQuery | accepted; leitura analítica do BigQuery pela tool SQL do agente pela 0011 | 2026-09-29 |
| [0009](0009-runtime-topology-next-v1-functions-events-mastra-cloud-run.md) | Topologia de runtime: `/v1` no Next (App Hosting), Functions para eventos, Mastra no Cloud Run | accepted; auth do Mastra pela 0010 | 2026-09-29 |
| [0010](0010-tenancy-organization-project-units-and-rbac.md) | Tenancy e acesso: Organização → Projeto → Unidades, RBAC por nó sem deny | accepted | 2026-09-29 |
| [0011](0011-contracts-as-machine-readable-data-catalog.md) | Contratos como catálogo de dados legível por humanos, compilador e IA | accepted | 2026-09-29 |

## Como criar

1. Próximo número livre na tabela.
2. Seguir skill `decisions`: título `# NNNN. Título`, header em bullets (`Status`, `Date`, `Deciders`, `Tags`, e `Supersedes`/`Complements` quando houver), seções Context → Decision Drivers → Considered Options → Decision Outcome → Consequences → References. ADR curto de política/desempate pode usar `## Decision` direto (0003, 0004).
   - Pacote de versão atrás do `latest` por incompatibilidade comprovada: linha nova (`E6`…) na tabela de exceções da [0004](0004-latest-stable-baseline-and-documented-exceptions.md), com fato, data e gatilho de revisão. Mudança de política ou de baseline: ADR novo.
3. Cross-link: rules/skills/MEMORY que aplicam a decisão referenciam `@.contexts/engineering/decisions/NNNN-...` (`NNNN-...` é placeholder: use o número e slug reais do ADR).
4. Não editar ADR accepted — supersede. Exceções: header de status/supersede, `## Amendments` de conformidade e linha nova na tabela de exceções da 0004 (prevista pela própria decisão).

## Relação com o resto do DDC

- **SSOT técnica de stacks/processos:** `.contexts/engineering/**` (e business/product).
- **ADR:** *por que* escolhemos e *o que* foi descartado — não substitui stack docs nem MEMORY.
- **Harness (`.claude/`):** implementa enforcement; mudanças de política de bootstrap/hooks relevantes → ADR.
