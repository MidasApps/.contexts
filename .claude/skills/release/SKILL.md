---
name: release
description: "Use ao preparar release — versionamento, changelog, tags. Keywords: release, semver, changelog."
---
# Release

Empacotar um conjunto de mudanças como **versão pública**: bump de versão, changelog, tag git, publish (npm/registry), comunicação a usuários. Deploy ≠ release: release é o evento percebido pelo consumidor.

## Essência
- **SemVer (`MAJOR.MINOR.PATCH`):**
  - PATCH: bugfix backward-compatible.
  - MINOR: feature aditiva, backward-compatible.
  - MAJOR: breaking change (API quebra, contrato muda).
- **Conventional Commits → release automation:** `feat:` → minor; `fix:` → patch; `BREAKING CHANGE:` ou `!` → major. Tooling: **Release Please** (apps, Functions — default), **changesets** (monorepo com packages publicados), semantic-release (alternativa). Bump **nunca** é manual.
- **Changelog (`CHANGELOG.md`):** Keep a Changelog format — seções `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security` por versão.
- **Tag git:** `vX.Y.Z` (sem prefixo de componente: `include-component-in-tag: false`), criada pela tool no merge do PR de release; tag manual só como exceção, e anotada. Imutável: nunca `git tag -f`.
- **Pre-releases:** `-alpha.N`, `-beta.N`, `-rc.N`; no npm só dist-tags `next`/`beta`/`alpha`, nunca `latest`.
- **Deprecation:** anunciar com pelo menos uma minor antes de remover na major. Marcar `@deprecated` em código + nota no changelog.
- **Breaking change** acompanha **migration guide**: o que mudou, antes/depois, scripts/codemods se aplicável.
- **Publish:** `npm publish` (com `--provenance` quando público), GitHub Release com notas, artefato em registry.
- **Hotfix:** `hotfix/<issue-id>-<slug>` a partir da **tag de produção** (não de `main`), PR fast-track com label `hotfix`, tool incrementa o patch, fix volta para `main` por PR, postmortem obrigatório.

## Procedimento mínimo
1. Merges em `main` com Conventional Commits (ou `.changeset/*.md`) acumulam no PR de release aberto pela tool.
2. Revisar o bump calculado e o `CHANGELOG.md` gerado — revisão humana do changelog é obrigatória.
3. Merge do PR de release → a tool cria a tag `vX.Y.Z` + GitHub Release.
4. CI roda na tag: publish (npm com `--provenance`/container) e deploy (skill `deploy`).
5. Comunicar (changelog público, Slack `#releases`, aviso direto em breaking).

## Anti-patterns
- Bump MAJOR sem migration guide → consumidores quebram.
- Tag em branch errada → release fantasma.
- Changelog gerado "ao final do trimestre" → impreciso e perde contexto.
- Mesma versão re-publicada com fix → quebra cache de consumidores; sempre bumpar.

## Mini-exemplo
```
# CHANGELOG.md
## [1.4.0] - 2026-05-25
### Added
- Idempotency-key support on POST /v1/orders.
### Changed
- Increased pagination max page size from 50 to 100.
### Fixed
- Race condition when two concurrent updates to the same order.

# Release Please: merge do PR "chore(main): release 1.4.0"
# → cria tag v1.4.0 + GitHub Release; CI publica a partir da tag
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/processes/release.md`
