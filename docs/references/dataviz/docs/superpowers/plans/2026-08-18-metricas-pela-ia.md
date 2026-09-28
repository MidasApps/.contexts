# A IA cria métrica — plano de implementação

> **Superado em parte.** A política de alteração descrita aqui ("na dúvida,
> variante") foi revista no mesmo dia: correção passa a valer para todas as
> páginas, com intenção declarada, histórico e desfazer. Ver **ADR-0024** — em
> caso de divergência, a ADR vence.

**Pergunta que originou:** "Mas a IA não cria métricas? Ela não pode editar
também? Editar métricas sem impactar outros relatórios que usam, caso sim, cria
nova métrica e variada?"

**Objetivo:** dar ao supervisor de `/api/chat` a capacidade de **criar** métrica
no catálogo do cliente e de **alterar** métrica sem quebrar quem já a usa —
criando variante quando a alteração seria compartilhada.

---

## O que já existe (verificado no código)

| Fato | Onde |
|---|---|
| Não existe tool de métrica para nenhum agente | `authoring-tools.ts`, `DEFAULT_AGENT_TOOLS` |
| `createChatMetric` materializa métrica de SQL de LLM, valida com `MetricDoc` antes do `set()` — **zero chamadores em produção** | `src/shared/lib/metrics/create-chat-metric.ts` |
| Execução de métrica de cliente já é suportada de ponta a ponta: `ownerClientId` ≠ cliente ⇒ 403; gate de rota `/g`; `maximumBytesBilled` citando explicitamente SQL de LLM | `execute-metric.ts:138`, `metric-route-map.ts`, `execute-metric.ts:250` |
| As 64 métricas `covenants.*` são **globais** (`ownerClientId ?? null`) | `scripts/seed-covenants-v2-metrics.mjs:172`, `scripts/metrics/covenants-v2.mjs` |
| `authorizeMetricWrite` já proíbe não-admin de escrever métrica global | `authorize-metric.ts` |
| Guardrail de SQL de LLM, normalizando comentário/literal antes da denylist | `src/features/ai-agents/lib/sql-guard.ts` |
| Catálogo que a IA enxerga vem de `product.metricRefs` — métrica de cliente **não** aparece | `client-semantic-context.ts:180-210` |
| Bloco com `metricId` fora do catálogo é recusado pela tool | `metric-guard.ts` |
| Convenções de coluna por forma (`scalar` ⇒ `value`; `timeseries` ⇒ `bucket,value`…) | `shared-context.ts` (LEGENDA_DE_FORMAS), `covenants-v2.mjs` §7 |

## Decisões

1. **Criar é sempre métrica NOVA**, `chat.<slug>`, `ownerClientId = cliente`.
   Nunca se edita métrica global: ela é catálogo da Liquid, compartilhado por
   todos os clientes.
2. **Alterar decide sozinho entre editar e variar**, e conta o uso real:
   - métrica não é do cliente ⇒ **variante**;
   - métrica é do cliente mas está em outra página ⇒ **variante**;
   - métrica é do cliente e só a página aberta usa ⇒ **edita no lugar**.
   O resultado da tool devolve onde a métrica é usada, para o assistente contar
   ao usuário o que fez e por quê.
3. **Nada é gravado sem provar que roda.** Antes do `set()`, o template é
   resolvido contra o binding real do cliente e validado por **dry-run** no
   BigQuery (custo zero, nenhuma escrita). O dry-run devolve o schema — é dele
   que sai `outputColumns`, em vez de o modelo declarar de memória.
4. **Template só fala a língua do contrato.** `{entidade}` e
   `{entidade.atributo}`; tabela literal (crase, `projeto.dataset.tabela`) é
   recusada — hardcodar dataset num doc de métrica fura o isolamento de tenant
   que o binding garante.
5. **Forma e colunas têm de casar** com a régua que os blocos usam, senão o
   bloco monta e renderiza vazio. Verificado contra o schema do dry-run.
6. **BigQuery permanece somente leitura.** `SELECT`/`WITH`, comando único,
   denylist de DML/DDL/EXPORT, e dry-run em vez de execução. Nada é criado ou
   alterado lá — a métrica é documento Firestore.

## Arquivos

**Novos** — `src/features/ai-agents/tools/metrics/`
- `guard-metric-template.ts` — `guardGeneratedSql` + recusa de tabela literal.
- `colunas-por-forma.ts` — casa `shape` × colunas devolvidas pelo dry-run.
- `valida-rascunho.ts` — monta o `MetricDoc` candidato, resolve e dry-runa.
- `usos-da-metrica.ts` — varre `clients/{id}/groups/*/reports/*` e diz quem usa.
- `create-metric.ts`, `update-metric.ts` — as duas tools.
- `list-metric-fields.ts` — entidades/atributos do contrato, sob demanda (não
  no prompt: 113 atributos custariam ~10% do prompt em todo turno).
- testes ao lado de cada um.

**Modificados**
- `create-chat-metric.ts` — vira o único persistidor (`persistChatMetric`), com
  `shape`/`outputColumns`. Não tinha chamador em produção; sua API era do fluxo
  morto de fill-block. Teste reescrito junto.
- `execute-metric.ts` — `dryRun?: boolean` em `ExecuteMetricArgs`. Reaproveita
  posse, rota, acesso ao dataset, escolha de binding e resolve; troca
  `bq.query` por `createQueryJob({ dryRun: true })`.
- `client-semantic-context.ts` — soma as métricas com `ownerClientId == cliente`
  às vindas de produto (dedupe, pula `deprecated`). Sem isso a métrica criada
  some do catálogo no turno seguinte.
- `agents/types.ts` + `app/api/chat/route.ts` — `userEmail` (server-bound, para
  o gate de dataset no dry-run) e `activeReportId` (derivado de `body.page`).
- `authoring-tools.ts` — registra as 3 tools, thread do catálogo mutável e a
  seção de prompt "Criar métrica".
- `build-supervisor-agent.ts` — repassa `userEmail`, `activeReportId`,
  `semanticContext`.

## Catálogo mutável no turno

`buildAuthoringTools` recebe hoje `metricIds` (array) e o compartilha com as 32
tools de bloco; `rejeitaMetricaDesconhecida` faz `catalogo.includes(id)`. A
métrica criada no meio do turno seria recusada pelo `add_kpi_block` seguinte.
Solução: `create_metric` recebe um `registraMetrica(id)` que dá `push` **no
mesmo array** — nenhuma das 32 tools muda.

⚠️ Só registra quando o catálogo existe. Com `semanticContext` ausente o
catálogo é `undefined` e a guarda é soft; criar um array de 1 item ligaria a
guarda e passaria a recusar todas as métricas reais.

## Tarefas

1. `guard-metric-template.ts` + teste (SELECT-only, tabela literal, CTE, UNNEST).
2. `colunas-por-forma.ts` + teste (uma linha por forma).
3. `dryRun` em `execute-metric.ts` + teste.
4. `persistChatMetric` (reescrita de `create-chat-metric.ts`) + teste.
5. `valida-rascunho.ts` + teste (junta 1–4).
6. `usos-da-metrica.ts` + teste.
7. `list_metric_fields` + teste.
8. `create_metric` + teste.
9. `update_metric` + teste (global ⇒ variante; usada fora ⇒ variante; só aqui ⇒ edita).
10. Catálogo mutável + `userEmail`/`activeReportId` no ctx + fiação no supervisor.
11. `client-semantic-context`: métricas do dono + teste.
12. Seção de prompt "Criar métrica" (convenções de coluna, filtros, placeholders).
13. Suíte completa + typecheck.

## Fora de escopo

- Promover métrica de chat a global (é do admin — `authorizeMetricWrite`).
- Apagar métrica pela IA.
- Recipe `aggregation`/`derived` gerada pela IA — só `sql`, que é o que o
  catálogo real usa.
- UI de administração das métricas criadas (a admin já lista `metrics/`).
