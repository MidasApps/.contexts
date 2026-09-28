# Modo Imersivo — Análise Conversacional

**Data:** 2026-03-18
**Status:** Aprovado

## Visão Geral

Novo modo de uso da plataforma onde a IA age como um analista que constrói dashboards dinâmicos através de conversa. O usuário pergunta, a IA planeja indicadores, busca dados no BigQuery, e renderiza páginas de visualização em tempo real.

Construído sobre o sistema de agentes existente como uma "camada 2" — tem seu próprio orquestrador e interface, mas coordena e delega para os agentes atuais quando necessário.

## Decisões de Design

| Decisão | Escolha |
|---------|---------|
| Entrada no modo | Landing page com escolha entre Dashboard e Análise Conversacional |
| Filtros | Híbrido: globais no header + refinamento por conversa |
| Arquitetura de agentes | Meta-agente (Canvas Orchestrator) com tools de composição |
| Tipos de visualização (MVP) | KPI cards, charts (bar/line/area/composed), tabelas — componentes existentes |
| Layout do modo imersivo | Dashboard gerado (painel ~75%) + chat lateral (~25%) |
| Comportamento ao conversar | Abas/páginas — cada análise pode virar uma nova aba |
| Edição de páginas | IA pode criar páginas e adicionar blocos (MVP); remover/reordenar blocos para storytelling (pós-MVP) |
| Persistência | Firestore por sessão (pós-MVP) |
| Landing page extras | Histórico + sugestões pré-configuradas (pós-MVP) |

## Arquitetura

### Estrutura da Tela (Modo Imersivo)

```
┌─────────────────────────────────────────────────────────────────┐
│ Header: Logo | Filtros globais (período, projeto) | Avatar      │
│         [Aba: Visão Geral] [Aba: Elegibilidade] [+]            │
├───────────────────────────────────────┬─────────────────────────┤
│                                       │                         │
│  Painel Principal (~75%)              │  Chat Lateral (~25%)    │
│                                       │                         │
│  ┌─ Bloco: Título + Descrição ──────┐│  ┌─ AI ──────────────┐ │
│  │ Visão Geral da Carteira          ││  │ Analisei sua...    │ │
│  │ Principais indicadores de saúde  ││  └────────────────────┘ │
│  └──────────────────────────────────┘│                         │
│                                       │  ┌─ Você ────────────┐ │
│  ┌─ Bloco: KPIs ────────────────────┐│  │ Detalhe a inadim..│ │
│  │ [Saldo: R$1.2B] [Contratos: 12K] ││  └────────────────────┘ │
│  │ [Inadimpl: 3.2%] [Eleg: 78.5%]  ││                         │
│  └──────────────────────────────────┘│  ┌─ AI ──────────────┐ │
│                                       │  │ Criei a aba       │ │
│  ┌─ Bloco: Chart ───────────────────┐│  │ "Inadimplência"   │ │
│  │ [Gráfico de barras - LTV]        ││  └────────────────────┘ │
│  └──────────────────────────────────┘│                         │
│                                       │  ┌────────────────────┐ │
│  ┌─ Bloco: Texto ───────────────────┐│  │ Pergunte algo...   │ │
│  │ A carteira apresenta 78.5% de... ││  └────────────────────┘ │
│  └──────────────────────────────────┘│                         │
├───────────────────────────────────────┴─────────────────────────┤
```

### Fluxo de Dados

```
Usuário envia mensagem
       │
       ▼
POST /api/canvas-chat (auth + dataset + filters + pages context)
       │
       ▼
Canvas Orchestrator (meta-agente)
       │
       ├── plan_analysis → plano de páginas/blocos
       ├── create_page → nova aba no frontend (streaming)
       ├── query_data → SQL no BigQuery
       ├── add_block → bloco renderiza no painel (streaming)
       ├── remove_block → bloco removido do painel
       ├── reorder_blocks → blocos reordenados
       ├── get_filter_options → opções de filtro
       └── analyze → delega para agentes existentes (texto)
              │
              ├── descriptive_agent
              ├── diagnostic_agent
              ├── predictive_agent
              └── (outros agentes conforme necessidade)
```

### Fases de Interação

**Fase 1 — Construção:** Usuário faz pergunta inicial. Canvas Orchestrator planeja e constrói páginas com indicadores, gráficos e textos explicativos. Blocos aparecem em tempo real via streaming.

**Fase 2 — Conversa:** Usuário continua perguntando. O orchestrator decide se:
- Responde com texto no chat (delegando a agente existente)
- Modifica uma página existente (add/remove/reorder blocks)
- Cria uma nova página/aba

A IA tem autonomia para construir um storytelling coerente — ordenando, adicionando ou removendo blocos para guiar o raciocínio do usuário.

## Protocolo de Streaming

O mecanismo central que conecta as tool calls do Canvas Orchestrator às atualizações visuais no frontend.

### Mecanismo: AI SDK `toolInvocations`

Usa o mesmo padrão do `AISidebar.tsx` existente. O Vercel AI SDK expõe tool calls como `toolInvocations` em cada mensagem via `useChat`. O `CanvasChat` intercepta essas invocations e despacha para o `CanvasStore`.

```
useChat (stream) → message.parts → toolInvocation (name, state, result)
                                          │
                                          ▼
                                    CanvasStreamHandler
                                          │
                                    switch(toolName):
                                      'create_page' → canvasStore.createPage(result)
                                      'add_block'   → canvasStore.addBlock(result)
                                      'query_data'  → noop (dados internos do agente)
                                      'analyze'     → noop (texto vai pro chat)
```

### Sequência: Adição de um bloco

```
1. LLM emite tool call: add_block({ pageIndex: 0, block: { type: 'kpis', items: [...] } })
2. AI SDK streaming entrega toolInvocation com state: 'partial-call' → UI mostra skeleton no bloco
3. AI SDK entrega state: 'result' com output completo → CanvasStore.addBlock() chamado
4. Zustand notifica CanvasPanel → bloco renderiza com dados
```

### Estados de tool invocation

| State | Efeito no UI |
|-------|-------------|
| `partial-call` | Skeleton/loading no local onde o bloco aparecerá |
| `result` | Bloco renderiza com dados completos |
| `error` | Bloco de erro com mensagem e botão "tentar novamente" |

### Tratamento de erros

- **`query_data` falha (SQL inválido):** O erro é retornado como tool result. O LLM pode tentar corrigir o SQL (até 2 retries). Se persistir, mensagem de erro no chat.
- **`add_block` com dados vazios:** Renderiza bloco com estado "sem dados" em vez de omitir.
- **Stream interrompido:** Blocos parcialmente adicionados permanecem visíveis. Mensagem no chat informando interrupção.
- **Timeout:** `maxDuration = 600` (10 min) para o endpoint canvas-chat, dado que encadeia múltiplas queries.

## Contratos de Dados

### CanvasBlock — Union Discriminada

```typescript
type CanvasBlock = TextBlock | KpiBlock | ChartBlock | TableBlock

interface BaseBlock {
  id: string
}

interface TextBlock extends BaseBlock {
  type: 'text'
  content: string  // markdown
}

interface KpiBlock extends BaseBlock {
  type: 'kpis'
  items: Array<{
    label: string
    value: string
    trend?: string           // ex: "+2.3%"
    trendDirection?: 'up' | 'down'
    trendIsPositive?: boolean // up pode ser ruim (ex: inadimplência)
    sparklineData?: number[]
  }>
}

interface ChartBlock extends BaseBlock {
  type: 'chart'
  chartType: 'bar' | 'line' | 'area' | 'composed' | 'stacked-bar'
  title?: string
  data: Array<Record<string, string | number>>  // ex: [{ name: "Faixa A", value: 1200 }]
  dataKeys: string[]      // quais campos plotar (ex: ["value"])
  xAxisKey: string        // campo do eixo X (ex: "name")
  colors?: string[]       // cores customizadas (opcional, usa palette padrão)
  stacked?: boolean       // para stacked-bar
}

interface TableBlock extends BaseBlock {
  type: 'table'
  columns: Array<{ header: string; accessorKey: string; format?: 'currency' | 'percent' | 'number' | 'date' }>
  rows: any[]             // max 100 rows — LLM deve limitar ou paginar
}
```

### Limites de dados

- **`query_data`:** Retorna no máximo 500 rows ao LLM como tool result. Para tabelas no frontend, o LLM pode instruir `add_block` com até 100 rows. O restante das rows é usado pelo LLM para análise textual.
- **`pages` no request body:** Envia apenas resumo estrutural (títulos de páginas, tipos de blocos, IDs) — NÃO envia chartData/rows. O LLM não precisa dos dados brutos para decidir o que modificar.
- **Nota sobre LIMIT:** O `query_data` tool NÃO força LIMIT no SQL do LLM. O limite de 500 rows é aplicado no resultado retornado ao contexto do LLM, não na query. A query pode retornar mais rows — os dados completos vão para o `add_block`.

### Schema Awareness

O Canvas Orchestrator tem acesso às mesmas tools de schema dos agentes existentes:
- `get_table_schema` — lista colunas e tipos de uma tabela
- `get_sample_data` — retorna amostra de rows para descoberta

Estas tools são incluídas no toolkit do orchestrator além das tools de composição de canvas.

## Estados de UI

| Estado | Comportamento |
|--------|--------------|
| **Planejando** | Indicador de "pensando..." no chat + shimmer nas abas |
| **Construindo bloco** | Skeleton animado no local do bloco |
| **Bloco pronto** | Renderiza com fade-in animation |
| **Query sem dados** | Bloco com ícone e mensagem "Sem dados para os filtros selecionados" |
| **Erro na query** | Bloco com mensagem de erro + o LLM tenta alternativa |
| **Stream interrompido** | Toast informando, blocos parciais permanecem |
| **Página vazia** | Mensagem "Comece perguntando algo sobre sua carteira" |

## Responsividade

MVP é **desktop-only** (min-width: 1024px). Em viewports menores, exibe mensagem sugerindo usar desktop. Pós-MVP: layout empilhado (painel acima, chat abaixo) para tablet.

## Componentes

### Novos Componentes Frontend

| Componente | Responsabilidade |
|------------|-----------------|
| `LandingPage` | Página raiz com cards de modo (dashboard / análise) |
| `ImmersiveLayout` | Layout fullscreen: header + painel + chat lateral |
| `CanvasHeader` | Logo, filtros globais, abas de páginas, botão voltar |
| `CanvasPanel` | Renderiza página ativa (blocos ordenados) |
| `CanvasChat` | Chat lateral com `useChat`, endpoint `/api/canvas-chat` |
| `CanvasBlockRenderer` | Switch que renderiza bloco por tipo (text/kpis/chart/table) |

### Reutiliza Componentes Existentes

- `KpiCard` (variante compact) para blocos de KPIs
- `ChartWidget` + SimpleBarChart/StackedBarChart/ComposedBarLineChart para gráficos
- `DataTableWidget` para tabelas
- `react-markdown` para blocos de texto
- `DataProvider` para estado de filtros
- Firebase auth para proteção de rotas

### Estado (Zustand)

`CanvasBlock` usa union discriminada conforme definido na seção "Contratos de Dados".

```typescript
interface CanvasPage {
  id: string
  title: string
  description?: string
  blocks: CanvasBlock[]
}

interface CanvasStore {
  sessionId: string | null
  pages: CanvasPage[]
  activePage: number

  // MVP
  createPage(title: string, description?: string): number
  addBlock(pageIndex: number, block: CanvasBlock, position?: number): void
  setActivePage(index: number): void

  // Pós-MVP
  removeBlock(pageIndex: number, blockId: string): void
  reorderBlocks(pageIndex: number, blockIds: string[]): void
  removePage(index: number): void
}
```

## Canvas Orchestrator

### Endpoint: `POST /api/canvas-chat`

Usa Canvas Orchestrator. Auth e validação de dataset extraídos para utility compartilhada (`src/shared/lib/api-auth.ts`) reutilizada por `/api/chat` e `/api/canvas-chat`.

**Request body:**
```typescript
{
  messages: Message[]
  body: {
    dataset: string
    filters: { dateRange, projetos, advancedFilters }
    sessionId?: string
    pagesContext: Array<{       // resumo estrutural apenas (sem dados brutos)
      id: string
      title: string
      blocks: Array<{ id: string; type: string; title?: string }>
    }>
  }
}
```

**Config:** `maxDuration = 600` (10 min) para acomodar múltiplas queries encadeadas.

### Tools

**MVP:**

| Tool | Input | Output | Efeito no frontend |
|------|-------|--------|-------------------|
| `plan_analysis` | prompt do usuário | `{ pages: [{ title, blocks: [{ type, query_hint }] }] }` | Nenhum (planejamento interno) |
| `create_page` | `{ title, description? }` | `{ pageIndex }` | Nova aba aparece |
| `add_block` | `{ pageIndex, block: CanvasBlock, position? }` | `{ blockId }` | Bloco renderiza na página |
| `query_data` | `{ sql, description }` | `{ rows, columns, rowCount }` | Nenhum (dados para próximo add_block) |
| `get_table_schema` | `{ table }` | `{ columns[] }` | Nenhum (descoberta de schema) |
| `get_sample_data` | `{ table, limit? }` | `{ rows[] }` | Nenhum (descoberta de dados) |
| `get_filter_options` | `{ dataset }` | `{ dates[], projetos[] }` | Popula filtros do header |
| `analyze` | `{ agent, context, question }` | `{ text }` | Texto no chat ou add_block type text |

`get_table_schema` e `get_sample_data` reutilizam as tools existentes dos agentes. `analyze` usa `generateText` (não streaming) para delegar a um agente existente e aguardar o resultado completo.

**Pós-MVP:**

| Tool | Input | Output | Efeito no frontend |
|------|-------|--------|-------------------|
| `remove_block` | `{ pageIndex, blockId }` | `{ success }` | Bloco removido |
| `reorder_blocks` | `{ pageIndex, blockIds[] }` | `{ success }` | Blocos reordenados |

### System Prompt (resumo)

O Canvas Orchestrator é instruído a:
- Agir como analista de crédito securitizado
- Pensar em storytelling — ordenar indicadores para construir raciocínio lógico
- Gerar títulos e descrições explicativas
- Usar `plan_analysis` antes de construir para pensar a estrutura
- Agrupar indicadores relacionados na mesma página
- Criar novas páginas quando o tema muda significativamente
- Na fase de conversa, decidir entre responder no chat ou modificar páginas

## Rotas

| Rota | Componente | Descrição |
|------|-----------|-----------|
| `/` | `LandingPage` | Escolha de modo (MVP: 2 cards simples) |
| `/explore` | `ImmersiveLayout` | Modo imersivo |
| `/dashboard` | `DashboardLayout` (existente) | Dashboard tradicional |
| Demais rotas | Sem mudança | Todas as páginas existentes continuam |

## Escopo do MVP

### Inclui

1. Landing page com dois cards (dashboard tradicional / análise conversacional)
2. Modo imersivo com layout painel + chat lateral + header com filtros e abas
3. Canvas Orchestrator com tools: `plan_analysis`, `create_page`, `add_block`, `query_data`, `get_table_schema`, `get_sample_data`, `get_filter_options`, `analyze`
4. Renderização de blocos: text, KPIs, charts (bar/line/area), tables
5. Streaming em tempo real — blocos aparecem conforme a IA constrói
6. Filtros globais (período e projeto) no header
7. Extração de auth para utility compartilhada (`api-auth.ts`)

### Pós-MVP

- Persistência de sessões (Firestore) e histórico na landing
- Sugestões pré-configuradas na landing
- Tools `remove_block` e `reorder_blocks`
- Comparação de períodos
- Export (PDF/CSV) das páginas geradas
- Layout responsivo para tablet
- Truncação/sumarização de histórico de conversa para sessões longas

## Impacto no Código Existente

### Não modifica

- `/api/chat` e orchestrator existente
- `/api/bigquery`
- Agentes existentes (descriptive, diagnostic, etc.)
- Todas as páginas do dashboard
- `AISidebar` e seus componentes
- Zustand store existente (`app-store.ts`)

### Modifica

- Rota raiz `/` — de redirect para `/dashboard` para nova `LandingPage`
- `/api/chat/route.ts` — extrai auth para utility compartilhada
- `next.config` — pode precisar de ajuste de rotas

### Adiciona

- `/app/explore/` — nova rota para modo imersivo
- `/app/page.tsx` — landing page
- `/src/pages/explore/` — componentes do modo imersivo
- `/src/pages/landing/` — componentes da landing page
- `/src/shared/stores/canvas-store.ts` — novo Zustand store
- `/src/shared/lib/api-auth.ts` — auth utility compartilhada
- `/src/features/canvas-orchestrator/` — meta-agente e tools
- `/app/api/canvas-chat/route.ts` — novo endpoint
