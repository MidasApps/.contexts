---
name: secrets
description: Use ao manipular secrets — secret manager, KMS, rotação, .env. Keywords: secrets, env, kms.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Secrets Management

Secrets (API keys, DB passwords, signing keys, tokens) vivem em **secret manager**, nunca em código. Acesso por IAM, rotação periódica, audit log de leitura.

## Essência
- **Storage:** GCP Secret Manager, AWS Secrets Manager, Vault, Doppler, 1Password Secrets. Nunca `.env` em prod (ok em dev local).
- **Acesso por IAM:** service account/role com escopo mínimo (least privilege) apenas no secret necessário.
- **Versioning:** secret manager guarda versões; aplicação pin numa versão ou usa `latest` por ambiente.
- **Rotação:** secrets com TTL/janela de validade. Rotacionar quando: vazamento suspeito, saída de pessoa com acesso, ciclo regular (90 dias típico).
- **`.env`:** só dev local. `.env.example` versionado com placeholders. `.gitignore` cobre `.env*` (exceto `.example`).
- **Injection runtime:** secret carregado no boot (server) ou via sidecar; nunca commitado.
- **Build-time vs runtime:** secret de build (token de package registry) injetado via CI secret store; runtime via secret manager + IAM.
- **Audit:** Cloud Logging registra cada leitura — investigável.
- **Encryption-at-rest** transparente em secret managers; para dado sensível adicional, usar KMS para envelope encryption.
- **Sem secret em log/exception/response/prompt LLM.** Filtro de log redacted obrigatório.
- **Sem secret no histórico git:** se vazou, **rotacionar primeiro**, depois limpar histórico (BFG/filter-branch). Recall do registry público se aplicável.

## Procedimento mínimo
1. Identificar secret novo → criar em secret manager por ambiente (dev/stg/prod).
2. Service account / role com acesso só ao secret + ambiente correspondente.
3. Aplicação lê no boot via SDK ou env injetada pelo orquestrador (Cloud Run, K8s, Firebase Functions `defineSecret`).
4. `.env.example` documenta a key + placeholder. `.env` ignorado.
5. Logger com redaction lista (Pino redact, Winston filter).
6. CI scanner (truffleHog, gitleaks) bloqueia commits com padrões de secret.

## Anti-patterns
- API key literal em código → vazamento garantido.
- `.env` no Docker image → vaza pra quem pull a imagem.
- Mesmo secret em todos os ambientes → blast radius gigante.
- Logar `process.env` inteiro em debug → secret no log.
- Rotacionar sem coordenar dual-validity → janela de outage.

## Mini-exemplo
Carregar do GCP Secret Manager no boot do server (Cloud Run, Functions): usar SDK oficial para acessar `projects/<id>/secrets/<name>/versions/latest`, cachear em memória, expor via objeto config tipado. Em Firebase Functions, declarar com `defineSecret("NAME")` e injetar via option `secrets: [...]`.

`.env.example` versionado deve listar cada variável com placeholder explicativo (sem valor real), incluindo `DATABASE_URL`, chaves de provedores externos, etc.

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/contracts/secrets.md`
