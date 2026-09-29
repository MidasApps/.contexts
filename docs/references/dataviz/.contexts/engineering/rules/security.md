---
title: Regras de Segurança
type: rules
scope: engineering
status: active
last_updated: 2026-05-20
related:
  - "@.contexts/engineering/rules/development.md"
---

# Regras de Segurança

Regras imperativas e enforce sobre segurança de código. Cobrem secrets, autenticação, autorização, validação de input, headers, dependências, criptografia, logging e prompt injection em features de IA. Para regras gerais de desenvolvimento, ver `@.contexts/engineering/rules/development.md`. Convenções de modelagem de secrets vivem em `@.contexts/engineering/contracts/secrets.md`. Regras detalhadas de validação de schema vivem em `@.contexts/engineering/rules/validation.md`. Regras de tratamento de erro vivem em `@.contexts/engineering/rules/error-handling.md`.

---

## 1. Secrets e credenciais

- **Nunca** comite secrets, tokens, chaves de API, credenciais de banco, service account JSONs, certificados privados ou strings de conexão. Sem exceção, mesmo em branch local.
- **Nunca** logue valores de secrets, headers `Authorization`, cookies de sessão, tokens JWT, chaves de API de provedores (OpenAI, Gemini, Google) ou payloads que contenham PII bruta.
- **Sempre** acesse secrets em runtime via Google Secret Manager (Firebase Functions) ou variáveis de ambiente injetadas pelo Vercel (Next.js), nunca via arquivo `.env` commitado.
- **Nunca** exponha secrets em variáveis prefixadas com `NEXT_PUBLIC_`. Tudo sob esse prefixo vaza para o bundle do cliente.
- **Sempre** rotacione chaves de API imediatamente após qualquer suspeita de vazamento (commit indevido, log compartilhado, screenshot público). Não confie em "vou apagar depois".
- **Nunca** reutilize secrets entre ambientes (dev, staging, prod). Cada ambiente tem o seu próprio.
- **Sempre** trate chaves de OpenAI, Gemini e qualquer SDK de IA como secrets server-side. Chamadas a esses provedores **nunca** partem do cliente.

## 2. Autenticação

- **Sempre** valide o ID token do Firebase Auth no servidor antes de processar qualquer request autenticada. Não confie em claims enviados pelo cliente.
- **Nunca** implemente lógica de autenticação custom em paralelo ao Firebase Auth no mesmo bounded context. Use uma única fonte de verdade por superfície.
- **Sempre** trate tokens expirados retornando `401`, não `500`. Cliente precisa diferenciar para acionar refresh.
- **Nunca** persista tokens de sessão em `localStorage`. Use cookies `HttpOnly` `Secure` `SameSite=Lax` (ou `Strict` quando aplicável) para sessões server-side.
- **Sempre** invalide sessões no logout server-side, não apenas limpe o storage do cliente.
- **Nunca** aceite autenticação via query string ou path param. Credenciais vão em header `Authorization: Bearer <token>` ou cookie seguro.

## 3. Autorização

- **Sempre** verifique autorização (não apenas autenticação) em **toda** rota, server action, Cloud Function e route handler que toca dado pertencente a usuário ou tenant.
- **Nunca** dependa exclusivamente de Firestore Security Rules como única camada de autorização para operações sensíveis. Trate Rules como defesa em profundidade, não como controle único.
- **Sempre** valide ownership do recurso comparando o `uid` do token autenticado com o `ownerId` (ou equivalente) do documento, antes de retornar ou mutar.
- **Nunca** confie em IDs vindos do cliente para identificar o ator. O ator é sempre o `uid` do token validado server-side.
- **Sempre** aplique o princípio do menor privilégio em service accounts. Function que só lê de uma coleção não recebe role de escrita.
- **Nunca** use a chave de admin (Firebase Admin SDK, service account) em código que executa no cliente ou em edge runtimes não isolados.

## 4. Validação de input

- **Sempre** valide todo input externo (request body, query params, headers customizados, webhooks, payloads de IA) com Zod no boundary, antes de entrar no domínio.
- **Nunca** passe input do cliente direto para query SQL, consulta Firestore, prompt de LLM, comando shell, `eval`, `Function()` ou interpolação de path de arquivo.
- **Sempre** use queries parametrizadas no PostgreSQL. Nunca concatene string para montar SQL.
- **Nunca** trust `Content-Type` ou tamanho declarado pelo cliente. Imponha limites de body no servidor.
- **Sempre** rejeite payloads que excedam o tamanho esperado para a rota. Para uploads, limite explicitamente em bytes.
- Para detalhes de schemas e mensagens de erro de validação, ver `@.contexts/engineering/rules/validation.md`.

## 5. Output e XSS

- **Nunca** use `dangerouslySetInnerHTML` no React com conteúdo derivado de input de usuário ou de output de LLM sem sanitização explícita.
- **Sempre** trate output de LLM como untrusted. Markdown gerado por IA passa por sanitizador antes de render como HTML.
- **Nunca** injete strings diretamente em URLs sem `encodeURIComponent` para query params e path segments dinâmicos.
- **Sempre** force `Content-Type` correto nas responses. JSON é `application/json`, não `text/html`.
- **Nunca** sirva conteúdo gerado por usuário sob o mesmo domínio de assets confiáveis sem CSP restritivo.

## 6. Headers HTTP

- **Sempre** force HTTPS em produção. Redirect 301 de HTTP para HTTPS na borda.
- **Sempre** defina `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` em respostas server-rendered.
- **Sempre** defina `X-Content-Type-Options: nosniff` e `Referrer-Policy: strict-origin-when-cross-origin` por padrão.
- **Sempre** configure Content Security Policy em `next.config.ts` ou middleware. `unsafe-inline` e `unsafe-eval` só com nonce e justificativa registrada.
- **Nunca** habilite CORS com `Access-Control-Allow-Origin: *` em rotas autenticadas. Liste origens explicitamente.
- **Nunca** ecoe `Origin` do request direto no `Access-Control-Allow-Origin` sem allowlist.

## 7. CSRF e same-site

- **Sempre** use Server Actions do Next 15 ou route handlers com verificação de origem para mutações. Server Actions já vêm com proteção CSRF embutida — não desabilite.
- **Nunca** aceite mutações via `GET`. `GET` é idempotente e safe por contrato.
- **Sempre** valide o header `Origin` (ou `Referer` como fallback) em endpoints que aceitam credenciais via cookie.

## 8. Rate limiting e abuso

- **Sempre** aplique rate limiting em rotas de autenticação, signup, recuperação de senha, envio de email/SMS e chamadas a LLM.
- **Nunca** use apenas IP como chave de rate limit em rotas autenticadas. Combine `uid` + IP.
- **Sempre** retorne `429 Too Many Requests` com header `Retry-After` quando o limite for atingido.
- **Sempre** estabeleça budget de tokens por usuário e por tenant em features de IA. Cap hard no servidor, não apenas no cliente.

## 9. Dependências

- **Nunca** instale dependência sem revisar o pacote (autor, downloads, last publish, número de manutenções). Pacote com baixa adoção ou owner recém-criado é suspeito.
- **Sempre** rode `npm audit` (ou equivalente) em CI e bloqueie merge em vulnerabilidades `high` ou `critical` sem mitigação registrada.
- **Nunca** use `npm install --force` ou `--legacy-peer-deps` para silenciar conflitos sem registrar a razão.
- **Sempre** mantenha `package-lock.json` versionado e idêntico entre dev e CI. Lockfile mismatch é regressão de segurança.
- **Nunca** dependa de tags mutáveis (`latest`, `next`). Pin de versão exata ou range controlado.

## 10. Firestore Security Rules

- **Sempre** escreva Security Rules que neguem por default. `allow read, write: if false;` no topo, abrindo apenas o necessário.
- **Nunca** publique rules de produção que contenham `if true` em qualquer nível, mesmo temporariamente.
- **Sempre** valide `request.auth.uid == resource.data.ownerId` (ou equivalente) em coleções que armazenam dado per-user.
- **Sempre** valide shape dos documentos em rules para campos críticos (role, tenant, billing). Cliente malicioso não escolhe o próprio papel.
- **Nunca** confunda Security Rules com lógica de negócio. Rules são guarda-corpo final; validação primária é server-side.

## 11. PostgreSQL e pgvector

- **Sempre** use queries parametrizadas (`$1`, `$2`) ou query builder com bind. Sem template string em SQL.
- **Nunca** conceda role `superuser` ou `CREATE DATABASE` a service accounts de aplicação. Use roles dedicadas com grants mínimos.
- **Sempre** habilite SSL/TLS na conexão em qualquer ambiente que não seja localhost.
- **Nunca** retorne erros de Postgres raw para o cliente. Mensagens de erro de banco vazam estrutura interna.

## 12. Criptografia

- **Nunca** implemente criptografia ou hashing custom. Use bibliotecas estabelecidas (`crypto` nativo do Node, `bcrypt` para senhas, libs do Firebase para tokens).
- **Sempre** use algoritmos atuais: `SHA-256` ou superior para hash, `AES-256-GCM` para criptografia simétrica, `argon2id` ou `bcrypt` para senhas. **Nunca** `MD5`, `SHA-1`, `DES`, `RC4`.
- **Nunca** gere IDs ou tokens com `Math.random()`. Use `crypto.randomUUID()` ou `crypto.randomBytes()`.
- **Sempre** armazene apenas hash de senhas, nunca a senha em si, nem reversivelmente cifrada.

## 13. Logging e PII

- **Nunca** logue: senhas, tokens, headers `Authorization`, valores de cookies, CPF/CNPJ, dados de cartão, conteúdo bruto de mensagens privadas, prompts contendo dado pessoal.
- **Sempre** redija ou tokenize PII antes de logar quando o log for necessário para debug.
- **Sempre** restrinja acesso a logs de produção. Logs são superfície de exfiltração tanto quanto o banco.
- **Nunca** envie payloads de produção para ferramentas externas de observabilidade sem garantir que PII está scrubada.

## 14. AI e prompt injection

- **Sempre** trate output de LLM como input não confiável. Output que vira ação (tool call, render, navegação) passa por validação Zod e allowlist.
- **Nunca** concatene input do usuário direto no system prompt. Use delimitadores explícitos e instrua o modelo a tratar o conteúdo do usuário como dado, não instrução.
- **Sempre** isole prompts de sistema de conteúdo dinâmico de usuário em mensagens separadas (`system` vs `user`) ao usar Vercel AI SDK, OpenAI ou Gemini.
- **Nunca** permita que o LLM execute tool calls com efeito colateral (escrever em banco, mandar email, gastar dinheiro) sem confirmação explícita do usuário ou allowlist server-side.
- **Sempre** restrinja escopo de tool calls: cada tool valida seus próprios args com Zod e verifica autorização do `uid` antes de agir.
- **Nunca** exponha system prompts contendo regras de negócio sensíveis ou segredos. Assuma que system prompts são extraíveis.
- **Sempre** trate URLs e links gerados por LLM como untrusted. Render como texto ou passe por allowlist de domínios antes de virar `<a href>`.
- **Sempre** aplique guardrails de conteúdo (moderação) em entrada e saída de features expostas a usuário final.
- **Nunca** envie dado de outro tenant ou usuário no contexto de um prompt sem isolamento explícito. Cross-tenant leakage via LLM é vetor real.

## 15. Webhooks e callbacks externos

- **Sempre** valide assinatura HMAC de webhooks (Stripe, GitHub, provedores OAuth) com a secret compartilhada antes de processar o body.
- **Nunca** confie no `Content-Length` ou IP de origem como única validação. Assinatura criptográfica é obrigatória.
- **Sempre** trate webhook como idempotente. Use o `event.id` do provedor como chave de deduplicação.

## 16. Uploads e arquivos

- **Sempre** valide MIME type e magic bytes server-side. Extensão e `Content-Type` declarado pelo cliente são mentirosos.
- **Nunca** sirva arquivos enviados por usuário sob o mesmo domínio principal sem isolamento de subdomínio ou storage dedicado.
- **Sempre** force tamanho máximo de upload no servidor (Cloud Storage rules ou middleware), nunca apenas no cliente.
- **Nunca** use path do filename enviado pelo cliente para construir caminho de storage. Gere nome server-side com `crypto.randomUUID()`.

## 17. Anti-patterns universais

- Comitar `.env` mesmo com mensagem "fix later".
- Desabilitar TLS verification (`rejectUnauthorized: false`) "só em dev".
- Copiar exemplo de Stack Overflow com `eval` ou `Function()` mantido.
- Comparar secrets com `===` (timing attack). Use `crypto.timingSafeEqual`.
- Retornar stack trace ou erro de banco em response de produção.
- Permitir que LLM gere e execute código sem sandbox.
- Confiar em validação client-side como única camada.
- Marcar campo de autorização como opcional no Zod "porque às vezes não vem".
