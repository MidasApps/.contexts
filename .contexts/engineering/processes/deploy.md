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
| `dev` | local + opcional shared dev env | `liquid-dev` | `dev.<app>.internal` | nenhuma |
| `staging` | auto-deploy de `main` | `liquid-staging` | `staging.<app>.com` | nenhuma |
| `prod` | tag `vX.Y.Z` + aprovação manual | `liquid-prod` | `<app>.com` | required reviewers |

Cada ambiente vive em **projeto GCP separado** (isolamento de dados, IAM, billing, secrets). Secrets nunca cruzam ambientes — consulte `@contracts/secrets` para naming e separação por projeto.

---

## 3. Pipeline canônico

```
1. PR mergeado em main
2. CI verde (lint, typecheck, tests, build — gates deste processo)
3. Deploy automático para staging
4. Smoke tests automáticos + QA manual quando flag de risco
5. Promote para prod via tag (vX.Y.Z) ou aprovação manual
6. Health checks pós-deploy (liveness + readiness + smoke)
7. Rollback automático se health falha em janela de 5 min
```

Cada passo é gate: falha em qualquer etapa impede progresso. Nunca pule etapas via override manual sem justificativa documentada no PR.

---

## 4. Componentes a deployar

| Componente | Comando canônico | Granularidade |
|---|---|---|
| Next.js app | Vercel (auto) ou Firebase App Hosting via Cloud Build | atômico (deploy completo) |
| Firebase Functions | `firebase deploy --only functions:<name>` | granular por function |
| Firestore rules + indexes | `firebase deploy --only firestore` | atômico |
| Storage rules | `firebase deploy --only storage` | atômico |
| Postgres migrations | `pnpm db:migrate` em job dedicado | sequencial pré-deploy do app |
| pgvector indexes | `CREATE INDEX CONCURRENTLY` dentro de migration | não bloqueante |
| Edge configs / Static assets | Vercel CDN | atômico via deploy do app |

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
- Logs estruturados incluem atributos `version` e `commit_sha` em todo registro (veja `@rules/observability`).

---

## 8. Health checks

Todo serviço deployável expõe:

| Endpoint | Semântica | Falha em deploy |
|---|---|---|
| `/health/liveness` | processo vivo, event loop respondendo | aborta rollout |
| `/health/readiness` | dependências OK (Postgres, Firestore, AI providers, Firebase Admin) | aborta rollout |

Pós-deploy, pipeline dispara **smoke tests automáticos** que hitam endpoints críticos (login, criação de recurso principal, leitura paginada). Falha de smoke em janela de 5 minutos dispara rollback automático.

---

## 9. Rollback

| Componente | Mecanismo |
|---|---|
| Vercel | `vercel rollback <deployment-url>` ou rollback instantâneo via dashboard |
| Firebase Functions | `firebase functions:rollback` (versões anteriores retidas) |
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

- GitHub Environment `production` configurado com **required reviewers**.
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

- **Vercel** (padrão): preview deployment automático por PR; production deployment automático em merge para `main` (configurável para promote manual).
- **Firebase App Hosting**: rollout via Cloud Build, com rollback por revisão.
- **ISR / Edge cache**: pós-deploy, dispare `revalidateTag` / `revalidatePath` para conteúdo afetado. Não confie em TTL natural quando a mudança é semântica.
- Configurações de runtime, env vars e edge config em `@stacks/frontend/next@16`.

---

## 16. Observabilidade pós-deploy

Pós-deploy, monitore em janela de 15 minutos (regras completas em `@rules/observability`):

| Métrica | Limiar de alerta |
|---|---|
| Error rate | > baseline + 1% absoluto |
| p95 latency | > baseline + 20% |
| Throughput | drop > 15% |

- Sentry / Datadog: **tag releases** com `version` para correlação automática de erros à release.
- Logs estruturados com `version`, `commit_sha`, `deploy_id`.
- Alerta de spike em error rate dentro de 5 min após deploy dispara **rollback automático**.

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
- Rollback descrito como "redeployar versão anterior" sem mecanismo claro de revisão.
- Sem rollback plan documentado em PR que contém migration.
- Edição manual de prompt no painel sem deploy versionado.
- Ausência de release tag (perde rastreabilidade).
- Long migration síncrona bloqueando deploy.
- Endpoint crítico em prod sem `minInstances`.
- Function sem region pinning (risco LGPD).
- Feature flags sem data de expiração (acumulam dívida).

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
- `@stacks/frontend/next@16` — Vercel deployment, ISR, edge cache.
- `@stacks/ai/harness-engineering` — eval gate para prompts.
- `@contracts/secrets` — naming, escopo e separação por ambiente.
