# Coluna de páginas ao lado do chat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tirar a navegação entre páginas do dropdown do `AppBar` e colocá-la
numa coluna fixa de 224px à direita do chat, que passa a colapsar para um rail
de 64px.

**Architecture:** Dois widgets à esquerda, um propósito cada.
`widgets/pages-sidebar` (novo, sempre visível) concentra seletor de cliente,
lista de páginas, ações de página, Administração e perfil.
`widgets/chat-sidebar` (renomeado de `nav-sidebar`) fica só com o chat e dois
estados de largura, guiados por um booleano persistido no `app-store`.

**Tech Stack:** Next.js 16 App Router, React 19, Zustand, Tailwind v4,
shadcn/ui (Radix), Vitest + Testing Library + happy-dom.

**Spec:** `docs/superpowers/specs/2026-07-30-sidebar-paginas-design.md`

## Global Constraints

- Package manager é **pnpm** — nunca npm ou yarn.
- Toda copy de UI em **PT-BR**.
- Só **tokens semânticos** de cor (`bg-background`, `text-foreground`,
  `bg-muted/40`, `border-border`, `text-muted-foreground`). Nada de
  `text-white/X` ou `bg-[#hex]` — o tema tem light e dark.
- Nenhuma mudança em Firestore, rotas ou no modelo flat de páginas. A fonte de
  dados continua sendo `useReports(groups[0]?.id ?? null)`.
- Branch de trabalho: `feat/sidebar-paginas` (já criada, com o spec commitado).
- Commits em conventional commits, mensagem em PT-BR. **Não fazer push.**
- Rodar sempre o arquivo de teste específico da task
  (`pnpm vitest run <caminho>`), não a suíte inteira. A suíte completa tem uma
  baseline conhecida de ~6 falhas não relacionadas (testes de Mastra/orchestrator
  sob carga); um full run não serve como sinal de regressão desta feature.

---

## File Structure

**Criados**

| Arquivo | Responsabilidade |
|---|---|
| `src/widgets/pages-sidebar/index.ts` | barrel |
| `src/widgets/pages-sidebar/ui/PagesSidebar.tsx` | a coluna: dados, handlers e as três faixas (topo/miolo/rodapé) |
| `src/widgets/pages-sidebar/ui/PageListItem.tsx` | um item da lista + seu menu `⋯` (apresentacional, sem dados) |
| `src/widgets/pages-sidebar/ui/__tests__/PagesSidebar.test.tsx` | testes da coluna |
| `src/widgets/chat-sidebar/ui/__tests__/ChatSidebar.test.tsx` | testes de colapso e auto-expansão |
| `src/widgets/app-bar/ui/__tests__/AppBar.test.tsx` | garante que o dropdown sumiu e o título ficou |

**Movidos** (via `git mv`, preservando histórico)

| De | Para |
|---|---|
| `src/widgets/nav-sidebar/ui/NavSidebar.tsx` | `src/widgets/chat-sidebar/ui/ChatSidebar.tsx` |
| `src/widgets/nav-sidebar/index.ts` | `src/widgets/chat-sidebar/index.ts` |
| `src/widgets/nav-sidebar/ui/NavItem.tsx` | `src/widgets/pages-sidebar/ui/NavItem.tsx` |
| `src/widgets/nav-sidebar/ui/TemplateGallery.tsx` | `src/widgets/pages-sidebar/ui/TemplateGallery.tsx` |
| `src/widgets/nav-sidebar/ui/__tests__/TemplateGallery.test.tsx` | `src/widgets/pages-sidebar/ui/__tests__/TemplateGallery.test.tsx` |

O teste da `TemplateGallery` importa `../../../../../scripts/templates/visao-geral.template.mjs`
por caminho relativo. A profundidade do diretório destino é idêntica, então o
caminho continua válido — não altere esse import.

**Modificados**

- `src/shared/stores/app-store.ts` — novo `chatCollapsed`
- `src/shared/stores/app-store.test.ts` — cobertura do novo estado
- `src/app/layouts/DashboardLayout.tsx` — monta as duas colunas
- `src/widgets/app-bar/ui/AppBar.tsx` — perde o dropdown e o CRUD

**Intocados de propósito:** `ClientSwitcher` (o único `dispatchEvent` que ele faz
está dentro de `if (collapsed)`, ramo que a `PagesSidebar` nunca aciona),
`BottomTabBar`, `AdminSidebar`, `useKeyboardShortcuts`.

---

### Task 1: Estado `chatCollapsed` no app-store

**Files:**
- Modify: `src/shared/stores/app-store.ts`
- Test: `src/shared/stores/app-store.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  ```ts
  chatCollapsed: boolean;                          // true = rail de 64px
  setChatCollapsed: (collapsed: boolean) => void;
  toggleChatCollapsed: () => void;
  ```
  Persistido em `localStorage` na chave `liquid:chatCollapsed`
  (`'1'` = colapsado, `'0'` = expandido). Chave ausente ⇒ `true`.

- [ ] **Step 1: Escrever o teste que falha**

Anexe ao fim de `src/shared/stores/app-store.test.ts`:

```ts
describe('app-store chatCollapsed', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ chatCollapsed: true });
  });

  it('começa colapsado por padrão', () => {
    expect(useAppStore.getState().chatCollapsed).toBe(true);
  });

  it('toggleChatCollapsed alterna o valor', () => {
    useAppStore.getState().toggleChatCollapsed();
    expect(useAppStore.getState().chatCollapsed).toBe(false);
    useAppStore.getState().toggleChatCollapsed();
    expect(useAppStore.getState().chatCollapsed).toBe(true);
  });

  it('setChatCollapsed persiste em localStorage', () => {
    useAppStore.getState().setChatCollapsed(false);
    expect(localStorage.getItem('liquid:chatCollapsed')).toBe('0');
    useAppStore.getState().setChatCollapsed(true);
    expect(localStorage.getItem('liquid:chatCollapsed')).toBe('1');
  });

  it('toggleChatCollapsed também persiste', () => {
    useAppStore.getState().setChatCollapsed(true);
    useAppStore.getState().toggleChatCollapsed();
    expect(localStorage.getItem('liquid:chatCollapsed')).toBe('0');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm vitest run src/shared/stores/app-store.test.ts`
Expected: FAIL — `toggleChatCollapsed is not a function`.

- [ ] **Step 3: Implementar**

Em `src/shared/stores/app-store.ts`, ao lado das outras funções de leitura
(depois de `saveActiveProductId`, por volta da linha 194):

```ts
const CHAT_COLLAPSED_STORAGE_KEY = 'liquid:chatCollapsed';

function readChatCollapsed(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(CHAT_COLLAPSED_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

function saveChatCollapsed(collapsed: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CHAT_COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
  } catch {}
}
```

Na interface `AppState`, logo abaixo do bloco `editingReport` (linha ~101):

```ts
  // Chat sidebar: rail de 64px (true) ↔ painel de 256px (false). Persistido.
  chatCollapsed: boolean;
  setChatCollapsed: (collapsed: boolean) => void;
  toggleChatCollapsed: () => void;
```

No corpo do store, logo abaixo de `setEditingReport` (linha ~214):

```ts
  chatCollapsed: readChatCollapsed(),
  setChatCollapsed: (collapsed) => {
    saveChatCollapsed(collapsed);
    set({ chatCollapsed: collapsed });
  },
  toggleChatCollapsed: () => {
    const next = !get().chatCollapsed;
    saveChatCollapsed(next);
    set({ chatCollapsed: next });
  },
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm vitest run src/shared/stores/app-store.test.ts`
Expected: PASS, incluindo os testes que já existiam no arquivo.

- [ ] **Step 5: Commit**

```bash
git add src/shared/stores/app-store.ts src/shared/stores/app-store.test.ts
git commit -m "feat(store): estado chatCollapsed persistido para o rail do chat"
```

---

### Task 2: `PagesSidebar` — lista, navegação, vazio e carregando

**Files:**
- Create: `src/widgets/pages-sidebar/ui/PagesSidebar.tsx`
- Create: `src/widgets/pages-sidebar/index.ts`
- Test: `src/widgets/pages-sidebar/ui/__tests__/PagesSidebar.test.tsx`

**Interfaces:**
- Consumes: `useReports(groupId: string | null)` de `@/shared/hooks/useReports`,
  que retorna `{ reports: Report[]; loading: boolean; create; rename; remove; duplicate; move }`.
  `Report` tem `id: string` e `name: string`. `useGroups()` retorna `{ groups: Group[]; create }`
  com `Group.id: string`.
- Produces: `export function PagesSidebar(props: { className?: string })`.
  Largura fixa `w-56` (224px — passo mais próximo da escala Tailwind dos 220px
  do spec).

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/widgets/pages-sidebar/ui/__tests__/PagesSidebar.test.tsx`:

```tsx
/* @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const pushMock = vi.fn();
const useReportsMock = vi.fn();
const setActiveReportMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock('@/shared/hooks/useGroups', () => ({
  useGroups: () => ({ groups: [{ id: 'g1', name: 'Minhas páginas' }], create: vi.fn() }),
}));

vi.mock('@/shared/hooks/useReports', () => ({
  useReports: () => useReportsMock(),
}));

vi.mock('@/shared/stores/app-store', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      activeClientId: 'vila-rosa',
      activeReportId: 'r2',
      setActiveReport: setActiveReportMock,
      setActiveGroup: vi.fn(),
      bumpReportsList: vi.fn(),
    }),
}));

import { PagesSidebar } from '../PagesSidebar';

const REPORTS = [
  { id: 'r1', name: 'Covenants' },
  { id: 'r2', name: 'Unidades' },
];

describe('PagesSidebar — lista de páginas', () => {
  beforeEach(() => {
    useReportsMock.mockReturnValue({ reports: REPORTS, loading: false });
  });

  it('lista as páginas retornadas pelo hook', () => {
    render(<PagesSidebar />);
    expect(screen.getByRole('button', { name: 'Covenants' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unidades' })).toBeInTheDocument();
  });

  it('marca a página ativa com aria-current', () => {
    render(<PagesSidebar />);
    expect(screen.getByRole('button', { name: 'Unidades' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Covenants' })).not.toHaveAttribute('aria-current');
  });

  it('clique num item navega para a rota da página', () => {
    render(<PagesSidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'Covenants' }));
    expect(setActiveReportMock).toHaveBeenCalledWith('g1', 'r1');
    expect(pushMock).toHaveBeenCalledWith('/g/g1/r/r1');
  });

  it('mostra estado vazio quando não há páginas', () => {
    useReportsMock.mockReturnValue({ reports: [], loading: false });
    render(<PagesSidebar />);
    expect(screen.getByText('Nenhuma página ainda')).toBeInTheDocument();
  });

  it('mostra skeleton enquanto carrega, sem o estado vazio', () => {
    useReportsMock.mockReturnValue({ reports: [], loading: true });
    render(<PagesSidebar />);
    expect(screen.getByTestId('pages-skeleton')).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma página ainda')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm vitest run src/widgets/pages-sidebar/ui/__tests__/PagesSidebar.test.tsx`
Expected: FAIL — não consegue resolver `../PagesSidebar`.

- [ ] **Step 3: Implementar**

Crie `src/widgets/pages-sidebar/ui/PagesSidebar.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { cn } from '@/shared/lib/utils';
import { useAppStore } from '@/shared/stores/app-store';
import { useGroups } from '@/shared/hooks/useGroups';
import { useReports } from '@/shared/hooks/useReports';

/**
 * Coluna fixa de navegação entre as páginas do cliente ativo.
 *
 * Modelo flat: todas as páginas vivem num único grupo padrão, então a coluna
 * lê sempre `groups[0]`. É a única coluna sempre visível — o chat ao lado
 * colapsa —, por isso ela também hospeda o chrome persistente (Task 4).
 */
export function PagesSidebar({ className }: { className?: string }) {
  const router = useRouter();
  const { groups } = useGroups();
  const activeReportId = useAppStore((s) => s.activeReportId);
  const setActiveReport = useAppStore((s) => s.setActiveReport);

  const defaultGroupId = groups[0]?.id ?? null;
  const { reports, loading } = useReports(defaultGroupId);

  const handleOpenReport = (reportId: string) => {
    if (!defaultGroupId) return;
    setActiveReport(defaultGroupId, reportId);
    router.push(`/g/${defaultGroupId}/r/${reportId}`);
  };

  return (
    <aside
      className={cn(
        'flex h-full w-56 shrink-0 flex-col border-r border-border bg-background',
        className,
      )}
    >
      <nav className="flex-1 overflow-y-auto px-2 py-2" aria-label="Páginas do relatório">
        {loading ? (
          <div className="space-y-1" data-testid="pages-skeleton">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-7 animate-pulse rounded-md bg-muted/40" />
            ))}
          </div>
        ) : reports.length === 0 ? (
          <p className="px-2 py-2 text-[11px] text-muted-foreground/60">
            Nenhuma página ainda
          </p>
        ) : (
          <ul className="space-y-0.5">
            {reports.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => handleOpenReport(r.id)}
                  aria-current={activeReportId === r.id ? 'page' : undefined}
                  className={cn(
                    'w-full truncate rounded-md px-2 py-1.5 text-left text-[12px] transition-colors',
                    activeReportId === r.id
                      ? 'bg-muted/50 text-foreground'
                      : 'text-muted-foreground/80 hover:bg-muted/40 hover:text-foreground',
                  )}
                >
                  {r.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </aside>
  );
}
```

Crie `src/widgets/pages-sidebar/index.ts`:

```ts
export { PagesSidebar } from './ui/PagesSidebar';
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm vitest run src/widgets/pages-sidebar/ui/__tests__/PagesSidebar.test.tsx`
Expected: PASS — 5 testes.

- [ ] **Step 5: Commit**

```bash
git add src/widgets/pages-sidebar
git commit -m "feat(pages-sidebar): coluna de navegacao entre paginas"
```

---

### Task 3: Ações por item e rodapé de criação

**Files:**
- Create: `src/widgets/pages-sidebar/ui/PageListItem.tsx`
- Modify: `src/widgets/pages-sidebar/ui/PagesSidebar.tsx`
- Move: `src/widgets/nav-sidebar/ui/TemplateGallery.tsx` → `src/widgets/pages-sidebar/ui/TemplateGallery.tsx`
- Move: `src/widgets/nav-sidebar/ui/__tests__/TemplateGallery.test.tsx` → `src/widgets/pages-sidebar/ui/__tests__/TemplateGallery.test.tsx`
- Modify: `src/widgets/app-bar/ui/AppBar.tsx:15` (só o caminho do import)
- Test: `src/widgets/pages-sidebar/ui/__tests__/PagesSidebar.test.tsx`

**Interfaces:**
- Consumes: `PagesSidebar` da Task 2; `useReports().rename/remove/duplicate/create`;
  `createReport` de `@/shared/lib/firestore/reports`; `PromptDialog`/`ConfirmDialog`
  de `@/shared/ui/prompt-dialog`.
- Produces:
  ```ts
  export interface PageListItemProps {
    name: string;
    active: boolean;
    onOpen: () => void;
    onRename: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
  }
  export function PageListItem(props: PageListItemProps): JSX.Element
  ```

**Nota de teste:** o menu `⋯` usa Radix `DropdownMenu`, que renderiza em portal e
depende de pointer events — abrir esse menu por `fireEvent` sob happy-dom é
frágil. O teste da `PagesSidebar` portanto **mocka** `../PageListItem` com um
stub de botões simples e verifica o *fio* (o id certo chegando no handler certo).
`PageListItem` fica puramente apresentacional, sem lógica a testar.

- [ ] **Step 1: Escrever o teste que falha**

Adicione ao topo de `PagesSidebar.test.tsx`, junto dos outros `vi.mock` (antes do
`import { PagesSidebar }`):

```tsx
vi.mock('../PageListItem', () => ({
  PageListItem: ({ name, onOpen, onRename, onDuplicate, onDelete }: {
    name: string;
    onOpen: () => void;
    onRename: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
  }) => (
    <div>
      <button onClick={onOpen}>{name}</button>
      <button onClick={onRename}>{`Renomear ${name}`}</button>
      <button onClick={onDuplicate}>{`Duplicar ${name}`}</button>
      <button onClick={onDelete}>{`Excluir ${name}`}</button>
    </div>
  ),
}));

vi.mock('../TemplateGallery', () => ({
  TemplateGallery: () => <div data-testid="template-gallery" />,
}));
```

O mock de `useReports` precisa passar a expor os mutadores. Substitua o
`beforeEach` do describe existente e acrescente o novo describe:

```tsx
const renameMock = vi.fn(async () => {});
const removeMock = vi.fn(async () => {});
const duplicateMock = vi.fn(async () => 'r-dup');

// dentro do beforeEach já existente, troque o mockReturnValue por:
useReportsMock.mockReturnValue({
  reports: REPORTS,
  loading: false,
  rename: renameMock,
  remove: removeMock,
  duplicate: duplicateMock,
});

describe('PagesSidebar — ações de página', () => {
  beforeEach(() => {
    useReportsMock.mockReturnValue({
      reports: REPORTS,
      loading: false,
      rename: renameMock,
      remove: removeMock,
      duplicate: duplicateMock,
    });
  });

  it('duplicar age sobre o item apontado, não sobre o ativo', async () => {
    render(<PagesSidebar />);
    // ativo é r2 (Unidades); a ação é disparada em r1 (Covenants)
    fireEvent.click(screen.getByRole('button', { name: 'Duplicar Covenants' }));
    await vi.waitFor(() => expect(duplicateMock).toHaveBeenCalledWith('r1'));
  });

  it('renomear abre o prompt com o nome do item apontado', () => {
    render(<PagesSidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'Renomear Covenants' }));
    expect(screen.getByDisplayValue('Covenants')).toBeInTheDocument();
  });

  it('excluir pede confirmação nomeando a página apontada', () => {
    render(<PagesSidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir Covenants' }));
    expect(screen.getByText(/Excluir página "Covenants"/)).toBeInTheDocument();
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('oferece criar página e importar template', () => {
    render(<PagesSidebar />);
    expect(screen.getByRole('button', { name: /Nova página/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Importar template/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm vitest run src/widgets/pages-sidebar/ui/__tests__/PagesSidebar.test.tsx`
Expected: FAIL — não resolve `../PageListItem`.

- [ ] **Step 3: Mover TemplateGallery e criar PageListItem**

```bash
git mv src/widgets/nav-sidebar/ui/TemplateGallery.tsx src/widgets/pages-sidebar/ui/TemplateGallery.tsx
git mv src/widgets/nav-sidebar/ui/__tests__/TemplateGallery.test.tsx src/widgets/pages-sidebar/ui/__tests__/TemplateGallery.test.tsx
```

Em `src/widgets/app-bar/ui/AppBar.tsx` linha 15, troque o import para:

```tsx
import { TemplateGallery } from '@/widgets/pages-sidebar/ui/TemplateGallery';
```

Crie `src/widgets/pages-sidebar/ui/PageListItem.tsx`:

```tsx
'use client';

import { cn } from '@/shared/lib/utils';
import { MoreHorizontal, Pencil, Copy, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';

export interface PageListItemProps {
  name: string;
  active: boolean;
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/**
 * Item da lista de páginas: abre ao clique e expõe renomear/duplicar/excluir
 * num menu que aparece no hover ou no foco por teclado. Apresentacional —
 * quem decide o que cada ação faz é a PagesSidebar.
 */
export function PageListItem({
  name,
  active,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
}: PageListItemProps) {
  return (
    <div
      className={cn(
        'group flex items-center rounded-md',
        active ? 'bg-muted/50' : 'hover:bg-muted/40',
      )}
    >
      <button
        onClick={onOpen}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'min-w-0 flex-1 truncate px-2 py-1.5 text-left text-[12px] transition-colors',
          active
            ? 'text-foreground'
            : 'text-muted-foreground/80 group-hover:text-foreground',
        )}
      >
        {name}
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={`Ações da página ${name}`}
            className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/60 opacity-0 transition-opacity hover:bg-muted/60 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[180px] border-border bg-popover">
          <DropdownMenuItem
            onSelect={(e) => { e.preventDefault(); setTimeout(onRename, 0); }}
            className="text-[12px] text-foreground"
          >
            <Pencil className="mr-2 h-3 w-3" /> Renomear
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => { e.preventDefault(); setTimeout(onDuplicate, 0); }}
            className="text-[12px] text-foreground"
          >
            <Copy className="mr-2 h-3 w-3" /> Duplicar
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => { e.preventDefault(); setTimeout(onDelete, 0); }}
            className="text-[12px] text-red-400"
          >
            <Trash2 className="mr-2 h-3 w-3" /> Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
```

O par `preventDefault()` + `setTimeout(..., 0)` replica o que o `AppBar` já
fazia (`AppBar.tsx:257`): sem isso, o Radix devolve o foco ao trigger enquanto o
dialog está montando e o dialog perde o foco.

- [ ] **Step 4: Reescrever a PagesSidebar com handlers e rodapé**

Substitua `src/widgets/pages-sidebar/ui/PagesSidebar.tsx` inteiro:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/shared/lib/utils';
import { Plus, LayoutTemplate, ArrowLeft } from 'lucide-react';
import { useAppStore } from '@/shared/stores/app-store';
import { useGroups } from '@/shared/hooks/useGroups';
import { useReports } from '@/shared/hooks/useReports';
import { createReport as createReportDoc } from '@/shared/lib/firestore/reports';
import { PromptDialog, ConfirmDialog } from '@/shared/ui/prompt-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { TemplateGallery } from './TemplateGallery';
import { PageListItem } from './PageListItem';

interface PromptState {
  title: string;
  defaultValue?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
}

interface ConfirmState {
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}

/**
 * Coluna fixa de navegação entre as páginas do cliente ativo.
 *
 * Modelo flat: todas as páginas vivem num único grupo padrão, criado sob
 * demanda (ensureGroup) na primeira criação/importação. É a única coluna
 * sempre visível — o chat ao lado colapsa —, por isso também hospeda o
 * chrome persistente (Task 4).
 */
export function PagesSidebar({ className }: { className?: string }) {
  const router = useRouter();
  const { groups, create: createGroup } = useGroups();
  const activeClientId = useAppStore((s) => s.activeClientId);
  const activeReportId = useAppStore((s) => s.activeReportId);
  const setActiveGroup = useAppStore((s) => s.setActiveGroup);
  const setActiveReport = useAppStore((s) => s.setActiveReport);
  const bumpReportsList = useAppStore((s) => s.bumpReportsList);

  const defaultGroupId = groups[0]?.id ?? null;
  const {
    reports,
    loading,
    rename: renameReport,
    remove: removeReport,
    duplicate: duplicateReport,
  } = useReports(defaultGroupId);

  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templatesGroupId, setTemplatesGroupId] = useState<string | null>(null);
  const [promptState, setPromptState] = useState<PromptState | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  /** Garante o grupo padrão único; cria sob demanda se ainda não existir. */
  const ensureGroup = async (): Promise<string | null> => {
    if (defaultGroupId) return defaultGroupId;
    try {
      const id = await createGroup('Minhas páginas');
      setActiveGroup(id);
      return id;
    } catch (err) {
      console.error('Failed to ensure default group:', err);
      return null;
    }
  };

  const handleOpenReport = (reportId: string) => {
    if (!defaultGroupId) return;
    setActiveReport(defaultGroupId, reportId);
    router.push(`/g/${defaultGroupId}/r/${reportId}`);
  };

  const handleNewPage = async () => {
    const gid = await ensureGroup();
    if (!gid) return;
    try {
      const rid = await createReportDoc(activeClientId, gid, 'Nova página');
      bumpReportsList();
      setActiveReport(gid, rid);
      router.push(`/g/${gid}/r/${rid}?edit=1`);
    } catch (err) {
      console.error('Failed to create page:', err);
    }
  };

  const handleImportClick = async () => {
    const gid = await ensureGroup();
    if (!gid) return;
    setActiveGroup(gid);
    setTemplatesGroupId(gid);
    setTemplatesOpen(true);
  };

  const handleRename = (reportId: string, currentName: string) => {
    setPromptState({
      title: 'Renomear página',
      defaultValue: currentName,
      confirmLabel: 'Salvar',
      onConfirm: async (name) => {
        if (name === currentName) return;
        try {
          await renameReport(reportId, name);
        } catch (err) {
          console.error('Failed to rename page:', err);
        }
      },
    });
  };

  const handleDuplicate = async (reportId: string) => {
    if (!defaultGroupId) return;
    try {
      const rid = await duplicateReport(reportId);
      if (rid) {
        setActiveReport(defaultGroupId, rid);
        router.push(`/g/${defaultGroupId}/r/${rid}`);
      }
    } catch (err) {
      console.error('Failed to duplicate page:', err);
    }
  };

  const handleDelete = (reportId: string, name: string) => {
    setConfirmState({
      title: `Excluir página "${name}"`,
      description: 'Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir',
      destructive: true,
      onConfirm: async () => {
        try {
          await removeReport(reportId);
          // Só sai da rota se a página excluída for a que está aberta.
          if (reportId === activeReportId) router.push('/dashboard');
        } catch (err) {
          console.error('Failed to delete page:', err);
        }
      },
    });
  };

  return (
    <>
      <aside
        className={cn(
          'flex h-full w-56 shrink-0 flex-col border-r border-border bg-background',
          className,
        )}
      >
        <nav className="flex-1 overflow-y-auto px-2 py-2" aria-label="Páginas do relatório">
          {loading ? (
            <div className="space-y-1" data-testid="pages-skeleton">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-7 animate-pulse rounded-md bg-muted/40" />
              ))}
            </div>
          ) : reports.length === 0 ? (
            <p className="px-2 py-2 text-[11px] text-muted-foreground/60">
              Nenhuma página ainda
            </p>
          ) : (
            <ul className="space-y-0.5">
              {reports.map((r) => (
                <li key={r.id}>
                  <PageListItem
                    name={r.name}
                    active={r.id === activeReportId}
                    onOpen={() => handleOpenReport(r.id)}
                    onRename={() => handleRename(r.id, r.name)}
                    onDuplicate={() => handleDuplicate(r.id)}
                    onDelete={() => handleDelete(r.id, r.name)}
                  />
                </li>
              ))}
            </ul>
          )}
        </nav>

        <div className="shrink-0 border-t border-border px-2 py-2">
          <button
            onClick={handleNewPage}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-muted-foreground/90 transition-colors hover:bg-muted/40 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
            <span className="truncate">Nova página</span>
          </button>
          <button
            onClick={handleImportClick}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-muted-foreground/90 transition-colors hover:bg-muted/40 hover:text-foreground"
          >
            <LayoutTemplate className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
            <span className="truncate">Importar template</span>
          </button>
        </div>
      </aside>

      {templatesGroupId && (
        <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
          <DialogContent className="!w-[1280px] !max-w-[95vw] gap-0 overflow-hidden border-border bg-popover p-0 text-foreground">
            <DialogHeader className="border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTemplatesOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/80 transition-colors hover:bg-muted/40 hover:text-foreground"
                  aria-label="Voltar"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <DialogTitle className="text-[15px] text-foreground">
                  Importar template
                </DialogTitle>
              </div>
            </DialogHeader>
            <TemplateGallery
              groupId={templatesGroupId}
              onClose={() => setTemplatesOpen(false)}
            />
          </DialogContent>
        </Dialog>
      )}

      <PromptDialog
        open={!!promptState}
        title={promptState?.title ?? ''}
        defaultValue={promptState?.defaultValue}
        confirmLabel={promptState?.confirmLabel}
        onConfirm={(v) => { promptState?.onConfirm(v); setPromptState(null); }}
        onCancel={() => setPromptState(null)}
      />

      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title ?? ''}
        description={confirmState?.description}
        confirmLabel={confirmState?.confirmLabel}
        destructive={confirmState?.destructive}
        onConfirm={() => { confirmState?.onConfirm(); setConfirmState(null); }}
        onCancel={() => setConfirmState(null)}
      />
    </>
  );
}
```

Repare no `handleDelete`: o `AppBar` sempre redirecionava para `/dashboard`
porque só sabia agir sobre a página ativa. Aqui a ação pode alvejar qualquer
item, então o redirect fica condicionado a `reportId === activeReportId` — é o
edge case 4 do spec.

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `pnpm vitest run src/widgets/pages-sidebar`
Expected: PASS — os 5 testes da Task 2, os 4 novos, e os testes da
`TemplateGallery` que vieram junto na mudança de pasta.

- [ ] **Step 6: Commit**

```bash
git add src/widgets/pages-sidebar src/widgets/nav-sidebar src/widgets/app-bar/ui/AppBar.tsx
git commit -m "feat(pages-sidebar): acoes por pagina e rodape de criacao"
```

---

### Task 4: Chrome persistente na coluna

**Files:**
- Move: `src/widgets/nav-sidebar/ui/NavItem.tsx` → `src/widgets/pages-sidebar/ui/NavItem.tsx`
- Modify: `src/widgets/pages-sidebar/ui/PagesSidebar.tsx`
- Test: `src/widgets/pages-sidebar/ui/__tests__/PagesSidebar.test.tsx`

**Interfaces:**
- Consumes: `ClientSwitcher` de `@/widgets/client-switcher` (prop `collapsed?: boolean`);
  `useUserPermissions()` → `{ isAdmin: boolean; canAccessRoute: (clientId, href) => boolean }`;
  `useAuthContext()` → `{ profile: { displayName?: string; email?: string; photoURL?: string } | null; signOut?: () => void }`;
  `NavItem` (props `{ label, href, icon, collapsed }`).
- Produces: nada novo — a assinatura de `PagesSidebar` não muda.

- [ ] **Step 1: Escrever o teste que falha**

Acrescente os mocks no topo de `PagesSidebar.test.tsx` (junto dos demais):

```tsx
const isAdminMock = vi.fn(() => true);

vi.mock('@/widgets/client-switcher', () => ({
  ClientSwitcher: () => <div data-testid="client-switcher" />,
}));

vi.mock('@/shared/hooks/useUserPermissions', () => ({
  useUserPermissions: () => ({ isAdmin: isAdminMock(), canAccessRoute: () => true }),
}));

vi.mock('@/features/auth/providers/AuthProvider', () => ({
  useAuthContext: () => ({
    profile: { displayName: 'Giulliano Soares', email: 'giulliano.soares@askliquid.com' },
    signOut: vi.fn(),
  }),
}));
```

E o novo describe:

```tsx
describe('PagesSidebar — chrome persistente', () => {
  beforeEach(() => {
    useReportsMock.mockReturnValue({
      reports: REPORTS,
      loading: false,
      rename: renameMock,
      remove: removeMock,
      duplicate: duplicateMock,
    });
    isAdminMock.mockReturnValue(true);
  });

  it('mostra o seletor de cliente no topo', () => {
    render(<PagesSidebar />);
    expect(screen.getByTestId('client-switcher')).toBeInTheDocument();
  });

  it('mostra o perfil do usuário no rodapé', () => {
    render(<PagesSidebar />);
    expect(screen.getByText('Giulliano Soares')).toBeInTheDocument();
  });

  it('mostra Administração para admin', () => {
    render(<PagesSidebar />);
    expect(screen.getByText('Administração')).toBeInTheDocument();
  });

  it('esconde Administração para não-admin', () => {
    isAdminMock.mockReturnValue(false);
    render(<PagesSidebar />);
    expect(screen.queryByText('Administração')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm vitest run src/widgets/pages-sidebar/ui/__tests__/PagesSidebar.test.tsx`
Expected: FAIL — `client-switcher` não encontrado.

- [ ] **Step 3: Mover NavItem e implementar o chrome**

```bash
git mv src/widgets/nav-sidebar/ui/NavItem.tsx src/widgets/pages-sidebar/ui/NavItem.tsx
```

Em `PagesSidebar.tsx`, adicione aos imports:

```tsx
import { User, LogOut } from 'lucide-react';
import { ClientSwitcher } from '@/widgets/client-switcher';
import { useUserPermissions } from '@/shared/hooks/useUserPermissions';
import { useAuthContext } from '@/features/auth/providers/AuthProvider';
import { NavItem } from './NavItem';
```

No corpo do componente, antes do `return`:

```tsx
  const { isAdmin } = useUserPermissions();
  let authContext: ReturnType<typeof useAuthContext> | null = null;
  // eslint-disable-next-line react-hooks/rules-of-hooks -- hook opcional em try/catch (fail-soft fora do <Provider>)
  try { authContext = useAuthContext(); } catch {}
  const profile = authContext?.profile;
```

Dentro do `<aside>`, **antes** do `<nav>`:

```tsx
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3">
          <ClientSwitcher collapsed={false} />
        </div>
```

E **depois** do bloco de rodapé com "Nova página"/"Importar template", ainda
dentro do `<aside>`:

```tsx
        {isAdmin && (
          <div className="shrink-0 border-t border-border px-2 py-2">
            <NavItem label="Administração" href="/admin" icon="Shield" collapsed={false} />
          </div>
        )}

        {profile && (
          <div className="shrink-0 border-t border-border p-2">
            <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/40">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted/50">
                {profile.photoURL ? (
                  // eslint-disable-next-line @next/next/no-img-element -- avatar 28px de URL externa arbitrária (Firebase/Google); next/image exigiria whitelist de domínios remotos
                  <img src={profile.photoURL} alt={profile.displayName ?? ''} className="h-full w-full object-cover" />
                ) : (
                  <User className="h-3.5 w-3.5 text-muted-foreground/80" strokeWidth={1.5} />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[12px] font-medium leading-tight text-foreground">
                  {profile.displayName ?? 'User'}
                </span>
                <span className="truncate text-[10px] uppercase tracking-wider text-muted-foreground/60">
                  {profile.email?.split('@')[0]}
                </span>
              </div>
              <button
                onClick={() => authContext?.signOut?.()}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted/50 hover:text-foreground"
                title="Sair"
                aria-label="Sair"
              >
                <LogOut className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            </div>
          </div>
        )}
```

`ClientSwitcher` só dispara `toggle-nav-collapse` no ramo `if (collapsed)`
(`ClientSwitcher.tsx:146-158`). Passando `collapsed={false}` esse ramo nunca
roda — por isso o `ClientSwitcher` não precisa de alteração nenhuma.

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm vitest run src/widgets/pages-sidebar`
Expected: PASS — 13 testes da `PagesSidebar` + os da `TemplateGallery`.

- [ ] **Step 5: Commit**

```bash
git add src/widgets/pages-sidebar src/widgets/nav-sidebar
git commit -m "feat(pages-sidebar): cliente, administracao e perfil na coluna"
```

---

### Task 5: `ChatSidebar` — rename, enxugamento e colapso pelo store

**Files:**
- Move: `src/widgets/nav-sidebar/` → `src/widgets/chat-sidebar/` (o que sobrou)
- Modify: `src/widgets/chat-sidebar/ui/ChatSidebar.tsx` (era `NavSidebar.tsx`)
- Modify: `src/widgets/chat-sidebar/index.ts`
- Test: `src/widgets/chat-sidebar/ui/__tests__/ChatSidebar.test.tsx`

**Interfaces:**
- Consumes: `chatCollapsed` / `setChatCollapsed` / `toggleChatCollapsed` (Task 1);
  `editingReport` do store.
- Produces: `export function ChatSidebar(props: { className?: string })`.
  **Sem** prop `collapsed` — o estado vem do store. Barrel:
  `export { ChatSidebar } from './ui/ChatSidebar'`.

**Preservar sem alteração:** o `useEffect` que dispara `enter-report-edit`
(`NavSidebar.tsx:123-127`). Ele **não** é código morto — `ReportPage.tsx:156`
escuta esse evento. Movê-lo ou removê-lo quebra a entrada em modo de edição.

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/widgets/chat-sidebar/ui/__tests__/ChatSidebar.test.tsx`:

```tsx
/* @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useAppStore } from '@/shared/stores/app-store';

vi.mock('@/widgets/ai-sidebar', () => ({
  AISidebar: () => <div data-testid="ai-sidebar" />,
}));

vi.mock('@/pages/explore/ui/ConversationSidebar', () => ({
  ChatPanel: () => <div data-testid="chat-panel" />,
}));

vi.mock('@/shared/hooks/useConversations', () => ({
  useConversations: () => ({ create: vi.fn(async () => 'c1'), save: vi.fn() }),
}));

vi.mock('@/shared/hooks/useActiveClient', () => ({
  useActiveDataset: () => 'bq-data-wh.vila_rosa',
}));

import { ChatSidebar } from '../ChatSidebar';

describe('ChatSidebar — colapso', () => {
  beforeEach(() => {
    useAppStore.setState({ chatCollapsed: true, editingReport: false, activeReportId: '' });
  });

  it('renderiza o rail quando colapsado, sem o chat', () => {
    render(<ChatSidebar />);
    expect(screen.queryByTestId('ai-sidebar')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expandir chat' })).toBeInTheDocument();
  });

  it('expande ao clicar no rail', () => {
    render(<ChatSidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'Expandir chat' }));
    expect(useAppStore.getState().chatCollapsed).toBe(false);
    expect(screen.getByTestId('ai-sidebar')).toBeInTheDocument();
  });

  it('o evento toggle-ai-sidebar alterna o estado', () => {
    render(<ChatSidebar />);
    act(() => { window.dispatchEvent(new CustomEvent('toggle-ai-sidebar')); });
    expect(useAppStore.getState().chatCollapsed).toBe(false);
    act(() => { window.dispatchEvent(new CustomEvent('toggle-ai-sidebar')); });
    expect(useAppStore.getState().chatCollapsed).toBe(true);
  });

  it('o evento toggle-nav-collapse alterna o estado', () => {
    render(<ChatSidebar />);
    act(() => { window.dispatchEvent(new CustomEvent('toggle-nav-collapse')); });
    expect(useAppStore.getState().chatCollapsed).toBe(false);
  });
});

describe('ChatSidebar — modo de edição', () => {
  beforeEach(() => {
    useAppStore.setState({ chatCollapsed: true, editingReport: false, activeReportId: '' });
  });

  it('auto-expande ao entrar em edição', () => {
    const { rerender } = render(<ChatSidebar />);
    act(() => { useAppStore.setState({ editingReport: true }); });
    rerender(<ChatSidebar />);
    expect(useAppStore.getState().chatCollapsed).toBe(false);
  });

  it('restaura o estado anterior ao sair da edição', () => {
    const { rerender } = render(<ChatSidebar />);
    act(() => { useAppStore.setState({ editingReport: true }); });
    rerender(<ChatSidebar />);
    act(() => { useAppStore.setState({ editingReport: false }); });
    rerender(<ChatSidebar />);
    expect(useAppStore.getState().chatCollapsed).toBe(true);
  });

  it('respeita colapso manual feito durante a edição', () => {
    const { rerender } = render(<ChatSidebar />);
    act(() => { useAppStore.setState({ editingReport: true }); });
    rerender(<ChatSidebar />);
    act(() => { useAppStore.getState().setChatCollapsed(true); });
    act(() => { useAppStore.setState({ editingReport: false }); });
    rerender(<ChatSidebar />);
    expect(useAppStore.getState().chatCollapsed).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm vitest run src/widgets/chat-sidebar`
Expected: FAIL — não resolve `../ChatSidebar`.

- [ ] **Step 3: Mover os arquivos**

```bash
git mv src/widgets/nav-sidebar src/widgets/chat-sidebar
git mv src/widgets/chat-sidebar/ui/NavSidebar.tsx src/widgets/chat-sidebar/ui/ChatSidebar.tsx
```

`src/widgets/chat-sidebar/index.ts` passa a ser:

```ts
export { ChatSidebar } from './ui/ChatSidebar';
```

- [ ] **Step 4: Reescrever o componente**

Substitua `src/widgets/chat-sidebar/ui/ChatSidebar.tsx` inteiro:

```tsx
'use client';

import { cn } from '@/shared/lib/utils';
import { ChevronsLeft, MessageSquare, Loader2 } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { AISidebar } from '@/widgets/ai-sidebar';
import { ChatPanel } from '@/pages/explore/ui/ConversationSidebar';
import { useAppStore } from '@/shared/stores/app-store';
import { useConversations } from '@/shared/hooks/useConversations';
import { useCanvasStore } from '@/shared/stores/canvas-store';
import { useActiveDataset } from '@/shared/hooks/useActiveClient';
import type { UIMessage } from 'ai';

/**
 * Wrapper que provê gestão de conversa para o ChatPanel durante a edição de
 * relatório. Cria a conversa no mount e escuta auto-fill-report.
 */
function ReportEditChat() {
  const { create, save } = useConversations();
  const activeDataset = useActiveDataset();
  const canvasStore = useCanvasStore;

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const createdRef = useRef(false);

  useEffect(() => {
    if (createdRef.current || !activeDataset) return;
    createdRef.current = true;
    create('Edição de relatório').then((id) => {
      if (id) {
        canvasStore.getState().setConversationId(id);
        setConversationId(id);
      }
    });
  }, [activeDataset, create, canvasStore]);

  useEffect(() => {
    if (!conversationId) return;
    const handler = (e: Event) => {
      const prompt = (e as CustomEvent).detail?.prompt;
      if (prompt) setPendingPrompt(prompt);
    };
    window.addEventListener('auto-fill-report', handler);
    return () => window.removeEventListener('auto-fill-report', handler);
  }, [conversationId]);

  if (!conversationId) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/60" />
      </div>
    );
  }

  return (
    <ChatPanel
      conversationId={conversationId}
      initialMessages={[] as UIMessage[]}
      pendingPrompt={pendingPrompt}
      onPromptSent={() => setPendingPrompt(null)}
      conversationsSave={save}
    />
  );
}

/**
 * Painel de chat da esquerda, em dois estados: rail de 64px (padrão) e
 * painel de 256px. O estado vive no app-store (persistido) e responde aos
 * eventos globais toggle-ai-sidebar (⌘K, ⌘⇧A, botão Buscar) e
 * toggle-nav-collapse (⌘[).
 *
 * A navegação entre páginas fica na PagesSidebar, ao lado.
 */
export function ChatSidebar({ className }: { className?: string }) {
  const collapsed = useAppStore((s) => s.chatCollapsed);
  const setChatCollapsed = useAppStore((s) => s.setChatCollapsed);
  const toggleChatCollapsed = useAppStore((s) => s.toggleChatCollapsed);
  const activeReportId = useAppStore((s) => s.activeReportId);
  const editingReport = useAppStore((s) => s.editingReport);

  // Avisa a ReportPage de que há relatório ativo fora de edição.
  // ReportPage.tsx escuta 'enter-report-edit' — não remover.
  useEffect(() => {
    if (activeReportId && !editingReport) {
      window.dispatchEvent(new CustomEvent('enter-report-edit'));
    }
  }, [activeReportId, editingReport]);

  useEffect(() => {
    const handler = () => toggleChatCollapsed();
    window.addEventListener('toggle-ai-sidebar', handler);
    window.addEventListener('toggle-nav-collapse', handler);
    return () => {
      window.removeEventListener('toggle-ai-sidebar', handler);
      window.removeEventListener('toggle-nav-collapse', handler);
    };
  }, [toggleChatCollapsed]);

  // Editar relatório é um fluxo conversacional: abre o chat ao entrar e
  // devolve o estado anterior ao sair — a menos que o usuário tenha
  // colapsado na mão durante a edição, caso em que a escolha dele vence.
  const collapsedBeforeEditRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (editingReport) {
      if (collapsedBeforeEditRef.current === null) {
        collapsedBeforeEditRef.current = collapsed;
        setChatCollapsed(false);
      }
      return;
    }
    if (collapsedBeforeEditRef.current !== null) {
      if (!collapsed) setChatCollapsed(collapsedBeforeEditRef.current);
      collapsedBeforeEditRef.current = null;
    }
  }, [editingReport, collapsed, setChatCollapsed]);

  return (
    <aside
      className={cn(
        'flex h-full flex-col bg-background transition-[width] duration-300 ease-out',
        collapsed ? 'w-16' : 'w-64',
        className,
      )}
    >
      {collapsed ? (
        <div className="flex flex-1 flex-col items-center gap-2 px-2 py-3">
          <button
            onClick={() => setChatCollapsed(false)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground/80 transition-colors hover:bg-muted/50 hover:text-foreground"
            aria-label="Expandir chat"
            title="Expandir chat"
          >
            <MessageSquare className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      ) : (
        <>
          <div className="flex h-14 shrink-0 items-center justify-end border-b border-border px-3">
            <button
              onClick={() => setChatCollapsed(true)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground/80 transition-colors hover:bg-muted/50 hover:text-foreground"
              aria-label="Minimizar chat"
              title="Minimizar chat"
            >
              <ChevronsLeft className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
          {editingReport ? (
            <ReportEditChat />
          ) : (
            <AISidebar open onClose={() => {}} embedded editMode={editingReport} />
          )}
        </>
      )}
    </aside>
  );
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `pnpm vitest run src/widgets/chat-sidebar`
Expected: PASS — 7 testes.

- [ ] **Step 6: Commit**

```bash
git add src/widgets/chat-sidebar src/widgets/nav-sidebar
git commit -m "refactor(chat-sidebar): renomeia nav-sidebar e move colapso para o store"
```

---

### Task 6: Montar as duas colunas no layout

**Files:**
- Modify: `src/app/layouts/DashboardLayout.tsx`

**Interfaces:**
- Consumes: `ChatSidebar` (Task 5) e `PagesSidebar` (Tasks 2-4).
- Produces: nada — é a montagem final.

- [ ] **Step 1: Editar o layout**

Em `src/app/layouts/DashboardLayout.tsx`:

Troque o import da linha 5:

```tsx
import { ChatSidebar } from '@/widgets/chat-sidebar';
import { PagesSidebar } from '@/widgets/pages-sidebar';
```

Remova o state `navCollapsed` (linha 25) e, no `useEffect` das linhas 30-41,
remova `handleToggleNavCollapse` e os dois listeners de `toggle-nav-collapse`
— quem responde a esse evento agora é a `ChatSidebar`. O efeito fica:

```tsx
  useEffect(() => {
    const handleToggleNavSidebar = () => setSidebarOpen(v => !v);
    window.addEventListener('toggle-nav-sidebar', handleToggleNavSidebar);
    return () => window.removeEventListener('toggle-nav-sidebar', handleToggleNavSidebar);
  }, []);
```

O bloco desktop (linhas 52-56) passa a montar as duas colunas:

```tsx
        {!isImmersive && (
          <div className="relative z-10 hidden lg:flex">
            {isAdmin ? (
              <AdminSidebar />
            ) : (
              <>
                <ChatSidebar />
                <PagesSidebar />
              </>
            )}
          </div>
        )}
```

O `Sheet` mobile (linhas 58-65) passa a mostrar a coluna de páginas, que é o
que o ícone ☰ promete:

```tsx
        {!isImmersive && (
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetContent side="left" className="z-50 w-60 border-border bg-background p-0">
              <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
              {isAdmin ? <AdminSidebar /> : <PagesSidebar className="w-full border-r-0" />}
            </SheetContent>
          </Sheet>
        )}
```

No diálogo de atalhos (linha 99), atualize a descrição do `⌘ [`:

```tsx
                  ['⌘ [', 'Colapsar/expandir chat'],
```

- [ ] **Step 2: Verificar que a suíte tocada continua verde**

Run: `pnpm vitest run src/widgets/pages-sidebar src/widgets/chat-sidebar src/shared/stores/app-store.test.ts`
Expected: PASS.

- [ ] **Step 3: Verificar tipos e lint**

Run: `pnpm lint`
Expected: sem erros. Um erro de import não usado em `DashboardLayout` aqui
significa que sobrou referência a `NavSidebar` ou `navCollapsed` — remova.

- [ ] **Step 4: Verificar no navegador**

Suba o dev server (`pnpm exec next dev --turbopack --port 3010`) e confirme, com
o cliente Vila Rosa:

1. rail de 64px + coluna de páginas de 224px à esquerda;
2. clicar numa página troca o conteúdo e marca o item;
3. clicar no ícone de chat expande para 256px; `⌘[` e `⌘⇧A` também;
4. recarregar a página preserva o estado do chat;
5. abrir uma página em modo de edição expande o chat sozinho.

- [ ] **Step 5: Commit**

```bash
git add src/app/layouts/DashboardLayout.tsx
git commit -m "feat(layout): monta chat e coluna de paginas lado a lado"
```

---

### Task 7: Limpar o `AppBar`

**Files:**
- Modify: `src/widgets/app-bar/ui/AppBar.tsx`
- Test: `src/widgets/app-bar/ui/__tests__/AppBar.test.tsx`

**Interfaces:**
- Consumes: nada das tasks anteriores.
- Produces: `AppBar` mantém a mesma prop pública (`AppBarProps`), mas as props
  `groupId` e `groupName` ficam sem uso interno. Mantenha-as na interface,
  marcadas como `@deprecated`, para não quebrar os call sites.

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/widgets/app-bar/ui/__tests__/AppBar.test.tsx`:

```tsx
/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/shared/ui/theme-toggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

import { AppBar } from '../AppBar';

describe('AppBar', () => {
  it('mostra o título da página', () => {
    render(<AppBar pageTitle="Visão Geral" />);
    expect(screen.getByText('Visão Geral')).toBeInTheDocument();
  });

  it('não oferece mais o dropdown de páginas', () => {
    render(<AppBar pageTitle="Visão Geral" />);
    expect(screen.queryByRole('button', { name: /Visão Geral/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Nova página')).not.toBeInTheDocument();
    expect(screen.queryByText('Importar template')).not.toBeInTheDocument();
  });

  it('mantém o botão de busca', () => {
    render(<AppBar pageTitle="Visão Geral" />);
    expect(screen.getByRole('button', { name: 'Buscar' })).toBeInTheDocument();
  });
});
```

O teste não mocka `useGroups` nem `useReports` de propósito: se o `AppBar`
ainda depender deles, ele quebra no render e o teste falha — exatamente o sinal
que queremos.

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `pnpm vitest run src/widgets/app-bar`
Expected: FAIL — o dropdown ainda existe e o componente ainda chama os hooks de
dados.

- [ ] **Step 3: Enxugar o AppBar**

Remova de `src/widgets/app-bar/ui/AppBar.tsx`:

- o `DropdownMenu` de páginas inteiro (linhas 221-277) e o botão "Importar
  template" (linhas 289-296);
- o `Dialog` da `TemplateGallery` (linhas 345-364), o `PromptDialog` e o
  `ConfirmDialog` (linhas 366-385);
- os handlers `ensureGroup`, `handleImportClick`, `handleNewPage`,
  `handleSwitchReport`, `handleRenameReport`, `handleDuplicateReport`,
  `handleDeleteReport`, `askPrompt`, `askConfirm`;
- os states `templatesOpen`, `promptState`, `confirmState`;
- os hooks `useRouter`, `useGroups`, `useReports` e todos os seletores do
  `useAppStore`, além de `activeReport` e `defaultGroupId`;
- os imports que ficaram órfãos: `useState`, `useRouter`, `Dialog*`,
  `TemplateGallery`, `PromptDialog`, `ConfirmDialog`, `useGroups`, `useReports`,
  `createReportDoc`, `useAppStore`, `DropdownMenu*`, e de `lucide-react` os
  ícones `ChevronDown`, `Plus`, `Check`, `LayoutTemplate`, `ArrowLeft`,
  `Trash2`, `Copy`.

Sobram os imports `cn`, `Button`, `Menu`, `Pencil`, `Search`, `ThemeToggle`.

O título deixa de ser trigger e vira texto:

```tsx
          <div className="flex min-w-0 items-center gap-1">
            <span className="truncate px-1.5 py-1 text-[14px] font-semibold text-foreground">
              {displayTitle}
            </span>

            {editable && !editing && (
              <button
                onClick={onEdit}
                className="ml-1 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-muted-foreground"
                title="Editar página"
              >
                <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            )}
          </div>
```

O componente também deixa de precisar do fragmento externo `<>...</>`: passe a
retornar o `<header>` direto.

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `pnpm vitest run src/widgets/app-bar`
Expected: PASS — 3 testes.

- [ ] **Step 5: Verificar tipos, lint e build**

Run: `pnpm lint`
Expected: sem erros nem warnings de variável não usada no `AppBar`.

Run: `pnpm build`
Expected: build completo, sem erro de tipo. É a checagem que pega qualquer
import quebrado deixado pelos `git mv` das Tasks 3-5.

- [ ] **Step 6: Confirmar no navegador**

Com o dev server rodando, revalide os edge cases do spec:

1. excluir uma página **não** ativa mantém você na página atual;
2. excluir a página ativa redireciona para `/dashboard`;
3. `/admin` continua com a `AdminSidebar` sozinha;
4. `/explore` continua sem sidebars;
5. numa rota legada (`/contratos`) nenhum item da coluna aparece como ativo;
6. abaixo de 1024px o ☰ abre a coluna de páginas.

- [ ] **Step 7: Commit**

```bash
git add src/widgets/app-bar
git commit -m "refactor(app-bar): remove dropdown de paginas e acoes de CRUD"
```

---

## Self-Review

**Cobertura do spec**

| Requisito do spec | Task |
|---|---|
| `PagesSidebar` com três faixas | 2, 3, 4 |
| `ChatSidebar` com rail 64px ↔ 256px | 5 |
| `chatCollapsed` persistido, default colapsado | 1 |
| `⌘[` / `⌘⇧A` / `toggle-ai-sidebar` controlam o chat | 5 |
| Auto-expandir na edição e restaurar ao sair | 5 |
| Ações por item, não sobre o "ativo" implícito | 3 |
| `+ Nova página` e `Importar template` no rodapé | 3 |
| Cliente, Administração e perfil na coluna | 4 |
| `AppBar` sem dropdown | 7 |
| Duas colunas em `lg+`; `Sheet` mobile com a coluna | 6 |
| Edge cases 1-2 (vazio, lista longa) | 2, 3 |
| Edge cases 3-4 (excluir ativa / não-ativa) | 3, 7 |
| Edge cases 5-7 (`/admin`, `/explore`, rotas legadas) | 6, 7 |
| Edge case 8 (carregando) | 2 |
| Edge case 9 (não-admin) | 4 |
| `ReportListCompact` absorvido | 5 |

**Consistência de tipos** — `PagesSidebar({ className })` e `ChatSidebar({ className })`
mantêm a mesma assinatura da Task 2/5 até o uso na Task 6. `PageListItemProps`
é definida na Task 3 e só consumida lá. `chatCollapsed`/`setChatCollapsed`/
`toggleChatCollapsed` são definidos na Task 1 e usados com os mesmos nomes na
Task 5.

**Riscos conhecidos**

- Os edge cases 5-7 e o comportamento mobile são verificados no navegador
  (Tasks 6-7), não por teste automatizado: montar `DashboardLayout` em teste
  exigiria stub de auth, permissões, tema e roteador — custo alto para o valor.
  Está declarado, não omitido.
- `pnpm build` na Task 7 é a rede de segurança dos `git mv`. Não pule.
