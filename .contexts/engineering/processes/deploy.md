---
title: Deploy
type: processes
status: active
scope: engineering
last_updated: 2026-09-29
---

# Deploy

Convenções operacionais para entregar mudanças aos ambientes `dev`, `staging` e `prod` de forma frequente, pequena, automatizada, observável e reversível. Este documento governa o fluxo de deploy ponta-a-ponta — desde merge em `main` até health check pós-rollout — e define as regras para componentes Next.js, Firebase Functions, Firestore, Postgres e prompts de IA.

Complementa `@processes/release`, `@processes/git` e `@processes/pull-requests` (este documento é o canônico de **deploy**). Para regras transversais de migração de schema, governança de features e observabilidade pós-deploy, consulte `@rules/migration`, `@rules/governance` e `@rules/observability`. Para manuseio de credenciais em pipeline, consulte `@contracts/secrets` e `@rules/security`.

---

## 1. Filosofia

- **Frequentes**: prefira muitos deploys pequenos a poucos deploys grandes. Lote pequeno reduz raio de impacto e acelera diagnóstico.
- **Pequenos**: cada deploy carrega uma unidade lógica de mudança. Migrations destrutivas e features comportamentais nunca compartilham o mesmo deploy.
- **Automatizados**: pipeline executa o deploy. Humanos aprovam, não digitam comandos.
- **Observáveis**: todo deploy é rastreável (quem, quando, qual commit, qual versão) e mensurável (métricas pré e pós).
- **Reversíveis**: todo deploy tem caminho de rollback documentado antes de iniciar.

Deploy é decoupled de release. O artefato chega em produção atrás de feature flag (`@rules/governance`); a release acontece quando a flag é ligada.

---

## 2. Ambientes

| Ambiente | Trigger | Projeto GCP | Domínio | Aprovação |
|---|---|---|---|---|
| `dev` | preview automático por PR (descartável) | `<projeto>-dev` | `<branch>-<project>.vercel.app` (ou `dev.<domain>.com`, se exposto) | nenhuma |
| `staging` | auto-deploy de `main` | `<projeto>-staging` | `staging.<domain>.com` | nenhuma |
| `prod` | tag `vX.Y.Z` + aprovação manual | `<projeto>-prod` | `app.<domain>.com` | required reviewers |

Definição canônica dos ambientes, naming de projetos e domínios: `@processes/environments` (este quadro a resume). Cada ambiente vive em **projeto GCP separado** (isolamento de dados, IAM, billing, secrets). Secrets nunca cruzam ambientes — consulte `@contracts/secrets` para naming e separação por projeto.

---

## 3. Pipeline canônico

```
1. PR mergeado em main
2. CI verde (lint, typecheck, tests, build — gates deste processo)
3. Deploy automático para staging
4. Smoke tests automáticos + QA manual quando flag de risco
5. Promote para prod via tag (vX.Y.Z) + aprovação manual do environment `prod`
6. Health checks pós-deploy (liveness + readiness + smoke)
7. Rollback automático se health/smoke falha na janela de 30 min pós-deploy (`@processes/monitoring`, "Ação ligada ao 5xx")
```

Cada passo é gate: falha em qualquer etapa impede progresso. Nunca pule etapas via override manual sem justificativa documentada no PR.

---

## 4. Componentes a deployar

| Componente | Comando canônico | Granularidade |
|---|---|---|
| Next.js app | Vercel ou Firebase App Hosting via Cloud Build (alvo a definir pelo projeto) | atômico (deploy completo) |
| Firebase Functions | `firebase deploy --only functions:<name>` | granular por function |
| Firestore rules + indexes | `firebase deploy --only firestore` | atômico |
| Storage rules | `firebase deploy --only storage` | atômico |
| Postgres migrations | `pnpm db:migrate` em job dedicado | sequencial pré-deploy do app |
| pgvector indexes | `CREATE INDEX CONCURRENTLY` dentro de migration | não bloqueante |
| Edge configs / Static assets | CDN do alvo do app (Vercel ou App Hosting) | atômico via deploy do app |

No core v1 o Next.js vai para o Firebase App Hosting e o Vercel não é usado (ADR 0009). Componentes, ordem e rollback do core: §21.

**Granularidade é obrigatória em Functions**: deploy de todas as functions quando apenas uma mudou propaga risco desnecessariamente. Veja `@stacks/backend/firebase-functions`.

---

## 5. Ordem de deploy

Siga **expand-and-contract** (regras completas em `@rules/migration`):

1. **Mudança aditiva no schema** (coluna nova, índice novo, collection nova) — deploy isolado.
2. **Backfill** se necessário — job idempotente, fora da janela de deploy.
3. **Código que escreve no novo formato** — dual-write quando substituindo campo.
4. **Código que lê do novo formato** — dual-read durante transição.
5. **Remoção do formato antigo** — deploy final, após verificação de que nada mais lê/escreve.

Breaking schema **nunca** compartilha deploy com código que depende dele. O rollback do código não pode quebrar o schema.

---

## 6. Estratégias de rollout

- **Blue-green**: padrão quando o provider suporta atomicidade (Vercel deployments imutáveis, Cloud Run revisions). Tráfego comuta de uma vez.
- **Canary**: para mudanças de risco médio/alto, escalone tráfego `5% → 25% → 50% → 100%` (Vercel preview com peso, Firebase App Hosting traffic split, Cloud Run revisions com `--traffic`). Cada degrau aguarda janela mínima de 10 minutos com métricas saudáveis antes de avançar.
- **Feature flags**: deploy do código com flag desligada é a estratégia default para qualquer feature comportamental. Release vira flip de flag, não deploy. Veja `@rules/governance`.

---

## 7. Versioning

- Toda release de prod recebe tag `vMAJOR.MINOR.PATCH` no commit promovido. Detalhes do esquema em `@processes/release`.
- Build embute `GIT_SHA` + `RELEASE_TAG` em variáveis de ambiente de runtime.
- Endpoint `/health` expõe `{ version, commit, builtAt }` para inspeção rápida.
- Logs estruturados incluem atributos `version` e `commitSha` em todo registro (veja `@rules/observability`).

---

## 8. Health checks

Todo serviço deployável expõe:

| Endpoint | Semântica | Falha em deploy |
|---|---|---|
| `/health/liveness` | processo vivo, event loop respondendo | aborta rollout |
| `/health/readiness` | dependências OK (Postgres, Firestore, AI providers, Firebase Admin) | aborta rollout |

Pós-deploy, pipeline dispara **smoke tests automáticos** que hitam endpoints críticos (login, criação de recurso principal, leitura paginada). Falha de smoke na janela de 30 minutos pós-deploy dispara rollback automático (`@processes/monitoring`).

---

## 9. Rollback

| Componente | Mecanismo |
|---|---|
| Vercel | `vercel rollback <deployment-url>` ou rollback instantâneo via dashboard |
| Firebase Functions | redeploy da tag anterior: `git checkout vX.Y.(Z-1)` + build + `firebase deploy --only functions:<name>`; ou Cloud Run (gen2) `gcloud run services update-traffic` para a revisão anterior |
| Firestore rules | redeploy do commit anterior via `firebase deploy --only firestore:rules` |
| Postgres migrations | forward-only por default; reverse migration documentada apenas quando viável e idempotente |
| Feature flags | flip da flag para `off` — rollback de comportamento sem deploy |
| Cloud Run revisions | `gcloud run services update-traffic --to-revisions=<prev>=100` |

Expand-and-contract garante que rollback de **código** nunca exige rollback de **schema**. Todo PR que contém migration documenta o plano de rollback explicitamente (regra em `@rules/migration`).

---

## 10. Deploy windows

- **Sem janelas rígidas**: deploys frequentes superam janelas fixas. Confiança vem de tamanho pequeno + automação + rollback rápido, não de horário.
- **Evitar**: sex-feira após 15h, véspera de feriado, horários de pico de tráfego (consulte dashboard por produto).
- **Hotfix**: exceção autorizada a qualquer hora, com aprovação registrada no PR e link para incidente.

---

## 11. Aprovação manual para prod

- GitHub Environment `prod` configurado com **required reviewers**.
- Mudanças padrão: 1 approval de eng owner.
- Mudanças sensíveis (auth, billing, migrations destrutivas, mudança em IAM, edição de secret): **2 approvals**, sendo 1 owner do domínio.
- Bypass de aprovação é proibido — se necessário em incidente, registrar postmortem.

---

## 12. Secrets em deploy

- **OIDC / Workload Identity Federation** para autenticar GitHub Actions no GCP. Não usar service account keys em CI.
- **Vercel secrets** via dashboard ou CLI com encryption at-rest. Nunca commitar `.env`.
- Rotação de secret **não dispara redeploy automático** por default — configurar trigger explícito por secret crítico (auth signing keys, DB credentials).
- Naming, escopo e separação por ambiente em `@contracts/secrets`. Regras de manuseio em `@rules/security`.

---

## 13. Migrations em deploy

- Job dedicado executa `pnpm db:migrate` **antes** do deploy do app.
- Falha em migration **aborta** o deploy do app. Pipeline não prossegue.
- **Long migrations** (>2 min) seguem o padrão:
  1. Deploy 1 — cria schema novo (aditivo, sem dependência).
  2. Backfill em job separado, fora da janela de deploy.
  3. Deploy 2 — código passa a usar o schema novo.

Nunca bloquear deploy em backfill síncrono. Regras detalhadas em `@rules/migration`.

---

## 14. Cloud Functions Gen 2 specifics

- Deploy granular obrigatório: `firebase deploy --only functions:<name>` por function alterada.
- Region pinning via `setGlobalOptions({ region: 'southamerica-east1' })` — consulte `@stacks/backend/firebase-functions`.
- `minInstances >= 1` em endpoints críticos de prod para eliminar cold start.
- Concurrency configurada por function conforme perfil de carga.

---

## 15. Next.js specifics

- **Vercel** (se for o alvo escolhido pelo projeto): preview deployment automático por PR (`dev`); merge em `main` vai para `staging`; production só a partir da tag `vX.Y.Z` + aprovação (§2) — desligar o auto-deploy de production em merge na `main`.
- **Firebase App Hosting**: rollout via Cloud Build, com rollback por revisão.
- **ISR / Edge cache**: pós-deploy, dispare `revalidateTag` / `revalidatePath` para conteúdo afetado. Não confie em TTL natural quando a mudança é semântica.
- Configurações de runtime, env vars e edge config em `@stacks/frontend/next@16`.

---

## 16. Observabilidade pós-deploy

Pós-deploy, monitore na janela de 30 minutos (regras completas em `@rules/observability`):

| Métrica | Limiar |
|---|---|
| Error rate (5xx) | o da tabela "Ação ligada ao 5xx" em `@processes/monitoring` |
| p95 latency | > baseline + 20% |
| Throughput | drop > 15% |

- Sentry / Datadog: **tag releases** com `version` para correlação automática de erros à release.
- Logs estruturados com `version`, `commitSha`, `deployId`.
- Nos 30 minutos depois do deploy, 5xx acima do baseline em 1 ponto percentual por 5 min, pico acima de 5% em 1 min, ou falha de smoke disparam rollback automático. Fora dessa janela vale a regra de page do monitoring, não um segundo limiar.

---

## 17. Audit log de deploys

Todo deploy registra:

- Quem (ator GitHub).
- Quando (timestamp ISO).
- O quê (commit SHA + tag + lista de componentes).
- Por quê (link para PR e/ou issue Linear).

Use **GitHub Deployments API** como fonte de verdade. Integração com Linear/Jira atualiza tickets relacionados.

---

## 18. Disaster recovery

- **Backups de DB** verificados periodicamente (mensal mínimo).
- **Restore tested**: exercício trimestral de restore em ambiente isolado, com runbook.
- **Runbook documentado** cobrindo: perda total de projeto GCP, perda de banco, comprometimento de secret, indisponibilidade de provider de IA.

---

## 19. AI prompt deploys

Prompts são código. Aplicam-se as mesmas regras de versionamento e gate.

- Prompts versionados em git, jamais editados em painel de provider.
- **Eval gate** obrigatório antes de deploy — consulte `@stacks/ai/harness-engineering`.
- **A/B via feature flag** para comparar versões antes do full rollout.
- **Kill-switch** (flag) para reverter sem deploy, conforme `@rules/governance`.

---

## 20. Anti-patterns

Reprovar em review qualquer PR que apresente:

- Deploy manual via FTP, SCP ou script ad hoc.
- Deploy sem CI verde.
- Migration + app deploy no mesmo passo sem expand-and-contract.
- Ausência de health checks pós-deploy.
- Sem audit de quem deployou.
- Deploy em sex-feira 17h sem motivo registrado.
- Bypass de approval em prod.
- Deploy de todas as functions quando só uma mudou.
- Rollback por redeploy de commit arbitrário sem tag — o caminho sancionado é redeployar a tag de release anterior (`vX.Y.Z`) ou reverter para a revisão anterior no provider.
- Sem rollback plan documentado em PR que contém migration.
- Edição manual de prompt no painel sem deploy versionado.
- Ausência de release tag (perde rastreabilidade).
- Long migration síncrona bloqueando deploy.
- Endpoint crítico em prod sem `minInstances`.
- Function sem region pinning (risco LGPD).
- Feature flags sem data de expiração (acumulam dívida).

---

## 21. Componentes do core v1

Topologia decidida em `@.contexts/engineering/decisions/0009-runtime-topology-next-v1-functions-events-mastra-cloud-run.md`; stores em `@.contexts/engineering/decisions/0008-data-stores-split-firestore-postgres-storage-bigquery.md`. Esta seção prevalece sobre as menções a Vercel nas §2, §9, §12 e §15, que ficam como alternativa de projeto derivado, não usada no core v1.

### 21.1 Componentes

| Componente | Host | Deploy canônico | Artefato / versão | Stack |
|---|---|---|---|---|
| `apps/web` (UI, Server Actions, `/v1`) | Firebase App Hosting, `nodejs24` (ADR 0004 E6) | `firebase deploy --only apphosting:<backendId>` a partir do commit da tag, ou `firebase apphosting:rollouts:create` | build do App Hosting por commit | `@.contexts/engineering/stacks/backend/firebase-platform.md` |
| `apps/mastra` | Cloud Run, imagem `node:26-alpine` | build da imagem com tag `GIT_SHA` → `gcloud run deploy mastra --no-traffic` → `update-traffic` | revisão do Cloud Run | `@.contexts/engineering/stacks/backend/cloud-run.md` |
| `apps/functions` | Functions Gen 2, `nodejs24` (E1) | `firebase deploy --only functions:<name>` (§14) | código da tag | `@.contexts/engineering/stacks/backend/firebase-functions.md` |
| Firestore rules + indexes, Storage rules | Firebase | `firebase deploy --only firestore`, `--only storage` (§4) | commit da tag | `@.contexts/engineering/stacks/database/firebase-firestore.md` |
| Postgres (schema `ai` do projeto) | Cloud SQL for PostgreSQL 18 | `pnpm db:migrate` em job dedicado (§13) | migration versionada | `@.contexts/engineering/stacks/database/postgres.md` |
| Postgres (schema `mastra`) | Cloud SQL, mesma instância | o adapter `@mastra/pg` cria e evolui as próprias tabelas no boot do `apps/mastra` | versão do `@mastra/pg` | 0008 |
| `apps/desktop` | Binário Tauri assinado + manifesto do updater | CI por plataforma gera instaladores assinados e publica o manifesto do updater (ADR 0007) | versão semver do app (`tauri.conf.json`) | `@.contexts/engineering/stacks/desktop/tauri@2.md` |

- Em `staging`, o merge em `main` dispara os componentes afetados (`turbo run --affected`, `architecture/monorepo.md`). Em `prod`, só a tag `vX.Y.Z` com aprovação (§3, §11).
- Rollout automático do App Hosting por push só na branch de `staging`. O backend de `prod` não tem branch viva: o pipeline da tag dispara o rollout.
- O `/health` do Mastra é liveness. Readiness com dependências (§8) é rota do core, definida no SP0b.

### 21.2 Ordem de deploy

Numa release que toca vários componentes, a ordem é do que é lido para quem lê. Cada passo espera o health do anterior:

1. **Schema:** migrations do schema `ai` (expand, §5 e `@.contexts/engineering/rules/migration.md`); Firestore indexes novos (esperar o build do índice antes de código que depende dele); Firestore e Storage rules só quando aditivas.
2. **`apps/functions`:** consumidores de evento novos antes dos produtores, para nenhum evento cair sem consumidor.
3. **`apps/mastra`:** revisão nova sem tráfego → canary por `update-traffic` (§6) → 100%. Tools e workflows novos precisam existir antes de o `/v1` expô-los.
4. **`apps/web`:** rollout do App Hosting. Rotas do `/v1` e telas que usam os passos anteriores entram atrás de feature flag.
5. **`apps/desktop`:** publicar o update só depois do `/v1` da mesma release estar em 100% em `prod`. O desktop instalado convive com versões antigas: o `/v1` segue compatível dentro da major (`@.contexts/engineering/rules/api-design.md` §7).
6. **Contract:** remoção de campo, rota ou rule antiga em release posterior, depois de verificar que nenhum leitor sobrou.

Upgrade de minor do Mastra que migra tabelas do schema `mastra` sai em release própria, sem outra mudança, e sem tráfego dividido entre revisões nova e antiga (`@.contexts/engineering/stacks/backend/cloud-run.md`, "Deploy e rollback").

### 21.3 Rollback por componente

| Componente | Mecanismo | Cuidado |
|---|---|---|
| `apps/web` | App Hosting: "Roll back to this build" na aba Rollouts (instantâneo, mesma imagem) | "Rebuild and rollback" aplica a configuração atual; use quando o problema foi secret ou env |
| `apps/mastra` | `gcloud run services update-traffic mastra --to-revisions=<rev-anterior>=100` | Se a revisão nova migrou tabelas do schema `mastra`, rollback de código pode não bastar: forward fix |
| `apps/functions` | redeploy da tag anterior por function, ou `update-traffic` da revisão anterior (§9) | Eventos processados pela versão nova não se desfazem: consumidor idempotente |
| Rules e indexes | redeploy do commit anterior (§9) | Index removido demora para reconstruir |
| Postgres `ai` | forward-only (§9, §13) | Plano de rollback no PR da migration |
| `apps/desktop` | Não há rollback de binário instalado. Publicar nova versão com a correção pelo updater (versão maior que a ruim) ou desligar a feature por flag no servidor | A chave de assinatura do updater precisa estar acessível ao pipeline de hotfix |
| Feature flag | flip para `off` (§9) | Primeiro recurso para qualquer componente |

Ordem de rollback: o inverso da §21.2, parando no primeiro componente cujo rollback resolve.

---

## Referências cruzadas

- `@processes/release` — esquema de versionamento e cadência de release.
- `@processes/git` — branching e merge.
- `@processes/pull-requests` — template e ciclo de revisão.
- `@rules/migration` — expand-and-contract, forward-only, dual-write/read.
- `@rules/governance` — feature flags, kill-switches, expiração.
- `@rules/observability` — métricas, logs estruturados, tagging de releases.
- `@rules/security` — manuseio de credenciais em pipeline.
- `@stacks/backend/firebase-functions` — region pinning, minInstances, deploy granular.
- `@stacks/backend/cloud-run` — imagem, billing por instância e rollback por revisão do servidor Mastra.
- `@stacks/backend/firebase-platform` — App Hosting (rollout, rollback, runtime E6) e Emulator Suite.
- `@stacks/frontend/next@16` — Vercel deployment, ISR, edge cache.
- `@stacks/ai/harness-engineering` — eval gate para prompts.
- `@contracts/secrets` — naming, escopo e separação por ambiente.
