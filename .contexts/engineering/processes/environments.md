---
title: Convenção de Ambientes
type: processes
status: active
last_updated: 2026-05-20
---

# Convenção de Ambientes

Este documento prescreve **quais ambientes existem**, **como se diferenciam**, **como são acessados** e **como dados, configuração e infraestrutura fluem entre eles**. É a fonte de verdade operacional para qualquer engenheiro ou agente que precise raciocinar sobre "onde isso roda" e "qual a config ali".

Referências relacionadas: `@processes/deploy`, `@processes/release`, `@processes/monitoring`, `@processes/rollback`, `@rules/security`, `@rules/governance`, `@rules/validation`, `@contracts/secrets`.

---

## 1. Ambientes canônicos

O projeto opera com **quatro ambientes**, e somente quatro. Não criar ambientes ad hoc sem ADR.

| Ambiente | Propósito | Dados | Deploy | URL canônica |
|---|---|---|---|---|
| `local` | Desenvolvimento na máquina do dev | Sintéticos, emulators | Manual (`pnpm dev`) | `localhost:3000` |
| `dev` | Ambiente compartilhado opcional para feature branches | Sintéticos | Auto por PR (preview) | `<branch>-<project>.vercel.app` |
| `staging` | Paridade com produção, QA, manual testing | Sintéticos ou anonimizados | Auto a partir da `main` | `staging.<domain>.com` |
| `prod` | Produção real | Reais, com PII | Manual via tag/aprovação (ver `@processes/release`) | `app.<domain>.com` |

Regras:

- Nunca pular `staging` ao promover para `prod`.
- `local` é estritamente individual; nunca compartilhado.
- `dev` é descartável; preview deploys por PR são a forma preferida.

---

## 2. Princípio de paridade (dev/prod parity)

Aplicar o princípio do **12-factor**: ambientes devem ser o mais idênticos possível, divergindo apenas em escala e dados.

**Diferenças aceitáveis:**

- Tamanho de dataset (staging tem amostra; prod tem volume real).
- Quotas e rate limits reduzidos em dev/staging.
- Logs mais verbosos em dev/staging.
- Custos contidos (instâncias menores, replicas reduzidas).

**Diferenças inaceitáveis:**

- SQLite em local e Postgres em prod.
- Mock LLM em local sem flag explícita que permita testar com modelo real.
- Versões de runtime divergentes entre ambientes (ver `@stacks/runtime/node@24`).
- Engine de banco diferente entre staging e prod.
- Lib de filas, cache ou storage divergente.

Toda divergência precisa ser:
1. Documentada neste arquivo ou no manual da stack relevante.
2. Justificada (custo, segurança, restrição técnica).
3. Reversível ou mitigada por testes de integração reais.

---

## 3. Infraestrutura por ambiente

### 3.1. GCP

Projetos GCP **completamente isolados**, um por ambiente:

- `<projeto>-dev`
- `<projeto>-staging`
- `<projeto>-prod`

Nunca compartilhar recursos GCP (Cloud SQL, Secret Manager, IAM, Pub/Sub) entre projetos.

### 3.2. Firebase

Projetos Firebase separados, espelhando GCP. Cada projeto tem seu próprio:

- Firestore database (ver `@stacks/database/firebase-firestore`).
- Cloud Functions (ver `@stacks/backend/firebase-functions`).
- Hosting site.
- Auth tenant.
- Storage bucket.

### 3.3. Vercel

Usar os três environments nativos do Vercel:

- **Production** — branch `main` taggeada, vinculada a `prod`.
- **Preview** — todo PR gera deploy isolado; vinculado a `staging` ou a banco efêmero.
- **Development** — equivale a `local`, raramente usado no dashboard.

### 3.4. Postgres

Instâncias separadas por ambiente (ver `@stacks/database/postgres`). **Nunca compartilhar a DB de prod com staging ou dev.** TLS obrigatório em todas as conexões não-locais.

### 3.5. Secrets

Secret Manager isolado por projeto GCP. Toda referência a secret segue `@contracts/secrets`. **Nenhum secret de prod existe fisicamente em projetos dev/staging.**

---

## 4. URLs canônicas

| URL | Ambiente |
|---|---|
| `app.<domain>.com` | prod |
| `staging.<domain>.com` | staging |
| `dev.<domain>.com` | dev (opcional, se exposto) |
| `<branch>-<project>.vercel.app` | preview de PR |
| `localhost:3000` | local |

Regras:

- URLs **nunca** ficam hardcoded no código. Sempre via env var (`NEXT_PUBLIC_APP_URL` ou similar).
- SSL gerenciado por Vercel ou Firebase Hosting automaticamente.
- Subdomínios apontam para CDN/Edge: Vercel Edge Network (frontend) e Cloud CDN (assets backend quando aplicável).

---

## 5. Variáveis de ambiente

### 5.1. Onde vivem

- **Vercel env-specific settings** — env vars de runtime do Next.js, separadas por Production/Preview/Development.
- **Secret Manager** — secrets server-only (DB password, API keys, service account credentials). Acessados em runtime via SDK, nunca expostos ao cliente.
- **`.env.local`** — apenas em `local`, gitignored.
- **`.env.example`** — commitado, com placeholders e comentários explicando cada var.

### 5.2. Validação no boot

Toda env var consumida pelo runtime é validada por schema Zod no boot (ver `@stacks/validation/zod@4` e `@rules/validation`). Boot falha em fail-fast se var obrigatória estiver ausente ou malformada.

### 5.3. Convenções de naming

| Var | Significado | Exemplo |
|---|---|---|
| `NODE_ENV` | Modo de runtime para libs (Next.js, React) | `development` em local; `production` em dev/staging/prod |
| `APP_ENV` | Ambiente lógico do projeto | `local`, `dev`, `staging`, `prod` |
| `NEXT_PUBLIC_*` | Público, exposto ao client bundle | `NEXT_PUBLIC_APP_URL` |
| `*_SECRET`, `*_KEY` | Server-only; nunca prefixar com `NEXT_PUBLIC_` | `STRIPE_SECRET_KEY` |

**Crítico:** `NODE_ENV` e `APP_ENV` são variáveis distintas. `NODE_ENV` é binário (`production` ou `development`) e governa comportamento de libs. `APP_ENV` distingue staging vs prod, que para o Node são ambos `production`. Nunca usar `NODE_ENV` para decidir lógica de negócio entre staging e prod.

---

## 6. Acesso por ambiente

| Ambiente | Quem acessa | Role IAM | Mecanismo |
|---|---|---|---|
| `local` | Próprio dev | n/a | Credenciais pessoais |
| `dev` | Time de eng | `developer` | SSO + IAM |
| `staging` | Time de eng + QA | `developer` | SSO + IAM |
| `prod` | Least-privilege | `viewer` por default; `developer` apenas em break-glass | SSO + audit log obrigatório |

Regras:

- **CI/CD usa service accounts dedicados por ambiente**, via Workload Identity Federation. **Nunca service account JSON keys** (ver `@rules/security`).
- Acesso a `prod` exige aprovação registrada e é auditado (ver `@rules/governance`).
- Nenhum service account tem `roles/owner`. Aplicar least-privilege.

---

## 7. Dados em ambientes

### 7.1. Direção de fluxo

- **Prod → outros: proibido cópia direta com PII.** Sempre via pipeline de sanitization/anonymization.
- **Outros → prod: proibido**, exceto via migration scripts versionados e aprovados.

### 7.2. Staging dataset

- Sintético gerado por seeds reproduzíveis, **ou**
- Anonimizado a partir de prod (PII removida, IDs hasheados, dados sensíveis substituídos por fake data plausível).
- Conformidade LGPD/GDPR obrigatória (ver `@rules/governance`).

### 7.3. Seeds reproduzíveis

`local`, `dev` e `staging` têm seeds versionados no repositório. Comando padronizado: `pnpm seed:<env>`. Reset destrutivo permitido em `local` e `dev`; em `staging` exige confirmação dupla.

---

## 8. Diferenças configuráveis entre ambientes

| Aspecto | local | dev | staging | prod |
|---|---|---|---|---|
| Rate limits | desligados | relaxados | relaxados | reais |
| Feature flags | livres | livres | **ON antes de prod** para QA | controlados |
| AI providers | mock/cheap models | mock/cheap | reais | reais |
| Email/SMS | sandbox (Resend dev, Twilio test) | sandbox | sandbox | live |
| Payments | Stripe test | Stripe test | Stripe test | Stripe live |
| Webhooks externos | tunnel (ngrok/cloudflared) | endpoint real | endpoint real | endpoint real |
| Logs | verbose | verbose | info | info + alertas |
| Monitoring | nenhum | nenhum | alertas relaxados | alertas críticos |

---

## 9. Setup canônico de `local`

Sequência prescrita para onboarding:

1. Clonar o repo.
2. `cp .env.example .env.local` e preencher placeholders.
3. `docker compose up -d` (Postgres + serviços auxiliares).
4. `firebase emulators:start --only auth,firestore,functions` em terminal dedicado.
5. `pnpm install`.
6. `pnpm seed:local` para popular dados sintéticos.
7. `pnpm dev` (inicia Next.js em `localhost:3000`).

Anti-pattern: rodar `local` apontando para `dev`/`staging`/`prod` real. Use **sempre emulators**.

---

## 10. Preview deploys (PRs)

- Vercel cria preview deploy automaticamente em todo PR aberto.
- Firebase Hosting preview channels via `firebase hosting:channel:deploy <pr-id>` quando relevante.
- DB backing: por padrão usa staging DB read-only; preferível usar ephemeral DB (Neon branching, Supabase branching) por PR quando o stack permitir.
- Bot do CI comenta no PR com URL do preview ao concluir build.
- Preview deploys são derrubados automaticamente em até 7 dias após merge ou fechamento do PR.

---

## 11. Promoção entre ambientes

Ver `@processes/deploy` e `@processes/release` para o pipeline completo. Resumo do fluxo:

```
local → PR aberto → preview deploy (auto)
                  → merge na main → staging (auto)
                                  → tag de release → prod (manual approval)
```

Regras:

- Nunca promover diretamente de `dev` ou de PR preview para `prod`.
- Toda promoção para `prod` exige tag semver assinada.
- Rollback de `prod` segue `@processes/rollback`.

---

## 12. Isolamento de network

- Postgres exige TLS em todas as conexões não-locais.
- Cloud Functions acessam Cloud SQL via **VPC connectors**; Cloud SQL não tem IP público em `staging`/`prod`.
- Firewall rules e IAM aplicados por ambiente; não compartilhar redes entre projetos GCP.

---

## 13. Region pinning

- Region default: `southamerica-east1` (São Paulo) para conformidade LGPD quando dados de cidadãos brasileiros são processados.
- **Todos os serviços de uma mesma feature em uma mesma region.** Firestore, Functions e Postgres devem residir na mesma region para minimizar latência e respeitar fronteiras de dados.
- Cross-region somente com ADR e justificativa explícita.

---

## 14. Domain & DNS

- Domínio principal gerenciado em provider único (registro centralizado).
- Subdomínios por ambiente (ver §4).
- SSL automático via Vercel/Firebase Hosting.
- CDN: Vercel Edge Network para frontend; Cloud CDN para assets servidos pelo backend quando aplicável.

---

## 15. Monitoring por ambiente

Ver `@processes/monitoring` para detalhamento.

| Ambiente | Alertas | Custo de observabilidade |
|---|---|---|
| `local` | nenhum | zero |
| `dev` | nenhum | mínimo |
| `staging` | relaxados, mas presentes (regression detection) | médio |
| `prod` | críticos com paging | alto, com budget |

---

## 16. Cost monitoring

Ver `@rules/governance`.

- Budget alerts configurados por projeto GCP.
- `dev` e `staging` com caps mais baixos e shutdown automático opcional fora de horário comercial.
- `prod` com budget alerts + anomaly detection ativos.

---

## 17. Anti-patterns

Os seguintes padrões são proibidos e devem ser bloqueados em review:

- Prod compartilhando DB com staging ou qualquer outro ambiente.
- Secrets de prod em arquivos `.env.staging` (ou qualquer `.env.*` commitado).
- LIVE keys de Stripe ou outro provider de pagamento em `dev`/`staging`.
- Email/SMS real disparado de `staging` para usuários reais (spam, dano reputacional).
- Dataset de prod copiado para `staging` sem sanitization (violação LGPD).
- Service account com `roles/owner` em qualquer ambiente.
- URLs hardcoded em código (sempre via env var validada).
- `NODE_ENV=production` em `local` (quebra source maps e hot reload).
- Tratar `NODE_ENV` como `APP_ENV` (confundir staging vs prod).
- Ausência de `.env.example` no repositório (onboarding penoso).
- Region inconsistente entre serviços de uma mesma feature (latência + risco LGPD).
- `dev` sem isolamento entre tenants/usuários (vazamento cross-tenant em testes).
- Promover para `prod` sem passar por `staging` com feature flags ativados para QA.
- Workload Identity Federation ausente; uso de service account JSON keys.
- Criar novo ambiente ad hoc fora dos quatro canônicos sem ADR.

---

## 18. Referências cruzadas

- `@processes/deploy` — pipeline de deploy e gates de CI por ambiente.
- `@processes/release` — versionamento e tagging.
- `@processes/monitoring` — observabilidade e alertas por ambiente.
- `@processes/rollback` — procedimento de rollback de prod.
- `@rules/security` — Workload Identity, least-privilege, secrets handling.
- `@rules/governance` — LGPD, audit, cost.
- `@rules/validation` — validação Zod no boot.
- `@contracts/secrets` — convenção de naming e referência de secrets.
- `@stacks/runtime/node@24` — runtime canônico.
- `@stacks/frontend/next@16` — configuração de env vars no Next.js.
- `@stacks/validation/zod@4` — schemas de validação de env.
- `@stacks/backend/firebase-functions` — projetos Firebase por ambiente.
- `@stacks/database/postgres` — instâncias separadas, TLS.
- `@stacks/database/firebase-firestore` — Firestore por projeto.
