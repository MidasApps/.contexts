# Patterns

> Patterns escolhidos para o projeto e referencias.

---

## Projeto

| Campo | Valor |
|-------|-------|
| Nome | Liquid DataViz |
| Recipe base | Metabase (dashboard analytics) + Linear (sidebar + command) + Notion (page builder) + Liquid brand |

---

## Patterns Selecionados

### Navegacao

| Pattern | Usar | Referencia |
|---------|------|------------|
| Sidebar | [x] | Metabase, Linear. Navegacao principal no desktop (esquerda) |
| Tab Bar | [x] | Mobile only. Tabs na parte de baixo da tela |
| App Bar | [x] | Header com filtros globais (Data Base Report, Projeto) |
| Drawer | [x] | Mobile: sidebar colapsa em drawer |
| Breadcrumb | [x] | Navegacao dentro de drill-downs de indicadores |
| Tabs | [x] | Tabs dentro de paginas. No canvas: tabs por mini-pagina com rename, reorder (drag), delete |
| Command Palette | [x] | Busca rapida de indicadores e navegacao (Cmd+K) |

### Layout

| Pattern | Usar | Referencia |
|---------|------|------------|
| Feed | [ ] | -- |
| Kanban | [ ] | -- |
| Master-Detail | [x] | Clicar em indicador para ver drill-down detalhado |
| Grid Gallery | [ ] | -- |
| Dashboard | [x] | Layout principal: grid de cards com KPIs, tabelas e graficos |
| Split View | [x] | Dashboard + AI sidebar (direita). Explore: sidebar chat (esquerda) + canvas (direita) |
| Canvas / Page Builder | [x] | Explore page: AI constroi paginas com blocos (KPI, chart, table, text) em grid de 3 colunas. Blocos tem colSpan (1/3, 2/3, 3/3), drag-and-drop, toolbar floating, selecao multipla |

### Interacao

| Pattern | Usar | Referencia |
|---------|------|------------|
| Infinite Scroll | [ ] | -- |
| Pull to Refresh | [ ] | -- |
| Drag and Drop | [x] | Canvas blocks: reordenar blocos entre linhas. Tabs: reordenar paginas. Nativo HTML drag (sem @dnd-kit) |
| Swipe Actions | [ ] | -- |
| Inline Edit | [x] | Tabs: double-click para renomear, input auto-size |
| Floating Toolbar | [x] | Toolbar aparece acima do block on hover/selecao. Contem: checkbox selecao, column span toggle, drag handle, delete |
| Multi-select | [x] | Selecionar multiplos blocos via toolbar checkbox. Selection bar fixa no bottom mostra contagem e permite limpar |

### Feedback

| Pattern | Usar | Referencia |
|---------|------|------------|
| Modal | [x] | Confirmacoes de exclusao (blocos, paginas), detalhes de contratos, KPI expanded |
| Toast | [x] | Notificacoes de acoes (filtro aplicado, export concluido) |
| Tooltip | [x] | Explicacao de indicadores, ajuda contextual |
| Accordion | [x] | Agrupar filtros avancados, detalhes expandiveis |
| Stale Data Banner | [x] | Banner amarelo quando filtros mudam e dados do canvas ficam desatualizados |

### Conteudo

| Pattern | Usar | Referencia |
|---------|------|------------|
| Chat | [x] | Agente AI conversacional. Dashboard: sidebar direita. Explore: sidebar esquerda com lista de conversas + chat |
| Rich Text | [ ] | -- |
| Pagination | [x] | Tabelas de contratos e pagamentos |
| Streaming | [x] | AI responses em tempo real, tool call indicators com labels em portugues |
| Markdown | [x] | Blocos de texto no canvas renderizados como markdown (ReactMarkdown + remark-gfm) |

### Data Entry

| Pattern | Usar | Referencia |
|---------|------|------------|
| Search + Filters | [x] | Filtros globais (periodo, projeto, data base) + busca de contratos |
| Multi-step Form | [ ] | -- |

### Sistema

| Pattern | Usar | Referencia |
|---------|------|------------|
| Offline Mode | [ ] | -- |
| Realtime | [x] | AI agent respostas em streaming, dados atualizados |
| Persistence | [x] | Conversas salvas no Firestore com auto-save. Paginas canvas persistem com a conversa |
| Desktop Gate | [x] | Explore page: gate que bloqueia acesso mobile (<1024px) com mensagem |
| Auth Gate | [x] | Explore page: requer Firebase auth |

---

## Layout Principal — Dashboard

**Estrutura**:

```
+----------+----------------------------------+-----------+
|          |                                  |           |
| Nav      |       Dashboard Content          |  AI Agent |
| Sidebar  |   +-------+ +-------+ +------+  |  Chat     |
| (240px)  |   | KPI 1 | | KPI 2 | | KPI 3| |  Sidebar  |
|          |   +-------+ +-------+ +------+  |  (360px)  |
| - Home   |                                  |           |
| - Contr. |   +---------------------------+  |  [Input]  |
| - Pagam. |   |     Chart / Table          |  |  [Msgs]   |
| - Fluxo  |   |                            |  |  [Sugge]  |
| - PDD    |   +---------------------------+  |           |
| - Simul. |                                  |           |
| - Pricing|   +---------------------------+  |           |
|          |   |     Table Detail            |  |           |
+----------+----------------------------------+-----------+
```

## Layout Explore — Canvas AI Page Builder

**Estrutura**:

```
+-------------------+-----------------------------------------------+
|                   | [Filtros]                   [Periodo] [Modo]  |
| Client Switcher   +-----------------------------------------------+
|                   | [Tab 1] [Tab 2] [Tab 3]              (rename/|
| [Painel Indicad.] |                                    reorder/del)|
| [+ Nova conversa] +-----------------------------------------------+
|                   | Descricao da pagina                           |
| === Conversas === |                                               |
| - Conv 1          | +--------+ +--------+ +--------+             |
| - Conv 2 (pinned) | | KPI    | | KPI    | | KPI    |  <- colSpan=1|
| - Conv 3          | +--------+ +--------+ +--------+             |
|                   |                                               |
| === Chat ===      | +---------------------------+                 |
| [AI messages]     | |  Chart (colSpan=2)        | +--------+     |
| [Tool indicators] | |                           | | Text   |     |
| [User input]      | +---------------------------+ +--------+     |
|                   |                                               |
| [BQML toggle]     | +--------------------------------------------+
| [Analise Profunda]| |  Table (colSpan=3, full width)              |
|                   | +--------------------------------------------+
+-------------------+-----------------------------------------------+
```

### Canvas Grid System

| Propriedade | Valor |
|-------------|-------|
| Colunas | 3 (`grid-cols-3`) |
| Gap | 16px (`gap-4`) |
| Padding horizontal | 24px (`px-6`) |
| Block colSpan | 1 (1/3), 2 (2/3), 3 (full) via `grid-column: span N` |

### Canvas Block Toolbar

| Elemento | Posicao | Comportamento |
|----------|---------|---------------|
| Container | `absolute bottom-full mb-1` (acima do bloco, 4px gap) | Aparece on hover ou selecao |
| Hover zone | `before:-top-3` (12px pseudo-element invisivel) | Impede flickering ao mover mouse para toolbar |
| Checkbox (esquerda) | Toggle selecao | Mostra indice quando selecionado |
| Column span (centro) | Cycla 1/3 -> 2/3 -> 3/3 | Icone muda: Columns3, Columns2, RectangleHorizontal |
| Drag handle (centro) | `draggable`, `cursor-grab` | Reordena blocos via HTML drag API |
| Delete (direita) | Abre modal de confirmacao | Icone X, hover vermelho |

### Canvas Block colSpan — Defaults da AI

| Tipo de bloco | colSpan default | Razao |
|---------------|-----------------|-------|
| KPI | 1 (1/3) | KPIs ficam lado a lado em fileiras de 3 |
| Texto | 2 (2/3) | Textos introdutorios com respiracao |
| Grafico | 2 (2/3) | Graficos precisam de espaco; 3 para muitas categorias |
| Tabela | 3 (full) | Tabelas precisam de largura total |

### Canvas Page Tabs

| Funcionalidade | Interacao |
|----------------|-----------|
| Ativar | Click |
| Renomear | Double-click abre input inline (auto-size via hidden span measurer) |
| Reordenar | Drag and drop entre tabs (HTML drag, `text/tab-index` data transfer) |
| Excluir | Botao X on hover, abre modal de confirmacao. Desabilitado quando so 1 pagina |

---

## Navegacao

| Breakpoint | Componente |
|------------|------------|
| Mobile (<768px) | Tab Bar no fundo (4-5 itens) + App Bar no topo com filtros. AI abre como drawer full-screen |
| Tablet (768-1023px) | Sidebar colapsavel (icones) + conteudo. AI abre como drawer lateral |
| Desktop (>=1024px) | Sidebar expandida (240px) + conteudo + AI sidebar (360px, toggle) |

---

## Extensions shadcn

| Extension | Pattern | Em uso |
|-----------|---------|--------|
| cmdk | Command Palette | [x] |
| vaul | Drawer, Bottom Sheet | [x] |
| sonner | Toasts | [x] |
| embla | Carousel | [ ] |
| react-day-picker | Date Picker | [x] |
| recharts | Charts | [x] |
| react-resizable-panels | Split View (AI sidebar) | [x] |
| @tanstack/virtual | Virtualizacao (tabelas grandes) | [x] |
| @tanstack/table | Tabelas | [x] |
| react-markdown + remark-gfm | Markdown rendering | [x] |

---

## Combinacao (Recipe)

**Tipo de app mais proximo**: Metabase + Linear + Notion hybrid

| Recipe | Patterns Core |
|--------|---------------|
| **Liquid DataViz** | sidebar, dashboard, split-view, canvas/page-builder, command, chat, master-detail, drag-and-drop, multi-select, floating-toolbar, inline-edit, realtime |

Combina:
- **Metabase**: Dashboard grid de KPIs + graficos + tabelas, filtros globais, drill-down
- **Linear**: Sidebar limpa, command palette, transicoes suaves
- **Notion**: Page builder com blocos reposicionaveis, inline editing, slash commands
- **Slack**: Chat sidebar (para o AI agent), conversas persistentes

---

## Densidade por Area

| Area | Densidade | Principio Liquid |
|------|-----------|------------------|
| Navegacao (sidebar) | Compact | Permite mais itens visiveis |
| Dashboard (KPIs) | Default | Permeabilidade: respiro visual |
| Tabelas | Default | Permeabilidade: linhas legiveis |
| Graficos | Comfortable | Espaco para visualizacao de dados |
| AI Chat | Compact | Maximiza historico visivel |
| Filtros | Compact | Condensacao: agrupados coesamente |
| Forms/Modais | Default | Conforto de interacao |
| Canvas toolbar | Compact | Minimo footprint: text-[10px], py-1, h-4 buttons |
| Canvas tabs | Compact | text-xs, py-2.5, gap-1 |

---

## Estados Globais

### Loading

| Contexto | Tratamento | Principio Liquid |
|----------|------------|------------------|
| Pagina inteira | Skeleton (shimmer) dos cards e tabelas | Fluidez |
| Secao/widget | Skeleton individual do widget | Condensacao |
| Botao/acao | Spinner inline no botao + disabled | Colisao |
| Lista/feed | Skeleton rows nas tabelas | Permeabilidade |
| Charts | Skeleton com outline do grafico | Transparencia |
| AI responses | Streaming text + tool call indicators (labels PT-BR) | Fluidez |
| Conversa carregando | Skeleton centralizado (h-8 w-48) | Fluidez |
| Canvas crossfade | Opacity transition 300ms entre welcome e canvas | Evaporacao |

### Empty

| Contexto | Tratamento |
|----------|------------|
| Lista vazia | Ilustracao minimalista + texto explicativo + CTA |
| Busca sem resultado | Texto "Nenhum resultado" + sugestoes |
| Primeiro uso (Explore) | Welcome page com input e sugestoes de analise |
| Dashboard sem dados | Cards com estado vazio + mensagem |
| Canvas sem blocos | Icone Sparkles + mensagem "Suas visualizacoes aparecerao aqui" |

### Error

| Contexto | Tratamento |
|----------|------------|
| Erro de rede | Toast com opcao de retry + fallback |
| Erro de validacao | Inline no campo + mensagem clara |
| Erro fatal | Pagina de erro com opcao de voltar + reportar |
| Erro de query (BigQuery) | Card com mensagem de erro + botao retry |
| AI error | Mensagem no chat + sugestao de reformular |

### Selection (Canvas)

| Estado | Tratamento visual |
|--------|------------------|
| Block hover | Toolbar aparece (opacity 0->1, duration-150) |
| Block selected | Ring `ring-1 ring-[#F3A169]/30`, toolbar com bg `#F3A169/10`, badge circular no canto |
| Multi-select ativo | Blocos nao selecionados ficam `opacity-50`. Selection bar sticky no bottom |
| Drag target | Border colorido `border-[3px] border-[#3b82f6]` no lado mais proximo |

---

## Acessibilidade

| Regra | Valor |
|-------|-------|
| Contraste minimo texto | 4.5:1 (WCAG AA) |
| Contraste minimo UI | 3:1 |
| Touch target minimo | 44px |
| Focus ring | `ring-2 ring-primary ring-offset-2 ring-offset-background` |
| Reduced motion | Respeitar `prefers-reduced-motion` (anula animacoes via globals.css) |
| Leitor de tela | ARIA labels em graficos e indicadores |
| Navegacao teclado | Elementos interativos acessiveis via Tab |
| Escape | Fecha modais, cancela rename de tab |

---

## Telas do Dashboard

| Tela | Tipo | Elementos principais |
|------|------|---------------------|
| Home / Visao Geral | Dashboard grid | KPIs resumidos + graficos principais |
| Contratos | Dashboard + tabela | KPIs de carteira + tabela por rating |
| Pagamentos | Dashboard + tabela | Indicadores de pagamento + tabela |
| Fluxo de Caixa | Dashboard + graficos | Graficos temporais + tabela de fluxo |
| PDD | Dashboard + tabela | Provisao por rating + tabela detalhada |
| Pricing da Carteira | Tabela | Tabela completa com pricing por rating |
| Simulacao em Bancos | Dashboard + tabela | Grafico LTV + tabela de stress |
| Elegibilidade | Tabela informativa | Criterios de elegibilidade |
| Anexos | Pagina informativa | Texto explicativo + tabela de referencia |
| **Explore** | Canvas AI Page Builder | Chat conversacional + canvas com blocos construidos por IA (KPI, chart, table, text). Multi-pagina com tabs, drag-and-drop, selecao, toolbar floating. Desktop only. |
