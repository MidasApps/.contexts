# Release

Convenções de processo para versionamento, empacotamento e disponibilização de funcionalidades ao usuário final. Define como o time transforma código mergeado em release tags, changelog, comunicação e artefatos auditáveis, com automação determinística baseada em Conventional Commits.

---

## 1. Release vs Deploy

Release e deploy são processos distintos e desacoplados. Não os trate como sinônimos.

| Eixo | Deploy | Release |
|---|---|---|
| Natureza | Ato técnico | Ato de produto/negócio |
| Significado | Código em ambiente de produção | Funcionalidade disponibilizada ao usuário |
| Frequência | Múltiplas vezes ao dia | Quando feature está pronta + comunicada |
| Artefatos | Build, imagem, container, função | Tag git, GitHub Release, changelog, release notes |
| Audiência | Sistema | Usuários, clientes, stakeholders |
| Reversão | Rollback de artefato | Feature flag off + release notes yanked |

Desacople release de deploy via **feature flags**. Código em produção pode estar desligado para usuários até o momento da release. Veja `@rules/governance` para política de flags e `@processes/deploy` para o pipeline técnico.

> Regra: nunca acople "deploy em produção" a "feature visível ao usuário" sem flag intermediária. Releases acontecem por decisão de produto; deploys acontecem por decisão de engenharia.

---

## 2. Versionamento

### 2.1. SemVer 2.0.0 (padrão do projeto para libs/packages)

Formato `MAJOR.MINOR.PATCH`.

- **MAJOR** — mudanças incompatíveis com API anterior (breaking changes).
- **MINOR** — funcionalidades adicionadas de forma retrocompatível.
- **PATCH** — correções retrocompatíveis.

Pre-releases usam sufixo: `1.4.0-alpha.1`, `2.0.0-beta.3`, `2.0.0-rc.1`.

### 2.2. CalVer (alternativa apenas para apps internos)

Formato `YYYY.MM.DD` ou `YYYY.MM.N`. Use apenas quando o tempo for o eixo dominante de versionamento (ex.: dashboards internos com release diária). **Não use CalVer em libs publicadas.**

### 2.3. Padrão do projeto

- **Libs/packages publicados:** SemVer.
- **Apps (Next.js, Firebase Functions, workers):** SemVer com bump automático via Conventional Commits.
- **CalVer:** somente com aprovação explícita registrada em `@processes/git`/decision.

---

## 3. Mapeamento Conventional Commits → Bump

Veja `@processes/commits` para a especificação completa de Conventional Commits.

| Commit | Bump |
|---|---|
| `fix:` | PATCH |
| `feat:` | MINOR |
| `feat!:` ou `fix!:` ou `BREAKING CHANGE:` no footer | MAJOR |
| `chore:`, `docs:`, `style:`, `refactor:`, `test:`, `ci:`, `build:` | Sem bump (ou PATCH dependendo da tool) |
| `perf:` | PATCH |
| `revert:` | PATCH |

> O bump é calculado pela tool de release (ver seção 4), nunca manualmente.

---

## 4. Tooling

### 4.1. Release Please (recomendado para apps)

Google's [Release Please](https://github.com/googleapis/release-please) — GitHub Action que monitora `main`, mantém um PR de release aberto com changelog e bump calculado, e ao merge cria tag + GitHub Release.

Use em:
- Apps Next.js
- Firebase Functions
- Workers, serviços standalone

### 4.2. changesets (recomendado para monorepos)

[changesets](https://github.com/changesets/changesets) — workflow baseado em arquivos `.changeset/*.md` declarando bumps por package. PR declara intenção; merge em `main` consolida e publica.

Use em:
- Monorepos com múltiplos packages publicados
- Libs internas com versionamento independente

### 4.3. semantic-release (alternativa madura)

[semantic-release](https://github.com/semantic-release/semantic-release) — alternativa quando Release Please não atende (ex.: publicação imediata sem PR intermediário). Mais agressivo: publica direto no merge.

### 4.4. Regras universais

- **Sempre automatizado em `main`.** Nunca há release manual em produção.
- A tool é configurada uma vez e versionada no repo (`.release-please-config.json`, `release.config.js`, `.changeset/config.json`).
- Credenciais (`GITHUB_TOKEN`, `NPM_TOKEN`) gerenciadas via secrets do CI — ver `@processes/deploy`.

---

## 5. Release Artifacts

Toda release válida produz:

1. **Git tag anotada** no formato `vMAJOR.MINOR.PATCH`.
   - Exemplo: `v1.4.2`, `v2.0.0-beta.1`.
   - Tag é **imutável**. Nunca rode `git tag -f`.
2. **GitHub Release** publicada com changelog auto-gerado.
3. **CHANGELOG.md** no repo, atualizado e committed pela tool.
4. **Deploy artifacts** correspondentes (imagem, bundle, função) — ver `@processes/deploy`.

Toda release sem tag é inválida e deve ser tratada como deploy não-rastreado.

---

## 6. Changelog

### 6.1. Formato: Keep a Changelog 1.1.0

Estrutura canônica com seções:

- `Added` — novas funcionalidades.
- `Changed` — alterações em funcionalidades existentes.
- `Deprecated` — funcionalidades a serem removidas.
- `Removed` — funcionalidades removidas.
- `Fixed` — correções de bugs.
- `Security` — correções de segurança.

### 6.2. Geração

- Auto-gerado a partir de Conventional Commits pela tool de release.
- **User-facing.** A geração automática é ponto de partida, não saída final.
- Antes da release, revisar manualmente para:
  - Traduzir jargão técnico em linguagem de usuário.
  - Remover entradas irrelevantes ao usuário (refactors internos).
  - Agrupar mudanças relacionadas.
  - Adicionar contexto/migration onde necessário.

> Regra: nenhuma release de app é publicada sem revisão humana do changelog. Veja `@rules/documentation`.

---

## 7. Release Cadence

### 7.1. Continuous Release (default)

Todo merge em `main` é potencial release. A tool acumula commits em PR de release; o merge desse PR cria a tag.

Use quando:
- Não há janela de QA externa.
- Feature flags governam visibilidade.

### 7.2. Scheduled Releases

Release tag em cadência fixa (semanal, quinzenal). Apropriado quando há janela de QA manual ou comunicação alinhada a calendário.

### 7.3. Hotfix Release

Patch incrementado para corrigir bug crítico em produção. Ver seção 11.

---

## 8. Release Branches (opcional)

Use apenas quando o projeto suporta múltiplas versões majors simultaneamente (LTS).

- Nome: `release-vX.x` (ex.: `release-v1.x`).
- Criada a partir da última tag da major.
- Hotfixes em LTS:
  1. PR na release branch.
  2. Cherry-pick para `main` quando aplicável.
- **Cleanup obrigatório quando a major atinge EOL.** Branches LTS abandonadas geram confusão e violam disciplina de inventário.

Para projetos sem LTS, **não crie release branches**. Trabalhe apenas com tags.

---

## 9. Pre-releases

Sufixos canônicos:

| Sufixo | Significado |
|---|---|
| `-alpha.N` | Em desenvolvimento, instável, audience: internos. |
| `-beta.N` | Funcionalidade completa, audience: beta testers. |
| `-rc.N` | Release Candidate, audience: ampla pré-final. |

Distribuição:
- **npm:** tags `next`, `beta`, `alpha` — nunca `latest`.
- **Apps:** canal/ambiente dedicado (ex.: `staging`, `canary`).
- **Feature flags:** pre-releases em produção exigem flag desligada para público geral.

> Regra: nunca exponha pre-release a usuários finais sem feature flag explícita. Ver `@rules/governance`.

---

## 10. Release Notes

### 10.1. Estrutura

**User-facing (obrigatório):**
- Highlights (3-5 bullets do que importa).
- Breaking changes com mitigação clara.
- Migration guide quando aplicável.

**Technical (quando relevante):**
- Dependencies bumped.
- Internal refactors com impacto observável (performance, comportamento sutil).

### 10.2. Audiência e canais de publicação

| Audiência | Canal |
|---|---|
| Engenharia interna | GitHub Release |
| Clientes/parceiros | Página de docs / changelog público |
| Estratégico (major) | Email + Slack `#releases` |
| Breaking changes externos | Email direto + blog post |

### 10.3. Disciplina editorial

- Nunca copy/paste de PR description.
- Nunca copy/paste cru de commit messages técnicos.
- Reescrever sob a perspectiva do usuário.
- Ver `@rules/documentation` para padrões de redação.

---

## 11. Patch Release Process (Hotfix)

Sequência operacional:

1. **Branch:** `hotfix/<issue-id>-<slug>` criada da tag de produção (não de `main`).
2. **Fix + tests:** correção mínima, testes regressivos cobrindo o bug.
3. **PR + fast-track review:** processo de PR conforme `@processes/pull-requests` com label `hotfix` e revisor on-call.
4. **Merge + tag PATCH:** tool de release incrementa patch automaticamente.
5. **Deploy:** seguindo `@processes/deploy`.
6. **Backfill em `main`:** cherry-pick ou merge garantindo que o fix não regride na próxima release.
7. **Postmortem:** obrigatório para hotfix em produção. Ver `@rules/governance`.

---

## 12. Major Release Process

Sequência operacional:

1. **Branch `release-vX.0`** (opcional, conforme seção 8).
2. **RC builds** distribuídos para beta testers via canal dedicado.
3. **Final QA** com checklist de breaking changes e migration validada.
4. **Tag final** `vX.0.0` criada pela tool ao merge do PR de release.
5. **Comunicação ampla:** email, blog, Slack, atualização de docs.
6. **Monitoramento pós-release** com SLOs definidos. Ver `@rules/observability`.

> Toda major release tem aprovador nomeado e auditável. Ver seção 17.

---

## 13. Breaking Changes

Disciplina obrigatória quando uma release contém breaking change:

1. **Seção dedicada** em release notes, separada de `Changed`/`Added`.
2. **Migration guide** publicado em docs antes da release. Ver `@rules/migration` e `@rules/documentation`.
3. **Versão anterior mantida em paralelo** durante janela de deprecation declarada (mínimo recomendado: 90 dias).
4. **Header `Sunset` (RFC 8594)** em APIs deprecadas, com data ISO 8601.
5. **Conformidade com `@rules/api-design` e `@contracts/api`** — breaking change em API exige bump major e contrato versionado.

> Breaking change em release MINOR é violação de SemVer e do framework. Não merge.

---

## 14. Communication

### 14.1. Internal

- Slack `#releases`: mensagem automática pela tool a cada tag.
- Tag stakeholders manualmente em releases majors ou com impacto cross-team.

### 14.2. External

- **Major release:** blog post + email para customers.
- **Breaking change:** email direto a customers afetados, antes da release.
- **Patch/minor:** apenas changelog público; nenhum push externo.

### 14.3. Deprecation Notices

- Anunciar com janela mínima de 90 dias.
- Migration guide publicado simultaneamente.
- Reforçar em N-1 e N-2 releases antes da remoção efetiva.

---

## 15. Versionamento de Prompts e Componentes de IA

Veja `@stacks/ai/harness-engineering` e `@rules/governance`.

- Prompts versionados em git, com hash de conteúdo registrado em metadata.
- Mudança de prompt = mudança versionada:
  - Em **lib interna de prompts:** SemVer com bump correspondente.
  - Em **app:** documentar em release notes quando comportamento observável muda.
- Eval results (precisão, regressões observadas) anexados ao GitHub Release quando a mudança for material.

---

## 16. Database e Schema Versions

- Migrations versionadas e numeradas em sequência monotônica (`001_*`, `002_*`).
- Release notes referenciam migrations exigidas: `v1.2.3 requer schema 004_add_orders`.
- Mudança de schema com impacto em consumidores externos (BigQuery exports, integrações) declarada em release notes.
- Backward-incompatible schema change exige bump MAJOR no app que governa o schema.

---

## 17. Compliance e Audit Trail

Toda release registrada com:

- **Aprovador** nomeado (humano, não bot).
- **Reviewer(s)** do PR de release.
- **Timestamp** ISO 8601 UTC.
- **Tag SHA imutável.**

Áreas reguladas exigem trail SOX-style:
- Quem aprovou.
- Quando.
- Quais mudanças contém (link para PR e diff).
- Resultados de testes anexados.

Ver `@rules/governance` para política completa de auditabilidade.

---

## 18. Rollback de Release

1. Tag anterior **continua válida** — não é deletada.
2. Deploy reverte para a tag anterior, seguindo `@processes/deploy`.
3. Release notes da tag yanked recebem **nota explícita** ("Yanked: causou regressão X. Use vX.Y.Z+1.").
4. **Nunca rode `git tag -f`.** A tag yanked permanece no histórico — imutabilidade é regra.
5. Postmortem obrigatório. Ver `@rules/governance`.

---

## 19. Métricas (DORA)

Acompanhar continuamente:

- **Release frequency** — releases por semana/mês.
- **Lead time** — commit em `main` → release tag.
- **Change failure rate** — % de releases que exigiram rollback ou hotfix dentro de 24h.
- **MTTR** — tempo médio entre detecção e resolução de incidente pós-release.

Métricas reportadas em dashboard de engenharia. Ver `@rules/observability`.

---

## 20. Anti-patterns

Nenhum dos itens abaixo é permitido. Cada um é violação direta do framework de release.

- Release sem tag git.
- Release notes auto-geradas publicadas sem revisão humana (linguagem técnica vazando para usuário).
- "Vamos chamar de v2 porque é uma feature grande" — sem critério SemVer real.
- Breaking change em release MINOR ou PATCH.
- Release sem changelog atualizado.
- Mudança visível ao usuário deployada sem release notes.
- Major release sem migration guide.
- Hotfix em produção sem postmortem.
- Tag movida (`git tag -f`) — viola imutabilidade.
- Pre-release exposta a usuário final sem feature flag.
- PR description copiada diretamente como release notes sem edição.
- Versionamento manual quando Conventional Commits poderia automatizar.
- Breaking change externa sem comunicação prévia aos stakeholders.
- Release branch LTS mantida indefinidamente sem cleanup pós-EOL.
- Major release sem audit trail de aprovador.
- Release acoplada a deploy sem feature flag intermediária.
- "Hotfix" usado como atalho para evitar processo normal de PR.

---

## Referências cruzadas

- `@processes/deploy` — pipeline técnico e automação que materializam o release.
- `@processes/git` — ciclo de desenvolvimento que alimenta a release.
- `@processes/commits` — Conventional Commits que dirigem o bump.
- `@processes/pull-requests` — PRs de release e de hotfix.
- `@rules/governance` — feature flags, postmortems, auditabilidade.
- `@rules/documentation` — disciplina editorial de release notes e migration guides.
- `@rules/observability` — monitoramento pós-release e métricas DORA.
- `@rules/api-design` — disciplina de breaking changes em APIs.
- `@rules/migration` — padrões de migration guides.
- `@contracts/api` — versionamento contratual de APIs.
- `@stacks/ai/harness-engineering` — versionamento de prompts e evals.

---

> **Nota de encerramento.** Este é o último documento da estrutura inicial DDC (64/64). O ciclo se fecha aqui e recomeça em `@processes/git`: cada nova feature entra pelo fluxo de branches e commits, atravessa PRs, CI, deploy, e retorna a este documento como tag de release. O framework é um anel, não uma fila — itere.
