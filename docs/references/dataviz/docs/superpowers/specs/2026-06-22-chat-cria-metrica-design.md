# Chat materializa indicador como métrica do cliente (G4) — Design

> **Status:** aprovado para plano. Sub-projeto **2 de 3** da reconciliação chat ↔ camada
> semântica. Depende da fundação já mergeada (PR #19: `ownerClientId`,
> `generateUniqueMetricId`, permissão por dono, autorização de escopo no resolve).
> O sub-projeto **3 (G5 — recipes semânticos portáveis)** vem depois.

## Contexto

Hoje o chat (canvas-orchestrator) preenche blocos kpi/chart/table via `fillBlock`
(`src/features/canvas-orchestrator/lib/fill-block-fn.ts`): um sub-agente roda `execute_sql`
(SQL livre) e chama `submit_data` com os dados renderizados; `convertToBlock` monta o bloco
**sem `metricId`**. Ao reabrir o report, `useReportData` ignora blocos sem `metricId` e não
refaz fetch → o indicador **congela** e não responde a filtro/data-base (gap G4 da auditoria).

A infraestrutura de consumo já existe: blocos têm `metricId?`/`sparklineMetricId?` e
`useReportData` re-resolve qualquer bloco com `metricId` via `/api/metrics/[id]/data`. Falta
o chat **criar a métrica** e **vincular o `metricId`**.

Decisões do usuário nesta rodada:
- **Responsivo a filtros já no G4:** o SQL capturado tem os filtros (período, data-base,
  projetos) parametrizados como placeholders → re-resolve com os filtros atuais.
- **Auto ao preencher, com dedup por intent+cliente:** todo bloco preenchido vira métrica do
  cliente, reusando uma métrica equivalente quando já existe (via recall de blocos).

Referências: ADR-0015 (camada semântica), ADR-0011 (recall de blocos `embeddingsBlocks`),
auditoria `docs/auditoria-arquitetura-camada-semantica.md` (G4).

## Arquitetura — materializar no `fillBlock`

A materialização acontece **dentro de `fillBlock`**, server-side, logo após `submit_data`
ter sucesso. É o **único ponto onde o SQL existe** (nos `result.steps` das chamadas
`execute_sql`, campo `input.query`). Há precedente no mesmo arquivo: `persistBlockSpec`
(recall ADR-0011) já persiste o spec do bloco best-effort. Adiciona-se um passo
"materializar métrica" antes de retornar o bloco.

Fluxo:
1. Sub-agente roda `execute_sql` (1+ queries) + `submit_data` (dados renderizados).
2. Extrai o SQL do **último** `execute_sql` dos steps. Sem SQL (ex.: bloco `text`) ⇒ não materializa.
3. `parameterizeFilters(sql, ctx.filters)` → substitui os valores **literais** de
   período/data-base/projetos por placeholders `{filter.date_range}` / `{filter.projetos}`.
4. **Dedup:** o recall (`queryBlockEmbeddings`, já chamado no início do `fillBlock`) retorna,
   além do spec, o `metricId` associado (campo novo em `embeddingsBlocks`). Match de **alta
   similaridade** (≥ limiar) com `metricId` ⇒ **reusa** esse id (não cria duplicata). Senão, cria.
5. `createChatMetric(...)` monta uma `Metric` do cliente e persiste em `metrics/{id}`.
6. `persistBlockSpec` passa a gravar o `metricId` criado (alimenta o dedup futuro).
7. `block.metricId = id` no bloco retornado.

Best-effort: qualquer falha na materialização **não** quebra o preenchimento do bloco
(degrada para bloco estático), igual ao `persistBlockSpec` atual.

## Componentes (unidades pequenas e testáveis)

### `parameterizeFilters(sql: string, filters: ChatRequestFilters): string`
`src/shared/lib/metrics/parameterize-sql.ts`. Substitui os literais conhecidos de `filters`
no SQL por placeholders do recipe `sql`:
- `filters.dateRange.start`/`end` (e a data-base, que coincide com o `end`/snapshot) → o
  predicado de `data_base_report`/intervalo vira `{filter.date_range}`.
- `filters.projetos[]` → a cláusula de `projeto IN (...)` vira `{filter.projetos}`.
Implementação por substituição textual dos valores literais presentes em `filters` (não é um
parser SQL completo — YAGNI). Sem filtros ativos ⇒ retorna o SQL inalterado. Idempotente.

### `createChatMetric(opts) → Promise<{ metricId: string } | null>`
`src/shared/lib/metrics/create-chat-metric.ts`. Server-side.
```ts
interface CreateChatMetricOpts {
  db: FirebaseFirestore.Firestore;
  clientId: string;            // ownerClientId
  intent: string;              // vira label + base do id
  targetType: 'kpi' | 'chart' | 'table';
  sql: string;                 // SQL capturado (já parametrizado)
  routingRef: string | null;   // AttributeRef 3-part "contract.entity.attr" p/ rotear dataset;
                               // montado pelo caller de semanticContext.dataContracts[0]; null ⇒ não cria
  reuseMetricId?: string | null; // do dedup; se presente, retorna sem criar
}
```
- `reuseMetricId` presente ⇒ retorna `{ metricId: reuseMetricId }` (dedup).
- `routingRef` null ⇒ retorna `null` (cliente sem contrato semântico; ver §Limitações).
- Senão: `id = generateUniqueMetricId(db, domain, slug)` (domain/slug derivados do intent,
  sanitizados para identifier); persiste `metrics/{id}` com:
  - `ownerClientId: clientId`, `recipe: { kind: 'sql', template: sql }`,
  - `requires: [routingRef]` (usado **só para roteamento de dataset** no resolve),
  - `label`, `type: targetType`, `status: 'active'`, `version: '1.0.0'`,
    `createdAt/updatedAt: Timestamp.now()`.

O caller (em `fillBlock`) monta `routingRef` a partir de `ctx.semanticContext.dataContracts[0]`:
`${contractId}.${entities[0].entityId}.${entities[0].attributes[0].attributeId}`; ausente ⇒ null.

### Ajustes em pontos existentes
- **`fillBlock`** (`fill-block-fn.ts`): após `submitResult`, captura SQL → monta `routingRef`
  de `ctx.semanticContext` → `createChatMetric` → se retornar id, `block.metricId = id`.
- **`recall-store`** (`embeddingsBlocks`): `persistBlockSpec` aceita e grava `metricId?`;
  `queryBlockEmbeddings` retorna `metricId?` no match (para dedup).
- **Coverage G8:** pular `collectBindingGaps` quando `recipe.kind === 'sql'` (o resolveColumn
  não consome `requires` em recipes sql — checagem daria falso-positivo). Gate no
  `/api/metrics/[id]/data` (caminho single-contract).

## Forma da métrica e roteamento no resolve

- O `recipe.sql.template` mantém **tabela e colunas literais** (escopo do cliente). Só os
  filtros são placeholders. (Portar a tabela/colunas entre clientes = G5.)
- `requires[0]` carrega o `contractRef` do cliente apenas para o resolve escolher o dataset
  certo (verifyDatasetAccess + cliente BQ + projectId). O SQL literal já é fully-qualified, então
  não depende de `{entity}` substitution.
- A autorização de escopo (fundação, PR #19) garante que a métrica do cliente só resolve no
  contexto dele (`ownerClientId === body.clientId`).

## Error handling

- Bloco sem `execute_sql` (ex.: `text`) ⇒ não materializa; bloco normal sem `metricId`.
- `routingRef` ausente (cliente legado/não-migrado, sem `semanticContext`) ⇒ não materializa + `console.warn`.
- Falha de persistência ⇒ best-effort: loga e retorna o bloco sem `metricId` (não quebra o chat).
- Recipe `sql` no resolve: coverage G8 pulado; demais validações inalteradas.

## Testes (TDD)

- **`parameterizeFilters`**: troca período/projetos literais por `{filter.*}`; sem filtros ⇒
  no-op; idempotente (rodar 2x não duplica placeholder).
- **`createChatMetric`**: monta Metric do cliente (ownerClientId, recipe sql, requires roteável)
  com id único (mock Firestore); `reuseMetricId` ⇒ retorna sem persistir; `contractRef` null ⇒
  retorna null sem persistir.
- **`fillBlock`** (foco): bloco recebe `metricId` quando há SQL + contrato; cliente sem
  contrato ⇒ sem `metricId` (warn); falha de `createChatMetric` ⇒ bloco ainda retornado.
- **Coverage gate**: métrica `sql` no `/api/metrics/[id]/data` não dispara 422 de coverage.

## Não-objetivos (sub-projeto 3 / depois)

- **G5** — recipes semânticos portáveis (`aggregation`/`derived` em entity.attr; templatizar
  tabela/colunas para re-resolver em qualquer cliente).
- Materializar métrica para clientes legados/não-migrados.
- Admin UI de promoção/edição/listagem por dono (já desbloqueada pela fundação).
- Parser SQL completo para parametrização (usa substituição textual dos literais conhecidos).
