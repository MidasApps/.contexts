# Security — regra sempre-ativa

Garante higiene mínima de segurança a cada mudança de código: validação na borda, segredos fora do repo, authn/authz checada, output escapado, dependências vigiadas.

## Princípios
- Trust boundary: todo input externo (HTTP, fila, arquivo, LLM) é hostil até ser validado.
- Defense in depth: validação + authz + escape + rate-limit + log. Nenhuma camada isolada basta.
- Least privilege: tokens, roles e service accounts com o mínimo necessário.
- Secrets nunca em código, log, error message, prompt ou histórico git.
- Authn/RBAC checada na primeira linha do handler — antes de qualquer side effect.
- Output sempre escapado para o sink (HTML/SQL/shell/prompt) — preferir queries parametrizadas e libs com escape default.
- Dependências: scan de CVE no CI, evitar libs abandonadas, lockfile versionado.

## Checklist (aplicar a todo turn)
- [ ] Inputs validados com schema na borda (ver rule `validation`).
- [ ] Sem `process.env.SECRET` exposto em client bundle, log ou retorno de erro.
- [ ] Handler verifica `userId`/role antes de tocar recurso (no IDOR).
- [ ] Output em HTML/SQL/shell usa escape automático (JSX, prepared statements, `execFile`).
- [ ] Rate-limit ou idempotency-key em endpoints sensíveis (auth, pagamento, write caro).
- [ ] Cabeçalhos: CSP, HSTS, X-Content-Type-Options, Referrer-Policy quando se aplica.
- [ ] CSRF: SameSite cookie + double-submit token em form mutations.

## Anti-patterns
- String interpolation em SQL/shell → use prepared statements / `execFile([])`.
- `dangerouslySetInnerHTML` sem sanitizer → use DOMPurify ou evite.
- Esconder erro de auth com 500 genérico → retornar 401/403 explícito, log no servidor.
- Secret em `.env` commitado → secret manager + `.env.example` apenas.
- Validar no client e confiar no server → server valida sempre, client é UX.

## Mini-exemplo
```ts
// handler: authz first, validate, then act
export async function POST(req: Request) {
  const user = await requireUser(req);          // 401 se faltar
  const input = CreateOrderSchema.parse(await req.json()); // 400 se inválido
  await assertCanCreateOrder(user, input.tenantId);        // 403 se IDOR
  return createOrder(user, input);
}
```

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/rules/security.md`
