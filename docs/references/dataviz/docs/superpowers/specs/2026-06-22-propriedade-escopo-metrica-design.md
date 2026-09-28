# Propriedade/Escopo de Métrica — Design (fundação do chat semântico)

> **Status:** aprovado para plano. Sub-projeto **1 de 3** da reconciliação chat ↔ camada
> semântica (G4+G5 da auditoria). Os sub-projetos 2 (chat cria métrica — G4) e 3 (tools
> semânticas — G5) dependem desta fundação e terão specs próprias.

## Contexto

Hoje `metrics/{id}` é uma coleção plana e **toda** escrita é `admin-only` (`isAdminEmail`),
ou seja, todas as métricas são de fato "de sistema". O produto precisa de dois donos:

- **Métrica de sistema (Liquid):** global, compartilhada com todos os clientes; só a Liquid
  edita/exclui. Re-resolve em cada cliente via `schemaBindings` (ADR-0015).
- **Métrica de cliente (ex.: BRZ cria no chat):** pertence àquele cliente; ele cria, edita e
  exclui. A Liquid pode **promover** uma métrica de cliente a global ("liberar para todos").

Esta spec entrega **apenas o modelo de dados + API + permissões** desse conceito de dono.
A criação pelo chat (G4) e a resolução semântica das tools (G5) consomem esta base depois.

Referências: ADR-0015 (camada semântica), ADR-0006 (isolamento multi-tenant), auditoria
`docs/auditoria-arquitetura-camada-semantica.md` (G1 permissões no servidor, G4/G5 chat).

## Decisão de arquitetura — coleção única + `ownerClientId`

Avaliadas duas formas de guardar métricas de cliente:

1. **Subcoleção `clients/{clientId}/metrics/{id}`** (global em `metrics/{id}`). Isolamento
   natural e sem colisão de slug, mas **promover a global exige mover o doc e reescrever
   todas as referências** (`block.metricId` espalhado em reports) → quebra referências.
2. **Coleção única `metrics/{id}` + campo `ownerClientId`** ← **escolhida**. Promover = flip
   de um campo (`ownerClientId: "brz" → null`), **id estável, zero referência quebrada**.
   Lookup de resolução continua sendo 1 leitura.

O requisito de **promoção** (explicitado pelo usuário) é o fator decisivo: a opção 2 torna a
promoção trivial. O ponto fraco da opção 2 — colisão de slug — é resolvido gerando ids
únicos para métricas de cliente **sem** codificar o dono no id (ver §Modelo de dados).

## Modelo de dados

`MetricDoc` (`src/shared/schemas/metric.ts`) ganha um campo:

```ts
/**
 * Dono da métrica. `null` ⇒ global/sistema (Liquid): compartilhada com todos
 * os clientes, CRUD só por admin. String (Slug do clientId) ⇒ métrica daquele
 * cliente: CRUD pelo dono ou admin. Promoção a global = setar para `null`.
 */
ownerClientId: Slug.nullable().default(null),
```

- **Default `null`** ⇒ docs existentes (sem o campo) são lidos como globais. **Sem migração de dados.**
- **Coleção única** `metrics/{id}`. O `MetricId` (`domain.slug`) permanece inalterado.
- **Id estável e independente do dono.** Métricas globais usam id curado (`pdd.total`).
  Métricas de cliente geram um id `domain.slug` único: deriva de `domain.slug` a partir do
  label/intent e, se já existir em `metrics/`, sufixa (`_2`, `_3`, …) até ser único. O id
  **nunca** codifica `ownerClientId`, por isso a promoção (flip do campo) não muda o id e as
  referências (`block.metricId`) seguem válidas. A geração do id é responsabilidade de quem
  cria (esta spec expõe o helper; o chat/Admin UI usam depois).

Helper novo (`src/shared/lib/metrics/metric-id.ts`):

```ts
/** Gera um MetricId `domain.slug` único em `metrics/`, sufixando em colisão. */
export async function generateUniqueMetricId(
  db: FirebaseFirestore.Firestore,
  domain: string,
  slug: string,
): Promise<string>
```

## Permissões (servidor)

Encerra o `admin-only` cego de `POST`/`DELETE` em `/api/metrics`, substituindo por checagem
por dono. Reusa `verifyClientAccess(email, clientId)` de `src/shared/lib/api-auth.ts`
(admin ⇒ sempre permitido).

| Ação | Global (`ownerClientId=null`) | De cliente (`ownerClientId=X`) |
|---|---|---|
| Listar | qualquer autenticado | dono de X (ou admin) |
| Criar / editar / excluir | **admin** | acesso ao cliente X **ou** admin |
| Promover → global | — | **admin** (flip `X→null`) |
| Resolver dados | qualquer autenticado | `clientId` da requisição === X (ou admin) |

Regra de autorização central (helper testável, `src/shared/lib/metrics/authorize-metric.ts`):

```ts
export type MetricWriteIntent = 'create' | 'update' | 'delete' | 'promote';

/**
 * Decide se `email` pode escrever uma métrica de dono `ownerClientId`.
 * - global (null): só admin.
 * - de cliente (X): admin, ou usuário com acesso ao cliente X.
 * - promote: só admin (qualquer dono).
 * Retorna { allowed, status?, error? } no mesmo formato dos outros verify*.
 */
export async function authorizeMetricWrite(
  email: string,
  ownerClientId: string | null,
  intent: MetricWriteIntent,
): Promise<{ allowed: boolean; status?: number; error?: string }>
```

## Superfície de API (`app/api/metrics/route.ts`)

- **`GET /api/metrics?clientId=X[&status=]`** — retorna globais (`ownerClientId` null/ausente)
  **+** métricas de X. Sem `clientId`: admin recebe todas; não-admin recebe só globais.
  (Filtragem no servidor a partir do snapshot; sem índice composto novo.)
- **`POST /api/metrics`** — corpo aceita `ownerClientId?: string | null`.
  - `ownerClientId` ausente/null ⇒ intenção global ⇒ `authorizeMetricWrite(email, null, create|update)`.
  - `ownerClientId = X` ⇒ `authorizeMetricWrite(email, X, …)`.
  - Edição de doc existente: a autorização usa o **`ownerClientId` atual do doc** (não o do
    corpo), para impedir que um cliente "sequestre" uma métrica global mudando o campo.
  - `MetricDoc` persiste `ownerClientId` (default null). Geração de id única fica a cargo do
    caller de cliente; este endpoint aceita o id já pronto (back-compat com o fluxo admin atual).
  - **Colisão × anti-sequestro:** `POST` de um id que **já existe com outro dono** cai na
    regra de edição (autoriza pelo `ownerClientId` do doc) ⇒ **403**. Logo um cliente nunca
    sobrescreve métrica global nem de outro cliente; em troca, precisa de um id livre — por
    isso métricas de cliente obtêm o id via `generateUniqueMetricId` (sufixa em colisão).
- **`DELETE /api/metrics?id=`** — carrega o doc, autoriza por `ownerClientId` atual.
- **Promoção:** `POST /api/metrics` com `{ action: "promote", id }` (admin) → seta
  `ownerClientId=null`, `updatedAt=now`, demais campos intactos. 422 se o id não existe.

## Resolução de dados (`app/api/metrics/[id]/data/route.ts`)

Após carregar o doc da métrica, **autoriza o escopo** antes de resolver: permite se
`ownerClientId` é null (global) **ou** `=== body.clientId` (própria do cliente); senão **403**
(`Métrica pertence a outro cliente`). Fecha o vazamento horizontal no espírito do G1, agora
no nível de métrica. Caminho de globais (todas hoje) inalterado.

## Error handling

- Falta de permissão: **403** com `{ error }` (mesmo shape dos outros `verify*`).
- Promote de id inexistente: **422**.
- `ownerClientId` inválido (não-Slug, não-null): **400** (Zod).
- Resolução cross-client: **403**.
- Back-compat: ausência de `ownerClientId` ⇒ global; nenhum fluxo existente muda de status.

## Testes (TDD)

- **Schema** (`metric.test.ts`): `ownerClientId` default null; aceita Slug e null; rejeita
  string não-Slug.
- **`generateUniqueMetricId`**: retorna `domain.slug` livre; sufixa `_2` em colisão (mock Firestore).
- **`authorizeMetricWrite`**: admin sempre; dono do cliente X cria/edita/deleta a sua; não-dono
  barrado (403); promote só admin. (mock `verifyClientAccess`/`isAdminEmail`.)
- **`/api/metrics` route**: cliente cria a sua; é barrado em global (403); admin faz tudo;
  edição usa `ownerClientId` do doc (anti-sequestro); promote (admin) flipa para null; `GET`
  filtra por escopo.
- **`/api/metrics/[id]/data` route**: nega métrica de outro cliente (403); permite global e a própria.

## Não-objetivos (próximas specs)

- Geração de métrica pelo chat + `create_metric` + vincular `metricId` ao bloco (G4).
- Tools do chat lendo contrato/bindings reais e produzindo recipes semânticos (G5).
- Admin UI de promoção/edição/listagem por dono.
- "Importar" métrica de cliente (cópia) como ação distinta de "promover" — modelado depois se necessário.
- Firestore security rules como defesa-em-profundidade (a API já enforce server-side via Admin SDK).
