---
title: Radix UI
category: frontend
packages:
  - "@radix-ui/react-* (SemVer individual por pacote)"
  - "radix-ui (meta-package, opcional)"
  - "@radix-ui/colors (opcional)"
last_updated: 2026-07-13
status: current
upstream:
  - https://www.radix-ui.com/primitives
  - https://github.com/radix-ui/primitives
  - https://www.radix-ui.com/colors
  - https://www.w3.org/WAI/ARIA/apg/
---

# Radix UI

Camada de **primitives headless** do projeto: comportamento, acessibilidade e composição. Consumido via `@stacks/frontend/shadcn-ui`, que monta os componentes estilizados em cima.

## 1. O que é Radix UI

Radix é um guarda-chuva com **três produtos distintos**. O projeto usa apenas o primeiro.

| Produto | Descrição | Status no projeto |
|---|---|---|
| **Radix Primitives** | Componentes headless (sem estilo) focados em comportamento e a11y. Cada primitive em pacote próprio com SemVer próprio. | **Adotado**, via `@stacks/frontend/shadcn-ui`. |
| **Radix Colors** | Paleta 12-step automaticamente dark-mode-aware, em OKLCH. Token-friendly. | **Não adotado por default.** Opcional como base para tokens em `@theme` (Tailwind 4). Ver §11. |
| **Radix Themes** | Component library estilizada (alternativa ao shadcn/ui). | **Proibido.** Conflita com shadcn/ui — não misturar no mesmo projeto. |

> Quando este documento diz "Radix", refere-se a **Primitives**.

## 2. Filosofia

- **Separação rígida** entre comportamento/a11y (Radix) e estilo (consumer).
- Componentes **não renderizam visual algum** — expõem estado e semântica via ARIA + `data-*` attributes.
- **Composição por Parts**: cada primitive é uma árvore de subcomponentes nomeados.

```tsx
<Dialog.Root>
  <Dialog.Trigger asChild><Button>Open</Button></Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay className="..." />
    <Dialog.Content className="...">
      <Dialog.Title>...</Dialog.Title>
      <Dialog.Description>...</Dialog.Description>
      <Dialog.Close asChild><Button>Close</Button></Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

Nunca recompor um primitive omitindo Parts canônicas (`Portal`, `Title`, `Description`) sem motivo deliberado.

## 3. Princípios técnicos

- **WAI-ARIA Authoring Practices** implementadas (roles, atributos, foco, anúncio).
- **Keyboard navigation completa** por default (Tab, Arrow keys, Esc, Enter, Space, Home/End conforme padrão).
- **Focus management automático**: focus trap em overlays, focus return ao fechar, focus initial configurável (`onOpenAutoFocus`, `onCloseAutoFocus`).
- **Screen reader compatible** (testado com NVDA, JAWS, VoiceOver).
- **Controlled e uncontrolled** modes em todos os primitives com estado.
- **`asChild`** em todos os triggers/items: delega rendering ao filho mergeando props e ref via `Slot`.
- **Portals** para overlays.
- **Collision detection** em popovers/tooltips/dropdowns (auto-flip, auto-shift).
- **RTL nativo** via `<DirectionProvider>`.
- **SSR-safe** (`useId` interno, sem `useLayoutEffect` warnings).

## 4. Catálogo de primitives

Visão geral — instale apenas via shadcn CLI conforme necessidade.

| Grupo | Primitives |
|---|---|
| **Overlays** | `Dialog`, `AlertDialog`, `Popover`, `HoverCard`, `Tooltip`, `ContextMenu`, `DropdownMenu`, `NavigationMenu`, `Menubar` |
| **Form** | `Checkbox`, `RadioGroup`, `Switch`, `Slider`, `Select`, `Form`, `Label`, `Toggle`, `ToggleGroup`, `OneTimePasswordField` |
| **Disclosure** | `Accordion`, `Collapsible`, `Tabs` |
| **Feedback** | `Progress`, ~~`Toast`~~ (descontinuado — usar Sonner ou implementação custom) |
| **Layout** | `AspectRatio`, `Separator`, `ScrollArea` |
| **Utilities** | `Avatar`, `Slot`, `Portal`, `VisuallyHidden`, `Direction`, `AccessibleIcon` |

## 5. Pacotes e imports

Cada primitive em pacote próprio com versão própria:

```ts
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
```

Existe um meta-package `radix-ui` consolidando todos, mas:

**Convenção do projeto:** importar **dos pacotes individuais** (`@radix-ui/react-*`), nunca do meta-package.

- Tree-shaking explícito.
- `package.json` reflete dependências reais.
- Alinhado com o que o `shadcn` CLI instala via `components.json`.

## 6. Styling via data attributes

Toda animação e estilo condicional usa `data-*` que Radix emite — nunca classes manuais sincronizadas com estado React.

Atributos canônicos:

| Atributo | Onde aparece |
|---|---|
| `data-state="open\|closed"` | Dialog, Popover, Collapsible, DropdownMenu, etc. |
| `data-state="checked\|unchecked\|indeterminate"` | Checkbox, Switch, RadioItem |
| `data-state="active\|inactive"` | Tabs |
| `data-side="top\|right\|bottom\|left"` | Popover/Tooltip/Dropdown Content |
| `data-align="start\|center\|end"` | Popover/Tooltip/Dropdown Content |
| `data-orientation="horizontal\|vertical"` | Slider, Tabs, Separator, ToggleGroup |
| `data-disabled` | qualquer item interativo desabilitado |
| `data-highlighted` | item focado por teclado em menus/select |
| `data-selected` | item selecionado |

Padrão Tailwind 4 (ver `@stacks/frontend/tailwind@4`):

```tsx
<Popover.Content
  className="
    data-[state=open]:animate-in data-[state=closed]:animate-out
    data-[side=top]:slide-in-from-bottom-2
    data-[side=bottom]:slide-in-from-top-2
  "
/>
```

Animações de entrada podem usar `@starting-style` (Tailwind 4) ou keyframes — sempre respeitar `prefers-reduced-motion` (ver `@rules/accessibility`).

## 7. `asChild` pattern

`asChild` renderiza o **filho** como elemento, mergeando props/ref do trigger via `Slot`. Evita aninhamento `<button><button>` que quebra semântica e a11y.

```tsx
// Correto
<Tooltip.Trigger asChild>
  <Button variant="ghost">Help</Button>
</Tooltip.Trigger>

// Errado — gera <button><button>
<Tooltip.Trigger>
  <Button variant="ghost">Help</Button>
</Tooltip.Trigger>
```

Regra: sempre que o filho já é um elemento interativo nativo (ou componente que renderiza um), use `asChild`.

## 8. Controlled vs uncontrolled

Todo primitive com estado aceita ambos:

```tsx
// Uncontrolled — preferir para UI local
<Dialog.Root defaultOpen={false}>...</Dialog.Root>

// Controlled — quando estado precisa subir
<Dialog.Root open={open} onOpenChange={setOpen}>...</Dialog.Root>
```

Convenção do projeto (alinhar com `@rules/state-management`):

- **Uncontrolled por default** para estado puramente local de UI (dropdown aberto, tab ativa visual).
- **Controlled** quando o estado precisa ser elevado, sincronizado com URL, persistido, ou compartilhado entre componentes irmãos.

## 9. Acessibilidade

Radix entrega WAI-ARIA Authoring Practices implementadas — mas o consumer pode quebrá-las. Ver `@rules/accessibility`.

- **Nunca** desabilitar `disableOutsidePointerEvents`, `forceMount`, `onPointerDownOutside`, `onEscapeKeyDown` sem entender impacto em foco/anúncio.
- **Sempre** incluir `<Dialog.Title>` e `<Dialog.Description>` (ou `<AlertDialog.*>`). Se design não permite mostrar visualmente, envolver em `<VisuallyHidden>` — não omitir.
- Ícones interativos isolados (sem texto) devem usar `<AccessibleIcon label="...">`.
- Não sobrescrever `aria-*` que Radix já gerencia (`aria-expanded`, `aria-controls`, `aria-haspopup`, etc.) sem necessidade.
- Animações devem respeitar `prefers-reduced-motion`.

## 10. Internacionalização

Ver `@rules/internationalization`.

```tsx
// app/layout.tsx (client boundary)
<DirectionProvider dir={locale === "ar" ? "rtl" : "ltr"}>
  {children}
</DirectionProvider>
```

Radix ajusta automaticamente `side`/`align` em popovers e direção de navegação em menus/sliders/tabs quando `dir="rtl"`.

## 11. Portals

Overlays renderizam em `<Portal>` por default, no `document.body`.

- Para targets customizados (modal dentro de iframe, root custom), passar `container`:
  ```tsx
  <Dialog.Portal container={myContainerRef.current}>...</Dialog.Portal>
  ```
- Em `@stacks/frontend/next@16` App Router: portais funcionam, mas o primitive em si é Client Component — sempre montar atrás de `"use client"`.
- Não criar portal customizado paralelo: quebra focus trap e RTL.

## 12. React 19 e Next.js 16

Ver `@stacks/frontend/react@19` e `@stacks/frontend/next@16`.

- Radix Primitives são **compatíveis com React 19**.
- `ref` como prop funciona: Radix internamente usa `forwardRef`, mas o consumer já pode passar `ref` diretamente em React 19.
- **Não envolver Radix em `forwardRef` próprio** em código novo — passe `ref` como prop.
- Todo wrapper de primitive em `components/ui/` (gerado pelo shadcn) é Client Component (`"use client"`).
- `useId` interno garante IDs estáveis SSR↔client; `useIsomorphicLayoutEffect` interno suprime warnings.

## 13. Bundle size

- Cada primitive ~2-8KB minified+gzip.
- Tree-shaking efetivo **se** importar dos pacotes individuais.
- **Não criar barrel exports** em `components/ui/index.ts` que reexportem todos — quebra tree-shaking. Importar primitives diretamente onde usados.

## 14. Customização — onde mora cada coisa

| Camada | Onde | Tecnologia |
|---|---|---|
| Comportamento + a11y | Radix Primitive | `@radix-ui/react-*` |
| Estilo + variantes | `components/ui/` | Tailwind + `cn`/`cva` (ver `@stacks/frontend/shadcn-ui` e `@stacks/frontend/tailwind@4`) |
| Composição de domínio | `features/<feature>/components/` | React composition |

Regra: **componente de domínio mora em `features/`, não em `ui/`.** `ui/` é só shadcn/Radix estilizado, sem regra de negócio.

## 15. Radix Colors (opcional)

Escala 12-step com semântica por step:

| Steps | Uso |
|---|---|
| 1-2 | App background, subtle background |
| 3-5 | UI element background, hovered, active |
| 6-8 | Subtle borders, UI borders, hovered borders |
| 9-10 | Solid backgrounds, hovered solids |
| 11-12 | Low-contrast text, high-contrast text |

Pode mapear para tokens shadcn em `@theme` (Tailwind 4):

```css
@theme {
  --color-background: var(--gray-1);
  --color-muted: var(--gray-3);
  --color-border: var(--gray-6);
  --color-primary: var(--blue-9);
  --color-foreground: var(--gray-12);
}
```

**Decisão atual:** não adotado por default. Avaliar caso a caso se design exigir escala consistente dark-mode-aware sem reinventar tokens.

## 16. Anti-patterns

- Recriar comportamento de um primitive manualmente "para ter controle" — você vai quebrar a11y.
- Omitir `asChild` e gerar `<button><button>` ou `<a><a>`.
- Estilizar sem usar `data-*` attributes e tentar sincronizar com state React.
- Misturar **Radix Primitives** com **Radix Themes** no mesmo projeto.
- Importar do meta-package `radix-ui` sem necessidade — usar pacotes individuais.
- Omitir `<Dialog.Title>` / `<Dialog.Description>` (warning em console + leitor de tela perdido).
- Animações que ignoram `prefers-reduced-motion`.
- Portal customizado que quebra focus trap e RTL.
- Patch em internals de Radix em vez de composição por cima.
- Wrapper em `forwardRef` em código novo (React 19 dispensa).
- Barrel export reexportando todos os primitives — mata tree-shaking.

## 17. Referências cruzadas

- `@stacks/frontend/shadcn-ui` — camada estilizada que consome estes primitives.
- `@stacks/frontend/tailwind@4` — styling via `data-*` e `@theme`.
- `@stacks/frontend/react@19` — `ref` como prop, sem `forwardRef`.
- `@stacks/frontend/next@16` — Client Components, SSR, App Router.
- `@rules/accessibility` — uso correto de Title/Description/VisuallyHidden, `prefers-reduced-motion`.
- `@rules/internationalization` — `DirectionProvider`, RTL.
- `@rules/state-management` — controlled vs uncontrolled.

## 18. Upstream

- Primitives: https://www.radix-ui.com/primitives
- Source: https://github.com/radix-ui/primitives
- Colors: https://www.radix-ui.com/colors
- WAI-ARIA APG: https://www.w3.org/WAI/ARIA/apg/
