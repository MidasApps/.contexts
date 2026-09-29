---
title: Regras de Migração
type: rules
scope: engineering
status: active
last_updated: 2026-05-20
related:
  - "@.contexts/engineering/rules/data-modeling.md"
  - "@.contexts/engineering/rules/validation.md"
  - "@.contexts/engineering/rules/security.md"
  - "@.contexts/engineering/rules/testing.md"
  - "@.contexts/engineering/rules/observability.md"
  - "@.contexts/engineering/contracts/postgres.md"
  - "@.contexts/engineering/contracts/firebase-firestore.md"
  - "@.contexts/engineering/contracts/bigquery.md"
  - "@.contexts/engineering/processes/deploy.md"
  - "@.contexts/engineering/processes/release.md"
---

# Regras de Migração

Regras imperativas e agnósticas de tecnologia sobre como conduzir migrações de schema (DDL) e de dados (backfill) com segurança, idempotência e zero-downtime. Cobrem expand-and-contract, lock-free DDL, índices concorrentes, batching, dual-write/dual-read, feature flags como gates, ordem de deploy, reversibilidade, migrações de Firestore sem ferramenta nativa, dados sensíveis, testes, runbook e versionamento. Para como modelar os dados que serão migrados, ver `@.contexts/engineering/rules/data-modeling.md`. Para convenções específicas de schema por banco, ver os documentos em Contracts. Para o fluxo de deploy e release que orquestra migrações, ver `@.contexts/engineering/processes/deploy.md` e `@.contexts/engineering/processes/release.md`.

## Escopo

Aplica-se a toda alteração de schema persistido (DDL em PostgreSQL, mudança estrutural em coleções Firestore, alteração de tabelas BigQuery) e a toda movimentação ou transformação de dados existentes em produção (backfill, renomeação, splitting, merging, denormalização, redação de PII). Cobre tanto migrações conduzidas por ferramenta de migration (Postgres) quanto scripts ad-hoc idempotentes (Firestore). Não cobre seed de dados de desenvolvimento, ETL recorrente de pipelines de dados, nem mudanças de código que não tocam estado persistido.

---

## 1. Princípio fundamental: expand-and-contract

- **Sempre** trate qualquer migração não-trivial como uma sequência de fases — nunca como uma única operação atômica.
- **Sempre** siga a sequência expand → migrate → contract: primeiro adicione o novo (expand), depois mova os dados e o tráfego (migrate), por fim remova o antigo (contract).
- **Nunca** renomeie, remova ou altere tipo de coluna/campo em uma única release. Isso é breaking change disfarçado.
- **Sempre** mantenha o sistema funcional em qualquer ponto entre fases. Se a release intermediária quebrar, a estratégia está errada.
- **Nunca** combine expand e contract no mesmo deploy. O contract só ocorre depois que todo tráfego antigo cessou e a observação confirmou isso.
- **Sempre** espere ao menos uma release completa entre expand e contract, mesmo quando parece seguro encurtar.
- **Nunca** assuma que "ninguém mais lê o campo antigo". Verifique com logs, métricas ou queries, não com memória.

## 2. Ordem de deploy entre código e schema

- **Sempre** faça mudanças de schema aditivas (adicionar coluna nullable, adicionar índice, adicionar tabela) **antes** do deploy do código que as usa.
- **Sempre** faça mudanças de schema destrutivas (drop column, drop table, drop index) **depois** do deploy do código que parou de usá-las.
- **Nunca** faça um deploy de código que falhará se o schema antigo ainda estiver vigente — isso é mandatory ordering invisível para o operador.
- **Sempre** desenhe o código para tolerar tanto o schema velho quanto o novo durante a janela de transição.
- **Nunca** dispare migrations de schema no boot da aplicação (`startup migration`). Migrações são passo explícito do pipeline de release, não efeito colateral de startup.
- **Sempre** rode migrations como job dedicado e auditável no pipeline, com log persistido e exit code verificado.

## 3. Idempotência

- **Sempre** escreva toda migration para ser idempotente. Rodar duas vezes precisa produzir o mesmo estado final, sem erro.
- **Sempre** use `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DROP ... IF EXISTS` em DDL Postgres.
- **Nunca** confie apenas no controle de versão da ferramenta de migration para impedir re-execução. A própria migration precisa ser segura sob retry.
- **Sempre** escreva backfills com critério de filtro que exclua linhas já processadas (`WHERE new_column IS NULL`, marker doc, checkpoint).
- **Nunca** use `UPDATE ... SET x = expr` sem `WHERE` que limite o conjunto a processar. Backfill sem filtro é incident waiting to happen.
- **Sempre** persista progresso de backfill (checkpoint, marker, last_processed_id) para permitir retomada após falha.
- **Nunca** assuma que o backfill rodará até o fim sem interrupção. Trate interrupção como o caso esperado.

## 4. Reversibilidade

- **Sempre** escreva migration up e migration down quando o sistema de migration suportar e a operação for tecnicamente reversível.
- **Sempre** declare explicitamente quando uma migration é irreversível (ex: drop de coluna com dados, normalização destrutiva) e documente o motivo no header do arquivo.
- **Nunca** apague dados sem ter uma cópia recuperável (snapshot, dump, partição arquivada) cuja existência foi verificada antes da migration rodar.
- **Sempre** prefira soft-archive (marcar como obsoleto, mover para tabela `_archived_`) antes de delete físico durante janela de observação.
- **Nunca** trate rollback de migration como rollback de deploy. Reverter código é segundos; reverter schema com dados perdidos é incident.
- **Sempre** documente o plano de rollback no runbook, mesmo que o plano seja "não há rollback automático, recuperar do snapshot X".

## 5. Lock e disponibilidade em Postgres

- **Sempre** crie índices em produção com `CREATE INDEX CONCURRENTLY`. `CREATE INDEX` normal bloqueia writes na tabela.
- **Nunca** rode `CREATE INDEX CONCURRENTLY` dentro de uma transação. A ferramenta de migration precisa permitir migration não-transacional para esse passo.
- **Sempre** rode `DROP INDEX CONCURRENTLY` para remover índices em tabelas grandes.
- **Nunca** adicione coluna `NOT NULL` com `DEFAULT` constante em tabela grande sem usar a estratégia em três passos: adicionar nullable, backfill em batches, aplicar constraint.
- **Sempre** aplique `NOT NULL` via `ADD CONSTRAINT ... NOT VALID` seguido de `VALIDATE CONSTRAINT` em tabelas grandes. Isso evita full table scan sob lock exclusivo.
- **Nunca** altere tipo de coluna em tabela grande com `ALTER COLUMN TYPE` direto. Use coluna nova, backfill, swap, drop.
- **Sempre** estabeleça `lock_timeout` e `statement_timeout` curtos no início de migrations DDL para falhar rápido em vez de bloquear writes em cascata.
- **Nunca** rode `VACUUM FULL`, `REINDEX TABLE` sem `CONCURRENTLY`, ou `CLUSTER` em produção sem janela acordada — todos travam a tabela.

## 6. Backfill em batches

- **Sempre** processe backfills em batches limitados (tipicamente 1.000 a 10.000 linhas por batch), nunca em uma única transação gigante.
- **Sempre** comite cada batch antes de processar o próximo. Transações longas inflam WAL e bloqueiam autovacuum.
- **Sempre** intercale pausas curtas (sleep de centenas de ms) entre batches em produção, para ceder I/O e evitar replication lag.
- **Nunca** rode backfill sem observar carga do banco (CPU, replication lag, lock waits). Pare e ajuste batch size se algum sinal sair do baseline.
- **Sempre** torne o batch size configurável via flag ou variável, não hardcoded. Operadores precisam ajustar em tempo de execução.
- **Nunca** rode mais de um backfill pesado em paralelo na mesma tabela sem coordenação explícita. Eles competem por lock e WAL.

## 7. Dual-write e dual-read

- **Sempre** durante migrações de splitting, merging ou renomeação de campo, opere em modo dual-write: o código escreve em ambos os locais (velho e novo) durante a janela de transição.
- **Sempre** inicie a transição em modo dual-write com leitura ainda do campo velho, valide consistência, então migre leitura para o novo.
- **Nunca** corte a leitura do velho antes de ter cobertura completa de escrita dupla mais backfill dos registros pré-existentes.
- **Sempre** instrumente discrepâncias entre velho e novo durante dual-write (log ou métrica de divergência). Discrepância silenciosa é a falha mais comum em migrações.
- **Nunca** mantenha dual-write indefinidamente. Defina prazo máximo no plano de migração — dual-write esquecido vira fonte de bug.
- **Sempre** remova o write no velho **antes** de remover a coluna velha. Drop com write ativo gera erro em produção.

## 8. Feature flags como gates de migração

- **Sempre** controle o corte de leitura entre velho e novo via feature flag, não via deploy.
- **Sempre** permita rollback do corte de leitura por flag em segundos, sem novo deploy.
- **Nunca** acople a habilitação de uma feature de produto a uma migration ainda em backfill. Feature flag de produto e gate de migração são variáveis diferentes, mesmo quando se referem à mesma mudança.
- **Sempre** documente no runbook qual flag controla qual fase e qual é o estado seguro de cada flag se algo der errado.
- **Nunca** deixe flags de migração permanentes no código depois que o contract termina. Remova a flag junto com o caminho velho.

## 9. Migrações em Firestore

- **Sempre** trate migrações de Firestore como scripts idempotentes versionados em `infra/migrations/firestore/` (ou diretório equivalente do projeto), não como ad-hoc no console.
- **Nunca** rode mutação em massa no Firestore via console ou shell interativo em produção. Sempre via script auditável, com log persistido.
- **Sempre** use `BulkWriter` ou batched writes (até 500 ops por batch) em scripts de migração Firestore, com retry exponencial.
- **Sempre** persista um marker doc (ex: `_migrations/<migration-id>`) que registra início, progresso (last processed cursor) e conclusão. Sem marker, retomada após falha é impossível.
- **Nunca** dependa de `collectionGroup` query para descobrir o conjunto a migrar se o conjunto ultrapassa o limite prático de leitura. Use cursor paginado salvo no marker.
- **Sempre** desenhe scripts Firestore para tolerar documentos já no novo formato (idempotência por inspeção do estado atual antes de escrever).
- **Nunca** delete coleção inteira via script de migração sem confirmação interativa e dry-run prévio. Firestore não tem `TRUNCATE` reversível.
- **Sempre** considere uso de Cloud Tasks ou jobs distribuídos para migrações Firestore grandes, em vez de processo único.

## 10. Migrações em BigQuery

- **Sempre** versione schemas BigQuery (DDL declarativo em arquivo) e aplique alterações via pipeline, não via console.
- **Sempre** prefira criar tabela nova com schema corrigido e `CREATE TABLE AS SELECT` a alterar tabela existente em mudanças não-aditivas.
- **Nunca** `DROP COLUMN` em tabela particionada sem entender o custo: BigQuery suporta, mas reprocessa partições.
- **Sempre** rode `CREATE OR REPLACE TABLE` apenas com backup explícito (snapshot ou cópia para dataset de arquivamento) feito antes.
- **Nunca** misture transformação de dados pesada com migração de schema na mesma operação BigQuery. Separe DDL de DML.

## 11. Dados sensíveis e PII

- **Sempre** trate migração que envolve PII como mudança de superfície de risco. O runbook precisa listar quais campos sensíveis tocam quais ambientes.
- **Nunca** copie PII para tabelas de staging, snapshots de teste, ou exports sem que esses destinos tenham os mesmos controles de acesso do destino original. Ver `@.contexts/engineering/rules/security.md`.
- **Sempre** redija/mascare PII antes de mover dados para ambiente não-produtivo, mesmo para fins de validação da migration.
- **Nunca** logue valores de PII durante backfill, mesmo em erro. Log apenas identificador opaco e contador.
- **Sempre** valide retenção: se a migration altera onde PII vive, confirme que a política de retenção do destino é igual ou mais restritiva.

## 12. Testes de migração

- **Sempre** teste migration up em base de dados representativa antes de produção — preferencialmente snapshot recente de produção restaurado em staging.
- **Sempre** teste migration down (se existir) na mesma base, na sequência up → down → up, e verifique estado idêntico.
- **Nunca** confie em migration testada apenas contra base vazia ou de seed. Volume e distribuição de dados reais mudam comportamento.
- **Sempre** meça duração da migration em staging com volume comparável a produção. Se demora hora em staging, demorará mais em prod.
- **Sempre** escreva teste automatizado que executa o pacote completo de migrations em base limpa e valida que o schema final bate com o esperado.
- **Nunca** marque migration como pronta para produção sem dry-run em staging com plano de rollback executado pelo menos uma vez.

## 13. Versionamento de migrations

- **Sempre** versione migrations com identificador monotônico (timestamp ou sequência) e nome descritivo em kebab-case: `20260520T1430-add-organization-id-to-users.sql`.
- **Nunca** edite uma migration já aplicada em qualquer ambiente. Migrations são append-only. Correção é nova migration.
- **Nunca** reordene migrations já mergeadas. A ordem aplicada em produção é a ordem persistida.
- **Sempre** trate o histórico de migrations como contrato com produção. Drift entre o que está no repo e o que está aplicado é incident de auditabilidade.
- **Sempre** registre no controle de migrations qual versão de código corresponde a cada migration, para correlacionar com deploys.
- **Nunca** delete arquivos de migration antigos para "limpar" o repositório. O histórico completo é necessário para reproduzir o schema em ambiente novo.

## 14. Runbook obrigatório

- **Sempre** acompanhe migração não-trivial de um runbook escrito antes da execução, contendo: objetivo, fases, comandos exatos, critério de sucesso de cada fase, plano de rollback, contato responsável.
- **Sempre** declare no runbook a janela esperada de duração e o threshold acima do qual a operação é abortada.
- **Nunca** execute migração crítica fora do horário acordado com o time de produto e sem alguém disponível para responder.
- **Sempre** registre o que de fato ocorreu durante a execução (timestamps, batches processados, anomalias) — preferencialmente no próprio runbook, junto à versão planejada.
- **Nunca** declare migração "concluída" sem confirmação observacional: queries de contagem batem, métrica de aplicação está saudável, sem erros novos no log. Ver `@.contexts/engineering/rules/observability.md`.

## 15. Observabilidade durante a migração

- **Sempre** instrumente a migration para emitir métricas: linhas processadas, batches concluídos, erros, duração por batch. Sem isso, dry-run não tem como ser comparado a produção.
- **Sempre** monitore métricas do banco durante migração: lock waits, replication lag, conexões ativas, I/O. Defina limiares de abort.
- **Nunca** rode migração de longa duração sem alerta acionável caso ela pare de progredir (heartbeat de batch).
- **Sempre** correlacione log da aplicação com log da migration por identificador comum (migration_id) para diagnosticar incidentes em janela de transição.

## 16. Anti-patterns proibidos

- **Nunca** rode migration no boot da aplicação em containers que escalam horizontalmente. Múltiplas instâncias tentando aplicar a mesma migration simultaneamente é fonte clássica de corrupção.
- **Nunca** trate "ORM `synchronize: true`" ou equivalente como mecanismo de migração em produção. Isso é ferramenta de desenvolvimento, nunca de release.
- **Nunca** aplique migration manualmente em produção bypassando o pipeline. Toda alteração de schema passa pelo mesmo processo auditável.
- **Nunca** crie tabela ou coleção "temporária" em produção sem prazo de remoção registrado. Temporário em produção vira permanente.
- **Nunca** use `TRUNCATE` em tabela de produção como passo de migration sem aprovação explícita e backup verificado.
- **Nunca** rode migration que depende de timezone do servidor, locale, ou variável de ambiente não declarada no runbook. Reprodutibilidade exige determinismo.
- **Nunca** assuma que uma migration que funcionou em staging "vai funcionar igual" em produção. Volume, concorrência e dados reais sempre revelam o que staging escondeu.
