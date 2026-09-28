# Coluna de páginas ao lado do chat — design

**Data:** 2026-07-30
**Status:** aprovado, pronto para plano de implementação

## Problema

A navegação entre páginas de relatório vive num dropdown no `AppBar`
(`src/widgets/app-bar/ui/AppBar.tsx:221`). Para clientes com muitas páginas
— Vila Rosa tem 13 — isso significa que a estrutura do relatório fica
invisível até o usuário clicar. O dropdown também acumula duas funções
distintas: navegar entre páginas e gerenciar a página ativa (renomear,
duplicar, excluir, criar).

Ao mesmo tempo, o `NavSidebar` ocupa 256px permanentes à esquerda com o chat
de IA, sem oferecer nenhuma navegação — apesar do nome.

## Solução

Separar em dois widgets à esquerda, cada um com uma responsabilidade:

```
┌──┬──────────────┬──────────────────────────────┐
│  │ Ⓥ Vila Rosa ⌄│ Visão Geral            ✎     │
│💬│──────────────│                              │
│  │ • Covenants  │ ┌────┐┌────┐┌────┐┌────┐     │
│  │   Empreend.  │ │KPI ││KPI ││KPI ││KPI │     │
│  │   Unidades ⋯ │ └────┘└────┘└────┘└────┘     │
│  │   Obra       │ ┌──────────┐┌──────────────┐ │
│  │   Vendas     │ │  chart   ││    chart     │ │
│  │   Recebíveis │ └──────────┘└──────────────┘ │
│  │──────────────│                              │
│  │ + Nova página│                              │
│  │ ⌸ Importar   │                              │
│  │──────────────│                              │
│⌄ │ 🛡 Admin      │                              │
│  │ 👤 Giulliano ⇥│                              │
└──┴──────────────┴──────────────────────────────┘
 64      220                  ~1200px canvas
```

| Widget | Responsabilidade | Largura |
|---|---|---|
| `widgets/chat-sidebar` (renomeado de `nav-sidebar`) | só o chat: `AISidebar` ou `ReportEditChat`, mais o botão de expandir/colapsar | 64px (rail) ↔ 256px |
| `widgets/pages-sidebar` (novo) | `ClientSwitcher` + lista de páginas + ações de página + Administração + perfil | 220px, fixa |

A coluna de páginas é a única sempre visível, então ela assume o chrome
persistente (identidade do cliente, admin, perfil) que hoje some quando a
sidebar colapsa (`NavSidebar.tsx:230`).

### Decisões e alternativas descartadas

- **Chat colapsável, páginas fixa.** Duas colunas fixas custariam ~460px
  permanentes (31% de um viewport de 1490px). Com o chat colapsado por
  padrão, o chrome cai para ~284px e o canvas volta a ~1200px. Tornar as
  duas colunas colapsáveis foi descartado: quatro estados combinados para
  desenhar, testar e persistir, sem ganho proporcional.
- **Dropdown do AppBar sai por completo.** Manter o dropdown deixaria a
  mesma lista em dois lugares na mesma tela. As ações de página passam a
  agir sobre o item apontado, não sobre um "ativo" implícito.
- **Rename `nav-sidebar` → `chat-sidebar`.** O widget deixa de ter qualquer
  navegação; o nome atual passaria a mentir. O churn é baixo: os únicos
  consumidores são `DashboardLayout` e o barrel `index.ts`.

## Componentes

### `widgets/pages-sidebar/ui/PagesSidebar.tsx`

Estrutura vertical em três faixas, com só o miolo rolando:

- **Topo (fixo):** `ClientSwitcher` — movido do `NavSidebar`.
- **Miolo (`overflow-y-auto`):** lista de páginas. Item ativo marcado com
  dot + `bg-muted/50`, como já faz `ReportListCompact` (`NavSidebar.tsx:40`).
  Cada item tem um menu `⋯` no hover/foco com renomear, duplicar e excluir,
  agindo sobre **aquele** item.
- **Rodapé (fixo):** `+ Nova página`, `⌸ Importar template`, separador,
  `Administração` (só admin) e card de perfil com logout.

Fonte de dados: `useReports(groups[0]?.id ?? null)` — exatamente a mesma do
dropdown atual. Os handlers (`handleNewPage`, `handleSwitchReport`,
`handleRenameReport`, `handleDuplicateReport`, `handleDeleteReport`,
`handleImportClick`, `ensureGroup`) migram do `AppBar` sem mudança de
comportamento, junto com `PromptDialog`/`ConfirmDialog` e o `Dialog` da
`TemplateGallery`.

`ReportListCompact` é absorvido pela lista e deixa de existir como
componente separado — o popover do modo colapsado perde a razão de ser,
já que a coluna mostra a lista o tempo todo.

### `widgets/chat-sidebar/ui/ChatSidebar.tsx`

O `NavSidebar` atual menos `ClientSwitcher`, `ReportListCompact`,
`Administração` e perfil. Sobram dois estados:

- **Rail (64px):** ícone de conversa que expande ao clique, e o botão de
  toggle na base.
- **Expandido (256px):** `ReportEditChat` quando `editingReport`, senão
  `AISidebar embedded`, mais o botão de colapsar.

### `widgets/app-bar/ui/AppBar.tsx`

Remove o `DropdownMenu` de páginas (linhas 221–277), o `Dialog` da
`TemplateGallery`, os dialogs de prompt/confirm e os handlers de CRUD.
Sobram título da página (texto simples, sem chevron), botão Editar, os
controles de modo de edição (Salvar/Cancelar), Buscar e `ThemeToggle`.

### `app/layouts/DashboardLayout.tsx`

Em `lg+` e fora de `/admin` e `/explore`, renderiza `<ChatSidebar />` e
`<PagesSidebar />` lado a lado, nessa ordem.

## Estado

Um booleano novo, `chatCollapsed`, no `app-store` (persistido, como os
snapshots de filtro por cliente). Default: `true` (colapsado).

- O toggle « e o atalho `⌘[` passam a controlar o chat — é o único painel
  colapsável que resta.
- `⌘⇧A` e o evento `toggle-ai-sidebar` continuam funcionando; passam a
  alternar `chatCollapsed`.
- Entrar em modo de edição de relatório (`editingReport`) auto-expande o
  chat, porque o fluxo de edição é conversacional (`auto-fill-report`,
  `NavSidebar.tsx:84`). Ao sair, volta ao estado anterior — o valor de
  `chatCollapsed` de antes da edição é preservado, não sobrescrito.
- A coluna de páginas não tem estado de colapso.

## Responsivo

Duas colunas só a partir de `lg` (1024px). Abaixo disso, o `Sheet` lateral
(`DashboardLayout.tsx:59`) passa a abrir a `PagesSidebar` em vez do
`NavSidebar` — é o que o ícone ☰ do `AppBar` já promete. O chat continua
acessível pelo botão Buscar / `⌘K`, em overlay. `BottomTabBar` fica
inalterado.

Entre 1024 e ~1280px o canvas aperta com o chat aberto; como o default é
colapsado, o caso comum fica confortável.

## Edge cases

1. **Sem páginas** — estado vazio na lista ("Nenhuma página ainda") com
   `+ Nova página` e `Importar template` em destaque no rodapé.
2. **Lista longa** — só o miolo rola; topo e rodapé ficam fixos.
3. **Excluir a página ativa** — redireciona para `/dashboard`, como hoje
   (`AppBar.tsx:193`).
4. **Excluir página não-ativa** — caso novo: a rota atual não muda, só a
   lista atualiza.
5. **`/admin`** — `AdminSidebar` sozinha, sem chat e sem coluna de páginas.
6. **`/explore`** — segue sem sidebars.
7. **Rotas legadas** (`/contratos`, `/pdd`, …) — a coluna aparece com nenhum
   item ativo; o título vem da página.
8. **`groups`/`reports` carregando** — skeleton nos itens, para a coluna não
   piscar vazia nem mudar de largura.
9. **Não-admin** — sem `Administração`, como hoje.

## Testes

Vitest + RTL, seguindo `src/widgets/nav-sidebar/ui/__tests__/`.

**`PagesSidebar`**
- lista as páginas retornadas pelo hook;
- clique num item navega para `/g/:groupId/r/:reportId`;
- item ativo recebe a marcação de ativo;
- estado vazio quando não há páginas;
- o menu `⋯` dispara renomear/duplicar/excluir para **aquele** item, não
  para o ativo;
- `Administração` ausente para usuário não-admin.

**Estado do chat**
- default colapsado;
- toggle alterna e o valor persiste;
- `editingReport` auto-expande e restaura ao sair.

**`AppBar`**
- não renderiza mais dropdown/chevron de páginas;
- título da página continua sendo exibido.

## Fora de escopo

Reordenar páginas por drag, favoritos, agrupamento de páginas, e a
modernização do `BottomTabBar` (que ainda aponta para as rotas legadas).
