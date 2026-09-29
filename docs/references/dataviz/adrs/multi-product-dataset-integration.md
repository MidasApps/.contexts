# ADR — Integração Multi-Produto e Multi-Dataset com Dicionário de Dados Dinâmico

| Campo                | Valor                                                              |
|----------------------|--------------------------------------------------------------------|
| **Status**           | 📝 PROPOSTA                                                        |
| **Data**             | 2026-04-15                                                         |
| **Domínio**          | Plataforma DataViz / Administração / Integração BigQuery           |
| **Impacto**          | Alto — afeta modelo Firestore, API layer, SQL builders e admin UI  |
| **Autores**          | Time Liquid DataViz                                                |
| **Revisores**        | Tech Lead, Arquitetura                                             |
| **Próxima revisão**  | Pós-implementação do piloto Covenants                              |

---

## 1. Contexto

O Liquid DataViz foi concebido como dashboard único para securitização de crédito imobiliário (Liquid Play+ Credit). O modelo de dados atual presume:

- **1 cliente = 1 dataset BigQuery**
- **3 tabelas fixas** (`contratos`, `pagamentos`, `fluxo_caixa`) definidas como constante TypeScript (`EXPECTED_SCHEMA`)
- **~70 campos pré-determinados** com nomes e descrições cravadas em código
- **1 projeto GCP** via variável de ambiente `BIGQUERY_PROJECT_ID`
- **Indicadores e rotas globais** (`ALL_INDICATORS`, `ALL_ROUTES`) aplicáveis a qualquer cliente

O roadmap agora inclui novos produtos — a começar por **Liquid Play+ (Covenants)** — com estruturas de dados radicalmente diferentes (covenants financeiros, backtests, análises one-shot). Clientes como `galli_vivapark_covenants`, `jotanunes_backtest` e `morar_oneshot` não possuem as tabelas atuais e introduzem domínios novos (ratings de debêntures, séries históricas de índices, resultados de simulação).

> ⚡ **Problema Raiz**
> A premissa "um schema universal para todos os clientes" é falsa para o mercado real. Produtos diferentes exigem dicionários de dados diferentes, e clientes de um mesmo produto podem ter variações de nomenclatura e escopo de tabelas.

### 1.1 Forças em Jogo

| Força                         | Manifestação no Projeto                                                              |
|-------------------------------|--------------------------------------------------------------------------------------|
| Diversidade de produtos       | Covenants, Credit, Backtest, One-shot têm modelos de dados incompatíveis             |
| Heterogeneidade de clientes   | Mesmo dentro de um produto, nomes de colunas e disponibilidade variam                |
| Multi-projeto GCP             | Bases podem viver em projetos GCP distintos por questões de isolamento               |
| Evolução contínua             | Novos campos/tabelas precisam ser adicionados sem deploy                             |
| Manutenibilidade              | Hard-code de schemas espalha conhecimento de domínio em `.ts`                        |
| Segurança de SQL              | Sanitização de identificadores dinâmicos é crítica                                   |
| Onboarding de cliente novo    | Admin precisa cadastrar cliente sem intervenção de engenharia                        |

### 1.2 Sintomas do modelo atual

- **`ClientDoc.dataset: string`** — força o binding 1:1 cliente↔dataset
- **`EXPECTED_SCHEMA` constante** — acoplamento forte entre domínio Credit e código
- **`ALL_INDICATORS` global** — todos os KPIs aparecem para todos os clientes
- **`BIGQUERY_PROJECT_ID` único** — impede clientes em projetos GCP distintos
- **`/api/schema-detect` hard-coded** para `('contratos', 'pagamentos', 'fluxo_caixa')`

---

## 2. Decisão

Adotamos uma arquitetura **multi-produto, multi-dataset, multi-projeto**, com **dicionário de dados persistido no Firestore** como fonte de verdade, desacoplando o modelo de domínio do código TypeScript.

> ✅ **Princípio Central**
> "O dicionário de dados mora no Firestore, não em constantes `.ts`." — Os produtos e seus schemas esperados são configuráveis em runtime via painel administrativo.

### 2.1 Conceitos de Domínio

| Conceito       | Descrição                                                                                   |
|----------------|---------------------------------------------------------------------------------------------|
| **Product**    | Vertical comercial (ex: "Covenants", "Credit"). Define páginas, indicadores e tabelas esperadas. |
| **DataSource** | Conexão nomeada a um projeto GCP (ex: `bq-data-wh`, `liquid-dfm-prod`).                     |
| **Dataset**    | Dataset BigQuery dentro de um `DataSource` (ex: `galli_vivapark_covenants`).                |
| **Client**     | Organização cliente. Pode assinar N produtos; cada assinatura aponta para 1+ `Dataset`.     |
| **Binding**    | Vínculo `Client × Product × Dataset` que contém o mapeamento de schema daquele contexto.    |

### 2.2 Hierarquia Firestore

```
firestore/
├── dataSources/                        # Registro de projetos GCP acessíveis
│   └── {dataSourceId}/                 # slug (ex: "bq-data-wh")
│       ├── name: string                # "Data Warehouse Principal"
│       ├── projectId: string           # "bq-data-wh"
│       ├── location: string            # "US" | "southamerica-east1"
│       ├── credentialRef?: string      # Secret Manager key (se diferente do ADC)
│       ├── createdAt: timestamp
│       └── updatedAt: timestamp
│
├── products/                           # Verticais comerciais
│   └── {productId}/                    # slug (ex: "covenants", "credit")
│       ├── name: string                # "Liquid Play+ Covenants"
│       ├── slug: string                # "covenants"
│       ├── icon: string                # Lucide icon name
│       ├── color: string               # OKLCH ou hex
│       ├── status: "active"|"draft"
│       ├── expectedTables: map[]       # Dicionário de dados esperado
│       │   [{
│       │     id: "covenants",
│       │     label: "Covenants",
│       │     description: "Covenants financeiros por emissão",
│       │     required: true,
│       │     fields: [{
│       │       id: "data_apuracao",
│       │       label: "Data de Apuração",
│       │       description: "Data-base do covenant",
│       │       type: "DATE" | "STRING" | "NUMERIC" | "BOOL" | "TIMESTAMP",
│       │       required: true,
│       │       isKey: boolean,
│       │       unit?: "BRL" | "%" | "dias" | ...
│       │     }, ...]
│       │   }]
│       ├── routes: map[]                # Rotas específicas do produto
│       │   [{ path, label, group, icon }]
│       ├── indicators: map[]            # KPIs/charts/tables disponíveis
│       │   [{ id, label, page, type, requiredFields: string[] }]
│       ├── createdAt, updatedAt
│
├── clients/                            # Organizações clientes
│   └── {clientId}/
│       ├── name, initial, color        # (existente)
│       ├── status: "active"|"trial"|"archived"
│       ├── productBindings: map[]      # NOVO: N produtos, N datasets
│       │   [{
│       │     productId: "covenants",
│       │     datasets: [{
│       │       id: "main",             # nome lógico dentro do binding
│       │       dataSourceId: "bq-data-wh",
│       │       datasetId: "galli_vivapark_covenants",
│       │       schema: {               # mapeamento expected→real
│       │         "covenants": {
│       │           "data_apuracao": "dt_apuracao",
│       │           "ebitda": null      # null = não disponível
│       │         }
│       │       },
│       │       lastSchemaSync: timestamp,
│       │       isPrimary: boolean
│       │     }],
│       │     enabledIndicators?: string[]  # override por binding
│       │     enabledRoutes?: string[]
│       │   }]
│       ├── legacyDataset?: string       # migração: preserva dataset antigo
│       └── ...
│
├── groups/                             # (existente, sem mudanças)
└── users/                              # (existente, com productAccess expandido)
    └── {userId}/
        └── clientAccess: [{
              clientId,
              productIds: string[]       # NOVO: restringe produtos por usuário
            }]
```

### 2.3 Regras de Validação (Zod)

Toda entidade do Firestore tem schema Zod correspondente em `src/shared/schemas/`:

- `DataSourceSchema` — valida `projectId` (regex GCP) e `location` enum
- `ProductSchema` — valida `expectedTables[].fields[].id` como SQL-safe identifier (`^[a-z][a-z0-9_]*$`)
- `ClientSchema` (novo) — valida `productBindings` com refs cruzadas
- `BindingSchemaMapSchema` — valores `string | null`, chaves SQL-safe

### 2.4 Segurança de SQL

**Identificadores dinâmicos (nome de dataset/tabela/coluna) NÃO podem ser parametrizados no BigQuery.** Portanto, toda interpolação obedece a:

| Camada            | Validação                                                                         |
|-------------------|-----------------------------------------------------------------------------------|
| Input do admin    | Zod regex `^[a-zA-Z_][a-zA-Z0-9_-]*$`                                             |
| Antes de executar | `safeColumnName()` + `safeIdentifier()` em `bigquery/client.ts`                  |
| Escape            | Backticks `` ` `` para todos os identificadores de tabela                         |
| Valores           | SEMPRE via `params` / `@param` binding, nunca concatenados                        |

### 2.5 Cliente BigQuery Multi-Projeto

`getBigQueryClient()` passa a ser `getBigQueryClient(dataSourceId?: string)` com cache `Map<dataSourceId, BigQuery>`:

```ts
// src/shared/lib/bigquery/client.ts
const clients = new Map<string, BigQuery>();

export async function getBigQueryClient(dataSourceId?: string): Promise<BigQuery> {
  const key = dataSourceId ?? '__default__';
  if (clients.has(key)) return clients.get(key)!;

  const opts: BigQueryOptions = {};
  if (dataSourceId) {
    const src = await getDataSource(dataSourceId);  // Firestore lookup
    opts.projectId = src.projectId;
    opts.location = src.location;
    if (src.credentialRef) {
      opts.keyFilename = await resolveCredential(src.credentialRef);
    }
  } else {
    opts.projectId = process.env.BIGQUERY_PROJECT_ID;
    if (process.env.BIGQUERY_CREDENTIALS) opts.keyFilename = process.env.BIGQUERY_CREDENTIALS;
  }

  const client = new BigQuery(opts);
  clients.set(key, client);
  return client;
}
```

### 2.6 Detecção de Schema Dinâmica

`/api/schema-detect` passa a receber `{ productId, dataSourceId, datasetId }` e:

1. Carrega `products/{productId}.expectedTables` do Firestore
2. Busca nomes das tabelas esperadas em `INFORMATION_SCHEMA.COLUMNS`
3. Constrói prompt Gemini com o dicionário carregado (não mais hard-coded)
4. Retorna `schema: Record<tableId, Record<fieldId, realColumn|null>>`

### 2.7 Resolver de Schema

`schema-resolver.ts` generaliza para suportar N tabelas:

```ts
resolveColumn(binding: ClientProductBinding, datasetLogicalId: string, tableId: string, fieldId: string): string | null
```

### 2.8 Administração

Novo tab **"Produtos"** em `/admin` para CRUD de `products/` com editor visual do dicionário de dados (tabelas → campos → tipos).

`ClientForm` ganha seção **"Assinaturas de Produto"**: para cada produto habilitado, o admin adiciona N bindings (dataset + mapeamento).

---

## 3. Alternativas Consideradas

### 3.1 Manter `EXPECTED_SCHEMA` em código, adicionar nova constante por produto

- ❌ **Rejeitado.** Exigiria deploy para cada novo produto/cliente com variação. Viola princípio de "configuração, não código".

### 3.2 Usar GitOps (YAML no repo) para definir produtos

- ⚠️ **Descartado por ora.** Admin não-técnico não consegue operar. Bom para migração inicial (seed), ruim como fonte de verdade.

### 3.3 Schema único com "extensões" opcionais

- ❌ **Rejeitado.** Acopla covenants, backtest e credit em um super-schema. Não escala conceitualmente e polui autocomplete.

### 3.4 BigQuery Dataset Labels como metadata

- ⚠️ **Complementar, não substituto.** Labels BQ podem informar `product=covenants`, mas não carregam dicionário rico.

---

## 4. Consequências

### 4.1 Positivas

- ✅ **Extensibilidade**: novo produto = novo doc `products/`, zero deploy
- ✅ **Onboarding cliente**: 100% via admin UI, sem engenharia
- ✅ **Multi-tenant real**: cada cliente pode ter N produtos com N datasets cada
- ✅ **Multi-projeto GCP**: isolamento fiscal/legal por `dataSourceId`
- ✅ **Dicionário como documentação**: descrições viram tooltips, sem desincronia
- ✅ **Permissões granulares**: usuário pode ter produto A de cliente X mas não produto B

### 4.2 Negativas

- ⚠️ **Complexidade inicial**: modelo Firestore mais profundo, mais validações Zod
- ⚠️ **Migração**: clientes existentes (om, brz, conx, imcasa) precisam ser migrados para `productBindings[]`
- ⚠️ **Latência de leitura**: queries precisam carregar product config antes de rodar SQL
  - **Mitigação**: cache in-memory de `products/*` com invalidação via Firestore listener
- ⚠️ **Superfície de ataque**: identificadores dinâmicos em SQL exigem validação robusta
  - **Mitigação**: camada `safeIdentifier()` obrigatória + regex strict
- ⚠️ **Custos GCP**: múltiplos clientes BQ podem inflar quotas se não cached

### 4.3 Riscos e Mitigações

| Risco                                              | Probabilidade | Impacto | Mitigação                                        |
|----------------------------------------------------|:-------------:|:-------:|--------------------------------------------------|
| SQL injection via nome de coluna malicioso         | Média         | Alto    | Regex whitelist + camada de sanitização única    |
| Admin mapeia coluna errada e corrompe dashboard    | Alta          | Médio   | Schema auto-detect obrigatório antes do salvar   |
| Listener Firestore sobrecarrega em prod            | Baixa         | Médio   | Cache TTL + fallback polling                     |
| Migração quebra clientes existentes                | Média         | Alto    | Dual-read: leitor aceita `dataset` OU `productBindings` |
| Custos BigQuery explodem por multi-projeto         | Baixa         | Alto    | Quota por `dataSourceId` + monitoring            |

---

## 5. Plano de Implementação

### Fase 0 — Fundação (pré-requisito)

- [ ] Provisionar Firestore **dedicado** para este projeto (database `liquid-dataviz-dev`)
- [ ] Seed inicial via script: `dataSources/bq-data-wh`, `products/credit` (com schema atual)

### Fase 1 — Modelagem e Zod schemas

- [ ] Criar `src/shared/schemas/` com Zod para `DataSource`, `Product`, `ClientBinding`
- [ ] Types derivados via `z.infer` (SSOT)
- [ ] Deprecar `EXPECTED_SCHEMA` const (marcar `@deprecated`, ler do Firestore)

### Fase 2 — Backend: BQ multi-projeto

- [ ] Refatorar `getBigQueryClient(dataSourceId?)` com cache
- [ ] Helper `safeIdentifier()` com testes unitários de injection
- [ ] Atualizar `/api/bigquery` para aceitar contexto `{productId, bindingId}`

### Fase 3 — Admin UI: Produtos

- [ ] Nova aba "Produtos" em `/admin`
- [ ] CRUD de `products/` com editor de `expectedTables`
- [ ] CRUD de `dataSources/`

### Fase 4 — Admin UI: Clientes multi-produto

- [ ] `ClientForm` com seção "Assinaturas de Produto"
- [ ] Para cada assinatura: array de bindings (dataset + schema mapping)
- [ ] Schema detect por binding com preview

### Fase 5 — Frontend: roteamento por produto

- [ ] Store Zustand expõe `activeProduct` além de `activeClient`
- [ ] Navigation monta menu a partir de `product.routes`
- [ ] Páginas consomem `product.indicators` para filtrar widgets

### Fase 6 — Migração

- [ ] Script que converte `clients/*.dataset` → `clients/*.productBindings[0]`
- [ ] Deploy com dual-read habilitado
- [ ] Validação e remoção do caminho legacy

### Fase 7 — Piloto: Liquid Play+ Covenants

- [ ] Seed `products/covenants` com dicionário Covenants
- [ ] Cliente `galli_vivapark` onboarded via admin (zero código)
- [ ] Primeiros 5 indicadores Covenants em produção

---

## 6. Referências

- ADR-001: [Estrutura e Modelagem do Firebase Firestore](./firebase-firestore.md)
- ADR-007: [Contratos de API REST](./contratos-api.md)
- [BigQuery INFORMATION_SCHEMA](https://cloud.google.com/bigquery/docs/information-schema-intro)
- [Zod v4 — z.infer](https://zod.dev/?id=type-inference)
- [Google Cloud IAM — project-level BigQuery roles](https://cloud.google.com/bigquery/docs/access-control)

---

## 7. Glossário

| Termo              | Definição                                                                         |
|--------------------|-----------------------------------------------------------------------------------|
| **ADC**            | Application Default Credentials — credenciais GCP locais                          |
| **Binding**        | Vínculo Client × Product × Dataset com mapeamento de schema                       |
| **Dicionário**     | Descrição formal das tabelas e campos esperados por um produto                    |
| **DataSource**     | Projeto GCP/BigQuery acessível                                                    |
| **Expected Schema**| Campos que o produto espera encontrar (não necessariamente o que existe no BQ)    |
| **SSOT**           | Single Source of Truth — aqui, o Firestore para configuração de domínio           |
