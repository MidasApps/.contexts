# Header global Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tirar cliente, filtros e chat de três lugares diferentes da tela e
reuni-los num header global, com o chat abrindo pela direita.

**Architecture:** Um widget novo `app-header`, renderizado uma vez pelo
`DashboardLayout`, compõe dois componentes que já existem
(`TopbarClientSwitcher`, `FiltersButton`) mais o botão do chat e o
`ThemeToggle`. A `ChatSidebar` muda de lado e perde o rail; a `PagesSidebar`
perde o seletor de cliente; o `AppBar` sai das 8 páginas de dashboard e
sobrevive só nas 4 de admin.

**Tech Stack:** Next.js 16 App Router, React 19, Zustand, Tailwind v4,
shadcn/ui (Radix), Vitest + Testing Library + happy-dom.

**Spec:** `docs/superpowers/specs/2026-08-03-header-global-design.md`
**Protótipo:** `docs/prototipo-header-global.html`

## Global Constraints

- Package manager é **pnpm** — nunca npm ou yarn.
- Toda copy de UI em **PT-BR**.
- Só **tokens semânticos** de cor (`bg-background`, `text-foreground`,
  `bg-muted/40`, `border-border`, `text-muted-foreground`). Cores hardcoded
  (`text-white/X`, `bg-[#hex]`) são proibidas — o tema tem light e dark.
- Nenhuma mudança em Firestore, rotas ou no modelo flat de páginas.
- Branch de trabalho: `feat/header-global` (já criada, com o spec commitado).
  Ela sai de `feat/sidebar-paginas`, que está em revisão no PR #48.
- Commits em conventional commits, mensagem em PT-BR. **Não fazer push.**
- Rodar sempre os testes específicos da task, nunca a suíte inteira: ela tem
  uma falha conhecida e não relacionada (`app/api/chat/__tests__/route.test.ts`,
  timeout de 5s sob carga — passa isolada, 7/7).
- Cada `describe` precisa ser auto-suficiente: rodar isolado com `-t` e
  passar. Um describe que só passa junto com os vizinhos é defeito — já
  aconteceu duas vezes neste projeto.
- Nos relatórios, transcrever o stderr real (`--reporter=verbose`) e
  classificar o ruído. Há um warning pré-existente do Radix
  ("Missing Description for DialogContent") vindo do `PromptDialog` na suíte
  da `PagesSidebar` — esse não é desta feature.

---

## File Structure

**Criados**

| Arquivo | Responsabilidade |
|---|---|
| `src/widgets/app-header/index.ts` | barrel |
| `src/widgets/app-header/ui/AppHeader.tsx` | header global: ☰ mobile, cliente, filtros, chat, tema |
| `src/widgets/app-header/ui/__tests__/AppHeader.test.tsx` | testes do header |

**Modificados**

| Arquivo | Mudança |
|---|---|
| `src/shared/stores/app-store.ts` | `chatCollapsed` → `chatOpen` (semântica invertida) |
| `src/shared/stores/app-store.test.ts` | idem |
| `src/widgets/chat-sidebar/ui/ChatSidebar.tsx` | painel à direita, sem rail |
| `src/widgets/chat-sidebar/ui/__tests__/ChatSidebar.test.tsx` | idem |
| `src/widgets/pages-sidebar/ui/PagesSidebar.tsx` | remove o `ClientSwitcher` do topo |
| `src/widgets/pages-sidebar/ui/__tests__/PagesSidebar.test.tsx` | idem |
| `src/app/layouts/DashboardLayout.tsx` | monta o header; chat à direita; Sheet do chat vira `side="right"` |
| `src/shared/hooks/useKeyboardShortcuts.ts` | remove `⌘[` |
| `src/widgets/app-bar/ui/AppBar.tsx` | remove o botão da lupa |
| 7 páginas simples + `ReportPage` | removem o `<AppBar>` |

**Intocados de propósito:** `TopbarClientSwitcher`, `FiltersButton`,
`FilterPanel`, `ClientSwitcher` (ainda usado em nenhum lugar após a Task 3 —
ver nota na Task 3), `AdminSidebar`, `BottomTabBar`, `GlobalFilters`. Nota
corrigida na revisão final de branch: `GlobalFilters` **não** é usado só no
`/explore` — o `CanvasPanel` (`src/pages/explore/ui/CanvasPanel.tsx`) também
o renderiza no ramo não-`authoring`, e esse mesmo `CanvasPanel` é reusado
pelo `ReportPage` em modo de edição. Essa premissa errada foi a causa do
Bloco 2 do fix-final-review: duplicava cliente/Filtros com o header global
dentro do modo de edição do `ReportPage`.

---

### Task 1: Renomear `chatCollapsed` para `chatOpen`

**Files:**
- Modify: `src/shared/stores/app-store.ts`
- Modify: `src/shared/stores/app-store.test.ts`
- Modify: `src/widgets/chat-sidebar/ui/ChatSidebar.tsx`
- Modify: `src/widgets/chat-sidebar/ui/__tests__/ChatSidebar.test.tsx`

**Interfaces:**
- Consumes: nada.
- Produces:
  ```ts
  chatOpen: boolean;                      // true = painel visível
  setChatOpen: (open: boolean) => void;
  toggleChatOpen: () => void;
  ```
  Persistido em `localStorage` na chave `liquid:chatOpen` (`'1'` = aberto,
  `'0'` = fechado). Chave ausente ⇒ `false`.

Rename mecânico com semântica invertida. O rail some só na Task 4; aqui a
`ChatSidebar` continua igual, apenas lendo o booleano invertido.

- [ ] **Step 1: Reescrever os testes do store**

Em `src/shared/stores/app-store.test.ts`, substitua o describe
`app-store chatCollapsed` inteiro por:

```ts
describe('app-store chatOpen', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ chatOpen: false });
  });

  it('começa fechado por padrão', () => {
    expect(useAppStore.getState().chatOpen).toBe(false);
  });

  it('toggleChatOpen alterna o valor', () => {
    useAppStore.getState().toggleChatOpen();
    expect(useAppStore.getState().chatOpen).toBe(true);
    useAppStore.getState().toggleChatOpen();
    expect(useAppStore.getState().chatOpen).toBe(false);
  });

  it('setChatOpen persiste em localStorage', () => {
    useAppStore.getState().setChatOpen(true);
    expect(localStorage.getItem('liquid:chatOpen')).toBe('1');
    useAppStore.getState().setChatOpen(false);
    expect(localStorage.getItem('liquid:chatOpen')).toBe('0');
  });

  it('toggleChatOpen também persiste', () => {
    useAppStore.getState().setChatOpen(false);
    useAppStore.getState().toggleChatOpen();
    expect(localStorage.getItem('liquid:chatOpen')).toBe('1');
  });

  it('lê o default do localStorage na inicialização', async () => {
    localStorage.clear();
    vi.resetModules();
    const m = await import('./app-store');
    expect(m.useAppStore.getState().chatOpen).toBe(false);
  });

  it('lê chatOpen=true quando a chave é "1"', async () => {
    localStorage.setItem('liquid:chatOpen', '1');
    vi.resetModules();
    const m = await import('./app-store');
    expect(m.useAppStore.getState().chatOpen).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run src/shared/stores/app-store.test.ts`
Expected: FAIL — `toggleChatOpen is not a function`.

- [ ] **Step 3: Renomear no store**

Em `src/shared/stores/app-store.ts`, substitua o bloco de helpers do chat:

```ts
const CHAT_OPEN_STORAGE_KEY = 'liquid:chatOpen';

function readChatOpen(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(CHAT_OPEN_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveChatOpen(open: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CHAT_OPEN_STORAGE_KEY, open ? '1' : '0');
  } catch {}
}
```

Na interface `AppState`, substitua as três linhas de `chatCollapsed` por:

```ts
  // Painel de chat à direita: aberto (true) ou ausente. Persistido.
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  toggleChatOpen: () => void;
```

No corpo do store, substitua as três implementações por:

```ts
  chatOpen: readChatOpen(),
  setChatOpen: (open) => {
    saveChatOpen(open);
    set({ chatOpen: open });
  },
  toggleChatOpen: () => {
    const next = !get().chatOpen;
    saveChatOpen(next);
    set({ chatOpen: next });
  },
```

- [ ] **Step 4: Atualizar a ChatSidebar**

Em `src/widgets/chat-sidebar/ui/ChatSidebar.tsx`, troque os seletores e
inverta a lógica. O `collapsed` local vira `open`:

```tsx
  const open = useAppStore((s) => s.chatOpen);
  const setChatOpen = useAppStore((s) => s.setChatOpen);
  const toggleChatOpen = useAppStore((s) => s.toggleChatOpen);
```

Nos dois listeners, `toggleChatCollapsed()` vira `toggleChatOpen()`.

No efeito de auto-expansão, o ref passa a guardar o estado de abertura:

```tsx
  const openBeforeEditRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (editingReport) {
      if (openBeforeEditRef.current === null) {
        openBeforeEditRef.current = open;
        // Não persiste: 'editingReport' não é persistido, então um reload no
        // meio da edição nunca roda a restauração abaixo — se isto gravasse
        // em localStorage, a escolha manual do usuário seria sobrescrita
        // para sempre por este estado transitório.
        useAppStore.setState({ chatOpen: true });
      }
      return;
    }
    if (openBeforeEditRef.current !== null) {
      if (open) setChatOpen(openBeforeEditRef.current);
      openBeforeEditRef.current = null;
    }
  }, [editingReport, open, setChatOpen]);
```

No JSX, `collapsed ? ... : ...` vira `open ? <painel> : <rail>` — ou seja,
inverta os dois ramos e as classes: `open ? 'w-64' : 'w-16'`. Os botões
trocam de `setChatCollapsed(false)` para `setChatOpen(true)` (expandir) e de
`setChatCollapsed(true)` para `setChatOpen(false)` (minimizar).

- [ ] **Step 5: Atualizar os testes da ChatSidebar**

Em `src/widgets/chat-sidebar/ui/__tests__/ChatSidebar.test.tsx`, troque toda
ocorrência de `chatCollapsed: true` por `chatOpen: false`, de
`chatCollapsed: false` por `chatOpen: true`, de `setChatCollapsed` por
`setChatOpen`, e inverta os valores esperados nas asserções
(`expect(...chatCollapsed).toBe(true)` vira `expect(...chatOpen).toBe(false)`).
As descrições dos testes devem continuar descrevendo o mesmo comportamento —
"renderiza o rail quando fechado", "expande ao clicar no rail", etc.

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `pnpm vitest run src/shared/stores/app-store.test.ts src/widgets/chat-sidebar`
Expected: PASS. Rode também cada describe isolado com `-t`.

- [ ] **Step 7: Commit**

```bash
git add src/shared/stores src/widgets/chat-sidebar
git commit -m "refactor(store): chatCollapsed vira chatOpen"
```

---

### Task 2: Widget `AppHeader`

**Files:**
- Create: `src/widgets/app-header/ui/AppHeader.tsx`
- Create: `src/widgets/app-header/index.ts`
- Test: `src/widgets/app-header/ui/__tests__/AppHeader.test.tsx`

**Interfaces:**
- Consumes: `TopbarClientSwitcher` de `@/widgets/client-switcher` (sem props);
  `FiltersButton` de `@/shared/ui/filters-button` (props
  `{ pageTitle?: string; className?: string }`); `ThemeToggle` de
  `@/shared/ui/theme-toggle` (sem props).
- Produces: `export function AppHeader(props: { className?: string })`.

O header ainda não é montado em lugar nenhum — isso é a Task 3.

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/widgets/app-header/ui/__tests__/AppHeader.test.tsx`:

```tsx
/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/widgets/client-switcher', () => ({
  TopbarClientSwitcher: () => <div data-testid="client-switcher" />,
}));

vi.mock('@/shared/ui/filters-button', () => ({
  FiltersButton: () => <div data-testid="filters-button" />,
}));

vi.mock('@/shared/ui/theme-toggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

import { AppHeader } from '../AppHeader';

describe('AppHeader', () => {
  it('reúne cliente, filtros e tema', () => {
    render(<AppHeader />);
    expect(screen.getByTestId('client-switcher')).toBeInTheDocument();
    expect(screen.getByTestId('filters-button')).toBeInTheDocument();
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
  });

  it('o botão do chat despacha toggle-ai-sidebar', () => {
    const spy = vi.fn();
    window.addEventListener('toggle-ai-sidebar', spy);
    render(<AppHeader />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir assistente' }));
    expect(spy).toHaveBeenCalledTimes(1);
    window.removeEventListener('toggle-ai-sidebar', spy);
  });

  it('o menu despacha toggle-nav-sidebar', () => {
    const spy = vi.fn();
    window.addEventListener('toggle-nav-sidebar', spy);
    render(<AppHeader />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }));
    expect(spy).toHaveBeenCalledTimes(1);
    window.removeEventListener('toggle-nav-sidebar', spy);
  });

  it('não oferece nenhum controle de busca', () => {
    render(<AppHeader />);
    expect(screen.queryByRole('button', { name: /buscar/i })).not.toBeInTheDocument();
    expect(screen.queryByText('⌘ K')).not.toBeInTheDocument();
  });

  it('não mostra título de página', () => {
    render(<AppHeader />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run src/widgets/app-header`
Expected: FAIL — não resolve `../AppHeader`.

- [ ] **Step 3: Implementar**

Crie `src/widgets/app-header/ui/AppHeader.tsx`:

```tsx
'use client';

import { Menu, MessageSquare } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { TopbarClientSwitcher } from '@/widgets/client-switcher';
import { FiltersButton } from '@/shared/ui/filters-button';
import { ThemeToggle } from '@/shared/ui/theme-toggle';

/**
 * Header global da aplicação: só conhece a sessão, nunca a página.
 *
 * Esquerda: menu (abaixo de lg) e o cliente ativo. Direita: filtros, chat e
 * tema. O título da página vive no PageHero, dentro do conteúdo — o header
 * não o repete.
 *
 * O botão do chat despacha `toggle-ai-sidebar`, o mesmo evento dos atalhos
 * ⌘K e ⌘⇧A; quem reage depende do viewport (ver isDesktopViewport()).
 */
export function AppHeader({ className }: { className?: string }) {
  return (
    <header
      className={cn(
        'flex h-14 shrink-0 items-center gap-2 border-b border-border bg-[var(--color-surface)] px-4 lg:px-6',
        className,
      )}
    >
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('toggle-nav-sidebar'))}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground/80 transition-colors hover:bg-muted/50 hover:text-foreground lg:hidden"
        aria-label="Abrir menu"
      >
        <Menu className="h-4 w-4" strokeWidth={1.5} />
      </button>

      <TopbarClientSwitcher />

      <div className="flex-1" />

      <FiltersButton />

      <div className="h-5 w-px shrink-0 bg-border" />

      <button
        onClick={() => window.dispatchEvent(new CustomEvent('toggle-ai-sidebar'))}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted/40 text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
        aria-label="Abrir assistente"
        title="Assistente de IA"
      >
        <MessageSquare className="h-3.5 w-3.5" strokeWidth={1.5} />
      </button>

      <ThemeToggle />
    </header>
  );
}
```

Crie `src/widgets/app-header/index.ts`:

```ts
export { AppHeader } from './ui/AppHeader';
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pnpm vitest run src/widgets/app-header`
Expected: PASS — 5 testes.

- [ ] **Step 5: Commit**

```bash
git add src/widgets/app-header
git commit -m "feat(app-header): header global com cliente, filtros, chat e tema"
```

---

### Task 3: Montar o header e tirar o cliente da coluna

**Files:**
- Modify: `src/app/layouts/DashboardLayout.tsx`
- Modify: `src/widgets/pages-sidebar/ui/PagesSidebar.tsx`
- Modify: `src/widgets/pages-sidebar/ui/__tests__/PagesSidebar.test.tsx`

**Interfaces:**
- Consumes: `AppHeader` da Task 2.
- Produces: nada novo.

- [ ] **Step 1: Escrever o teste que falha**

Em `src/widgets/pages-sidebar/ui/__tests__/PagesSidebar.test.tsx`, no
describe `PagesSidebar — chrome persistente`, substitua o teste
`mostra o seletor de cliente no topo` por:

```tsx
  it('não mostra mais o seletor de cliente — ele vive no header global', () => {
    render(<PagesSidebar />);
    expect(screen.queryByTestId('client-switcher')).not.toBeInTheDocument();
  });
```

Os outros três testes do describe (perfil, Administração para admin,
Administração ausente para não-admin) continuam como estão.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run src/widgets/pages-sidebar/ui/__tests__/PagesSidebar.test.tsx -t "chrome persistente"`
Expected: FAIL — o `client-switcher` ainda está lá.

- [ ] **Step 3: Remover o cliente da coluna**

Em `src/widgets/pages-sidebar/ui/PagesSidebar.tsx`, remova o bloco do topo
(linhas 179-181, a `div` com `h-14` que envolve o `<ClientSwitcher />`) e o
import `ClientSwitcher` de `@/widgets/client-switcher`. O `<nav>` da lista
passa a ser o primeiro filho do `<aside>`.

Atualize o JSDoc do componente: a menção a "seletor de cliente" no chrome
persistente sai; o que resta é administração e perfil.

- [ ] **Step 4: Montar o header no layout**

Em `src/app/layouts/DashboardLayout.tsx`, acrescente o import:

```tsx
import { AppHeader } from '@/widgets/app-header';
```

O container raiz passa a empilhar header e corpo. Troque a `div` raiz e o
começo do conteúdo para:

```tsx
    <div className="flex h-dvh flex-col overflow-hidden bg-background font-sans relative selection:bg-primary/30 selection:text-primary-foreground">
      {!isImmersive && !isAdmin && <AppHeader />}
      <div className="flex flex-1 min-h-0">
        {/* ... colunas, Sheets e main como já estão ... */}
      </div>
    </div>
```

Ou seja: a raiz vira `flex-col`, o header entra antes, e tudo que já existia
dentro dela passa a viver numa `div` `flex flex-1 min-h-0`. Rotas de admin e
`/explore` não recebem o header.

- [ ] **Step 5: Rodar os testes e o lint**

Run: `pnpm vitest run src/widgets/pages-sidebar src/widgets/app-header`
Expected: PASS.

Run: `pnpm lint`
Expected: sem erros. Um erro de import não usado aqui significa que sobrou
referência ao `ClientSwitcher`.

- [ ] **Step 6: Commit**

```bash
git add src/app/layouts/DashboardLayout.tsx src/widgets/pages-sidebar
git commit -m "feat(layout): monta o header global e tira o cliente da coluna"
```

**Nota:** depois desta task o `ClientSwitcher` (variante de sidebar) fica sem
consumidor. **Não o remova** — a decisão de aposentá-lo não é desta feature.
Reporte a observação.

---

### Task 4: Chat pela direita, sem rail

**Files:**
- Modify: `src/widgets/chat-sidebar/ui/ChatSidebar.tsx`
- Modify: `src/widgets/chat-sidebar/ui/__tests__/ChatSidebar.test.tsx`
- Modify: `src/app/layouts/DashboardLayout.tsx`

**Interfaces:**
- Consumes: `chatOpen`/`setChatOpen`/`toggleChatOpen` da Task 1.
- Produces: `ChatSidebar` passa a renderizar `null` quando fechado.

- [ ] **Step 1: Escrever o teste que falha**

Em `src/widgets/chat-sidebar/ui/__tests__/ChatSidebar.test.tsx`, substitua os
dois primeiros testes do describe de colapso por:

```tsx
  it('não renderiza nada quando fechado', () => {
    const { container } = render(<ChatSidebar />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renderiza o painel e o botão de fechar quando aberto', () => {
    useAppStore.setState({ chatOpen: true });
    render(<ChatSidebar />);
    expect(screen.getByTestId('ai-sidebar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fechar assistente' })).toBeInTheDocument();
  });

  it('fecha ao clicar no botão de fechar', () => {
    useAppStore.setState({ chatOpen: true });
    render(<ChatSidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'Fechar assistente' }));
    expect(useAppStore.getState().chatOpen).toBe(false);
  });
```

Os testes de evento (`toggle-ai-sidebar` com guarda de viewport) e os de modo
de edição continuam válidos e não mudam.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run src/widgets/chat-sidebar -t "colapso"`
Expected: FAIL — o rail ainda renderiza quando fechado.

- [ ] **Step 3: Reescrever o JSX da ChatSidebar**

Substitua o `return` de `src/widgets/chat-sidebar/ui/ChatSidebar.tsx` por:

```tsx
  if (!open) return null;

  return (
    <aside
      className={cn(
        'flex h-full w-64 shrink-0 flex-col border-l border-border bg-background',
        className,
      )}
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="text-[12px] font-semibold text-foreground">Assistente</span>
        <div className="flex-1" />
        <button
          onClick={() => setChatOpen(false)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/80 transition-colors hover:bg-muted/50 hover:text-foreground"
          aria-label="Fechar assistente"
          title="Fechar assistente"
        >
          <X className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
      <ChatContent />
    </aside>
  );
```

Ajuste os imports de `lucide-react`: entra `X`, saem `ChevronsLeft` e
`MessageSquare` (o ícone do chat agora vive no `AppHeader`).

Atualize o JSDoc: o componente deixa de ter rail e passa a ser o painel da
direita.

- [ ] **Step 4: Mover o painel para a direita no layout**

Em `src/app/layouts/DashboardLayout.tsx`:

1. No bloco desktop, remova `<ChatSidebar />` de dentro do wrapper
   `hidden lg:flex` — lá fica só a `PagesSidebar` (e a `AdminSidebar` no ramo
   de admin).
2. Depois do `<main>`/bloco de conteúdo, ainda dentro da `div` do corpo,
   acrescente:

```tsx
        {!isImmersive && !isAdmin && (
          <div className="hidden lg:flex">
            <ChatSidebar />
          </div>
        )}
```

3. O `Sheet` do chat mobile passa a abrir pela direita: troque
   `side="left"` por `side="right"` no `SheetContent` do chat (o do menu de
   navegação continua `side="left"`).

- [ ] **Step 5: Rodar testes e lint**

Run: `pnpm vitest run src/widgets/chat-sidebar src/widgets/pages-sidebar src/widgets/app-header`
Expected: PASS. Rode cada describe isolado com `-t`.

Run: `pnpm lint`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/widgets/chat-sidebar src/app/layouts/DashboardLayout.tsx
git commit -m "feat(chat-sidebar): painel abre pela direita e dispensa o rail"
```

---

### Task 5: Remover o `AppBar` das 7 páginas simples

**Files:**
- Modify: `src/pages/dynamic/ui/RouteTemplatePage.tsx`
- Modify: `src/pages/covenants-configuracao/ui/CovenantsConfiguracaoPage.tsx`
- Modify: `src/pages/covenants-configuracao/ui/EvolucaoObraPage.tsx`
- Modify: `src/pages/covenants-configuracao/ui/OpenBankingPage.tsx`
- Modify: `src/pages/anexos-elegibilidade/ui/AnexosElegibilidadePage.tsx`
- Modify: `src/pages/anexos-pdd/ui/AnexosPddPage.tsx`
- Modify: `src/pages/anexos-rating/ui/AnexosRatingPage.tsx`

**Interfaces:**
- Consumes: o header global da Task 3, já montado.
- Produces: nada.

Nestas sete páginas o `AppBar` só carregava o título, que o `PageHero` já
exibe logo abaixo — é a duplicação que o spec elimina. Nenhuma delas usa
`editable`, `editing`, `onSave` ou `onCancel`.

- [ ] **Step 1: Conferir que nenhuma usa controles de edição**

Run: `grep -n "editable\|onSave\|onCancel\|editing" src/pages/dynamic/ui/RouteTemplatePage.tsx src/pages/covenants-configuracao/ui/*.tsx src/pages/anexos-*/ui/*.tsx`
Expected: nenhuma linha em que essas props sejam passadas ao `AppBar`. Se
alguma aparecer, **pare e reporte** — essa página vira caso da Task 6.

- [ ] **Step 2: Remover o AppBar de cada uma**

Em cada arquivo: apague a linha `<AppBar ... />` (ou o bloco, se estiver
multilinha) e o import `import { AppBar } from '@/widgets/app-bar';`.

Se a remoção deixar um fragmento `<>...</>` com um único filho, simplifique
para retornar esse filho direto.

- [ ] **Step 3: Verificar lint e build**

Run: `pnpm lint`
Expected: sem erros nem warning de import não usado nessas sete páginas.

Run: `pnpm build`
Expected: build completo. É o que pega qualquer JSX quebrado pela remoção.

- [ ] **Step 4: Commit**

```bash
git add src/pages
git commit -m "refactor(pages): remove o AppBar das paginas que so exibiam titulo"
```

---

### Task 6: `ReportPage` — controles de edição para o `PageHero`

**Files:**
- Modify: `src/pages/report/ui/ReportPage.tsx`

**Interfaces:**
- Consumes: `PageHero` de `@/shared/ui/page-hero`, props
  `{ kicker?, title, pill?, meta?, actions?, className? }`.
- Produces: nada.

O `ReportPage` usa `AppBar` em três pontos: estado de carregamento, estado de
relatório inexistente, e o render principal com `editable`, `editing`,
`onEdit`, `onSave`, `onCancel` e `saving`.

- [ ] **Step 1: Substituir os dois estados simples**

No ramo `if (loading)`, troque o `<AppBar pageTitle="Carregando..." ... />`
por nada — o corpo já mostra o spinner centralizado, e o header global
continua na tela. Remova o fragmento externo se ele ficar com um filho só.

No ramo `if (!report)`, faça o mesmo: some com o `<AppBar>` e deixe só a
mensagem "Este relatório não existe ou foi removido.".

- [ ] **Step 2: Mover os controles de edição**

No render principal, remova o `<AppBar ... />` e passe os controles ao
`PageHero` que a página já renderiza, via `actions`:

```tsx
        actions={
          editing ? (
            <>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary/70">
                Editando
              </span>
              <button
                onClick={handleCancel}
                disabled={saving}
                className="rounded-md px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-md bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </>
          ) : (
            <button
              onClick={handleEdit}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-muted-foreground"
              title="Editar página"
              aria-label="Editar página"
            >
              <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          )
        }
```

Acrescente `Pencil` aos imports de `lucide-react` e remova o import do
`AppBar`.

Repare no `text-primary-foreground` do botão Salvar: o `AppBar` usava
`text-black` hardcoded, o que não troca com o tema. Aqui vai o token.

**Se o `ReportPage` não renderizar `PageHero` no mesmo ramo do `AppBar`**,
pare e reporte antes de improvisar um lugar para os controles.

- [ ] **Step 3: Verificar lint e build**

Run: `pnpm lint` e `pnpm build`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/pages/report/ui/ReportPage.tsx
git commit -m "refactor(report): controles de edicao migram para o PageHero"
```

---

### Task 7: Limpeza — lupa do `AppBar`, `⌘[` e diálogo de atalhos

**Files:**
- Modify: `src/widgets/app-bar/ui/AppBar.tsx`
- Modify: `src/widgets/app-bar/ui/__tests__/AppBar.test.tsx`
- Modify: `src/shared/hooks/useKeyboardShortcuts.ts`
- Modify: `src/app/layouts/DashboardLayout.tsx`
- Modify: `src/widgets/chat-sidebar/ui/ChatSidebar.tsx`

**Interfaces:**
- Consumes: nada das tasks anteriores.
- Produces: nada.

O `AppBar` sobrevive nas 4 páginas de admin que já o usavam (`AdminPage`,
`AgentQualityPage`, `OrchestratorAnalyticsPage`, `AdminSqlCatalogPage`), que
não têm `PageHero`. Lá ele fica com título, controles de edição e tema — mas
sem a lupa, que despachava `toggle-ai-sidebar` num contexto sem chat nenhum.
Há uma 5ª página de admin, `TemplateEditorPage`
(`app/(admin)/admin/templates/[id]/page.tsx`), que nunca usou `AppBar` — tem
header próprio — e por isso não é tocada por esta task.

- [ ] **Step 1: Escrever o teste que falha**

Em `src/widgets/app-bar/ui/__tests__/AppBar.test.tsx`, substitua o teste
`mantém o botão de busca` por:

```tsx
  it('não oferece mais o botão de busca', () => {
    render(<AppBar pageTitle="Visão Geral" />);
    expect(screen.queryByRole('button', { name: 'Buscar' })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run src/widgets/app-bar`
Expected: FAIL — o botão ainda existe.

- [ ] **Step 3: Remover a lupa do AppBar**

Em `src/widgets/app-bar/ui/AppBar.tsx`, apague o `<button>` da busca junto
com o comentário que o precede, e tire `Search` dos imports de
`lucide-react`. O `ThemeToggle` continua.

- [ ] **Step 4: Remover o atalho `⌘[`**

Em `src/shared/hooks/useKeyboardShortcuts.ts`, apague o bloco do
`meta && e.key === '['` que despacha `toggle-nav-collapse`. `⌘K` e `⌘⇧A`
continuam.

Em `src/widgets/chat-sidebar/ui/ChatSidebar.tsx`, remova o listener de
`toggle-nav-collapse` (o `handleToggleNavCollapse` e as duas linhas de
add/remove). Só o listener de `toggle-ai-sidebar`, com a guarda de viewport,
permanece. Ajuste o JSDoc do componente, que descreve esse evento.

Em `src/app/layouts/DashboardLayout.tsx`, remova a linha
`['⌘ [', 'Colapsar/expandir chat']` da lista do diálogo de atalhos.

- [ ] **Step 5: Rodar tudo**

Run: `pnpm vitest run src/widgets/app-bar src/widgets/app-header src/widgets/chat-sidebar src/widgets/pages-sidebar src/shared/stores/app-store.test.ts`
Expected: PASS. Cada describe isolado com `-t` também.

Run: `pnpm lint` e `pnpm build`
Expected: sem erros.

- [ ] **Step 6: Verificar no navegador**

O container Docker está em `http://localhost:4400` (build de produção, exige
login). Se você conseguir logar, confirme com o cliente Vila Rosa:

1. header no topo com cliente à esquerda e filtros/chat/tema à direita;
2. nenhuma lupa em lugar nenhum;
3. o botão do chat abre o painel **à direita**, empurrando o conteúdo;
4. fechar o chat devolve a largura ao conteúdo; recarregar preserva o estado;
5. o título da página aparece **uma vez só**, no corpo;
6. abaixo de 1024px: ☰ abre as páginas pela esquerda, 💬 abre o chat pela
   direita;
7. `⌘[` não faz mais nada; `⌘K` e `⌘⇧A` abrem o chat.

Se não conseguir logar, **diga isso no relatório** em vez de descrever o que
deveria acontecer.

- [ ] **Step 7: Commit**

```bash
git add src/widgets/app-bar src/shared/hooks/useKeyboardShortcuts.ts src/app/layouts/DashboardLayout.tsx src/widgets/chat-sidebar
git commit -m "refactor(nav): remove a lupa do AppBar e o atalho invalido"
```

---

## Self-Review

**Cobertura do spec**

| Requisito | Task |
|---|---|
| Header com cliente à esquerda | 2, 3 |
| Filtros, chat e tema à direita | 2 |
| Sem busca / lupa removida | 2, 7 |
| Header sem título de página | 2 |
| Header global no `DashboardLayout` | 3 |
| Cliente sai da `PagesSidebar` | 3 |
| Chat abre pela direita, empurrando | 4 |
| Rail de 64px eliminado | 4 |
| `chatCollapsed` → `chatOpen` | 1 |
| `⌘[` removido | 7 |
| 8 páginas de dashboard perdem o `AppBar` | 5, 6 |
| Salvar/Cancelar e lápis no `PageHero` | 6 |
| 4 páginas de admin mantêm o `AppBar` | 7 (só perde a lupa) |
| Gavetas: páginas à esquerda, chat à direita | 4 |
| Edge cases 1-2 (sem cliente, fora do provider) | 2 — já tratados pelos componentes reaproveitados |
| Edge cases 3-4 (`/admin`, `/explore`) | 3 |
| Edge case 6 (auto-abrir na edição) | 1 |

**Consistência de tipos** — `chatOpen`/`setChatOpen`/`toggleChatOpen` são
definidos na Task 1 e usados com os mesmos nomes nas Tasks 4 e 7.
`AppHeader({ className })` é definido na Task 2 e consumido na Task 3.

**Riscos conhecidos**

- A Task 3 mexe na estrutura raiz do `DashboardLayout` (de `flex` para
  `flex-col` com header). Não há teste automatizado para o layout — decisão
  herdada do plano anterior, pelo mesmo motivo (montar exigiria stub de auth,
  permissões, tema e roteador). `pnpm build` e a verificação no navegador da
  Task 7 são a rede.
- A Task 5 toca sete arquivos de página que não têm teste. O `pnpm build` é
  o que garante que nenhuma remoção quebrou JSX.
- Depois da Task 3 o `ClientSwitcher` fica sem consumidor. Está registrado
  como observação, não como remoção.
