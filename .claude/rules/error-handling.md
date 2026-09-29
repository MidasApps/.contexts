# Error Handling — regra sempre-ativa

Distingue erros esperados de domínio, falhas transitórias de infraestrutura e bugs; responde com o envelope estável; mascara internals; propaga `requestId`/`traceId`.

## Princípios
- Taxonomia: **domínio esperado** (não encontrado, conflito, regra violada) · **infra transitória** (timeout, 429, 503) · **bug** (invariante quebrada).
- Domínio → `Result<T, E>` narrowed pelo caller (`if (result.ok)`); `throw` só em adapter/boundary e para bug. Não misturar os dois na mesma função.
- Erro de domínio é classe com `code` estável (SCREAMING_SNAKE) e `cause` ao re-lançar; nunca `throw new Error("...")` genérico.
- Envelope HTTP: `{ error: { code, message, details?, requestId } }` — fonte única `@.contexts/engineering/contracts/api.md` §6. Cliente programa contra `code`. Esta rule não redefine o shape.
- Logar cada erro UMA vez, no boundary que o trata, com `requestId`/`traceId` e contexto seguro.
- Em prod: mensagem ao cliente é genérica; stack, SQL e mensagem crua de SDK só no log.

## Checklist (aplicar a todo turn)
- [ ] `try/catch` só no boundary (route handler, Server Action, handler de Function, worker), com mapeamento erro→status.
- [ ] Erro conhecido tem classe com `code`; `catch (e: unknown)` + `instanceof` antes de usar.
- [ ] Nenhuma promise solta; nenhum `catch {}` vazio.
- [ ] Resposta de erro NÃO contém stack, query, secret, path absoluto.
- [ ] Retry só em operação idempotente + erro transitório, com backoff+jitter e `maxAttempts`.
- [ ] I/O tem timeout explícito e propaga `AbortSignal`.

## Anti-patterns
- `catch (e) { console.log(e) }` → logger estruturado + map ou rethrow com `cause`.
- `return null` no catch → `Result.err` ou propagar.
- 200 com `{ ok: false }` → status HTTP correto.
- Vazar `e.message` do ORM/SDK → traduzir para `code` estável.

## Mini-exemplo
```ts
export class OrderNotFoundError extends Error {
  readonly code = "ORDER_NOT_FOUND";
  readonly orderId: OrderId;
  constructor(orderId: OrderId, options?: ErrorOptions) {
    super("order not found", options);
    this.name = "OrderNotFoundError";
    this.orderId = orderId; // sem parameter property: erasableSyntaxOnly
  }
}

try {
  const result = await getOrder({ tenantId, orderId }); // Result<Order, OrderNotFoundError>
  if (!result.ok)
    return Response.json({ error: { code: "NOT_FOUND", message: "Order not found.", requestId } }, { status: 404 });
  return Response.json({ data: result.data });
} catch (e: unknown) { // bug ou infra: loga uma vez, 500 genérico
  logger.error("get_order_failed", { requestId, traceId, err: e });
  return Response.json({ error: { code: "INTERNAL_ERROR", message: "Internal error.", requestId } }, { status: 500 });
}
```

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/rules/error-handling.md`
