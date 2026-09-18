# Error Handling — regra sempre-ativa

Distingue erros operacionais (esperados, recuperáveis) de bugs (impossíveis), retorna envelope estável ao cliente, mascara internals em prod, propaga correlation ID.

## Princípios
- Taxonomia: **operational** (input ruim, recurso indisponível, conflito) vs **programmer** (assert, invariante quebrada).
- Operational → resposta tipada para o caller (4xx ou Result). Programmer → log + 500 + crash policy.
- Error envelope estável: `{ code: "ORDER_NOT_FOUND", message, details?, traceId }`. Cliente programa contra `code`, não mensagem.
- `Result<T, E>` ou either em boundaries internos quando o erro é parte do contrato; `throw` quando é excepcional.
- Toda exception logged com correlation/trace ID + contexto (userId, route, params seguros).
- Em prod: mensagem ao cliente é genérica; stack trace só no log.
- Catch específico, não `catch (e) {}` mudo — engole bugs.

## Checklist (aplicar a todo turn)
- [ ] Handler tem `try/catch` apenas no topo, com mapeamento erro→HTTP.
- [ ] Erros conhecidos têm classe/tag (`class NotFoundError`, `kind: "conflict"`).
- [ ] Log inclui `traceId`, `userId` (se houver), rota, code.
- [ ] Resposta de erro NÃO contém stack, query, secret, path absoluto.
- [ ] `Promise` sem `.catch`/`await` → erro caçado por handler de topo.
- [ ] Retry só em erro idempotente + transient (5xx, ECONNRESET).

## Anti-patterns
- `catch (e) { console.log(e) }` → log estruturado + rethrow ou map.
- Lançar `Error("falhou")` genérico → use classe com `code`.
- Retornar 200 com `{ ok: false }` para erro → use status HTTP correto.
- Vazar `e.message` do ORM ao cliente → traduzir para code estável.

## Mini-exemplo
```ts
class NotFoundError extends Error { code = "NOT_FOUND"; constructor(public resource: string){ super(resource) } }

try { return await getOrder(id) }
catch (e) {
  if (e instanceof NotFoundError) return json({ code: e.code, message: "Order not found" }, 404);
  logger.error({ traceId, err: e }, "unhandled");
  return json({ code: "INTERNAL", traceId }, 500);
}
```

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/rules/error-handling.md`
