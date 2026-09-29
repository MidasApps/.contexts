---
name: pull-requests
description: Use ao abrir/revisar pull requests. Keywords: pull request, pr, code review.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Pull Requests

PRs são unidade de revisão e merge. Pequenos, focados, descritos claramente. Code review é diálogo técnico, não posturing.

## Essência
- **Pequeno:** alvo < 400 LOC reais (sem lockfile/gerado); acima de 800 LOC, dividir é obrigatório (incremental ou stacked). Exceção: codemod/regeneração, sinalizada no título.
- **Foco único:** uma intenção (feature, fix, refactor) por PR. Refactor + feature na mesma PR esconde mudanças.
- **Título** em Conventional Commits (`type(scope): description`) — vira a mensagem do squash commit em `main`.
- **Descrição** segue `.github/pull_request_template.md`: Summary, Changes, Why, How to test, Screenshots/Recordings, Risks (breaking, rollback, migrations), Checklist. Seção vazia é removida, não deixada com placeholder.
- **WIP** = PR em Draft, não título `WIP`.
- **CI verde** antes de pedir review. Reviewer não é debugger de lint.
- **Self-review:** ler o próprio diff antes de pedir review pega 50% dos problemas.
- **Reviewers:** code-owner do path + 1 cross-domain quando útil. Não pedir review pra 10 pessoas.
- **Code review etiquette:**
  - Pergunte > afirme ("could we…?", "what if…?").
  - Prefixos obrigatórios (rule `code-review`): `blocker:`, `issue:`, `suggestion:`, `nit:`, `question:`, `praise:`.
  - Aprovar com nits — não bloquear por estilo se há linter.
  - Sugerir via "GitHub suggested change" quando aplicável.
- **Merge strategy:** squash por padrão (`processes/git.md`); merge commit só em release branch/auditoria. Sync com `main` por rebase + `git push --force-with-lease`, nunca `git merge main` no PR.
- **SLA:** primeira review < 24h úteis; resposta do autor < 24h úteis.
- **Conventional commit** na mensagem final (ver rule `commits`).
- **Stacked PRs** para mudanças grandes: cada PR é review unit, próximo PR depende do anterior.

## Procedimento mínimo
1. Branch curta a partir de `main` atualizada, nome `<type>/<short-description>` (ex. `feat/orders-idempotency`).
2. Commits atômicos durante desenvolvimento.
3. Antes de marcar ready: `git fetch origin && git rebase origin/main`, CI local, self-review do diff.
4. Abrir PR (Draft enquanto WIP) com template preenchido.
5. Pedir review do code-owner; responder feedback em horas, não dias.
6. CI verde + approvals → merge (squash conforme política).
7. Deletar branch após merge.

## Anti-patterns
- "Mega PR" de 3000 linhas → quebrar em série.
- Descrição "fix bug" → sem contexto, reviewer perde tempo.
- Ignorar feedback bloqueante e fazer merge → quebra confiança do time.
- Aprovar sem ler ("LGTM" em 3000 linhas em 30s) → review teatral.
- Argumentar estilo num PR → mover pra lint config; PR não é fórum de estilo.

## Mini-exemplo
```markdown
<!-- título: feat(orders): support idempotency-key header -->
## Summary
- Add Idempotency-Key support on POST /v1/orders to prevent double charge on client retry.

## Changes
- New `idempotency_keys` table (24h TTL).
- Middleware checks the key before the handler; replays the stored response on hit.

## Why
Closes #482.

## How to test
- [x] Integration: duplicate POST returns the same response/status
- [x] Load: 1000 concurrent same-key requests → 1 charge

## Risks
Feature-flagged via `IDEMPOTENCY_ENABLED`, off by default. Rollback = flip flag.

## Checklist
- [x] Tests adicionados/atualizados
- [x] Feature flag quando aplicável
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/processes/pull-requests.md`
