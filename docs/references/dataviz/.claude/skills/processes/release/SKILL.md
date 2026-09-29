---
name: release
description: Use ao preparar release — versionamento, changelog, tags. Keywords: release, semver, changelog.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Release

Empacotar um conjunto de mudanças como **versão pública**: bump de versão, changelog, tag git, publish (npm/registry), comunicação a usuários. Deploy ≠ release: release é o evento percebido pelo consumidor.

## Essência
- **SemVer (`MAJOR.MINOR.PATCH`):**
  - PATCH: bugfix backward-compatible.
  - MINOR: feature aditiva, backward-compatible.
  - MAJOR: breaking change (API quebra, contrato muda).
- **Conventional Commits → release automation:** `feat:` → minor; `fix:` → patch; `BREAKING CHANGE:` ou `!` → major. Ferramentas: changesets, release-please, semantic-release.
- **Changelog (`CHANGELOG.md`):** Keep a Changelog format — seções `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security` por versão.
- **Tag git:** `vX.Y.Z` no commit do release. Assinada (`-s`) quando possível.
- **Pre-releases:** `1.2.0-rc.1`, `1.2.0-beta.0` — testar antes do estável.
- **Deprecation:** anunciar com pelo menos uma minor antes de remover na major. Marcar `@deprecated` em código + nota no changelog.
- **Breaking change** acompanha **migration guide**: o que mudou, antes/depois, scripts/codemods se aplicável.
- **Publish:** `npm publish` (com `--provenance` quando público), GitHub Release com notas, artefato em registry.
- **Hotfix:** branch a partir da tag, fix, bump patch, nova tag, deploy fast-track.

## Procedimento mínimo
1. Reunir mudanças desde última tag (via Conventional Commits ou changesets).
2. Decidir bump: PATCH/MINOR/MAJOR baseado em natureza das mudanças.
3. Atualizar `CHANGELOG.md` com seção da nova versão.
4. Bump em `package.json`/`pyproject.toml`/etc.
5. Commit `chore(release): vX.Y.Z`; tag `vX.Y.Z`.
6. CI roda em tag: publish (npm/container), criar GitHub Release com notas.
7. Comunicar (changelog público, Slack, email para breaking).

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

# git
git commit -m "chore(release): v1.4.0"
git tag -s v1.4.0 -m "v1.4.0"
git push origin main --tags
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/processes/release.md`
