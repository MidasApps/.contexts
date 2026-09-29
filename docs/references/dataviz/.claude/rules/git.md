# Git — regra sempre-ativa

Trunk-based: branches curtas a partir de `main`, merge frequente, sem force-push em ramos compartilhados, histórico legível.

## Princípios
- Trunk = `main`. Branches feature têm vida curta (horas a poucos dias).
- Nome de branch: `<tipo>/<scope>-<descricao-curta>` ex. `feat/orders-idempotency`, `fix/auth-redirect`.
- Rebase local antes de abrir PR para histórico linear; merge commit no PR conforme política do projeto.
- **Nunca** `git push --force` em `main` ou branch compartilhada. `--force-with-lease` em sua própria branch.
- Commits pequenos e atômicos — um commit = uma intenção. Squash no merge se houve fixups.
- `.gitignore` cobre artifacts (`node_modules`, `dist`, `.env`); `.env.example` versionado, `.env` nunca.
- Sem segredos no histórico — se vazar, rotacionar + filter-branch/BFG.
- Sem binário gigante (use Git LFS quando necessário).

## Checklist (aplicar a todo turn)
- [ ] Branch parte de `main` atualizada.
- [ ] Nome de branch segue padrão `<tipo>/...`.
- [ ] Sem `--force` em ramo compartilhado.
- [ ] `.env` ou credencial NÃO está em `git status`.
- [ ] Commits agrupados por intenção, não por "fim do dia".

## Anti-patterns
- Branch `dev-giulliano` de longa duração que diverge de main → rebase frequente.
- Commit "WIP" final no PR → squash ou reescrever.
- Force-push em PR com review em andamento → comentários ficam órfãos.

## Mini-exemplo
```bash
git switch -c feat/orders-idempotency
# ... commits atomic
git fetch origin && git rebase origin/main
git push -u origin feat/orders-idempotency
```

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/processes/git.md`
