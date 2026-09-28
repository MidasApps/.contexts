# Patterns

> Patterns escolhidos para o projeto e referências.

---

## Projeto

| Campo | Valor |
|-------|-------|
| Nome | |
| Recipe base | |

---

## Patterns Selecionados

### Navegação

| Pattern | Usar | Referência |
|---------|------|------------|
| Sidebar | [ ] | Linear, Slack, VS Code |
| Tab Bar | [ ] | Instagram, Uber, iFood |
| App Bar | [ ] | Material, Twitter |
| Drawer | [ ] | Gmail, mobile apps |
| Breadcrumb | [ ] | Notion, e-commerce |
| Tabs | [ ] | Qualquer app |
| Command Palette | [ ] | Linear, Notion, VS Code |

### Layout

| Pattern | Usar | Referência |
|---------|------|------------|
| Feed | [ ] | Twitter, Instagram, TikTok |
| Kanban | [ ] | Trello, Linear, Notion |
| Master-Detail | [ ] | Mail, Slack, Notes |
| Grid Gallery | [ ] | Instagram, Pinterest |
| Dashboard | [ ] | Stripe, Analytics |
| Split View | [ ] | VS Code, Figma |
| Canvas | [ ] | Figma, Miro |

### Interação

| Pattern | Usar | Referência |
|---------|------|------------|
| Infinite Scroll | [ ] | Qualquer feed |
| Pull to Refresh | [ ] | Twitter, mobile apps |
| Drag and Drop | [ ] | Trello, Notion |
| Swipe Actions | [ ] | Mail, iFood |

### Feedback

| Pattern | Usar | Referência |
|---------|------|------------|
| Modal | [ ] | Qualquer app |
| Toast | [ ] | Qualquer app |
| Tooltip | [ ] | Qualquer app |
| Accordion | [ ] | FAQ, settings |

### Conteúdo

| Pattern | Usar | Referência |
|---------|------|------------|
| Chat | [ ] | WhatsApp, Slack |
| Rich Text | [ ] | Notion, Slack |
| Pagination | [ ] | E-commerce, tabelas |

### Data Entry

| Pattern | Usar | Referência |
|---------|------|------------|
| Search + Filters | [ ] | Airbnb, e-commerce |
| Multi-step Form | [ ] | Checkout, onboarding |

### Sistema

| Pattern | Usar | Referência |
|---------|------|------------|
| Offline Mode | [ ] | Notion, Slack |
| Realtime | [ ] | Figma, Slack |

---

## Layout Principal

**Estrutura escolhida**:

```
[ ] Sidebar + Content
[ ] Tab Bar + Content
[ ] Top Bar + Content
[ ] Split View
[ ] Canvas
[ ] Full Screen Feed
```

**Esboço**:

```
+------------------+
|                  |
|                  |
|                  |
+------------------+
```

---

## Navegação

| Breakpoint | Componente |
|------------|------------|
| Mobile | |
| Tablet | |
| Desktop | |

---

## Extensions shadcn

| Extension | Pattern | Instalar |
|-----------|---------|----------|
| cmdk | Command Palette | [ ] |
| vaul | Drawer, Bottom Sheet | [ ] |
| sonner | Toasts | [ ] |
| embla | Carousel | [ ] |
| react-day-picker | Date Picker | [ ] |
| recharts | Charts | [ ] |
| react-resizable-panels | Split View | [ ] |
| @dnd-kit | Drag and Drop | [ ] |
| @tanstack/virtual | Virtualização | [ ] |
| @tanstack/table | Tabelas | [ ] |
| tiptap | Rich Text | [ ] |

---

## Combinação (Recipe)

**Tipo de app mais próximo**:

| Recipe | Patterns Core |
|--------|---------------|
| Linear | sidebar, kanban, command, master-detail |
| Notion | sidebar, rich-text, master-detail, command |
| Twitter | feed, tab-bar, infinite-scroll |
| Slack | sidebar, chat, master-detail, realtime |
| Uber | map, tab-bar, bottom-sheet |
| iFood | feed, tab-bar, search |
| Figma | canvas, split-view, realtime |
| VS Code | sidebar, split-view, command |

---

## Densidade por Área

| Área | Densidade |
|------|-----------|
| Navegação | |
| Conteúdo principal | |
| Forms | |
| Listas | |

---

## Estados Globais

### Loading

| Contexto | Tratamento |
|----------|------------|
| Página inteira | |
| Seção/widget | |
| Botão/ação | |
| Lista/feed | |

### Empty

| Contexto | Tratamento |
|----------|------------|
| Lista vazia | |
| Busca sem resultado | |
| Primeiro uso | |

### Error

| Contexto | Tratamento |
|----------|------------|
| Erro de rede | |
| Erro de validação | |
| Erro fatal | |

---

## Acessibilidade

| Regra | Valor |
|-------|-------|
| Contraste mínimo texto | 4.5:1 |
| Contraste mínimo UI | 3:1 |
| Touch target mínimo | 44px |
| Focus ring | `ring-2 ring-ring ring-offset-2` |
| Reduced motion | Respeitar `prefers-reduced-motion` |
