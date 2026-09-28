---
title: Convenções de Modelagem para Secrets
type: contracts
scope: secrets, credentials, API keys, signing keys, encryption keys
last_updated: 2026-05-20
status: active
---

# Convenções de Modelagem para Secrets

Este documento define **como o time modela, nomeia, armazena e opera secrets** no stack Node 24 + TypeScript 7 + Next.js 16 + Firebase Functions + GCP. Não é manual de ferramenta nem regra de implementação isolada — é a doutrina que governa toda fronteira onde um valor confidencial entra ou sai do sistema.

Para regras imperativas de implementação, ver `@rules/security`. Para política de rotação e governança, ver `@rules/governance`. Para logging e redaction, ver `@rules/observability`. Para validação de schema no boot, ver `@rules/validation` e `@stacks/validation/zod@4`. Para uso operacional em Cloud Functions, ver `@stacks/backend/firebase-functions`. Para boundary client/server no frontend, ver `@stacks/frontend/next@16`.

---

## 1. Definição de secret

**Secret** = qualquer valor cuja perda de confidencialidade impacta segurança, integridade ou conformidade do sistema.

Catálogo do que **é** secret neste projeto:

- API keys de provedores de IA (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `GEMINI_API_KEY`)
- Credenciais de banco (`DATABASE_URL` com password embutido, service account JSON do Firestore)
- Chaves de assinatura JWT (`JWT_SIGNING_KEY`), client secrets OAuth, session secrets
- Webhook secrets inbound (`STRIPE_WEBHOOK_SECRET`, `GITHUB_WEBHOOK_SECRET`)
- Chaves de assinatura interna entre serviços (`INTERNAL_API_SIGNING_KEY`)
- Encryption keys (column-level encryption, envelope encryption)
- Service account JSON do GCP
- Tokens de SaaS terceiros (`SENTRY_AUTH_TOKEN`, `RESEND_API_KEY`)
- Tokens de guardrails contra prompt injection

O que **NÃO** é secret (apesar de viver em env vars):

- Firebase web config (apiKey, authDomain — públicos por design)
- Stripe publishable key (`pk_live_*`)
- URLs de endpoints públicos
- Feature flags não-sensíveis
- Qualquer variável `NEXT_PUBLIC_*` (essas são públicas por contrato)

> Se o valor é exposto ao cliente, não é secret. Se vazar e exigir rotação imediata, é secret.

---

## 2. Storage canônico

A modelagem de storage de secret segue uma hierarquia única e prescritiva:

| Contexto | Storage canônico |
|---|---|
| Produção e staging | **Google Secret Manager** |
| Cloud Functions (prod/staging) | **`defineSecret('NAME')`** (wrapper sobre Secret Manager — ver `@stacks/backend/firebase-functions`) |
| Next.js deployado na Vercel | **Vercel Environment Variables** (encrypted at rest, scoped por environment) |
| Dev local | **`.env.local`** (gitignored, nunca commitado, nunca compartilhado em chat) |
| CI/CD (GitHub Actions) | **GitHub Encrypted Secrets** + **Workload Identity Federation** (OIDC) |
| Encryption keys | **Cloud KMS** (auto-rotation habilitada) |

Storage **nunca-permitido**, sob nenhuma hipótese:

- Arquivos commitados em git (`.env`, `config.json`, `secrets.yaml`)
- Constantes em código (`const OPENAI_KEY = "sk-..."`)
- Comentários em código ou PR
- Logs (mesmo DEBUG, mesmo local)
- Screenshots, prints, gravações de tela
- Mensagens em Slack, Discord, email, WhatsApp
- Issues, PRs, tickets do Linear/Jira
- Documentação interna ou Notion

---

## 3. Naming

### 3.1 Forma

- **SCREAMING_SNAKE_CASE**, sem exceção: `OPENAI_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `DATABASE_URL`, `JWT_SIGNING_KEY`.
- Sem hífen, sem ponto, sem case misturado.
- Sem prefixo de empresa redundante (`ACME_OPENAI_API_KEY`); o projeto/ambiente já dá escopo.

### 3.2 Estrutura semântica

Padrão: `<PROVIDER>_<PURPOSE>_<TYPE>`

| Componente | Exemplos |
|---|---|
| `<PROVIDER>` | `OPENAI`, `STRIPE`, `FIREBASE`, `POSTGRES` |
| `<PURPOSE>` | `WEBHOOK`, `SIGNING`, `API`, `OAUTH`, `SESSION` |
| `<TYPE>` | `KEY`, `SECRET`, `TOKEN`, `URL`, `PASSWORD` |

Aplicação:

```
OPENAI_API_KEY              certo — provider + type
STRIPE_API_KEY              certo — outbound API
STRIPE_WEBHOOK_SECRET       certo — inbound webhook (semântica diferente)
JWT_SIGNING_KEY             certo — purpose + type
DATABASE_URL                certo — convenção universal para connection string
oai_key                     errado — case errado, abreviação obscura
STRIPE_KEY                  errado — ambíguo (API key ou webhook secret?)
SECRET_OPENAI               errado — ordem invertida
```

### 3.3 Separação de ambientes

**Modelo canônico**: projetos GCP separados (`prod-app`, `staging-app`, `dev-shared`) com o **mesmo nome de secret** em cada projeto.

```
prod-app/secrets/OPENAI_API_KEY
staging-app/secrets/OPENAI_API_KEY
dev-shared/secrets/OPENAI_API_KEY
```

**Modelo aceitável (legado)**: sufixo de ambiente.

```
OPENAI_API_KEY_PROD
OPENAI_API_KEY_STAGING
```

**Anti-pattern**: mesma chave compartilhada entre ambientes.

```
OPENAI_API_KEY  (usado em prod, staging E dev)     errado
```

### 3.4 Versionamento

Nunca incluir versão no nome — **Secret Manager versiona automaticamente**.

```
OPENAI_API_KEY            certo (versões 1, 2, 3... gerenciadas pelo Secret Manager)
OPENAI_API_KEY_V2         errado
OPENAI_API_KEY_2026       errado
OPENAI_API_KEY_NEW        errado
```

---

## 4. Catálogo de secrets do projeto

Toda família de secret usada no projeto deve aderir a uma das categorias abaixo.

### 4.1 AI provider keys

```
OPENAI_API_KEY
ANTHROPIC_API_KEY
GOOGLE_API_KEY        # AI Studio / Generative Language API
GEMINI_API_KEY        # alias semântico; preferir GOOGLE_API_KEY salvo em contexto específico
```

### 4.2 Database credentials

```
DATABASE_URL                  # Postgres connection string com password
FIRESTORE_SERVICE_ACCOUNT     # JSON via mount; preferir Workload Identity quando possível
```

### 4.3 OAuth / Auth

```
JWT_SIGNING_KEY
OAUTH_CLIENT_SECRET
SESSION_SECRET
```

### 4.4 Webhooks inbound

```
STRIPE_WEBHOOK_SECRET
GITHUB_WEBHOOK_SECRET
<PROVIDER>_WEBHOOK_SECRET
```

### 4.5 Internal signing

```
INTERNAL_API_SIGNING_KEY
```

### 4.6 Third-party SaaS

```
SENTRY_AUTH_TOKEN
RESEND_API_KEY
```

Todo secret novo deve encaixar em uma dessas categorias. Se não encaixa, abrir discussão antes de criar — é provável que seja design errado de fronteira.

---

## 5. Acesso em código

### 5.1 Firebase Functions

Sempre via `defineSecret` + binding declarativo (ver `@stacks/backend/firebase-functions`):

```ts
import { defineSecret } from 'firebase-functions/params';

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');

export const generateText = onCall(
  { secrets: [OPENAI_API_KEY] },
  async (req) => {
    const client = new OpenAI({ apiKey: OPENAI_API_KEY.value() });
    // ...
  },
);
```

Nunca `process.env.OPENAI_API_KEY` direto em Cloud Functions — o binding declarativo é o que permite o IAM least-privilege automático.

### 5.2 Next.js — server-side

Em Server Components, Route Handlers e Server Actions:

```ts
const apiKey = process.env.OPENAI_API_KEY;
```

Tipado e validado via `src/env.ts` (ver §5.4).

### 5.3 Next.js — client-side

**Proibido**. Nenhum secret pode ser acessado em código que roda no browser.

- Variáveis `NEXT_PUBLIC_*` são **públicas por contrato** — qualquer valor com esse prefixo é assumido como público e jamais deve conter secret.
- `NEXT_PUBLIC_OPENAI_API_KEY` é vazamento garantido; o build do Next.js inlina o valor no bundle JS.

Ver `@stacks/frontend/next@16` para o boundary server/client completo.

### 5.4 Validação no boot

Todo secret consumido pelo app é declarado e validado no `src/env.ts` via Zod (ver `@rules/validation`, `@stacks/validation/zod@4`):

```ts
import { z } from 'zod';

const schema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  DATABASE_URL: z.string().url(),
  JWT_SIGNING_KEY: z.string().min(32),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_'),
});

export const env = schema.parse(process.env);
```

Fail-fast no startup. Secret ausente derruba o boot — nunca é silent fail em runtime.

---

## 6. Separação de ambientes

- **Projetos GCP separados** por ambiente (`prod-*`, `staging-*`, `dev-shared`).
- Secrets de produção **jamais** são copiados para staging ou dev.
- Service accounts dedicados por ambiente, cada um com least-privilege via IAM.
- Cross-environment access é proibido — staging não tem credenciais para ler bucket de prod.

```
prod-app       service account A       acessa: prod-app/secrets/*       certo
staging-app    service account B       acessa: staging-app/secrets/*    certo
staging-app    service account B       acessa: prod-app/secrets/*       errado
```

---

## 7. Lifecycle

### 7.1 Criação

- Via Console GCP, `gcloud secrets create`, ou IaC (Pulumi/Terraform — preferred para reproducibilidade).
- Auditoria via Cloud Audit Logs (Admin Activity logs sempre ativos por default).
- Owner do secret nomeado: pessoa ou time responsável por rotação e revogação.

### 7.2 Rotação

- **Política mínima**: 90 dias (ver `@rules/governance`).
- **Imediata** em suspeita de vazamento, saída de membro com acesso, ou exposição em log/repo.
- **Mecanismo padrão**:
  1. Criar nova versão no Secret Manager (`gcloud secrets versions add`).
  2. Atualizar consumers (reload via redeploy ou hot-reload onde suportado).
  3. Manter versão antiga ativa por janela curta (24-72h) para drain.
  4. Desativar versão antiga (`disabled`).
  5. Destruir versão antiga após retention.

### 7.3 Revogação

Deletar do Secret Manager **não revoga** a credencial no provider.

```
1. gcloud secrets versions disable <version>     remove do nosso lado
2. Revogar no provider (OpenAI dashboard, Stripe, etc.)     mata a credencial
```

Ambas as etapas são obrigatórias em qualquer revogação.

### 7.4 Deletion

- Hard delete só após retention de audit logs (mínimo 90 dias).
- Nunca durante incidente sem rotação prévia — apaga evidência.

---

## 8. Acesso humano

- **Least-privilege via IAM**: `roles/secretmanager.secretAccessor` por secret específico, nunca em projeto inteiro.
- **Break-glass com audit**: acesso emergencial via grupo elevado com IAM Conditions + alerta automático.
- **Nunca via chat, email, screenshare, AirDrop**. Compartilhamento secreto entre humanos: 1Password / Doppler / Infisical com TTL.
- Onboarding de novo dev: grant em `dev-shared` apenas, nunca em `prod-*`.
- Offboarding: revogar acesso IAM em até 24h.

---

## 9. Auditoria

- **Cloud Audit Logs** com Data Access logs habilitados para Secret Manager (não vem ativo por default).
- **Alertas** configurados em Cloud Monitoring para:
  - Acesso fora de janela esperada (3am-6am UTC sem oncall, por exemplo)
  - Acesso de IP novo/inesperado
  - Acesso em massa (>10 secrets em <1 minuto)
- **Dashboard** "quem acessou o quê" disponível para o time de segurança.

---

## 10. CI/CD secrets

- **GitHub Actions**: encrypted secrets em repo settings, nunca em workflow YAML.
- **Workload Identity Federation (OIDC)** para acesso ao GCP em vez de service account keys long-lived — **preferred path**.
- **Vercel**: env vars scoped por environment (Production / Preview / Development) com encryption at rest.
- Em logs de CI: usar `::add-mask::` em GitHub Actions para qualquer valor sensível que possa aparecer.

---

## 11. Webhook secrets

Modelagem de secret de webhook inbound:

- Geração: random 32 bytes hex (`openssl rand -hex 32`).
- Assinatura: **HMAC-SHA256** sobre `timestamp + body`.
- Validação no consumer:
  1. Timestamp dentro de janela de 5 minutos.
  2. Signature recomputada bate com header.
  3. Constant-time comparison (`crypto.timingSafeEqual`).
- Rotação independente do API key do mesmo provider.

```
header: X-Webhook-Signature: sha256=<hex>
header: X-Webhook-Timestamp: <unix>
```

---

## 12. Encryption keys

- **Cloud KMS-managed** com auto-rotation (90 dias).
- Nunca chave plana em código ou Secret Manager (KMS é o boundary correto).
- **Envelope encryption** para dados em DB: KMS encrypta DEK, DEK encrypta dado.
- **Column-level encryption** para PII sensível em Postgres via KMS.

---

## 13. Local dev

- **`.env.local`** gitignored, criado manualmente por cada dev.
- **`.env.example`** commitado no repo, com chaves vazias e comentários:

```bash
# AI provider keys — pegar em dev-shared/secrets ou solicitar via #eng
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# Postgres local — usar string do docker-compose por default
DATABASE_URL=postgresql://app:app@localhost:5432/app

# JWT signing — gerar local com `openssl rand -base64 64`
JWT_SIGNING_KEY=
```

- Onboarding: dev recebe acesso a `dev-shared` Secret Manager **ou** vault compartilhado (1Password).
- **Nunca** secrets de prod em `.env.local`.

---

## 14. Secret leak detection

Defense-in-depth obrigatório:

1. **Pre-commit hook**: `gitleaks` ou `trufflehog` bloqueia commit com padrão de secret.
2. **GitHub Secret Scanning** habilitado no repo (free para repos públicos, Advanced Security para privados).
3. **CI scan** completo do diff de PR.
4. **Log redaction em produção** (ver `@rules/observability`):
   - Pino logger config: `redact: ['*.password', '*.token', '*.apiKey', '*.authorization', 'req.headers.authorization']`
   - Stack traces sanitizadas antes de enviar a Sentry/Datadog
   - Headers logados com `Authorization` mascarado

---

## 15. Logs e observabilidade

Ver `@rules/observability` e `@rules/security` para regras imperativas. Doutrina de modelagem:

- Nenhum secret entra em log, mesmo em DEBUG, mesmo local, mesmo "temporariamente".
- Logger é configurado com redact list **antes** de qualquer log ser emitido.
- Stack traces que cruzam boundary para Sentry/Datadog passam por sanitizer.
- Em error reporting, env dump é **proibido** — capturar contexto seletivamente, nunca `process.env` inteiro.

---

## 16. Code review

Ver `@contracts/api`, `@contracts/schemas` e regras de revisão de código. Reviewer obrigatoriamente checa:

- Nenhum valor literal de aparência de secret no diff (`sk-`, `whsec_`, `-----BEGIN`).
- Nenhum `console.log(process.env)` ou `console.log(req.headers)`.
- Toda nova env var: declarada no schema Zod do `src/env.ts`.
- Toda nova env var: documentada em `.env.example`.
- Toda nova env var: provisionada em Secret Manager nos ambientes alvo.

Merge é **bloqueado** se reviewer identifica introdução de secret hardcoded.

---

## 17. Frontend (Next.js)

- **`NEXT_PUBLIC_*`** = público por contrato. Use para Firebase web config, Stripe publishable key, URLs públicas.
- **`process.env.X`** (sem `NEXT_PUBLIC_`) = server-only. Disponível em Server Components, Route Handlers, Server Actions.
- Boundary é estático, validado em build time. Ver `@stacks/frontend/next@16`.

```ts
// app/api/chat/route.ts (server)
const apiKey = process.env.OPENAI_API_KEY;           // certo

// app/components/chat.tsx (client component "use client")
const apiKey = process.env.OPENAI_API_KEY;           // undefined em runtime
const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY; // vaza no bundle — proibido
```

---

## 18. Service account JSON

- **Nunca commitar**, nem em repo privado.
- **Workload Identity** (preferred) elimina a necessidade de JSON em disco.
- Quando JSON é inevitável (CI legado, integração externa): armazenar em Secret Manager, mount como arquivo via volume, rotação a cada 90 dias.
- Service account com least-privilege por função — nunca `roles/owner`.

---

## 19. JWT signing keys

- **RSA (RS256) ou ECDSA (ES256)** preferred sobre HMAC (HS256) quando há mais de um serviço validando.
- HMAC só para signing interno single-service.
- **JWKS endpoint** público para distribuição de public keys.
- **`kid` no header** para suportar rotação sem downtime.
- Rotação: nova key publicada no JWKS → tokens novos assinam com nova → tokens antigos validam até expirar → key antiga removida do JWKS.

---

## 20. Anti-patterns

Lista exaustiva do que **rejeitar em review** ou tratar como incidente:

| Anti-pattern | Severidade |
|---|---|
| Hardcoded em código (`const KEY = "sk-..."`) | crítica — bloquear merge |
| Commitado em git (mesmo deletado depois) | crítica — rotação imediata, vaza no histórico |
| `.env` commitado | crítica |
| `console.log(process.env)` em PR | alta — bloquear merge |
| Compartilhar via Slack/email plain text | alta — rotacionar |
| Mesma chave em dev/staging/prod | alta |
| Service account JSON long-lived em vez de Workload Identity | média |
| Sem política de rotação | média |
| `NEXT_PUBLIC_OPENAI_API_KEY` ou similar | crítica — vazamento garantido para client |
| Logar payload bruto com `Authorization` header | alta |
| Stack trace com env dump | alta |
| Rotacionar sem revogar no provider | alta — credencial antiga continua válida |
| Secret aparecendo em CI log | alta — usar `::add-mask::` |
| Data Access logs do Secret Manager desabilitados | média |
| `roles/owner` em service account de app | crítica |
| Secret sem schema Zod no boot | média — silent fail em prod |
| Encryption key plana em código ou Secret Manager (sem KMS) | alta |
| `.env.example` desatualizado em relação ao schema | baixa, mas atrita onboarding |

---

## 21. Incident response em vazamento

Quando um secret vaza (commit, log, screenshot, leak externo):

1. **Rotacionar imediatamente** no Secret Manager (nova versão).
2. **Revogar no provider** (OpenAI dashboard, Stripe, GitHub, etc.) — desativar a credencial antiga na fonte.
3. **Audit logs**: revisar Cloud Audit Logs dos últimos 90 dias para o secret comprometido — quem acessou, de onde, quando?
4. **Avaliar blast radius**: o que esse secret destrava? Acesso a quais dados? Que ações foram possíveis?
5. **Notificar stakeholders**: security lead, owner do recurso, eventualmente legal/compliance.
6. **Postmortem** seguindo `@rules/governance`: timeline, root cause, ação corretiva, prevenção.
7. **Atualizar processo**: se o vazamento expôs gap de doutrina, atualizar este documento.

---

## Referências cruzadas

- `@rules/security` — regras imperativas de segurança
- `@rules/governance` — política de rotação e postmortem
- `@rules/observability` — redact list, logging seguro
- `@rules/validation` — schema Zod no boot
- `@stacks/backend/firebase-functions` — `defineSecret` operacional
- `@stacks/frontend/next@16` — boundary server/client, `NEXT_PUBLIC_*`
- `@stacks/validation/zod@4` — sintaxe e padrões Zod
- `@contracts/api` — convenções de modelagem de API (headers, auth)
- `@contracts/schemas` — convenções de modelagem de schemas Zod
