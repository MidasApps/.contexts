# Git Workflow

Convenção operacional de versionamento, colaboração e integração para o repositório. Define o modelo de branching, sincronização, merge, hotfix, release e higiene. Tom prescritivo: o que está aqui é o fluxo oficial; desvios exigem justificativa em PR ou ADR.

---

## 1. Modelo adotado

**Trunk-Based Development** com short-lived feature branches é o default do projeto.

- `main` é o trunk único — sempre deployable, sempre verde.
- Feature branches vivem **horas a poucos dias**, no máximo uma semana antes de rebase ou merge.
- **GitHub Flow leve** é aceitável quando o time precisar de uma alternativa mais simples (sem release branches), mantendo as mesmas garantias de proteção e PR.
- **Git Flow é rejeitado**: overhead de `develop`, `release/*` e `hotfix/*` paralelos não compensa em projetos com CI/CD contínuo e deploy direto de `main`.

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
- `chore/upgrade-next-15`
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
| Release branch → main | Merge commit (preservar histórico granular do release) |
| Hotfix → main | Squash merge ou fast-forward |
| Branch já rebaseada e linear | Fast-forward quando viável |

Squash é o default porque `main` carrega 1 commit semântico por unidade entregue, e o histórico granular fica preservado no PR.

`merge --no-ff` em todo merge é **anti-pattern** — polui o histórico com merge commits desnecessários.

---

## 7. Commits

- Mensagens seguem **Conventional Commits** (ver `@processes/commits`).
- Cada commit deve **buildar e passar testes localmente** — `git bisect` precisa funcionar.
- Commits "WIP" são aceitáveis durante o trabalho, mas **devem ser squashed** antes do merge.
- Commits atômicos: uma mudança lógica por commit.

---

## 8. Pull Requests

- **Tamanho ideal: <400 LOC** (incluindo testes). Acima de 1000 LOC, dividir.
- **Um propósito por PR.** Refactor + feature na mesma PR é anti-pattern.
- Template e checklist em `@processes/pull-requests`.
- Critérios de review em `@rules/code-review`.

---

## 9. Hotfix

Para correções urgentes em produção:

```
1. git switch -c hotfix/<issue> origin/main
2. fix + teste
3. PR fast-track (review obrigatório, CI obrigatório, mas prioridade alta)
4. squash merge em main
5. deploy imediato
6. tag de patch release (vX.Y.Z+1)
```

Backfill em main acontece automaticamente — não há `develop` para sincronizar.

---

## 10. Release

- Releases marcadas com **tags anotadas semver**: `git tag -a v1.2.3 -m "release: <resumo>"`.
- Push explícito: `git push origin v1.2.3` (ou `git push --tags`).
- Formato obrigatório: `vMAJOR.MINOR.PATCH` (ver `@processes/release`).
- Tags lightweight (`git tag v1.2.3` sem `-a`) são proibidas — perdem metadados de autor, data e mensagem.

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

- Sempre **anotadas**: `git tag -a vX.Y.Z -m "<mensagem>"`.
- Sempre **semver**: `vMAJOR.MINOR.PATCH`, prefixo `v` obrigatório.
- Push explícito: `git push origin vX.Y.Z` ou `git push --tags`.
- Tags são imutáveis — para corrigir, criar nova versão patch.

---

## 19. Submodules

**Evitar.** Submodules introduzem complexidade de clone, CI e onboarding. Preferir:

- **pnpm workspaces** para código interno compartilhado.
- **Packages publicados** (npm registry privado) para código versionado independentemente.

Submodules são justificáveis apenas para integrar repositórios externos que não podem ser publicados como package — registrar a decisão em ADR.

---

## 20. Monorepo

Estrutura padrão com pnpm workspaces:

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
| Histórico de releases | Preservado via tags anotadas, nunca via branches |

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
- PR gigante (>1000 LOC) sem justificativa.
- Commits "WIP" mergeados sem squash.
- `git push --force` puro (use `--force-with-lease`).
- `git push --force` em branch compartilhada sem aviso.
- Commitar `node_modules`, `.env`, secrets, binários voláteis.
- Branch sem prefixo type (`minha-branch` em vez de `feat/minha-branch`).
- Direct push em `main`.
- Tag sem anotação (`git tag v1.2.3` em vez de `git tag -a`).
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
