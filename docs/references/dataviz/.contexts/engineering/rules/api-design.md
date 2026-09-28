---
title: Regras de Design de API
type: rules
status: active
scope: HTTP Route Handlers (Next.js), Server Actions, Firebase Functions (HTTPS/Callable), webhooks, RPC interno
---

# Regras de Design de API

Regras imperativas que governam **como** desenhamos superfícies de API. Este documento trata de princípios de design (verbos, recursos, status, idempotência, evolução). O **shape** concreto de payloads (campos, tipos, envelopes) vive em `@contracts/api`. Validação de entrada vive em `@rules/validation`. Tratamento de erros vive em `@rules/error-handling`. Segurança de transporte e autenticação vivem em `@rules/security`.

---

## 1. Recursos vs ações

- **Sempre** modele endpoints HTTP como recursos (substantivos), nunca como ações (verbos): use `POST /orders`, não `POST /createOrder`.
- **Use** plural para coleções: `/orders`, `/users`, `/invoices` — nunca `/order`, `/user`.
- **Use** kebab-case em paths: `/payment-methods`, nunca `/paymentMethods` ou `/payment_methods`.
- **Use** camelCase em query strings e bodies JSON: `?sortBy=createdAt`, `{ "firstName": "..." }`.
- **Não** misture verbos no path quando o método HTTP já carrega a semântica. Reserve verbos para ações que não mapeiam para CRUD: `POST /orders/:id/cancel`, `POST /invoices/:id/send`.
- **Para Server Actions**, nomeie a função com verbo no infinitivo em camelCase: `createOrder`, `cancelInvoice`, `archiveProject`. Server Actions são RPC, não REST — não tente forçar semântica de recurso.
- **Para Firebase Callable Functions**, siga o mesmo padrão de Server Actions: nomes verbais, camelCase, sem prefixos como `api` ou `fn`.

## 2. Métodos HTTP

- **Use** `GET` apenas para leituras seguras e idempotentes. `GET` **nunca** modifica estado.
- **Use** `POST` para criação ou ações não-idempotentes.
- **Use** `PUT` para substituição completa de recurso (idempotente).
- **Use** `PATCH` para atualização parcial (idempotente quando possível).
- **Use** `DELETE` para remoção (idempotente — chamadas repetidas retornam 404 ou 204, nunca erro).
- **Não** use `GET` com body. Se precisa de query complexa, use `POST /resource/search` com body, retornando os mesmos dados que o `GET` retornaria.
- **Não** invente métodos. Se você precisa de algo que não cabe em GET/POST/PUT/PATCH/DELETE, modele como sub-recurso de ação (`POST /orders/:id/refund`).

## 3. Status codes

- **Sempre** retorne o status code mais específico aplicável. Não use 200 para tudo nem 500 para qualquer erro.
- **200 OK** — leitura bem-sucedida, ou ação que retorna corpo.
- **201 Created** — criação bem-sucedida. Inclua `Location` header apontando para o recurso criado.
- **202 Accepted** — operação assíncrona aceita mas ainda não concluída. Inclua identificador da operação para polling.
- **204 No Content** — sucesso sem body (delete, ações fire-and-forget). **Não** envie body junto.
- **400 Bad Request** — payload inválido sintaticamente ou semanticamente. Use para falhas de validação de schema.
- **401 Unauthorized** — falta autenticação ou token inválido. **Nunca** use 401 quando o problema é permissão.
- **403 Forbidden** — autenticado mas sem permissão. **Nunca** vaze informação sobre existência do recurso aqui — prefira 404 se a existência for sensível.
- **404 Not Found** — recurso não existe ou usuário não tem acesso (quando existência é sensível).
- **409 Conflict** — estado atual do recurso impede a operação (ex: cancelar ordem já cancelada).
- **410 Gone** — recurso existia mas foi removido permanentemente. Use para deprecação dura.
- **422 Unprocessable Entity** — sintaxe OK, semântica inválida em regra de negócio. Diferencie de 400 quando útil para o cliente.
- **429 Too Many Requests** — rate limit excedido. Sempre acompanhe de `Retry-After`.
- **500 Internal Server Error** — falha inesperada. **Nunca** vaze stack trace ou detalhe de implementação no body.
- **503 Service Unavailable** — falha temporária (dependência fora). Inclua `Retry-After` quando estimável.
- **Não** use 200 com `{ "error": "..." }` no body. Status code carrega a sinalização primária.

## 4. Idempotência

- **Toda** rota `PUT`, `DELETE`, `GET` é idempotente por contrato. Implemente para que seja verdade.
- **Para `POST` que cria recurso**, aceite header `Idempotency-Key` (UUID gerado pelo cliente) quando a operação custar dinheiro, gerar efeito colateral externo (email, webhook, pagamento) ou for crítica. A chave é válida por no mínimo 24h.
- **Armazene** o resultado da primeira execução indexado pela `Idempotency-Key` e retorne-o em chamadas subsequentes com a mesma chave, mesmo status code.
- **Não** confunda idempotência com cache. Idempotência é sobre efeito; cache é sobre resposta.

## 5. Paginação

- **Sempre** pagine listagens. **Nunca** retorne coleção ilimitada — mesmo que hoje haja 5 registros, projete para 5 milhões.
- **Use** cursor-based pagination por padrão: `?cursor=<opaque>&limit=20`. O cursor é opaco para o cliente — não documente seu formato interno.
- **Use** offset-based apenas quando o cliente precisa explicitamente saltar páginas (raro, geralmente admin UIs).
- **Limite** padrão: 20. **Máximo** permitido: 100. Requisições acima do máximo retornam 400.
- **Retorne** metadata de paginação no envelope: `{ "data": [...], "pagination": { "nextCursor": "...", "hasMore": true } }`. Não use headers para isso.
- **Não** inclua `totalCount` em listagens grandes. Contar é caro. Se o cliente precisa de total, exponha endpoint separado `GET /resource/count`.

## 6. Filtros, ordenação e sparse fieldsets

- **Filtros** vão em query string com nome do campo: `?status=active&createdAfter=2025-01-01`.
- **Para filtros compostos**, use sufixos: `?priceGte=100&priceLte=500`, `?statusIn=active,pending`.
- **Ordenação** usa `sortBy` e `sortOrder`: `?sortBy=createdAt&sortOrder=desc`. Para ordenação múltipla, aceite array: `?sortBy=status,createdAt&sortOrder=asc,desc`.
- **Campos esparsos**: aceite `?fields=id,name,status` para reduzir payload quando útil. Documente quais endpoints suportam.
- **Não** aceite filtros arbitrários por SQL-injection-like syntax (`?filter=status eq 'active'`). Use parâmetros nomeados.
- **Rejeite** filtros desconhecidos com 400. Não ignore silenciosamente — isso esconde bugs do cliente.

## 7. Versionamento

- **Versione** APIs públicas no path: `/v1/orders`, `/v2/orders`. Nunca em header (`Accept-Version`) — quebra cache e discoverability.
- **Não** versione APIs internas (Server Actions, callables consumidas só pelo próprio app). Deploy atômico com o cliente.
- **Para mudanças aditivas** (novo campo opcional, nova rota), **não** incremente versão. Adicione e documente.
- **Para breaking changes** (remoção de campo, mudança de tipo, mudança de semântica), incremente major version e mantenha a anterior por no mínimo 6 meses.
- **Marque** rotas deprecadas com header `Deprecation: true` e `Sunset: <date RFC 7231>` em toda resposta. Logue uso para identificar consumidores antes do sunset.
- **Não** mantenha mais de duas versões majors simultaneamente em produção.

## 8. Identificadores

- **Use** ULID para IDs gerados pelo servidor: ordenáveis por tempo, opacos ao cliente, URL-safe. Não use UUID v4 (não-ordenável) nem auto-increment (vaza volume).
- **IDs são opacos**. **Nunca** parseie estrutura do ID no cliente. **Nunca** documente formato interno.
- **Não** exponha IDs de banco (`uid` interno) ao público quando o recurso tem outra identidade natural pública (slug, código). Use o ID público.
- **Para recursos hierárquicos**, prefira path nesting raso: `/projects/:projectId/tasks/:taskId`. Não aninhe mais de dois níveis — vira inferno de URL.

## 9. Envelopes de resposta

- **Use** envelope consistente em **toda** resposta de sucesso com body:
  ```json
  { "data": <payload> }
  ```
  Para coleções:
  ```json
  { "data": [...], "pagination": {...} }
  ```
- **Use** envelope consistente em **toda** resposta de erro — definido em `@rules/error-handling`. Este documento não redefine o shape.
- **Não** retorne array bruto no root (`[...]`). Sempre embrulhe — permite adicionar metadata futura sem breaking change.
- **Para Server Actions**, retorne `{ success: true, data }` ou `{ success: false, error }`. Server Actions não têm status code — o envelope carrega o sinal.

## 10. Content negotiation

- **Toda** API aceita e retorna `application/json` por padrão. **Não** suporte XML, form-encoded ou outros formatos sem necessidade real documentada.
- **Para upload de arquivo**, aceite `multipart/form-data` em rotas dedicadas (`POST /uploads`). Não misture upload com JSON metadata na mesma rota — separe upload (retorna handle) e metadata (consome handle).
- **Rejeite** com 415 Unsupported Media Type se o `Content-Type` não for esperado. Não tente adivinhar.
- **Sempre** envie `Content-Type: application/json; charset=utf-8` em respostas JSON.

## 11. Streaming e SSE

- **Para respostas longas de IA** (LLM completions), use SSE (`text/event-stream`) ou streaming response do AI SDK. Nunca acumule no servidor e retorne JSON no fim.
- **Toda** stream tem evento de início, eventos incrementais e evento de término explícito (`event: done`). Cliente nunca depende de fechamento de conexão para saber que terminou.
- **Toda** stream emite `event: error` em formato JSON estruturado quando há falha mid-stream. Não corte conexão silenciosamente.
- **Não** use WebSocket quando SSE basta. Use WebSocket apenas para canal bidirecional real.

## 12. Webhooks (saída)

- **Toda** entrega de webhook é assinada com HMAC-SHA256 no header `X-Signature`. A assinatura cobre body + timestamp.
- **Inclua** header `X-Webhook-Timestamp` (Unix epoch). Receptores rejeitam timestamps fora de janela de 5 minutos para mitigar replay.
- **Inclua** header `X-Webhook-Id` único por entrega. Receptores usam para deduplicação.
- **Retry** com backoff exponencial: 1m, 5m, 30m, 2h, 12h. Pare após 5 tentativas. Sucesso é qualquer 2xx do receptor.
- **Não** envie payload sensível bruto (PII, tokens) em webhook. Envie ID do evento e exija que o receptor busque o dado via API autenticada.
- **Documente** todos os tipos de evento em catálogo único. Cada evento tem versão (`order.created.v1`). Nunca renomeie evento — deprecie e crie novo.

## 13. Webhooks (entrada)

- **Verifique** assinatura HMAC **antes** de qualquer parsing ou processamento. Falha de assinatura retorna 401 sem detalhe.
- **Trate** todo webhook recebido como possivelmente duplicado. Use `X-Webhook-Id` ou equivalente do remetente para deduplicar.
- **Responda** rápido (< 5s). Processamento pesado vai para fila, não inline.
- **Retorne** 2xx assim que o evento for aceito (não necessariamente processado). 4xx/5xx forçam retry do remetente.

## 14. Rate limiting

- **Toda** API pública expõe limites por consumidor. **Sempre** comunique limites via headers:
  - `RateLimit-Limit`: total permitido na janela.
  - `RateLimit-Remaining`: restante.
  - `RateLimit-Reset`: segundos até reset.
- **Em 429**, envie `Retry-After` (segundos ou data HTTP).
- **Não** rate-limite por IP em APIs autenticadas — limite por identidade (user/org/api-key). IP vira fallback para rotas anônimas.
- **Aplique** rate limit antes de qualquer processamento custoso. Limite primeiro, processe depois.

## 15. APIs internas vs públicas

- **API pública** = consumida por terceiros, mobile app de cliente, integração externa. Versionada, rate-limited, com SLA, com deprecação formal.
- **API interna** = consumida só pelo próprio frontend ou serviços do mesmo deploy. **Não versionada**, deploy atômico, breaking changes livres.
- **Server Actions são sempre internas**. Se você precisa expor a mesma capacidade a terceiros, crie endpoint HTTP REST separado — não exponha Server Action.
- **Callables Firebase são internas** quando consumidas pelo app oficial; tornam-se públicas no momento em que terceiros recebem credenciais. Promova com critério.
- **Não** misture concerns: rota interna não vira pública sem revisão de design (versionamento, rate limit, contrato estável, erros sanitizados).

## 16. HATEOAS

- **Não** implemente HATEOAS por padrão. Custo de design e implementação não se paga em APIs JSON consumidas por SPAs e mobile.
- **Use** links contextuais (`{ "data": ..., "links": { "next": "...", "cancel": "..." } }`) **apenas** quando o cliente precisa descobrir ações disponíveis dinamicamente (workflows com estado). Caso contrário, é overhead.
- **Quando usar links**, são URLs absolutas. Cliente não monta path manualmente.

## 17. Deprecação e breaking changes

- **Defina** breaking change explicitamente: remover campo, mudar tipo de campo, mudar semântica de valor existente, mudar status code retornado, mudar formato de ID, mudar formato de data, tornar campo opcional em obrigatório.
- **Adições** (novo campo opcional, nova rota, novo valor em enum quando documentado como extensível) **não** são breaking.
- **Para deprecar** rota ou campo: marque com `Deprecation: true` header, anuncie em changelog, dê prazo mínimo de 6 meses para públicas e 1 sprint para internas, monitore uso via logs estruturados.
- **Não** mude semântica de campo existente. Crie novo campo e deprecie o antigo.

## 18. Consistência transversal

- **Toda** rota retorna `Content-Type` correto, status code apropriado, envelope consistente.
- **Toda** API usa mesmo formato de data: ISO 8601 com timezone (`2026-05-20T14:30:00Z`). Nunca epoch em campo de payload (apenas em headers como `X-Webhook-Timestamp`).
- **Toda** API usa mesmo formato de moeda: inteiro em menor unidade (centavos), com campo `currency` separado (ISO 4217). Nunca float para dinheiro.
- **Toda** API usa mesmo formato de booleano: `true`/`false` JSON. Nunca `"yes"`, `"1"`, `1`.
- **Toda** API usa mesma convenção de nulidade: campo opcional ausente vs presente com `null` significam coisas diferentes. **Ausente** = não informado. **`null` explícito** = limpar valor. Documente em `@contracts/api`.
- **Inconsistência transversal entre rotas é bug**, não preferência de quem implementou. Revisor de PR rejeita.

## 19. Anti-patterns proibidos

- **Não** crie endpoints `/api/getThing` ou `/api/doStuff`. Verbo no path mais método HTTP é dupla negação semântica.
- **Não** retorne 200 com `{ "success": false }`. Status code é sinal primário.
- **Não** misture identidade de recurso com slug humano sem necessidade. Se precisa de slug, ofereça ambos: `GET /articles/:idOrSlug`.
- **Não** exponha contagem total em listagens grandes sem necessidade explícita do cliente.
- **Não** invente formato de data, moeda, booleano por rota.
- **Não** crie rota que faz duas coisas (criar usuário **e** enviar email **e** logar auditoria) e que o cliente espera ver desfeita atomicamente do lado dele. Atomicidade é interna; expose apenas a operação de domínio.
- **Não** documente formato interno de IDs, cursors ou tokens opacos. Tudo opaco é opaco para sempre.

## 20. Checklist de PR para nova rota

Antes de aprovar PR que adiciona ou modifica rota HTTP, verificar:

- Recurso (substantivo plural kebab) ou ação justificada (`/resource/:id/verb`).
- Método HTTP correto e semântico.
- Status codes apropriados para sucesso e cada caso de erro.
- Envelope de resposta consistente.
- Paginação se for listagem.
- Validação de input em `@rules/validation` aplicada.
- Tratamento de erro em `@rules/error-handling` aplicado.
- Autenticação/autorização em `@rules/security` aplicadas.
- Idempotência implementada se for POST com efeito custoso.
- Rate limit aplicável definido.
- Versionamento correto (público vs interno).
- Contrato de payload formalizado em `@contracts/api`.
- Tipos derivados do schema, não duplicados.
- Testes cobrem caminho feliz, validação, autorização, idempotência.

---

## Referências cruzadas

- `@contracts/api` — shape concreto de payloads, naming de campos, envelopes específicos.
- `@rules/validation` — validação de input (schemas, sanitização).
- `@rules/error-handling` — formato de erro, taxonomia, propagação.
- `@rules/security` — autenticação, autorização, transporte, secrets.
- `@rules/performance` — caching de resposta, ETags, compressão.
- `@stacks/frontend/next@16` — Route Handlers, Server Actions, headers em Next.
- `@stacks/backend/firebase-functions` — HTTPS e Callable Functions.
- `@stacks/ai/vercel-ai-sdk` — streaming de respostas de LLM.
