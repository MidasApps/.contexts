# Commits — regra sempre-ativa (Conventional Commits)

Cada commit segue Conventional Commits: tipo + escopo opcional + descrição imperativa. Histórico vira changelog automatizável; hook `guard-conventional-commit` valida no `PreToolUse Bash(git commit*)`.

## Princípios
- Formato: `<type>(<scope>)<!>: <description>` — ex. `feat(orders): add idempotency key`, `fix(auth)!: drop legacy token`.
- Tipos: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- Descrição em **imperativo presente**, minúscula, sem ponto final: "add", não "added"/"adds". Header inteiro ≤ 72 chars (conta type, scope, `!` e `:`).
- Scope em kebab-case, um nível, nome de bounded context ou área estável (`orders`, `auth`, `deps`); obrigatório quando a área é clara; nada de `app`/`core`/`misc`.
- `!` (preferido) e/ou footer `BREAKING CHANGE:` para mudança incompatível.
- Body explica **por quê** + contexto não-óbvio. Linhas ≤ 72 chars.
- Footer: `Refs: #123`, `Fixes: #123`/`Closes: #123`, `BREAKING CHANGE: <descrição>`, `Co-Authored-By:` quando houve assistência de IA.
- Um commit = uma mudança lógica. Se a mensagem tem "and", provavelmente são dois commits.
- Sem mensagens vazias: `fix`, `update`, `.` → rejeitar. `wip` só em branch local antes de squash, nunca em PR.

## Checklist (aplicar a todo turn)
- [ ] Tipo presente e válido.
- [ ] Descrição imperativa, minúscula, sem ponto; header ≤ 72 chars.
- [ ] Escopo é bounded context/área, não arquivo.
- [ ] Breaking change marcada com `!` e/ou `BREAKING CHANGE:` no footer.
- [ ] Body presente quando o "por quê" não é óbvio.

## Anti-patterns
- `update stuff` → `refactor(orders): extract pricing into module`.
- `fix bug` → `fix(auth): prevent redirect loop on expired session`.
- Misturar refactor + feature no mesmo commit → separar.

## Mini-exemplo
```
feat(orders): support idempotency-key header

Mutations on /v1/orders now accept Idempotency-Key. Repeated
requests with the same key within 24h return the original response.

Refs: #482
```

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/processes/commits.md`
