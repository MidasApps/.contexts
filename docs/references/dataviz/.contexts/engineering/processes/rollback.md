# Rollback

Processo operacional de reversão de mudanças em produção. Define quando rolar back, como rolar back cada componente do stack, e o que precisa estar no lugar para que o rollback seja uma operação rotineira — não uma improvisação durante incidente.

## Filosofia

Rollback é mecanismo de defesa, não fracasso. Um deploy revertido é um sistema funcionando como projetado: detecção rápida, mitigação rápida, aprendizado posterior.

- **Deploy pequeno + frequente reduz blast radius.** Um deploy de 20 commits reverte 20 mudanças; um deploy de 1 commit reverte uma.
- **Ter botão de rollback testado é parte do contrato de produção.** Se não foi exercitado, não existe.
- **Rollback é primary mitigation, não last resort.** Diante de incidente ativo, mitigar primeiro (rollback), investigar depois (postmortem).
- **MTTR > MTBF.** É mais barato recuperar rápido de falhas frequentes do que tentar prevenir todas as falhas.

## Quando rolar back

Acione rollback (ou forward fix urgente) quando qualquer um destes critérios for atingido:

- **Error rate acima do threshold** definido em `@processes/monitoring` (tipicamente > 1% sustentado por 5min, ou pico > 5%).
- **p95 de latência degradou significativamente** versus baseline pre-deploy (tipicamente > 2x).
- **SLO burn rate alto** — queimando budget mensal em horas.
- **Bug crítico afetando usuários** (fluxo principal quebrado, dados incorretos exibidos, ação destrutiva acidental).
- **Vazamento de dados ou incidente de segurança** — ver `@rules/security`. Rollback imediato + rotação de credenciais + comms.
- **Cost spike imprevisto** (loop infinito chamando LLM, query N+1 em hot path, runaway function).
- **Falha em smoke tests pós-deploy** — ver `@processes/deploy`. Rollback automático preferido quando viável.

Diante de qualquer sinal acima, **mitigar primeiro, investigar depois**. Não debate de root cause durante incidente ativo.

## Quando NÃO rolar back

Nem todo bug em produção justifica rollback. Avalie forward fix quando:

- **Bug cosmético sem impacto funcional** (typo, alinhamento, copy errado). Hotfix forward na próxima janela.
- **Issue afetando < 1% dos usuários sem perda de dados.** Custo do rollback (interrupção, regressão de features legítimas) > benefício. Preferir hotfix forward.
- **Migration destrutiva já aplicada irreversivelmente** (drop column, drop table). Rollback do código pode quebrar com schema novo — ver `@rules/migration`. Forward-only com fix.
- **Falha causada por dependência upstream** (provider de IA down, Firebase outage, DNS). Rollback não resolve. Comunicar status, esperar mitigação upstream, considerar fallback/degradação.
- **Bug existe em todas as versões recentes.** Rollback apenas troca um bug por outro. Hotfix forward.

## Tipos de rollback (em ordem de preferência)

Sempre prefira o mecanismo mais rápido e menos disruptivo disponível para o caso.

### 1. Feature flag flip

**Tempo:** segundos. **Risco:** mínimo. **Preferido para:** regressões comportamentais, features novas defeituosas, mudanças com escopo flag-gated.

Desligar o flag reverte o comportamento sem deploy. Zero risco de regressão em outras features. Toda feature nova nasce com flag — ver `@rules/governance`.

### 2. Deploy revert (atomic)

**Tempo:** segundos a minutos. **Risco:** baixo se versão anterior é conhecida boa.

Promover deploy anterior conhecido bom via mecanismo nativo da plataforma (Vercel rollback, Cloud Run traffic split, Firebase Functions versioning). Atômico, sem warmup, sem reboot manual.

### 3. Forward fix com hotfix deploy

**Tempo:** minutos a horas. **Risco:** maior — fix sob pressão.

Quando rollback não é viável (migration aplicada, dados novos incompatíveis com versão anterior, schema breaking). Fix mínimo, deploy expedito, smoke tests obrigatórios. Não pular CI.

### 4. Kill-switch

**Tempo:** segundos. **Risco:** depende do escopo.

Desligar feature inteira via flag de kill. Útil para features de IA ou integrações experimentais — ver `@stacks/ai/harness-engineering`. Cliente vê feature como "temporariamente indisponível", não como bug.

## Componentes e como rolar back cada um

### Next.js app (Vercel)

- **Dashboard:** Deployments → selecione deploy anterior → "Promote to Production".
- **CLI:** `vercel rollback`.
- **Comportamento:** atomic, troca instantânea de tráfego, sem warmup.
- **Pré-requisito:** deploy anterior ainda existe (Vercel mantém histórico).

Ver `@stacks/frontend/next@16` para detalhes específicos da versão.

### Next.js (Firebase App Hosting / Cloud Run)

- **CLI:** `gcloud run services update-traffic <service> --to-revisions=PREV_REVISION=100 --region=<region>`.
- **Comportamento:** atomic com traffic split — pode rolar back gradualmente (10/90 → 50/50 → 100/0) se quiser canário reverso.
- **Pré-requisito:** revision anterior não foi garbage-collected (configurar retention de pelo menos 10 revisions).

### Firebase Functions (Gen 2)

- **CLI:** `firebase functions:rollback` ou redeploy da versão anterior via git checkout + `firebase deploy --only functions:<name>`.
- **Granularidade:** por function (`--only functions:<name>`), nunca rolar back o projeto inteiro se só uma function regrediu.
- **Comportamento:** Cloud Run revisions por baixo — mesma mecânica de traffic split aplicável.

Ver `@stacks/backend/firebase-functions`.

### Firestore Security Rules

- **CLI:** `firebase deploy --only firestore:rules` apontando para versão anterior.
- **Pré-requisito:** rules versionadas em git (não editar via console).
- **Tempo:** propagação em segundos, mas eventual — pode haver lag de poucos segundos.

### Firestore data

Não há rollback nativo de dados. Estratégias:

- **Scripts compensatórios** documentados em runbook — ver `@rules/migration`.
- **Soft-delete vs hard-delete:** decisão de modelagem definida em `@contracts/firebase-firestore`. Soft-delete permite recovery; hard-delete não.
- **PITR (Point-in-Time Recovery):** se habilitado, recovery de até 7 dias. Restaura para projeto separado — não sobrescreve produção.
- **Para vazamentos:** snapshot pré-incidente + replay seletivo dos eventos legítimos posteriores.

### Postgres schema

- **Forward-only por default** — ver `@rules/migration`.
- **Reverse migration documentada** quando viável (additive é fácil de reverter; destructive é praticamente impossível).
- **Expand-and-contract evita necessidade de rollback de schema:** o código anterior continua compatível com o schema novo, então rollback de código não exige rollback de DB.
- **PITR (Cloud SQL):** 7-35 dias dependendo da configuração. Restore cria nova instância — failover manual.

Ver `@stacks/database/postgres`.

### Postgres data

- **Compensating transactions:** INSERT/UPDATE para reverter efeito de transações ruins.
- **Soft-delete recovery:** restore via UPDATE de `deleted_at = NULL`.
- **Vazamentos / corrupção em massa:** PITR para instância paralela + replay seletivo + cutover.

### pgvector embeddings

- Embeddings são imutáveis — ver `@contracts/pgvector`.
- Rollback de modelo de embedding: swap para tabela `_v(N-1)` mantida durante expand-and-contract.
- Sem expand-and-contract = sem rollback possível, apenas re-embed forward.

### BigQuery

- **Time travel:** `SELECT * FROM dataset.table FOR SYSTEM_TIME AS OF TIMESTAMP '2026-05-19 14:00:00 UTC'`. Default 7 dias, configurável até 90.
- **Snapshots / clones:** criar snapshot pré-mudança crítica (`CREATE SNAPSHOT TABLE ... CLONE ...`).
- **Restore:** `CREATE OR REPLACE TABLE x AS SELECT * FROM x FOR SYSTEM_TIME AS OF ...`.

### Domain events publicados

Eventos são imutáveis — não há rollback retroativo. Ver `@contracts/events`.

- Para "desfazer" um evento: emitir evento compensatório (`OrderCanceled` após `OrderPlaced` errado).
- Consumers devem ser idempotentes e lidar com sequências de compensação.

### AI prompts

- Prompts versionados em git (sem exceção).
- **Rollback via feature flag** apontando para versão anterior do prompt — ver `@stacks/ai/harness-engineering`.
- **Pré-requisito:** eval pré-deploy reduz necessidade. Regressão de prompt deveria ser pega antes de chegar em produção.

### Secrets

Secrets não se "rolam back" — se rotacionam. Ver `@contracts/secrets`.

- **Em vazamento:** rotacionar imediato no Secret Manager + revogar credencial no provider (API key revoke, IAM key delete) + redeploy de tudo que consome.
- **Em deploy ruim que usou secret errado:** rollback do deploy resolve; secret em si não precisa rotacionar.

## Migrations e rollback

Migrations de schema dominam a viabilidade de rollback. Ver `@rules/migration` para regras de modelagem.

- **Expand-and-contract** é o padrão default. Permite rollback de código sem rollback de schema.
- **Breaking schema deploy** sempre via add+deprecate em múltiplas releases. Nunca em uma só.
- **Reverse migration scripts** mantidos quando viável (additive: trivial; destructive: praticamente impossível de reverter sem perda).
- **NUNCA** faça "drop column" se há chance de precisar rolar back o deploy do código. Dados perdidos não voltam por rollback.

Anti-padrão clássico: deploy adiciona coluna nova, código novo escreve nela, rollback do código tenta escrever em coluna velha que ainda existe — funciona. Inverso: deploy dropa coluna velha, rollback do código tenta escrever nela — quebra.

## Decisão entre rollback vs forward fix

| Cenário | Preferir |
|---|---|
| Bug recente, deploy fresh (< 1h), sem migration, feature flag não cobre | Rollback |
| Migration aplicada e dados novos incompatíveis com versão anterior | Forward fix |
| Schema mudou de forma breaking | Forward fix |
| Fix é trivial e testado | Forward fix |
| Causa raiz desconhecida e impacto alto | Rollback (mitiga primeiro) |
| Feature flag cobre o comportamento | Flag flip (preferido sobre ambos) |
| Bug em todas as versões recentes | Forward fix |

A pergunta operacional: **"Posso voltar para a versão X em < 5 min com confiança?"** Se sim, rollback. Se não, forward.

## Runbook de rollback

Sequência canônica durante incidente:

### 1. Decisão

- **Quem:** oncall + tech lead. Em incidente P1, oncall pode decidir sozinho.
- **Critério:** rollback ou forward fix segundo a matriz acima.
- **Tempo:** < 5 min desde detecção. Não debater — decidir.

### 2. Comunicar

- Abrir thread em `#incidents` no Slack com: o que está acontecendo, qual mitigação, ETA.
- Atualizar status page se impacto é externo.
- Avisar PM e sales se há impacto em clientes para customer comms.

### 3. Executar rollback

- Use o mecanismo atomic preferido para o componente (ver seção anterior).
- **Não** execute comandos `gcloud`/`firebase` ad hoc sem registrar no canal — audit trail é parte do incidente.
- Se houver múltiplos componentes a reverter, comece pelo que está causando o impacto observado.

### 4. Verificar saúde

- Smoke tests automáticos (`@processes/deploy`).
- Dashboards primários (`@processes/monitoring`).
- Métricas de erro, latência, throughput.
- Verificação manual do fluxo afetado quando viável.

### 5. Confirmar mitigação

- Error rate voltou ao baseline.
- p95 normalizou.
- Sem novos alertas relacionados.
- Comunicar mitigação no canal de incidente.

### 6. Postmortem

Agendado em até 48h. Ver `@rules/governance`. Estrutura:

- **Timeline:** detecção → decisão → mitigação → confirmação, com timestamps.
- **Root cause:** o que efetivamente quebrou.
- **Por que rollback foi necessário:** gap em testes? CI? eval? feature flag ausente? canário insuficiente?
- **Action items:** mudanças concretas com owner e prazo.
- **Sem blame:** culpa pessoa não é root cause. Sistema permitiu, sistema precisa mudar.

## Pré-requisitos para rollback funcionar

Rollback só existe se for testado e suportado pelo sistema. Mínimos:

- **Versão anterior conhecida boa, identificável por tag/release** — ver `@processes/release`.
- **Expand-and-contract em migrations** — ver `@rules/migration`.
- **Feature flags como mecanismo primário** para mudanças comportamentais.
- **Smoke tests pós-deploy automáticos** — ver `@processes/deploy`. Falha = rollback automático quando configurado.
- **Health checks expostos:** `/health/liveness` e `/health/readiness` em todo serviço — ver `@rules/observability`.
- **Audit log de deploys:** quem deployou o quê e quando. Vercel, Cloud Run e Firebase mantêm; conferir periodicamente.
- **Backups verificados periodicamente.** Backup nunca testado é backup que não existe.

## Testar rollback

Não descubra que o rollback não funciona durante o incidente.

- **Drill periódico (game day):** uma vez por trimestre, em staging, simular incidente e executar rollback completo end-to-end. Cronometrar.
- **Verificar boot da tag anterior:** garantir que a última release tagueada ainda boota com as configs atuais.
- **PITR restore drill:** executar restore em instância de DB staging ao menos uma vez por trimestre. Backups corrompidos são descobertos cedo, não tarde.
- **Documentar findings do drill:** runbook se mantém vivo apenas se for exercitado.

## Comunicação durante rollback

- **`#incidents` no Slack:** canal único de coordenação. Tudo registrado.
- **Status page:** atualizar se houver impacto externo perceptível. Update inicial em < 15 min após detecção.
- **Stakeholders internos:** PM e sales cientes para customer comms — não dependem de descobrir pelo Twitter.
- **Postmortem público:** apropriado para incidentes de segurança e outages prolongados afetando clientes pagantes. Decidir com PM/legal.

## Métricas DORA

Ver `@processes/release` para contexto completo.

- **MTTR (mean time to recover):** meta < 1h para P1. Medido do alerta até confirmação de mitigação.
- **Change failure rate:** percentual de deploys que requerem rollback ou hotfix dentro de 24h. Meta: < 15%.

Métricas tracked por release; revisitadas em retros.

## Anti-patterns

- **Rollback via "redeploy da versão anterior" sem mecanismo atomic.** Lento, propenso a erro, sujeito a regressão se o build mudou. Use o mecanismo nativo.
- **Sem tag em prod = sem ponto de rollback identificável.** "Qual era a versão anterior?" é pergunta que não pode existir durante incidente.
- **Migration destrutiva sem expand-and-contract.** Rollback impossível. Dados perdidos não voltam.
- **Sem feature flags.** Todo bug requer deploy revert. Cara, lento, blast radius alto.
- **Force-push em `main` para "remover" commit problemático.** Não desfaz mudanças em DB. Quebra histórico. Quebra checkouts de outros devs. Nunca.
- **"Vamos só corrigir forward" como default sem avaliar impacto.** Usuários sofrendo enquanto fix é debatido. Mitigar primeiro.
- **Postmortem culpando pessoa.** Foco vira defesa pessoal, não melhoria de sistema. Action items somem.
- **Sem comunicação durante incidente.** Clientes descobrem pelo Twitter. Suporte despreparado.
- **Drill de rollback ausente.** Descobrir que rollback não funciona durante o incidente é o pior cenário possível.
- **`gcloud`/`firebase` ad hoc sem audit trail.** Ninguém sabe o que foi feito. Postmortem fica cego.
- **Rollback que afeta usuários não impactados.** Blast radius do rollback maior que o do bug. Feature flag teria isolado.
- **Skip de postmortem ("não foi tão grave").** Aprendizado perdido. Mesma falha volta.
- **Não atualizar runbook após incidente.** Mesma improvisação na próxima vez.
- **Backups sem teste de restore.** Descobrir corrupção durante incidente.
- **PITR habilitado mas ninguém sabe como usar.** Capacidade existe no papel, não na prática.

## Referências cruzadas

- `@processes/deploy` — smoke tests, health checks, canário.
- `@processes/release` — tagging, versionamento, MTTR/CFR.
- `@processes/monitoring` — thresholds de erro e latência, SLO burn rate.
- `@processes/environments` — paridade entre staging e prod para drills.
- `@rules/migration` — expand-and-contract, forward-only, reverse migrations.
- `@rules/governance` — feature flags, postmortems blameless.
- `@rules/observability` — health endpoints, métricas, audit log.
- `@rules/security` — incidentes de vazamento, rotação de secrets.
- `@stacks/frontend/next@16` — rollback no Vercel e App Hosting.
- `@stacks/backend/firebase-functions` — rollback granular de functions.
- `@stacks/database/postgres` — PITR, migrations.
- `@stacks/database/firebase-firestore` — PITR, security rules versionadas.
- `@stacks/ai/harness-engineering` — kill-switch, prompt rollback.
- `@contracts/firebase-firestore` — soft-delete, recovery.
- `@contracts/pgvector` — imutabilidade, expand-and-contract.
- `@contracts/events` — eventos compensatórios.
- `@contracts/secrets` — rotação, revogação.
