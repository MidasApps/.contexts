# Git — regra sempre-ativa

Trunk-Based Development: `main` é o trunk único, protegido e sempre deployable; branches curtas; rebase para sincronizar; squash merge; sem force-push puro.

## Princípios
- Trunk = `main` (sem `develop`, sem Git Flow). Branch vive horas a poucos dias (máx. 1 semana); código incompleto entra atrás de feature flag.
- Nome: `<type>/<short-description>` em kebab-case (`feat/orders-idempotency`, `fix/auth-redirect-loop`). Hotfix: `hotfix/<issue-id>-<slug>` criado da **tag de produção**, com backfill em `main` por PR.
- Sincronize com `git fetch origin && git rebase origin/main`; nunca `git merge main` na feature branch.
- Merge em `main` só por PR, CI verde, **squash merge** (título do PR = mensagem Conventional do commit final).
- `wip`/fixups só em branch local, squashed antes do PR.
- Force-push: nunca em `main`; nunca `--force` puro; `--force-with-lease` na própria branch (em PR com review ativo, avisar no PR).
- Commits em `main` são imutáveis: reverter com `git revert`, nunca `reset`.
- Segredo vazado: revogar primeiro, depois reescrever histórico (`git filter-repo`/BFG) com aprovação de governance.
- Tags anotadas semver (`git tag -a v1.2.3`); binário > 10 MB em Git LFS.

## Checklist (aplicar a todo turn)
- [ ] Branch parte de `origin/main` atualizada e segue `<type>/...`.
- [ ] Sem `--force` puro; `--force-with-lease` só em branch própria.
- [ ] `.env` ou credencial NÃO está em `git status`.
- [ ] Commits atômicos, cada um builda e passa teste.

## Anti-patterns
- Branch pessoal de longa duração que diverge de `main` → rebase frequente ou feature flag.
- Commit `WIP` chegando ao PR → squash local antes.
- `merge --no-ff` em todo merge → squash/fast-forward.

## Mini-exemplo
```bash
git fetch origin && git switch -c feat/orders-idempotency origin/main
# ... commits atômicos
git fetch origin && git rebase origin/main
git push -u origin feat/orders-idempotency   # abrir PR → squash merge
```

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/processes/git.md`
