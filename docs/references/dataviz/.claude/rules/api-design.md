# API Design — regra sempre-ativa

APIs HTTP/RPC seguem contrato previsível: verbos REST, status codes corretos, validação na borda, autenticação primeiro, paginação consistente, versionamento explícito, idempotência onde importa.

## Princípios
- Resource-oriented (REST) ou function-oriented (RPC) — escolha uma e seja consistente.
- Verbos: `GET` (read, safe), `POST` (create/action), `PUT` (replace), `PATCH` (partial), `DELETE`. `GET` nunca causa side effect.
- Status: `200/201/204` sucesso; `400` input inválido; `401` no auth; `403` no permission; `404` not found; `409` conflict; `422` semântico; `429` rate-limit; `5xx` falha servidor.
- Authn/authz na primeira linha do handler — antes de qualquer leitura ou parse.
- Validação por schema na borda — ver rule `validation`.
- Error envelope estável: `{ code, message, details?, traceId }` (ver rule `error-handling`).
- Paginação: cursor-based (`?cursor=...&limit=20`) para listas grandes; offset só para UI com page-jump.
- Versionamento: `/v1/...` no path OU `Accept: application/vnd.x.v1+json`. Breaking = nova versão.
- Idempotency-key em mutations que podem ser retried (`POST /payments`).
- Paths: substantivos plurais (`/orders/:id`), nested apenas 1 nível (`/orders/:id/items`).

## Checklist (aplicar a todo turn)
- [ ] Handler segue auth → validate → authorize → act.
- [ ] Status codes corretos (não retornar 200 com `ok: false`).
- [ ] Lista grande tem paginação documentada.
- [ ] Mutation crítica aceita `Idempotency-Key`.
- [ ] Breaking change → nova versão; aditivo → mesma versão.
- [ ] OpenAPI/contrato atualizado quando shape muda.

## Anti-patterns
- `GET /deleteOrder?id=...` → `DELETE /orders/:id`.
- `POST` que só lê sem motivo → `GET`.
- 200 com `{ error: "..." }` → status code apropriado.
- Quebrar v1 em vez de criar v2 → cliente quebra silenciosamente.

## Mini-exemplo
```ts
// POST /v1/orders
const user = await requireAuth(req);
const body = CreateOrderSchema.parse(await req.json());
await assertCanCreate(user, body.tenantId);
const order = await orders.create(body, { idempotencyKey: req.headers.get("idempotency-key") });
return Response.json(order, { status: 201, headers: { Location: `/v1/orders/${order.id}` } });
```

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/rules/api-design.md`
