# Assistente único — plano de implementação

**Goal:** Um assistente só, capaz de analisar E de construir páginas, em qualquer
tela — eliminando as duas pilhas de chat paralelas que hoje fazem a capacidade
mudar conforme o local.

**Arquitetura:** O supervisor Mastra (`/api/chat`, runtime de registro pela
ADR-0019) absorve as ferramentas de autoria. `/api/canvas-chat` e o
`canvas-orchestrator` são aposentados. Os dois componentes de chat
(`AISidebar` e `ChatPanel`) viram um. Página passa a ser sempre um documento de
relatório no Firestore — o conceito de "página de canvas" efêmera acaba.

**Stack:** Mastra `Agent` (`agents:` + `tools:`), AI SDK v6 `tool()`, Firestore.

## Diagnóstico que motiva o plano

| Sintoma observado | Causa |
|---|---|
| Assistente geral recusa criar página | `/api/chat` não tem tool de autoria; elas só existem em `/api/canvas-chat` |
| Capacidade muda conforme a tela | `ChatContent` troca de componente E de rota conforme `editingReport` |
| `create_page` não persiste | Cria página no canvas store; `ReportPage.handleSave` grava só `pages[0]` |
| Mesma lógica de aplicar tool em dois lugares | `AISidebar` e `ChatPanel` duplicam o `switch` de tool→store |

## Global Constraints

- Escopo de tenant é **server-bound** (ADR-0006): tool nenhuma aceita `clientId`
  do cliente. Vem do contexto do servidor.
- Toda escrita nova valida dono antes do side effect, como `/api/reports` já faz.
- BigQuery é somente leitura.
- Sem quebrar o editor de templates do admin (`TemplateEditorPage`), que usa o
  mesmo `CanvasPanel` com `authoring`.
- Cada task termina verificável: `pnpm test` + `pnpm exec tsc --noEmit`.

---

### Task 1: tool `create_report_page` (persistência real)

**Files:** criar `src/features/ai-agents/tools/create-report-page.ts`;
teste ao lado.

Cria o documento em `clients/{clientId}/groups/{groupId}/reports/{id}` via
Firestore admin, com `clientId` do contexto server-bound. Devolve
`{ action:'report_page_created', groupId, reportId, name }` para o cliente
navegar. Resolve o grupo default quando não informado (mesmo `ensureGroup` que a
PagesSidebar usa).

- [x] Teste: cria com nome pedido; rejeita nome vazio; usa clientId do ctx e
      ignora qualquer um vindo do input; devolve ids.
- [x] Implementar.
- [ ] Commit.

### Task 2: tools de autoria no registry + no supervisor

**Files:** `src/features/ai-studio/runtime/tool-registry.ts`,
`src/features/ai-agents/mastra/build-supervisor-agent.ts`.

Registrar `create_report_page` e as tools de bloco (`add_*_block`,
`update_*_block`, `remove_block`, `move_block`) no `TOOL_REGISTRY`, e passar o
conjunto ao supervisor via `tools:` (hoje ele só tem `agents:`).

- [x] Teste: supervisor recebe as tools de autoria; sub-agentes seguem intactos.
- [x] Implementar (em `mastra/authoring-tools.ts`, não no `TOOL_REGISTRY`: o
      registry é do AI Studio, por chave de configuração; autoria é do supervisor
      e depende do `pagesContext` da requisição).
- [ ] Commit.

### Task 3: um único aplicador de resultado de tool

**Files:** criar `src/features/canvas-orchestrator/apply-tool-result.ts`;
remover o `switch` duplicado de `AISidebar` e `ChatPanel`.

Função pura `aplicarResultadoDeTool(result, deps)` — testável sem render.

- [x] Teste: cada ação aplica no store; resultado sem `action` não aplica nada.
- [x] Implementar e apontar os dois componentes para ela.
- [ ] Commit.

A diferença entre as duas telas virou dependência, não código duplicado:
`resolvePageIndex` e `criarPagina`. O relatório tem uma página só e omite
`criarPagina`; o explore mantém o mapa servidor→store.

**Consumidor de `report_page_created` (fecha a Task 1).** A `AISidebar` cria a
página no canvas como ATIVA — os blocos que a IA adiciona em seguida caem nela,
e a página que estava aberta fica intacta. No fim do turno (`status === 'ready'`)
grava via `updateReport` e navega. Gravar durante o streaming pegaria a página
pela metade; navegar antes de gravar remontaria o relatório a partir do
documento vazio e os blocos sumiriam.

### Task 4: um único componente de chat

**Files:** `src/widgets/chat-sidebar/ui/ChatContent.tsx`,
`src/widgets/ai-sidebar/ui/AISidebar.tsx`,
`src/pages/explore/ui/ConversationSidebar.tsx`.

`ChatContent` deixa de trocar de componente por `editingReport`. Sobra um, com
histórico de conversas, e as tools disponíveis não dependem mais da tela.

- [x] Teste: mesma tela, com e sem `editingReport`, monta o mesmo componente.
- [x] Implementar — `ChatContent` virou uma linha: `<AISidebar embedded />`.
      `ReportEditChat` deixou de existir; o `auto-fill-report` que ele escutava
      já tinha listener na `AISidebar`. Ganho de brinde: durante a edição agora
      existe histórico de conversas, que o `ChatPanel` não tinha.
- [ ] Commit.

### Task 5: aposentar `/api/canvas-chat` e o canvas-orchestrator

**Files:** remover `app/api/canvas-chat/`,
`src/features/canvas-orchestrator/orchestrator.ts` e o prompt
`canvas-orchestrator.ts`; migrar o que sobrar de útil (gate de tools do
`prepare-step`) para o supervisor.

- [x] Verificar que nada mais importa os removidos.
- [x] Implementar.
- [ ] Commit.

**O plano subestimou o alcance.** `/api/canvas-chat` tinha um consumidor vivo
que a tabela de diagnóstico não citava: a rota `/explore` ("Análise
Conversacional", linkada da landing). Decisão do usuário: aposentar junto.

Saiu, além do previsto: `app/(dashboard)/explore/`, `ExplorePage`,
`ExploreWelcome`, `ConversationSidebar`/`ChatPanel`, o `orchestrator-workflow` e
seus `steps/`+`workflow/` (motor de workflow próprio), 16 tools que só ele usava
(`declare_layout`, `fill_block`, `add_slot`, `remove_slot`, `create_page`,
`set_filters`, `query-data`, …), o smoke script, e os tipos órfãos em
`agents/types.ts` (`Intent`, `GatheredContext`, `LayoutPlan`, `ValidationReport`,
`SlotSpec`, `FillBlockResult`). **63 arquivos.**

O que sobrou da feature são as 4 tools de bloco + o aplicador — nada de
orquestrador. Por isso `canvas-orchestrator/` virou **`report-authoring/`**:
manter o nome de uma coisa que não existe mais é o tipo de deriva que confunde
quem chega depois.

O gate de tools do `prepare-step` não foi migrado: ele existia para esconder
tools por fase do workflow de canvas. Sem workflow, não há fase — o supervisor
recebe o conjunto inteiro e escolhe.

Consequência assumida: o fluxo de esqueleto (bloco `skeleton` → `fill_block`)
deixou de existir. O tipo e o renderer continuam, para dados antigos que ainda
tenham blocos assim; nenhum caminho novo os cria.

### Task 6: salvar o relatório inteiro

**Files:** `src/pages/report/ui/ReportPage.tsx`.

`handleSave` grava só `pages[0]`. Com página = relatório, o canvas passa a ter
uma página só por definição — a task fecha o buraco e trava com teste.

- [x] Teste: salvar preserva todo o blockMap e layout correntes.
- [x] Implementar — `paginaDoRelatorio(pages, reportId)` em `report-canvas.ts`.
      O defeito não era "grava só a primeira página": era gravar **por posição**.
      O canvas edita `pages[activePage]`, e a IA agora cria página no meio da
      conversa; a página se identifica pelo id, que `loadPages` preserva. Sem
      correspondência não grava — perder um clique em "Salvar" é recuperável,
      sobrescrever o relatório com a página errada não.
- [ ] Commit.

## Fora de escopo (registrado, não feito)

- **`/docs` documenta arquitetura que não existe mais.** A rota interna de
  explicação (`app/docs/`, `src/pages/docs/`) descreve o orquestrador de canvas,
  o `ChatPanel` e o fluxo do `/explore` como se fossem vivos —
  `docs-data.ts:57` ainda tem um agente `canvas-orchestrator`. Reescrever é
  trabalho de documentação, não deste plano; fica sinalizado porque é
  informação errada servida na aplicação.
- **`src/pages/explore/` sem página.** A pasta virou slice compartilhado de
  renderização de bloco (`CanvasPanel`, `CanvasBlockRenderer`, `blocks/*`), sem
  rota `/explore`. O lugar certo é `src/widgets/`; a mudança são ~15 arquivos
  com importadores em `report` e `admin-template-editor`.

- Sparkline nos KPIs/gauges: bloqueado por dados (2 meses de base).
- `POST /api/metrics/rename` não re-aponta `metricId`/`sparklineMetricId` dentro
  de `blockMap` (achado da auditoria de 21/07).
- Eixo Y do gráfico de Inadimplência todo em `0` (formatação).
