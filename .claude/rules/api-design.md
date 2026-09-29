# API Design — regra sempre-ativa

APIs HTTP/RPC seguem contrato previsível: recursos REST, status codes corretos, auth primeiro, validação na borda, paginação cursor, versão no path, idempotência onde importa.

## Princípios
- HTTP público = recursos (substantivo plural kebab-case, `/payment-methods`); ação não-CRUD como sub-recurso (`POST /orders/:id/cancel`). Server Actions/callables = RPC interno, verbo camelCase (`placeOrder`).
- Verbos: `GET` (safe, nunca side effect), `POST` (create/ação), `PUT` (replace), `PATCH` (parcial), `DELETE`.
- Status: `200/201/204` sucesso; `400` input inválido; `401` sem auth; `403` sem permissão; `404`; `409` conflito; `422` regra de negócio; `429` + `Retry-After`; `5xx` falha servidor.
- Handler: auth → validate → authorize → act, antes de qualquer side effect.
- Sucesso: `{ data, meta? }`; nunca array no root. Erro: `{ error: { code, message, details?, requestId } }`. Shapes em `@.contexts/engineering/contracts/api.md` (§5, §6).
- Paginação cursor: `?cursor=...&limit=20` (máx. 100), resposta `meta.page: { cursor, hasMore, limit }`. Ordenação `?sort=-createdAt,name`. Filtros `createdAfter/createdBefore`, `amountMinorMin/Max`, lista por vírgula (§9–10).
- Versão só no path (`/v1/...`), nunca em header. Breaking = nova major; aditivo = mesma versão. Deprecação: `Deprecation` + `Sunset` + `Link rel="successor-version"`, janela ≥ 6 meses (§17).
- `Idempotency-Key` em POST com efeito custoso (pagamento, e-mail, webhook); resultado guardado ≥ 24h.
- Paths aninhados até 2 níveis (`/orders/:orderId/items`). IDs opacos, sem prefixo de tipo.

## Checklist (aplicar a todo turn)
- [ ] Handler segue auth → validate → authorize → act.
- [ ] Status code correto (nunca 200 com `{ error }` ou `{ success: false }`).
- [ ] Lista tem paginação cursor e `meta.page`.
- [ ] Mutation crítica aceita `Idempotency-Key`.
- [ ] Breaking change → `/v{N+1}`; OpenAPI regerado a partir do Zod (`docs/openapi/v1.yaml`).

## Anti-patterns
- `GET /deleteOrder?id=...` → `DELETE /v1/orders/:orderId`.
- `?sortBy=createdAt&sortOrder=desc` → `?sort=-createdAt`.
- `Accept: application/vnd.x.v1+json` para versionar → `/v1/` no path.
- Quebrar v1 em vez de criar v2 → cliente quebra silenciosamente.

## Mini-exemplo
```ts
// src/services/orders/adapters/driving/place-order-route-handler.ts
// (src/app/v1/orders/route.ts só faz: export { POST } from "@/services/orders/adapters/driving/place-order-route-handler")
export async function POST(req: Request) {
  const user = await requireAuth(req);                                   // 401
  const parsed = PlaceOrderInputSchema.safeParse(await req.json());      // 400 (rule validation)
  if (!parsed.success) return validationError(parsed.error, requestId);
  await assertCanPlaceOrder(user, parsed.data.tenantId);                 // 403
  const order = await placeOrder(parsed.data, { idempotencyKey: req.headers.get("idempotency-key") });
  return Response.json({ data: order }, { status: 201, headers: { Location: `/v1/orders/${order.id}` } });
}
```

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/rules/api-design.md`
