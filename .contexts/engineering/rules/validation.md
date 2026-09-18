---
title: Regras de Validação
type: rules
scope: engineering
status: active
last_updated: 2026-07-13
related:
  - "@.contexts/engineering/rules/development.md"
  - "@.contexts/engineering/rules/security.md"
  - "@.contexts/engineering/rules/performance.md"
  - "@.contexts/engineering/stacks/validation/zod@4.md"
  - "@.contexts/engineering/contracts/schemas.md"
---

# Regras de Validação

Regras imperativas e enforce sobre validação de dados em qualquer fronteira do sistema. Cobrem boundaries de entrada (HTTP, Server Actions, formulários, env vars, output de LLM, mensagens de fila, webhooks), separação entre parse e validate, tipos branded, coerção segura, mensagens de erro e schemas como fonte da verdade. Para regras gerais de tipagem, ver `@.contexts/engineering/rules/development.md`. Para regras de segurança em validação de input adversarial, ver `@.contexts/engineering/rules/security.md`. Para manual de Zod específico da versão, ver `@.contexts/engineering/stacks/validation/zod@4.md`. Para convenções de modelagem de schemas, ver `@.contexts/engineering/contracts/schemas.md`.

## Escopo

Aplica-se a todo ponto de entrada onde dado externo cruza a fronteira do código de domínio: route handlers, Server Actions do Next.js, Firebase Functions (HTTP, callable, triggers), webhooks, leitura de env vars, parsing de cookies e headers, output estruturado de LLMs, mensagens consumidas de Pub/Sub ou filas, payloads de formulário e respostas de APIs externas. Não cobre a modelagem dos schemas em si (ver Contracts) nem o manual da biblioteca de validação (ver Stacks).

---

## 1. Princípio fundamental: never trust external

- **Sempre** valide todo dado que cruza a fronteira do código antes de entrar no domínio. Sem exceção.
- **Nunca** assuma que dado retornado por API externa, SDK terceiro ou serviço interno é confiável, mesmo que "controlado por nós".
- **Sempre** trate output de LLM como input externo. Structured output não dispensa validação — o modelo pode quebrar o schema.
- **Nunca** confie em tipos do TypeScript em runtime. Tipo é contrato de compilação, validação é contrato de execução.
- **Sempre** valide na borda mais externa possível. Quanto mais cedo o dado é validado, mais o domínio assume invariantes.
- **Nunca** revalide dado já validado no mesmo boundary. Validar duas vezes esconde a fonte da verdade.

## 2. Parse, não validate

- **Sempre** use `.parse()` ou `.safeParse()` para transformar dado desconhecido em dado tipado. Validação que apenas checa booleano e segue com o tipo original é anti-pattern.
- **Nunca** use `is` type guards manuais para input externo. Eles dependem do desenvolvedor lembrar de todos os campos. Use Zod.
- **Sempre** deixe o schema gerar o tipo via `z.infer<typeof schema>`. Tipo é derivado, schema é fonte.
- **Nunca** declare o tipo TypeScript primeiro e depois "espelhe" no schema. Os dois divergem em silêncio.
- **Sempre** retorne o dado parsed (transformado, com defaults aplicados, com coerções resolvidas) e use ele daqui em diante. Não use mais o input bruto.

## 3. Schema como fonte da verdade

- **Sempre** defina o schema uma única vez e derive tudo dele: tipo do payload, tipo do domínio, validação runtime, contrato de API documentado.
- **Nunca** duplique schema entre cliente e servidor sem compartilhar o módulo. Schemas duplicados manualmente divergem.
- **Sempre** centralize schemas reutilizados em módulos compartilhados (`schemas/`, `contracts/`). Schemas inline são para uso único.
- **Nunca** mantenha schema e tipo manual lado a lado para a mesma entidade. Apague o tipo manual.

## 4. Boundaries obrigatórios

Estas fronteiras **exigem** validação Zod sem exceção:

- **Sempre** valide `request.body`, `request.query`, `request.params` e headers customizados em route handlers do Next.js.
- **Sempre** valide os argumentos de Server Actions com Zod, mesmo quando o form vem do mesmo app. Form data é input externo.
- **Sempre** valide payloads de Firebase Functions HTTP e callable functions. Triggers do Firestore validam o snapshot esperado antes de processar.
- **Sempre** valide mensagens de Pub/Sub, Cloud Tasks ou qualquer fila antes de processar. Mensagem entregue não é mensagem válida.
- **Sempre** valide payload de webhooks (Stripe, OAuth callbacks, provedores) após verificar assinatura HMAC. Assinatura prova origem, schema prova shape.
- **Sempre** valide structured output de LLMs (`generateObject`, `responseFormat: json_schema`, function calling) com o mesmo schema usado no SDK.
- **Sempre** valide variáveis de ambiente no boot do processo. Falha de env é falha de inicialização, não erro silencioso em runtime.
- **Sempre** valide resposta de APIs externas (Stripe, Slack, OpenAI, Gemini) com schema mínimo dos campos que você consome.
- **Sempre** valide documentos lidos do Firestore quando o shape importa para a lógica downstream. Banco evolui; código antigo encontra documento novo.

## 5. Validação de env vars

- **Sempre** valide `process.env` no boot via Zod e exporte um objeto `env` tipado. Resto do código consome `env`, não `process.env`.
- **Nunca** acesse `process.env.X` direto em código de domínio. Acesse o `env` validado.
- **Sempre** falhe rápido: se uma env var obrigatória está ausente ou inválida, o processo aborta imediatamente com mensagem clara.
- **Nunca** use `process.env.X || 'default'` para valores que precisam estar definidos. Default silencioso esconde misconfiguration de produção.
- **Sempre** declare obrigatoriedade no schema. `z.string().min(1)` é diferente de `z.string().optional()`.
- **Nunca** misture env vars `NEXT_PUBLIC_` (client) com env vars server-only no mesmo schema. Separe em `clientEnv` e `serverEnv`.

## 6. Coerção e transformação

- **Sempre** use `z.coerce` ou `.transform()` explícito quando converter de string (query param, form data) para número, boolean ou date.
- **Nunca** confie em coerção implícita do JavaScript (`+x`, `!!x`, `new Date(x)`) para input externo. Coerção implícita aceita lixo.
- **Sempre** valide o resultado da coerção. `z.coerce.number()` aceita `"abc"` como `NaN` em algumas versões — combine com `.refine(n => Number.isFinite(n))`.
- **Nunca** use `parseInt` ou `parseFloat` sem checar `isNaN` no resultado. Prefira `Number()` ou Zod coerção.
- **Sempre** normalize antes de validar quando aplicável (trim de strings, lowercase de emails, remoção de máscaras de CPF). Use `.transform()` no schema, não no consumidor.
- **Nunca** transforme em um lugar e valide em outro. Encadeie no schema: `z.string().trim().toLowerCase().email()`.

## 7. Tipos branded e invariantes de domínio

- **Sempre** use branded types (`z.string().brand<'UserId'>()`) para identificadores e valores com invariantes (emails normalizados, CPF validado, slugs). Previne mistura acidental de `userId` com `tenantId`.
- **Nunca** use `string` cru para representar um identificador de domínio em assinaturas de função pública. Use o brand.
- **Sempre** crie o brand uma única vez, no boundary onde a invariante é validada. Domínio recebe o tipo branded e confia.
- **Nunca** force cast (`as UserId`) para criar valor branded. O brand só existe legitimamente após parse.

## 8. Mensagens de erro

- **Sempre** retorne `400 Bad Request` (HTTP) ou `INVALID_ARGUMENT` (gRPC/callable) quando validação falha. Não `500`. Erro de validação é culpa do cliente.
- **Sempre** retorne o conjunto de erros de validação, não apenas o primeiro. Cliente conserta tudo em uma rodada.
- **Nunca** retorne stack trace, schema interno ou nomes de campos internos no erro público. Exponha apenas o necessário para o cliente corrigir o input.
- **Sempre** mapeie `ZodError.issues` para um formato estável de erro da API (campo, código, mensagem). Não vaze o shape interno do Zod.
- **Nunca** use a mensagem padrão do Zod (em inglês, técnica) como mensagem de UI direta. Traduza no boundary do cliente ou customize a mensagem no schema.
- **Sempre** inclua o `path` do campo que falhou em erros de formulário, para que o cliente destaque o campo certo.

## 9. `safeParse` vs `parse`

- **Sempre** use `safeParse` em boundaries onde falha de validação é fluxo esperado (HTTP handler, processamento de fila, parsing de output de LLM). Falha vira resposta, não exceção.
- **Sempre** use `parse` apenas quando falha de validação é bug irrecuperável (env vars no boot, asserts internos). Aí queremos crash.
- **Nunca** envolva `parse` em `try/catch` genérico para "ignorar erro de validação". Se a falha não deve ser fatal, use `safeParse`.
- **Sempre** propague o `ZodError` para o handler de erro central; não engula silenciosamente.

## 10. Output de LLM

- **Sempre** valide structured output de LLM com Zod mesmo quando o SDK aceita o schema. Modelos quebram contrato em casos limítrofes.
- **Nunca** assuma que `generateObject` do Vercel AI SDK ou `response_format: json_schema` da OpenAI garantem o schema 100%. Trate como hint, valide depois.
- **Sempre** trate falha de validação de output de LLM como erro de domínio: retry com prompt ajustado, fallback, ou erro explícito ao usuário. Nunca silencie.
- **Nunca** persista output de LLM no banco antes de validar. Lixo entra, lixo permanece.
- **Sempre** versione schemas de output de LLM quando mudarem. Histórico de chamadas anteriores pode ter shape antigo.

## 11. Formulários e Server Actions

- **Sempre** valide o `FormData` recebido por Server Action com Zod antes de qualquer side effect. `formData.get('campo')` retorna `FormDataEntryValue | null` — não é o tipo final.
- **Nunca** confie em validação client-side (`required`, `pattern`, validação React Hook Form) como única camada. Cliente é descartável.
- **Sempre** retorne erros de validação no formato esperado pelo hook do cliente (`useFormState`, `useActionState`), com `path` por campo.
- **Nunca** lance exception em Server Action para sinalizar validação falha. Retorne objeto com erros estruturados.
- **Sempre** revalide no servidor mesmo que o formulário já tenha validação Zod no cliente. Cliente e servidor compartilham o **mesmo** schema, não validações duplicadas em formatos diferentes.

## 12. Documentos do Firestore

- **Sempre** valide documentos lidos do Firestore quando vão alimentar lógica crítica (billing, autorização, ações com efeito colateral). Schema do banco evolui mais devagar que o código, mas evolui.
- **Nunca** trate `DocumentSnapshot.data()` como já tipado. O tipo é `DocumentData`, não o seu tipo de domínio.
- **Sempre** use schemas tolerantes a campos extras em leituras (`z.object({...}).passthrough()` quando aplicável) e estritos em escritas (`.strict()`).
- **Nunca** escreva no Firestore um objeto que não passou por schema de escrita. Validação garante invariantes antes do banco.

## 13. Strict mode e campos desconhecidos

- **Sempre** decida explicitamente entre `.strict()`, `.strip()` (default) e `.passthrough()`. Não há default seguro universal.
- **Sempre** use `.strict()` em endpoints que recebem input de cliente externo. Campo extra é sinal de cliente desatualizado ou tentativa de exploit.
- **Sempre** use `.strip()` (default) para input interno entre serviços que evoluem juntos. Campos novos não quebram consumidores antigos.
- **Nunca** use `.passthrough()` sem justificativa registrada em comentário. Passar dado não validado adiante é vetor de bugs e CVEs.

## 14. Validação assíncrona

- **Sempre** use `.parseAsync()` ou `.safeParseAsync()` quando o schema contém `refine` ou `transform` assíncrono. `parse` síncrono em schema async retorna Promise não resolvida.
- **Nunca** faça lookup em banco dentro de `.refine()` no boundary HTTP. Validação de schema valida shape; verificação de existência (`email já cadastrado?`) é regra de negócio, vive no use case.
- **Sempre** separe validação de schema (sincrônica, barata, deterministic) de regra de negócio (assíncrona, dependente de estado). Schema falha antes de tocar banco.

## 15. Validação em camadas

- **Sempre** valide no boundary externo (HTTP, fila, webhook) com schema completo da requisição.
- **Sempre** valide novamente na fronteira do bounded context interno quando o dado cruza módulos com contratos próprios. Cada bounded context valida o que precisa.
- **Nunca** revalide o mesmo schema dentro do mesmo módulo. Uma vez validado no boundary, o tipo carrega a garantia.
- **Sempre** torne a passagem de dado entre camadas tipada via `z.infer`, não via cast.

## 16. Defaults e campos opcionais

- **Sempre** use `.default(...)` no schema para fornecer valor inicial. Default no consumidor (`x ?? 'foo'`) duplica conhecimento.
- **Nunca** use `.optional()` apenas para "fazer o schema passar". Opcional significa que a ausência é semanticamente válida; se for obrigatório, marque como obrigatório.
- **Sempre** distinga `null`, `undefined` e ausente. `.nullable()`, `.optional()` e `.nullish()` têm significados diferentes — escolha o correto.
- **Nunca** trate `null` e `undefined` como intercambiáveis no schema. JSON envia `null`, JavaScript envia `undefined`. Decida qual o boundary aceita.

## 17. Schemas como contratos públicos

- **Sempre** trate schemas exportados como API pública. Quebrar o schema quebra consumidores.
- **Sempre** versione schemas quando publicados em superfícies externas (webhooks que enviamos, eventos para outros tenants). Para detalhes de versionamento, ver `@.contexts/engineering/contracts/schemas.md`.
- **Nunca** torne um campo obrigatório que era opcional sem migração. É breaking change.
- **Nunca** renomeie campo sem fase de coexistência. Aceite ambos por uma janela, depois deprecate.

## 18. Performance

- **Sempre** prefira `z.discriminatedUnion` sobre `z.union` quando há campo discriminador. Performance e mensagens de erro melhores.
- **Nunca** chame `safeParse` em hot path sem necessidade. Validação custa CPU; valide uma vez no boundary, não em cada acesso.
- **Sempre** cache schemas compostos em escopo de módulo (`const schema = z.object(...)` no top-level), não recrie dentro de handlers a cada request.

## 19. Anti-patterns universais

- Declarar `type User = { ... }` manualmente e schema Zod separado para a mesma entidade.
- Usar `as` para "validar" output de LLM ou resposta de API.
- `JSON.parse(body)` sem schema na sequência.
- `process.env.X!` (non-null assertion) sem validação prévia de env.
- `try { schema.parse(x) } catch { return defaultValue }` — silencia bug em vez de tratar erro.
- Validar com Yup, Joi e Zod no mesmo projeto. Padronize em Zod.
- Schema com 30 campos `.optional()` "porque sometimes vem incompleto". Decida cada campo com intenção.
- Reaproveitar schema de input como schema de output. Input e output têm shapes diferentes — derive um do outro com `.pick()`, `.omit()`, `.partial()`.
- Usar `z.any()` ou `z.unknown()` como escape hatch. Se o tipo é desconhecido, faça parse incremental; não desista da validação.
- Confiar em validação client-side de formulário como única camada.
- Validar input de webhook antes de verificar assinatura HMAC. Ordem correta: assinatura primeiro, schema depois.
- Logar payload inteiro no erro de validação (vaza PII, ver `@.contexts/engineering/rules/security.md`).
