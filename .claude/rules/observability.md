# Observability — regra sempre-ativa

Todo evento relevante (request, job, erro, side effect caro) produz log estruturado com correlação, métricas e — quando aplicável — span de tracing. Sem PII em log.

## Princípios
- Logs são JSON, não texto livre. Campos consistentes: `timestamp`, `level`, `message`, `service`, `env`, mais `requestId`/`traceId` quando houver; duração em `durationMs` (nunca `ts`, `msg`, `duration_ms`).
- `requestId` atribuído na borda (`proxy.ts` no Next 16, gateway ou runtime) e devolvido no envelope de erro; `traceId`/`spanId` propagados via OTel context, sem header próprio.
- Níveis: `debug` (dev), `info` (eventos de negócio), `warn` (degradação), `error` (falha).
- Métricas RED para serviços (Rate, Errors, Duration) + USE para recursos (Utilization, Saturation, Errors). `userId`/`requestId` nunca como label de métrica (cardinalidade).
- Tracing: OTel spans para chamadas externas (DB, HTTP, fila). Nome do span = operação, não URL com IDs.
- Nunca logar: senha, token, CPF, email cru, número de cartão, payload de webhook de pagamento.
- Log no momento da decisão, não só do erro — "por que escolhi este branch".

## Checklist (aplicar a todo turn)
- [ ] Todo handler termina com log estruturado incluindo `requestId`/`traceId` e `durationMs`.
- [ ] Erros logados com `err: { name, message, stack }` (lib serializa).
- [ ] Nenhum `console.log` em produção — usar logger configurado.
- [ ] Métricas de negócio relevantes incrementadas (ex.: `orders.created`).
- [ ] Spans em chamadas externas (DB query, fetch, queue publish).
- [ ] PII redacted ou hasheado antes de logar.

## Anti-patterns
- `console.log("user", user)` → `logger.info("user_loaded", { userId: user.id })`.
- TraceId gerado no log final → propagar desde a borda.
- Mensagem com template-literal só (`"user ${id} did X"`) → campo separado para `userId`.
- Logar request body inteiro → log apenas campos não-sensíveis.

## Mini-exemplo
```ts
// mensagem estável primeiro, campos estruturados depois (mesma forma do firebase-functions/logger)
const startedAt = performance.now();
const order = await placeOrder(input);
logger.info("order_placed", {
  requestId, traceId, tenantId: input.tenantId, orderId: order.id,
  itemCount: input.items.length, durationMs: Math.round(performance.now() - startedAt),
});
```

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/rules/observability.md`
