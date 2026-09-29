# Chat opera contra o schema real do cliente (G5) — Design

> **Status:** aprovado para plano. Sub-projeto **3 de 3** da reconciliação chat ↔ camada
> semântica. Depende da fundação (PR #19) e do G4 (PR #20).

## Contexto

O prompt do canvas-orchestrator injeta DOIS schemas:
- `buildSchemaContext()` (`src/shared/config/agents/shared-context.ts`) — schema **hardcoded**
  (colunas físicas tipo `saldo_devedor`, `data_base_report`) contra o qual o LLM escreve SQL;
- a seção de contrato do cliente (`renderDataContractSection` via `renderSemanticContextSections`)
  — lista entidades/atributos (`entity.attr` + tipo), mas **sem as colunas físicas bound**.

O `execute_sql` do sub-agente roda SQL **literal** na hora (para obter os dados do bloco), então
o chat precisa das **colunas físicas reais** do cliente. Hoje ele usa as colunas hardcoded
(schema da OM); para um cliente cujas colunas diferem (BRZ), o SQL sai inválido/errado — o gap
G5 da auditoria ("chat gera SQL cru contra schema BigQuery hardcoded, ignorando schemaBindings").

As colunas reais vivem em `clients/{id}.productBindings[].datasets[].schemaBindings`
(`entity.attr → coluna`), a mesma fonte que `resolveColumn` usa.

Decisões do usuário nesta rodada:
- **Substituir** o schema hardcoded pelo do cliente quando há contrato (não manter os dois — ter
  ambos confunde o LLM sobre quais colunas usar).
- **Sem clientes legado** e **só a BRZ importa** (os demais são dados de teste) ⇒ **sem**
  portabilidade cross-client (templatização) e **sem** fallback de migração nesta spec.

Referências: ADR-0015 (camada semântica), ADR-0006 (multi-tenant), auditoria
`docs/auditoria-arquitetura-camada-semantica.md` (G5; G7 fica para depois).

## Arquitetura — surfaçar as colunas reais no prompt

Três mudanças, todas no caminho de montagem do contexto/prompt:

### 1. `getClientSemanticContext` anexa a coluna física por atributo
`src/shared/repositories/client-semantic-context.ts` já carrega `clients/{id}.productBindings`.
Passa a ler `datasets[].contractRef` + `datasets[].schemaBindings` e anexar, por atributo, a
coluna bound:
```ts
attributes: Array<{ attributeId: string; type?: string; description?: string; column?: string | null }>
```
`column` = `schemaBindings['${entityId}.${attributeId}']` do dataset cujo `contractRef === contractId`.
Atributo sem binding (ou mapeado para `null`) ⇒ `column: null`.

### 2. `renderDataContractSection` rende a coluna física
`src/shared/config/agents/shared-context.ts`. Para cada atributo COM `column`, renderiza a coluna
real; atributos SEM `column` são **omitidos** (o chat não deve inventar coluna):
```
### Contrato `liquid-play` (entidade `contratos`)
- saldo_devedor → coluna `vl_saldo_dev` (float)
- data_base_report → coluna `dt_base` (date)
```
O texto-guia da seção muda para: "Escreva SQL usando EXATAMENTE estas colunas físicas."

### 3. `buildCanvasOrchestratorPrompt` substitui o hardcoded quando há schema do cliente
`src/shared/config/agents/canvas-orchestrator.ts`. Helper `hasClientSchema(sc)` = o
`semanticContext` traz ≥1 atributo com `column`. Quando true: **omite** `buildSchemaContext()`
(hardcoded) e usa só a seção do cliente. Quando false (cenário de teste, sem contrato/colunas):
mantém `buildSchemaContext()` (comportamento atual, sem regressão). O mesmo gate ajusta o trecho
de `SQL_RULES` para reforçar "use as colunas do contrato do cliente acima".

## Error handling

- Cliente sem contrato/bindings ⇒ `hasClientSchema` false ⇒ fallback ao schema hardcoded.
- Atributo sem coluna bound ⇒ omitido da seção do cliente (não vira coluna inventada).
- `getClientSemanticContext` permanece best-effort (try/catch já existente); falha ao ler binding
  de um dataset ⇒ atributos daquele contrato ficam sem `column` (degradam para omitidos).

## Testes (TDD)

- **`getClientSemanticContext`**: anexa `column` do `schemaBindings` por atributo (mock Firestore
  com client doc + dataset bindings); `null` quando o attr não tem binding.
- **`renderDataContractSection`**: renderiza a coluna física; **omite** atributos sem `column`.
- **`buildCanvasOrchestratorPrompt`**: com schema do cliente ⇒ NÃO contém o schema hardcoded
  (ex.: ausência de um marcador único do `buildSchemaContext`) e contém a coluna real; sem schema
  do cliente ⇒ contém o hardcoded (sem regressão).

## Não-objetivos (fora desta spec)

- **Portabilidade/templatização cross-client (B)** — YAGNI com um único cliente real (a métrica
  literal do G4 já resolve para a BRZ).
- **`get_table_schema` v2 / `expectedTables`** — alinhar a tool de schema ao binding é o **G7**,
  spec separada. (O prompt é a fonte autoritativa das colunas no G5.)
- Clientes legado / migração; unificar `EXPECTED_SCHEMA` (duplicação D1).
- **Popular os dados da BRZ** (contrato/entities/attributes/bindings) — é configuração, não código;
  o G5 entrega o mecanismo (o chat usa o que estiver bound).
