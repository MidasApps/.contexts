---
title: AI-Friendly Code
type: practice
status: active
last_updated: 2026-05-20
---

# AI-Friendly Code

## O que é

**AI-friendly code** é a disciplina de escrever código otimizado para que LLMs e agentes de codificação (Claude Code, Cursor, Copilot, e ferramentas internas via `@stacks/ai/harness-engineering`) trabalhem com **alta precisão** sobre ele — leiam, editem, refatorem, gerem testes e estendam features sem alucinar, sem quebrar código adjacente e sem precisar de babysitting humano constante.

Não é um paradigma novo. É um **refinamento de `@practices/clean-code`** com ênfase em três eixos que importam particularmente para IA:

1. **Token economy** — código que cabe em janelas de contexto finitas sem desperdício.
2. **Localidade semântica** — o que é editado junto vive junto, sem chamada-chasing infinita.
3. **Navegabilidade programática** — agentes resolvem símbolos, imports e tipos deterministicamente, sem ter que adivinhar.

Este documento **não** é sobre "código gerado por IA". É sobre código que **IA lê e edita bem**, independente de quem o escreveu originalmente. Revisão humana continua obrigatória — ver `@rules/code-review`.

## Por que existe

LLMs trabalham bem em janelas de contexto finitas e sob pressão de atenção. Quando o código é:

- **Fragmentado em demasia** (funções de 5 linhas espalhadas em 20 arquivos): o agente precisa abrir N arquivos para entender 1 feature, consome janela em navegação e perde sinal na hora de gerar.
- **Denso e gigante** (arquivos de 2000 linhas, funções de 300): o agente não consegue carregar o todo, edita um trecho assumindo um contexto que não verificou, e quebra invariantes silenciosas.
- **Mal nomeado** (`utils.ts`, `helpers.ts`, `doStuff()`): o agente "adivinha" pela posição no arquivo e gera código que parece certo mas viola contratos não visíveis.
- **Implícito** (convenções não documentadas, side effects de import order, magic strings): o agente não tem como inferir — alucina o padrão mais provável estatisticamente, que pode não ser o seu.

O sintoma final é sempre o mesmo: **regenerações, edits cirurgicamente errados, refactors que quebram callers, testes gerados que validam o comportamento errado**. AI-friendly code reduz a superfície dessa classe de erro tornando o código **legível por máquina sem perder legibilidade humana**.

## Princípios centrais

### 1. Tamanho de arquivo: 150–500 linhas como sweet spot

- **Arquivos >1000 linhas**: difíceis de fit em janela junto com prompt + outputs; edits arriscam scope incorreto porque o agente não viu o arquivo inteiro.
- **Arquivos <30 linhas com lógica não-trivial**: forçam o agente a abrir N arquivos para reconstruir 1 conceito; cada hop consome tokens e introduz risco de leitura parcial.
- **150–500 linhas**: cabem confortavelmente em contexto, comportam um conceito coeso e ainda permitem edição cirúrgica.

Quando passar de 500: dividir por **eixo conceitual** (não por tamanho arbitrário). Quando ficar abaixo de 30 sem motivo de reuso ou fronteira de domínio: consolidar.

### 2. Tamanho de função: 30–50 linhas no fluxo principal

Matizamos a recomendação de Uncle Bob (funções minúsculas, idealmente <10 linhas). Para colaboração com IA:

- **Funções de 5 linhas pulverizadas**: geram chamada-chasing; o agente precisa abrir cada uma para reconstruir o algoritmo.
- **Funções >100 linhas**: exigem leitura sequencial pesada, escondem invariantes no meio do corpo, e o agente perde precisão na edição parcial.
- **30–50 linhas no fluxo principal**: o agente "vê" o algoritmo inteiro de uma vez. Extrair só quando há **reuso real** ou quando um nome de helper agrega entendimento — não como ritual estético.

Ver tensão correlata em `@practices/clean-code` (wrong-abstraction de Sandi Metz).

### 3. Modularidade alta + acoplamento baixo

Um módulo bem desenhado pode ser editado pelo agente **sem que ele precise abrir N módulos vizinhos**. Isso significa:

- Dependências explícitas e injetáveis.
- Fronteiras claras (schemas Zod no boundary — ver `@stacks/validation/zod@4` e `@practices/sdd`).
- Side effects isolados em locais previsíveis.

### 4. Localidade semântica

Tudo que é editado junto **vive junto**. Schema + tipo + função + teste + componente do mesmo conceito coabitam a mesma pasta (`feature-as-folder`). Ver `@architecture/feature-based` e `@architecture/fsd`.

Quando o agente edita o schema, ele encontra o teste correspondente a 1 hop de leitura; quando edita o componente, encontra o hook que ele consome adjacente. Sem caçar `/src/types`, `/src/schemas`, `/src/hooks` em três cantos do repo.

### 5. Token economy

- **Nomes ricos > comentários extensos**: `unitsRemainingAfterReserve` é melhor que `count // unidades restantes após reserva`.
- **Código autoexplicativo** — ver `@practices/clean-code`.
- **Sem boilerplate cerimonial repetido**: padrões que o agente vê 50 vezes consomem janela sem agregar; consolide em primitivas reutilizáveis.

### 6. Navegabilidade programática

- **Imports explícitos**: `import { createOrder } from '@/features/orders/api'` — não `import * as orders from '@/features/orders'`.
- **Exports nomeados > default exports**: nome estável, agent resolve símbolo deterministicamente.
- **`index.ts` minimal** (re-exporta no máximo o que é API pública da feature; não barrel gigante).
- **Path aliases consistentes**: `@/features/orders/...` em vez de `../../../features/orders/...`.
- **Types co-localizados** com o código que os usa, ou em pasta `types/` clara da feature.

### 7. Determinismo de estilo

Formatter (Biome) + lint enforce **idêntico em todo o repo**. O agente nunca decide "qual convenção usar aqui" — só executa. Estilo viral em pré-commit é melhor que código review reclamando de aspas duplas.

### 8. Schemas como especificação

Zod no boundary (`@stacks/validation/zod@4`) e tests-as-spec (`@practices/tdd`, `@practices/bdd`, `@practices/sdd`) dão ao agente um **contrato legível sem precisar ler a implementação inteira**. Schema é o resumo executivo do tipo.

### 9. Tipos como documentação

Em TS 7 (`@stacks/language/typescript@7`), o sistema de tipos é o melhor canal de comunicação com a IA:

- **Branded types** para identificadores (`OrderId`, `UserId`) — agente não passa `string` solta.
- **Discriminated unions** para estados (`{ status: 'idle' } | { status: 'loading' } | { status: 'error', error: ApiError }`).
- **Tipos descritivos > `any`/`unknown`**: cada `any` é um buraco no contrato e o agente "alucinará" o shape mais comum.
- **`satisfies`** para validar shape sem alargar tipo.

### 10. Erros tipados

Discriminated union de erros > strings genéricas. O agente gera handlers exaustivos automaticamente:

```ts
type CreateOrderError =
  | { kind: 'stock_unavailable'; sku: string }
  | { kind: 'payment_declined'; reason: string }
  | { kind: 'invalid_address' };
```

vs.

```ts
throw new Error('something went wrong'); // agente não tem como gerar handler específico
```

### 11. Single source of truth

O agente **não duplica acidentalmente** porque há um lugar canônico. Convenções vivem em `@rules/development` e `@rules/documentation`. Schemas vivem em uma pasta clara da feature. Quando há SSOT, o agente atualiza o lugar certo; quando não há, ele cria uma cópia divergente.

## Anti-patterns que prejudicam IA

| Anti-pattern | Por que prejudica IA |
|---|---|
| Arquivos >1000 linhas | Overflow de janela; edits perigosos por contexto parcial |
| Funções >100 linhas | Lógica enterrada; invariantes invisíveis no meio do corpo |
| Helpers globais com nomes genéricos (`utils.ts`, `helpers.ts`, `common.ts`) | Sem semântica; agente coloca tudo lá; vira lixeira sem ownership |
| Barrel exports (`export *`) | Origem real do símbolo perdida; resolução estática quebrada |
| Magic strings/numbers sem const nomeado | Agente recria literal com typo; não rastreável |
| Estado global mutável escondido | Side effects invisíveis (ex: Zustand sem schemas claros — ver `@stacks/state/zustand@5`) |
| Reflection/metaprogramação pesada | Decorators, dynamic `require`, `eval` — agente não consegue inferir estático |
| Acoplamento implícito por import order | Side effects de import; ordem importa mas não está documentada |
| Comentários repetindo o código | Gastam token sem agregar (`// increment i`) |
| Comentários obsoletos contradizendo código | Agente confia no comentário errado |
| Mocks/fakes feitos com `any` | Perde tipagem em fronteira de teste; agente alucina shape |
| Convenções implícitas não documentadas | Agente reinventa estilo; pull request fica inconsistente |
| Múltiplos paradigmas misturados no mesmo módulo | FP + OO + procedural no mesmo arquivo; agente segue o paradigma errado |
| Path aliases inconsistentes ou ausentes | `../../../` longos; refactor de pasta quebra imports silenciosamente |
| Estruturas profundamente aninhadas (>4 níveis) | Lógica enterrada em closures/condicionais; difícil de editar parcialmente |

## Práticas recomendadas

### Arquivos focados

1 arquivo = 1 conceito coeso. Split quando passar de 500 linhas, dividindo por **fronteira semântica** (não numérica). Consolide quando 3 arquivos de 20 linhas formam 1 conceito único.

### Funções pequenas mas não pulverizadas

30–50 linhas no fluxo principal. Extrair quando **claramente reutilizável** ou quando o nome do helper agrega entendimento. Não extrair só por ritual.

### Named exports + explicit imports

```ts
// Bom
import { createOrder, cancelOrder } from '@/features/orders/api';

// Ruim
import orders from '@/features/orders';
orders.createOrder(...);
```

### Co-location

```
features/orders/
  schema.ts      // Zod schemas
  types.ts       // tipos derivados
  api.ts         // funções de boundary
  hooks.ts       // hooks React
  components/
  __tests__/
```

Ver `@architecture/feature-based` e `@architecture/fsd`.

### Inline types em funções complexas

```ts
function reserveStock(input: {
  sku: string;
  quantity: number;
  warehouseId: WarehouseId;
}): Result<Reservation, StockError> { ... }
```

O agente "vê" o contrato sem abrir outro arquivo.

### `satisfies` para validar shape sem widening

```ts
const config = {
  retries: 3,
  timeout: 5000,
} satisfies RequestConfig;
```

### JSDoc/TSDoc onde tipo não é suficiente

Onde houver invariantes, efeitos colaterais ou preconditions não expressáveis no tipo:

```ts
/**
 * Reserva estoque para um pedido. Bloqueia a unidade por 15 minutos.
 *
 * @throws {StockUnavailableError} se quantity > available
 * @precondition warehouseId deve existir em warehouses ativos
 */
function reserveStock(...) { ... }
```

### Schemas Zod nomeados em inputs/outputs públicos

Funções de boundary expõem `CreateOrderInputSchema` e `CreateOrderOutputSchema` nomeados, importáveis e referenciáveis. Ver `@stacks/validation/zod@4`.

### Conventional naming

`getX`, `setX`, `useX` (hooks React), `handle<Event>`, `on<Event>`, `<Verb><Noun>` para handlers. O agente infere intenção pelo prefixo.

### Path aliases

Configurar `@/` em `tsconfig.json` e usar em **todo** o repo. Imports relativos só dentro da mesma feature.

### README local em features complexas

1 parágrafo + diagrama mental + entry points. Não um manual gigante — só o suficiente para o agente saber por onde começar.

```
features/checkout/README.md
---
Fluxo de checkout. Entry points:
- api.ts → createCheckoutSession (server)
- hooks.ts → useCheckout (client)
- state.ts → checkoutStore (Zustand)

Fluxo: cart → session → payment → confirmation
```

### Test naming descritivo

```ts
it('rejects order when stock is zero')        // bom
it('test1')                                    // ruim
it('returns 400 when sku does not exist')     // bom
```

Testes como especificação executável — ver `@practices/tdd` e `@practices/bdd`. O agente infere comportamento esperado lendo os nomes.

## Estrutura de repo amigável a IA

```
src/
  features/
    orders/
      schema.ts
      types.ts
      api.ts
      hooks.ts
      components/
      __tests__/
      README.md
    checkout/
      ...
  shared/                  # primitivas reutilizáveis (FSD-style)
    ui/
    lib/
    types/
CLAUDE.md                  # entry points + convenções do repo
.contexts/                 # DDC framework (este arquivo)
```

Ver `@architecture/fsd`. O `CLAUDE.md` na raiz aponta para `.contexts/` como fonte canônica de convenções.

## Métricas práticas

- **File size p50/p95** monitorado em CI; alertar quando p95 ultrapassar 600 linhas.
- **Cyclomatic complexity** capped em CI (ex: 15 por função, 25 por arquivo).
- **Boyscout rule** aplicada quando edits acontecem em hotspots de complexidade — ver `@rules/development`.
- **Ratio de `any`/`unknown`** monitorado; cada um precisa de justificativa em comentário.

## Trade-offs com Clean Code clássico

| Dimensão | Clean Code clássico | AI-friendly code |
|---|---|---|
| Tamanho de função | Idealmente <10 linhas | 30–50 linhas no fluxo principal |
| Comentários | Minimizar; código se explica | Manter JSDoc em superfícies públicas |
| DRY | Forte | Moderado (wrong-abstraction de Sandi Metz) |
| Abstração | Extrair cedo | Extrair quando há reuso real |

Não há contradição — há ênfase diferente. Ver `@practices/clean-code` para a base. AI-friendly code **estende** clean code; não substitui.

## Quando aplicar

- **Sempre**: este é o estilo padrão do repo. Todo PR deve passar pelos critérios mínimos (tamanho, naming, types).
- **Com mais rigor**: em features de alta complexidade, hotspots editados frequentemente, e código no caminho crítico de geração por IA.
- **Com menos rigor**: scripts one-shot, migrations descartáveis, POCs explicitamente marcados como tal.

## Quando NÃO aplicar

- Código **gerado** que será descartado em horas (POC, throwaway).
- Código de **terceiros** vendorizado (mantenha estilo upstream).
- Casos onde performance crítica exige paradigma específico que conflita com legibilidade — documente a exceção.

## Referências cruzadas

- Base de código limpo: `@practices/clean-code`
- Testes como spec: `@practices/tdd`, `@practices/bdd`
- Specs como contrato: `@practices/sdd`
- Organização espacial: `@architecture/feature-based`, `@architecture/fsd`
- Convenções imperativas: `@rules/development`, `@rules/documentation`, `@rules/code-review`
- Linguagem e tipagem: `@stacks/language/typescript@7`
- Validação: `@stacks/validation/zod@4`
- Estado: `@stacks/state/zustand@5`
- Agentes internos: `@stacks/ai/harness-engineering`

## Inspirações

- Anthropic, *Effective AI Engineering* — princípios de colaboração humano+agente.
- Cursor docs — context-friendly code patterns.
- Sean Grove, *The New Code* — spec-first como linguagem comum entre humano e IA.
- Geoffrey Litt + Steve Krouse — malleable software e código editável por agentes.
- Robert C. Martin, *Clean Code* — base sobre a qual este documento matiza.
- Sandi Metz, *The Wrong Abstraction* — sobre quando NÃO extrair.
