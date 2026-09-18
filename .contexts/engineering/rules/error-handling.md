---
title: Error Handling Rules
type: rules
status: active
scope: engineering
last_updated: 2026-05-20
---

# Regras de Error Handling

Regras imperativas e enforce sobre como tratar erros no código. Cobre taxonomia, propagação, retry, timeout, cancelamento, boundaries e anti-patterns. Para envelope HTTP de erro, ver `@rules/api-design`. Para regras de logging estruturado, ver `@rules/observability`. Para não-vazamento de PII e stack traces, ver `@rules/security`. Para validação de input, ver `@rules/validation`.

## 1. Taxonomia de erros

- **Sempre** classifique todo erro em uma de três categorias antes de escrever o handler: erro de domínio esperado, falha de infraestrutura recuperável, ou bug do programador.
- **Use** `Result<T, E>` (Either, tagged union) para erros esperados de domínio que o caller deve tratar.
- **Use** `throw` apenas para bugs do programador (invariantes violadas, estado impossível) e para falhas que atravessam várias camadas até um boundary.
- **Nunca** trate validação de input do usuário como exception — retorne `Result.err` ou objeto de validação. Ver `@rules/validation`.
- **Nunca** use `throw` para fluxo de controle normal. Lançar exception não é `return`.

## 2. Tipos de erro customizados

- **Sempre** defina classes de erro custom estendendo `Error` com nome único e discriminador `kind` (string literal) para narrowing.
- **Sempre** inclua `cause` (segundo argumento de `Error`) ao re-lançar para preservar a cadeia.
- **Sempre** anexe contexto estruturado como propriedade (`context: Record<string, unknown>`), nunca concatene no `message`.
- **Nunca** inclua PII, secrets, tokens ou conteúdo de usuário em `message` ou `context`. Ver `@rules/security`.
- **Use** union discriminado de tipos de erro de domínio por módulo. Exporte o union, não classes soltas.

```ts
// ok
class OrderNotFoundError extends Error {
  readonly kind = "order_not_found" as const;
  constructor(public orderId: string, options?: { cause?: unknown }) {
    super(`order ${orderId} not found`, options);
    this.name = "OrderNotFoundError";
  }
}

// errado: sem discriminador, sem cause, PII no message
class Err extends Error {
  constructor(msg: string) { super(msg); }
}
```

## 3. Result/Either no domínio

- **Sempre** retorne `Result<T, E>` em funções de domínio que podem falhar de forma esperada (não encontrado, conflito, regra de negócio violada).
- **Sempre** force o caller a tratar o erro via narrowing (`if (result.ok)`), nunca via try/catch implícito.
- **Nunca** misture `Result` e `throw` na mesma função. Escolha um contrato e mantenha.
- **Use** `throw` somente em adapters/boundaries (HTTP, DB, fila) e converta para `Result` ao entrar no domínio.

## 4. Propagação e boundaries

- **Sempre** capture exceptions no boundary mais externo razoável: route handler do Next.js, handler do Firebase Function, top-level do worker, error boundary do React.
- **Nunca** capture exception no meio do fluxo sem ação concreta (handle, transformar, ou re-lançar com contexto).
- **Sempre** transforme erros de infraestrutura em erros de domínio ao cruzar a fronteira de camada (ex: `pg` lança → `RepositoryError` no repositório → `OrderNotFoundError` no use case).
- **Nunca** vaze tipos de erro de uma dependência (Prisma, Firestore, axios) para fora do adapter que a encapsula.
- **Re-lance com contexto** quando precisar enriquecer: `throw new DomainError("…", { cause: e })`. Nunca `throw e` sem contexto adicional.

## 5. Catch silencioso é proibido

- **Nunca** escreva `catch {}` ou `catch (e) {}` vazio. Sem exceções.
- **Nunca** escreva `catch (e) { /* ignore */ }`. Se o erro é realmente ignorável, comente o motivo com `// intentionally swallowed: <razão>` e logue em nível `debug`.
- **Nunca** use `.catch(() => undefined)` ou `.catch(() => null)` para esconder falhas. Trate ou propague.
- **Nunca** silencie erro via `as` ou `satisfies` para satisfazer o TypeScript. Resolva a raiz.

## 6. Logging de erros

- **Logue cada erro exatamente uma vez**, no boundary mais externo que o trata.
- **Nunca** logue e re-lance o mesmo erro. Isso produz logs duplicados sem contexto adicional.
- **Sempre** logue com nível apropriado: `error` para falhas inesperadas, `warn` para esperadas mas notáveis, `info` para domínio normal.
- **Sempre** inclua `cause` na serialização do log. Ver `@rules/observability` para schema de log.
- **Nunca** logue conteúdo de payloads brutos. Logue identificadores e contexto estruturado.

## 7. Mensagens user-facing vs internas

- **Sempre** separe a `message` técnica do erro de uma `userMessage` (ou tradução i18n) destinada ao usuário final.
- **Nunca** exponha `error.message`, `error.stack` ou `cause` diretamente em respostas HTTP, UI ou logs públicos.
- **Sempre** mapeie erros de domínio para mensagens user-facing genéricas no boundary (route handler, Server Action, RSC).
- **Use** o envelope de erro definido em `@rules/api-design` para respostas HTTP.

## 8. Retry

- **Sempre** verifique idempotência antes de adicionar retry. Operações não-idempotentes só podem ter retry com chave de idempotência explícita.
- **Sempre** use backoff exponencial com jitter (`base * 2^attempt + random(0, base)`). Nunca retry imediato em loop.
- **Sempre** defina `maxAttempts` finito e `maxElapsedTime`. Nunca retry infinito.
- **Sempre** retry apenas para erros transitórios identificados (timeout, 429, 503, ECONNRESET). Nunca para 4xx semânticos (400, 401, 403, 404, 422).
- **Use** circuit breaker em chamadas a serviços externos com SLA frágil. Abra após N falhas consecutivas, half-open após cooldown.

## 9. Timeouts

- **Sempre** defina timeout explícito em toda operação de I/O: HTTP, DB, fila, leitura de stream, chamada a LLM.
- **Nunca** confie no timeout default da biblioteca. Defina no call site.
- **Sempre** propague timeout via `AbortSignal` quando a API suportar (`fetch`, `pg`, `@google/genai`, AI SDK).
- **Use** timeouts mais curtos quanto mais perto do usuário (route handler: 5–15s; worker: até o limite da plataforma).

## 10. Cancelamento

- **Sempre** aceite `AbortSignal` em toda função async que faz I/O ou trabalho longo.
- **Sempre** propague o signal recebido para chamadas internas. Nunca crie um signal local que ignora o de cima.
- **Sempre** trate `AbortError` (ou `signal.aborted`) como caminho esperado, não como falha. Não logue em `error`.
- **Nunca** continue trabalho após `signal.aborted === true`. Saia em pontos de checagem.

## 11. Streams e async iterators

- **Sempre** trate erros dentro de `for await` com try/catch envolvendo o loop inteiro, não apenas o corpo.
- **Sempre** chame `.return()` no iterator ao sair cedo para liberar recursos.
- **Sempre** trate erros emitidos por streams Node (`stream.on("error", …)`). Stream sem handler de erro derruba o processo.
- **Nunca** ignore erros em streaming de LLM (Vercel AI SDK, `@google/genai`). Falhas no meio do stream são esperadas — trate `onError` e finalize a resposta com sinal de erro.

## 12. React Error Boundaries

- **Sempre** envolva subárvores que renderizam dados externos (queries, suspense) em Error Boundary.
- **Sempre** forneça UI de fallback explícita por boundary. Nunca tela branca silenciosa.
- **Sempre** reporte o erro capturado pelo boundary ao sistema de observability uma única vez.
- **Nunca** use Error Boundary para fluxo de controle de UI normal (loading, vazio). Use estado explícito.
- Ver `@stacks/frontend/react@19` para API do Error Boundary.

## 13. Next.js error.tsx e route handlers

- **Sempre** crie `error.tsx` por segmento de rota que pode falhar em render server-side.
- **Sempre** crie `global-error.tsx` no root para capturar falhas do layout raiz.
- **Sempre** capture exceptions em route handlers e Server Actions, retornando o envelope de erro de `@rules/api-design`.
- **Nunca** deixe um Server Action propagar erro cru para o cliente — o framework expõe stack em dev e mensagem genérica em prod, perdendo controle do contrato.
- Ver `@stacks/frontend/next@16` para API.

## 14. Erros em adapters de infraestrutura

- **PostgreSQL**: capture `pg` errors, inspecione `code` (ex: `23505` unique violation, `23503` FK violation) e mapeie para erro de domínio antes de propagar. Nunca exponha SQL ou nomes de constraint ao usuário.
- **Firebase Functions / Firestore**: trate `FirebaseError.code` explicitamente. Erros de quota e indisponibilidade são transitórios; permission-denied não é.
- **AI SDKs**: trate `RateLimitError`, `APIConnectionError` como transitórios (com retry); `BadRequestError`, `AuthenticationError` como bugs ou config.
- **fetch**: `fetch` não rejeita em status 4xx/5xx. Sempre verifique `response.ok` e converta para erro tipado.

## 15. Panic only at startup

- **Use** `process.exit(1)` ou `throw` no top-level apenas durante boot/startup para falhas de configuração irrecuperáveis (env var faltando, schema de DB incompatível).
- **Nunca** chame `process.exit` em runtime de request. Falhas em runtime são erros, não panics.
- **Nunca** use `process.on("uncaughtException")` para continuar executando. Logue, drene, e termine o processo.

## 16. Anti-patterns proibidos

- `try { … } catch { return null; }` — perde diagnóstico, esconde bug. Use `Result` ou propague.
- `catch (e: any)` ou `catch (e)` sem narrowing — sempre `catch (e: unknown)` seguido de checagem (`instanceof`, discriminador).
- `throw "string"` ou `throw { code: 1 }` — sempre `throw new Error(...)` ou subclasse.
- `.catch(console.error)` em produção — logging fora do schema, sem contexto, sem propagação.
- `if (err) throw err` no meio de uma cadeia de await sem enriquecer contexto.
- Capturar e re-lançar sem `cause`: `} catch (e) { throw new MyError("failed"); }` — perde stack original.
- Catch-all no topo da função que mascara qualquer falha como "internal error" sem inspecionar.
- Usar exceptions como controle de fluxo (`throw NotFound` para sair de uma busca quando `Result.err` cabe).
- Capturar erro só para `console.log` e re-lançar.
- `Promise.all` sem considerar que uma rejeição cancela as outras — use `Promise.allSettled` quando falhas parciais são aceitáveis.

## 17. Testes de erro

- **Sempre** teste o caminho de erro com a mesma seriedade do caminho feliz.
- **Sempre** asserte o tipo discriminado (`expect(result.error.kind).toBe("…")`), nunca apenas `expect(() => …).toThrow()` genérico.
- **Sempre** teste timeouts, cancelamento via `AbortSignal` e retry quando o código os implementa.
- Ver `@rules/testing` para padrões de teste.

## Referências cruzadas

- `@rules/validation` — erros de input/schema.
- `@rules/api-design` — envelope HTTP de erro.
- `@rules/observability` — logging estruturado, métricas, traces de erro.
- `@rules/security` — não vazamento de PII e stack.
- `@stacks/frontend/react@19` — Error Boundary.
- `@stacks/frontend/next@16` — `error.tsx`, `global-error.tsx`, Server Actions.
