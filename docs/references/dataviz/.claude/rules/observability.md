# Observability — regra sempre-ativa

Todo evento relevante (request, job, erro, side effect caro) produz log estruturado com correlação, métricas e — quando aplicável — span de tracing. Sem PII em log.

## Princípios
- Logs são JSON, não texto livre. Campos consistentes: `ts`, `level`, `msg`, `traceId`, `service`, `env`.
- Correlation ID propaga de borda a borda — entra no header, sai no log, vai pro próximo serviço.
- Níveis: `debug` (dev), `info` (eventos de negócio), `warn` (degradação), `error` (falha).
- Métricas RED para serviços (Rate, Errors, Duration) + USE para recursos (Utilization, Saturation, Errors).
- Tracing: OTel spans para chamadas externas (DB, HTTP, fila). Nome do span = operação, não URL com IDs.
- Nunca logar: senha, token, CPF, email cru, número de cartão, payload de webhook de pagamento.
- Log no momento da decisão, não só do erro — "por que escolhi este branch".

## Checklist (aplicar a todo turn)
- [ ] Todo handler inicia/termina com log estruturado incluindo `traceId` e `duration_ms`.
- [ ] Erros logados com `err: { name, message, stack }` (lib serializa).
- [ ] Nenhum `console.log` em produção — usar logger configurado.
- [ ] Métricas de negócio relevantes incrementadas (ex.: `orders.created`).
- [ ] Spans em chamadas externas (DB query, fetch, queue publish).
- [ ] PII redacted ou hasheado antes de logar.

## Anti-patterns
- `console.log("user", user)` → `logger.info({ userId: user.id }, "user_loaded")`.
- TraceId gerado no log final → propagar desde a borda.
- Mensagem com template-literal só (`"user ${id} did X"`) → campo separado para `userId`.
- Logar request body inteiro → log apenas campos não-sensíveis.

## Mini-exemplo
```ts
const log = logger.child({ traceId, route: "POST /orders", userId });
log.info({ items: input.items.length }, "order_create_start");
const order = await createOrder(input);
log.info({ orderId: order.id, duration_ms: Date.now() - t0 }, "order_create_ok");
```

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/rules/observability.md`
