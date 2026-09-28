---
name: pull-requests
description: Use ao abrir/revisar pull requests. Keywords: pull request, pr, code review.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Pull Requests

PRs são unidade de revisão e merge. Pequenos, focados, descritos claramente. Code review é diálogo técnico, não posturing.

## Essência
- **Pequeno:** < 400 linhas mudadas é fácil revisar; > 1000 é quase certamente refatorável em PRs menores.
- **Foco único:** uma intenção (feature, fix, refactor) por PR. Refactor + feature na mesma PR esconde mudanças.
- **Descrição:**
  - **What:** o que mudou.
  - **Why:** por que (link issue/ADR).
  - **How:** abordagem se não óbvia.
  - **Screenshots/recordings** em mudança de UI.
  - **Test plan:** como verificar (manual + automatizado).
  - **Risk/rollback:** o que pode quebrar; como reverter.
- **CI verde** antes de pedir review. Reviewer não é debugger de lint.
- **Self-review:** ler o próprio diff antes de pedir review pega 50% dos problemas.
- **Reviewers:** code-owner do path + 1 cross-domain quando útil. Não pedir review pra 10 pessoas.
- **Code review etiquette:**
  - Pergunte > afirme ("could we…?", "what if…?").
  - Distinguir bloqueante vs nit (prefixar `nit:`, `question:`, `suggestion:`, `blocking:`).
  - Aprovar com nits — não bloquear por estilo se há linter.
  - Sugerir via "GitHub suggested change" quando aplicável.
- **Merge strategy:** squash (default), merge commit, ou rebase — escolher política do projeto e ser consistente.
- **Conventional commit** na mensagem final (ver rule `commits`).
- **Stacked PRs** para mudanças grandes: cada PR é review unit, próximo PR depende do anterior.

## Procedimento mínimo
1. Branch curta com nome `<tipo>/<scope>-...`.
2. Commits atômicos durante desenvolvimento.
3. Antes de abrir PR: rebase com main, rode CI local, self-review.
4. Abrir PR com descrição completa + test plan.
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
## What
Add idempotency-key header support on POST /v1/orders.

## Why
Closes #482. Prevents double-charge on client retry after network blip.

## How
- New `idempotency_keys` table (24h TTL).
- Middleware checks key before handler; replays cached response on hit.
- Cache key includes path + body hash.

## Test plan
- [x] Unit: middleware caches/serves
- [x] Integration: duplicate POST returns same response/status
- [x] Load: 1000 concurrent same-key requests → 1 charge

## Risk / rollback
Feature-flagged via `IDEMPOTENCY_ENABLED`. Off by default. Rollback = flip flag.
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/processes/pull-requests.md`
