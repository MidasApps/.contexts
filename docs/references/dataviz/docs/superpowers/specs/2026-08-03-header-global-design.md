# Header global — design

**Data:** 2026-08-03
**Status:** aprovado, pronto para plano de implementação
**Protótipo:** `docs/prototipo-header-global.html`
**Depende de:** `feat/sidebar-paginas` mergeada (spec `2026-07-30-sidebar-paginas-design.md`)

## Problema

Três ações que valem para a sessão inteira estão espalhadas por três lugares
diferentes da tela:

- **cliente ativo** — no topo da coluna de páginas (`PagesSidebar`);
- **filtros** — dentro do conteúdo, no `PageHero.actions` de cada página;
- **chat** — num rail de 64px na borda esquerda.

Nenhuma delas pertence à página aberta: trocar de cliente troca o dataset
inteiro, e os filtros valem para todas as páginas. Estar dentro do conteúdo
sugere o contrário.

Além disso o título da página aparece duas vezes — no `AppBar` e outra vez,
grande, no `PageHero` logo abaixo — e o botão "Buscar" do `AppBar` não busca
nada: ele despacha `toggle-ai-sidebar`, ou seja, é o botão do chat com rótulo
errado.

## Solução

Um header global atravessando a janela, acima de tudo, com **quatro** itens:

```
┌──────────────────────────────────────────────────────────────┐
│ Ⓥ Cliente Vila Rosa ⌄            ⚙ Filtros 3 │ 💬 │ ☀        │
├───────────┬──────────────────────────────────┬───────────────┤
│ PÁGINAS   │  Visão Geral               ✎     │  ✦ Assistente │
│ • Visão   │  Saldos e inadimplência          │               │
│   Covenan │  ┌────┐┌────┐┌────┐┌────┐        │  Como posso   │
│   Unidade │  │KPI ││KPI ││KPI ││KPI │        │  ajudar?      │
│   ...     │  └────┘└────┘└────┘└────┘        │               │
│ ───────── │  ┌──────────┐┌──────────┐        │  [_________]  │
│ 👤 perfil │  │  chart   ││  chart   │        │               │
└───────────┴──────────────────────────────────┴───────────────┘
```

**Esquerda do header:** seletor de cliente (e o ☰ abaixo de `lg`).
**Direita do header:** Filtros, ícone do chat, alternador de tema.
**Sem busca.** A lupa desaparece; o ícone de chat assume a função que o botão
já tinha de fato.

### Decisões de layout

- **O header não tem título de página.** Ele só conhece a sessão, nunca a
  página. O título volta a ser o do `PageHero`, e a duplicação atual acaba.
- **O chat abre pela direita** e **empurra o conteúdo** (não flutua sobre
  ele). O uso é conversar sobre o que está na tela; um painel sobreposto
  cobriria justamente o gráfico sendo discutido. O custo aceito é o reflow do
  canvas ao abrir e fechar.
- **O rail de 64px deixa de existir.** Com o ícone no header e o painel à
  direita, um rail na esquerda não tem função. Fechado, o chat ocupa zero.
- **Salvar/Cancelar e o lápis de editar descem para o `PageHero`**, junto do
  que está sendo editado, já que o header não tem mais espaço de página.

## Componentes

| Peça | Mudança |
|---|---|
| `widgets/app-header` (novo) | Header global, renderizado uma vez pelo `DashboardLayout`. Compõe `TopbarClientSwitcher`, `FiltersButton`, botão do chat e `ThemeToggle`, mais o ☰ mobile. |
| `widgets/chat-sidebar` | Passa a ser painel à **direita**, depois do conteúdo no DOM. Sem estado de rail: aberto (256px) ou ausente. |
| `widgets/pages-sidebar` | Perde o `ClientSwitcher` do topo. Fica lista de páginas + ações + Administração + perfil. |
| `shared/ui/page-hero` | `actions` passa a receber o lápis de editar e, em modo de edição, o chip "Editando" + Salvar/Cancelar. |
| `widgets/app-bar` | Sai das 8 páginas de dashboard. **Continua existindo para as 4 páginas de admin**, que não têm `PageHero` e não devem receber cliente nem filtros. Perde o botão da lupa. |

Reaproveitados sem reescrita: **`TopbarClientSwitcher`** (já existe, estilo
pill de topbar, com busca e preservação de filtros por cliente) e
**`FiltersButton`** (já existe, com contador de filtros ativos). O
`FilterPanel` que o botão abre já contém período, Último mês/Acumulado,
Comparar períodos, projetos e filtros avançados — nada disso sobe para o
header.

## Estado e eventos

`chatCollapsed` no `app-store` passa a se chamar **`chatOpen`**, com a
semântica invertida e default `false`. Com o rail eliminado, "colapsado"
descreve um estado que não existe mais; o chat está aberto ou não está.
A persistência em `localStorage` continua, na chave `liquid:chatOpen`.

O evento `toggle-ai-sidebar` continua sendo o contrato, agora despachado pelo
ícone do header e pelos atalhos `⌘K` / `⌘⇧A`. A guarda por viewport já
existente (`isDesktopViewport()`, em `shared/lib/viewport.ts`) continua
válida: em `lg+` alterna `chatOpen`; abaixo, abre a gaveta do chat.

`toggle-nav-collapse` (`⌘[`) perde o sentido — não há mais nada colapsável
além do chat, que já tem dois atalhos. O atalho é removido do
`useKeyboardShortcuts` e da lista do diálogo de atalhos.

## Migração das páginas

**8 páginas de dashboard** renderizam hoje `AppBar` **e** `PageHero`:
`ReportPage`, `RouteTemplatePage`, `CovenantsConfiguracaoPage`,
`EvolucaoObraPage`, `OpenBankingPage`, `AnexosElegibilidadePage`,
`AnexosPddPage`, `AnexosRatingPage`.

Em todas: remover o `<AppBar>` e mover para `PageHero.actions` o que era dele.
Só o `ReportPage` tem controles de edição; nas outras o `AppBar` só carregava
o título, que o `PageHero` já mostra.

O `ReportPage` usa `AppBar` em três pontos — carregando, não encontrado, e o
render principal. Nos dois primeiros o header servia só para exibir
"Carregando..." e "Relatório não encontrado"; essas mensagens passam a viver
no próprio corpo da página.

**5 páginas de admin**: `AdminPage`, `AgentQualityPage`,
`OrchestratorAnalyticsPage` e `AdminSqlCatalogPage` continuam com o `AppBar`
como está, menos a lupa. A quinta, `TemplateEditorPage`
(`app/(admin)/admin/templates/[id]/page.tsx`), nunca usou o `AppBar` — tem
um header próprio (voltar, título do template, Salvar/Cancelar). Nenhuma das
5 recebe o header global, tem cliente ativo ou filtros; todas seguem com a
`AdminSidebar`.

## Responsivo

Abaixo de `lg` (1024px) o header sobrevive inteiro: o ☰ reaparece à esquerda
do cliente, o cliente perde o rótulo "Cliente" e o Filtros vira ícone com
contador, sem o texto.

As duas colunas viram gavetas, **cada uma do seu lado**: páginas pela
esquerda (☰), chat pela direita (💬) — coerente com a posição delas no
desktop.

## Edge cases

1. **Sem cliente carregado** — o `TopbarClientSwitcher` já trata: mostra
   spinner e "Carregando…", depois "Nenhum cliente".
2. **Fora do `DataProvider`** — `FiltersButton` já retorna `null` por
   `try/catch`. O header renderiza sem ele em vez de quebrar.
3. **Rotas de admin** — sem header global; `AdminSidebar` + `AppBar` como
   hoje.
4. **`/explore` (imersivo)** — segue sem header e sem colunas.
5. **Chat aberto + janela estreitando para menos de `lg`** — o painel da
   direita deixa de ser coluna; o estado `chatOpen` continua guardado e volta
   a valer quando a janela alarga.
6. **Modo de edição de relatório** — o chat auto-abre à direita (é fluxo
   conversacional) e Salvar/Cancelar ficam no `PageHero`.
7. **Rotas legadas** (`/contratos`, `/pdd`, …) — recebem o header global
   normalmente; nenhum item da coluna de páginas fica ativo.
8. **Página em carregamento ou inexistente** (`ReportPage`) — o header global
   continua na tela; a mensagem aparece no corpo.

## Testes

Vitest + RTL, seguindo os padrões já estabelecidos em
`src/widgets/*/ui/__tests__/`.

**`AppHeader`**
- renderiza os quatro itens: cliente, filtros, chat, tema;
- o botão do chat despacha `toggle-ai-sidebar`;
- **não** renderiza nenhum controle de busca;
- o ☰ despacha `toggle-nav-sidebar`.

**Estado do chat**
- `chatOpen` default `false` e persistido em `liquid:chatOpen`;
- acima de `lg` o evento alterna o estado; abaixo, não altera o estado
  (mantendo a exclusividade por viewport já testada na branch anterior).

**`PagesSidebar`**
- não renderiza mais o seletor de cliente;
- o resto da suíte existente continua valendo.

**Páginas migradas**
- `ReportPage` renderiza Salvar/Cancelar em modo de edição sem o `AppBar`.

## Fora de escopo

Busca de verdade (páginas, indicadores); reformulação da `BottomTabBar`;
unificar o `AppBar` de admin com o header global; mover período e Comparar
para fora do `FilterPanel`.
