---
title: Git Workflow
type: processes
status: active
scope: engineering
last_updated: 2026-09-28
---

# Git Workflow

Convenção operacional de versionamento, colaboração e integração para o repositório. Define o modelo de branching, sincronização, merge, hotfix, release e higiene. Tom prescritivo: o que está aqui é o fluxo oficial; desvios exigem justificativa em PR ou ADR.

---

## 1. Modelo adotado

**Trunk-Based Development** com short-lived feature branches é o default do projeto.

- `main` é o trunk único — sempre deployable, sempre verde.
- Feature branches vivem **horas a poucos dias**, no máximo uma semana antes de rebase ou merge.
- **Git Flow é rejeitado**: overhead de `develop` e de `release/*`/`hotfix/*` de longa duração não compensa em projetos com CI/CD contínuo e deploy direto de `main`.

Long-lived feature branches são proibidas — use feature flags para entregar código incompleto em produção (ver `@rules/governance`).

---

## 2. Branch naming

Formato obrigatório: `<type>/<short-description>` em kebab-case.

Types alinhados com Conventional Commits (ver `@processes/commits`):

| Type | Uso |
|---|---|
| `feat/` | Nova funcionalidade |
| `fix/` | Correção de bug |
| `chore/` | Manutenção, dependências, tooling |
| `refactor/` | Refatoração sem mudança de comportamento |
| `docs/` | Documentação apenas |
| `test/` | Testes apenas |
| `perf/` | Performance |
| `hotfix/` | Correção urgente em produção |

**Válido:**
- `feat/order-checkout`
- `fix/auth-redirect-loop`
- `chore/upgrade-next-16`
- `refactor/extract-payment-gateway`

**Inválido:**
- `minha-branch` (sem type)
- `feat/OrderCheckout` (não é kebab-case)
- `feature/order_checkout` (type errado, snake_case)
- `fix/` (sem descrição)

---

## 3. Proteção da `main`

A branch `main` é protegida no nível do remote. Regras enforce:

- **Sem direct push.** Qualquer commit chega via PR.
- **PR obrigatório** com 1+ review approval (ver `@rules/code-review`, `@processes/pull-requests`).
- **Status checks verdes** antes do merge: lint, type-check, build, testes unitários e de integração (ver `@processes/deploy`).
- **Branch up-to-date com main** antes do merge (rebase obrigatório se há divergência).
- **Signed commits** opcionais; recomendados para releases e hotfixes.
- **Force push proibido** em `main` sem exceção.
- **Deletion proibida** de `main`.

---

## 4. Ciclo de vida de uma working branch

```
1. git fetch origin
2. git switch -c feat/<descricao> origin/main
3. <commits atômicos, cada um build/test verde>
4. git fetch origin && git rebase origin/main
5. git push -u origin feat/<descricao>
6. abrir PR (ver @processes/pull-requests)
7. revisão e CI
8. squash merge em main
9. git push origin --delete feat/<descricao>  (ou auto-delete via repo settings)
```

Branches remotas são deletadas automaticamente após merge (configurar em repo settings).

---

## 5. Estratégia de sincronização

**Rebase sobre `main`** — histórico linear é mandatório.

- Default global: `git config --global pull.rebase true`.
- Antes de push: `git fetch origin && git rebase origin/main`.
- **Nunca** `git merge main` dentro de uma feature branch — gera merge commits ruidosos.
- Conflitos resolvidos durante o rebase, não em merge commit.

Se a rebase ficar inviável por volume de conflitos, **fechar o PR, abrir nova branch a partir de main e re-portar as mudanças** — sinal de que a branch viveu tempo demais.

---

## 6. Estratégia de merge

| Cenário | Estratégia |
|---|---|
| Feature branch → main | **Squash merge** (1 commit por feature, mensagem Conventional) |
| Hotfix → `main` (backfill) | PR com cherry-pick do fix, squash merge (seção 9) |
| Branch já rebaseada e linear | Fast-forward quando viável |

Squash é o default porque `main` carrega 1 commit semântico por unidade entregue, e o histórico granular fica preservado no PR.

`merge --no-ff` em todo merge é **anti-pattern** — polui o histórico com merge commits desnecessários.

---

## 7. Commits

- Mensagens seguem **Conventional Commits** (ver `@processes/commits`).
- Cada commit deve **buildar e passar testes localmente** — `git bisect` precisa funcionar.
- Commits `wip` são aceitáveis só em branch local e **devem ser squashed** antes do push/PR (ver `@processes/commits`, Squash policy).
- Commits atômicos: uma mudança lógica por commit.

---

## 8. Pull Requests

- **Tamanho ideal: <400 LOC reais** (sem lockfile/gerado). Acima de 800 LOC, dividir (limite em `@processes/pull-requests`).
- **Um propósito por PR.** Refactor + feature na mesma PR é anti-pattern.
- Template e checklist em `@processes/pull-requests`.
- Critérios de review em `@rules/code-review`.

---

## 9. Hotfix

Para correções urgentes em produção:

```
1. git switch -c hotfix/<issue-id>-<slug> <tag-de-producao>   # ex.: v1.4.2, não main
2. fix + teste de regressão
3. PR fast-track com label `hotfix` (review e CI obrigatórios, prioridade alta)
4. tag de patch (vX.Y.Z+1, ex.: v1.4.3) criada pela tool de release no commit aprovado do hotfix (`@processes/release` §11)
5. deploy imediato a partir da tag
6. backfill em main: PR com cherry-pick do fix, squash merge
7. postmortem
```

Sequência idêntica a `@processes/release` seção 11. O backfill em `main` é obrigatório para o fix não regredir na próxima release. Não há `develop` para sincronizar.

---

## 10. Release

- Tags de release são criadas pela **tool de release** (Release Please) no merge do PR de release — processo canônico em `@processes/release` §4–5. Não criar tag de release à mão.
- Formato obrigatório: `vMAJOR.MINOR.PATCH`, sem prefixo de componente (ver `@processes/release`).
- Tag criada manualmente (fora da tool, exceção registrada no PR/incidente) é sempre anotada: `git tag -a vX.Y.Z -m "<mensagem>"` + `git push origin vX.Y.Z`.

---

## 11. Feature flags > long-lived branches

Código incompleto vai para `main` atrás de feature flag. Long-lived branches geram drift, conflitos e atraso de integração. Ver `@rules/governance` para política de flags.

---

## 12. `.gitignore`

Commitado em root. Inclui no mínimo:

```
# env
.env
.env.local
.env.*.local

# deps
node_modules
.pnpm-store

# build
.next
dist
build
out

# coverage e cache
coverage
.turbo
.cache

# logs
*.log
npm-debug.log*
pnpm-debug.log*

# IDE
.vscode/*
!.vscode/settings.json
!.vscode/extensions.json
.idea

# OS
.DS_Store
Thumbs.db
```

---

## 13. `.gitattributes`

Commitado em root para normalização cross-OS:

```
* text=auto eol=lf
*.{png,jpg,jpeg,gif,webp,ico,pdf} binary
*.{woff,woff2,ttf,otf,eot} binary
*.lock linguist-generated=true
pnpm-lock.yaml linguist-generated=true
```

---

## 14. Arquivos grandes

- **Git LFS** obrigatório para assets binários >10MB.
- **Nunca** commitar binários voláteis (vídeos de demo, dumps de DB, builds).
- Repositório git deve permanecer abaixo de 1GB de histórico — auditar com `git count-objects -vH`.

---

## 15. Secrets

**Nunca** commitar segredos, mesmo temporariamente, mesmo em branch privada. Ver `@contracts/secrets`.

- `gitleaks` rodando em pre-commit hook (bloqueio local).
- `gitleaks` rodando em CI (bloqueio remoto).
- Se um segredo vazar: **revogar o segredo primeiro**, depois reescrever histórico (ver Seção 17).

---

## 16. Force push

| Cenário | Permitido? |
|---|---|
| `main` | **Nunca**, em nenhuma circunstância |
| Branch compartilhada (review ativo) | Apenas com `--force-with-lease` e comunicação no PR |
| Branch própria, não compartilhada | OK com `--force-with-lease` |
| `git push --force` puro | **Nunca** — sempre `--force-with-lease` |

`--force-with-lease` protege contra sobrescrever trabalho de outro autor que tenha pushado entre o seu último fetch e o push.

---

## 17. Reescrita de histórico

- **Rebase, squash, amend, fixup** apenas em branches **não-compartilhadas**.
- Após push para branch compartilhada (review em andamento), **histórico é imutável** — nenhuma reescrita sem aviso explícito e `--force-with-lease`.
- Commits em `main` são **definitivamente imutáveis** — para reverter, use `git revert` (novo commit), nunca `git reset`.

Exceção única para reescrita em `main`: vazamento de secret. Procedimento exige aprovação de governance e comunicação a todos os clones ativos.

---

## 18. Tags

- Criadas pela tool de release (§10, `@processes/release`); tag manual de exceção é **anotada** (`git tag -a`).
- Sempre **semver**: `vMAJOR.MINOR.PATCH`, prefixo `v` obrigatório.
- Tags são imutáveis — para corrigir, criar nova versão patch.

---

## 19. Submodules

**Evitar.** Submodules introduzem complexidade de clone, CI e onboarding. Preferir:

- **pnpm workspaces** para código interno compartilhado.
- **Packages publicados** (npm registry privado) para código versionado independentemente.

Submodules são justificáveis apenas para integrar repositórios externos que não podem ser publicados como package — registrar a decisão em ADR.

---

## 20. Monorepo

Layout do repositório (monorepo com workspaces vs `src/` único): **a definir pelo projeto** (ver `@architecture/fsd` e `@.contexts/engineering/MEMORY.md`). Se o projeto adotar monorepo, estrutura sugerida com pnpm workspaces:

```
.
├── apps/
│   ├── web/          # Next.js
│   └── api/          # Firebase Functions
├── packages/
│   ├── ui/
│   ├── types/
│   └── config/
├── pnpm-workspace.yaml
└── turbo.json
```

- **Turborepo** (ou Nx) para CI seletivo baseado em changed-affected.
- Cada `app/` e `package/` tem seu próprio `package.json`.
- Versão única no root para deps compartilhadas (via `pnpm.overrides`).

---

## 21. Higiene do repositório

| Item | Política |
|---|---|
| Branch stale | >30 dias sem atividade → alerta automático ou cleanup |
| PR stale | >7 dias sem update → escalar ao autor ou fechar |
| Branches merged | Deletar remoto automaticamente após merge |
| Histórico de releases | Preservado via tags `vX.Y.Z`, nunca via branches |

Auditoria mensal: listar branches remotas, identificar stale, agir.

---

## 22. Commits assinados

- **Opt-in** via repo settings (GPG ou SSH signing).
- **Recomendado** para releases, hotfixes e qualquer commit que toque `main` diretamente em cenário excepcional.
- Quando habilitado, CI verifica `verified` status do commit.

---

## 23. Anti-patterns

Lista enforce — qualquer item abaixo é motivo legítimo para bloqueio em review:

- Branches de longa duração (>1 semana sem rebase em `main`).
- `git merge main` dentro de feature branch (use rebase).
- PR gigante (>800 LOC reais) sem justificativa.
- Commits "WIP" mergeados sem squash.
- `git push --force` puro (use `--force-with-lease`).
- `git push --force` em branch compartilhada sem aviso.
- Commitar `node_modules`, `.env`, secrets, binários voláteis.
- Branch sem prefixo type (`minha-branch` em vez de `feat/minha-branch`).
- Direct push em `main`.
- Tag de release criada à mão fora da tool de release (ou tag manual sem anotação).
- Tag fora do formato semver.
- Submodules quando workspaces resolvem.
- Reescrita de histórico após push compartilhado.
- `merge --no-ff` em todo merge (poluição de histórico).
- Long-lived feature branch em vez de feature flag.

---

## Referências cruzadas

- `@processes/commits` — Conventional Commits, formato de mensagens.
- `@processes/pull-requests` — Template, ciclo de vida e checklist de PR.
- `@processes/release` — Política de versionamento e ciclo de release.
- `@processes/deploy` — Pipeline de integração contínua e gates de qualidade.
- `@rules/code-review` — Critérios de revisão de código.
- `@rules/governance` — Feature flags, política de exceções.
- `@rules/documentation` — Documentação de mudanças significativas.
- `@contracts/secrets` — Convenções de segredos e rotação.
