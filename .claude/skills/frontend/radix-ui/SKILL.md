---
name: radix-ui
description: Use para primitivas headless Radix UI (pacote unificado radix-ui@1.6.7) — acessibilidade, composição, asChild, data-state, focus management. Keywords: radix, radix-ui, headless, primitives, asChild, dialog, popover.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Radix UI Primitives

Componentes **headless** (sem estilo) com acessibilidade WAI-ARIA correta out-of-the-box: Dialog, Popover, DropdownMenu, Tooltip, Tabs, Toast, Select, OneTimePasswordField etc. Baseline **radix-ui@1.6.7** (pacote unificado). Toaster do projeto é Sonner via shadcn (o `toast` do shadcn está deprecated; o primitive `Toast` do Radix segue publicado).

## Essência
- **Headless:** Radix fornece comportamento + ARIA + keyboard nav; **você fornece o CSS** (Tailwind/CSS).
- **`asChild` prop:** ao invés de renderizar wrapper extra, passa props/ref para o filho. Crucial para `<Link asChild>` etc.
- **Estados via `data-*`:** `data-state="open"`, `data-disabled`, `data-orientation` — estilizar com Tailwind `data-[state=open]:...`.
- **Controle:** controlled (`open`/`onOpenChange`) ou uncontrolled (`defaultOpen`).
- **Portal por default** em overlays (Dialog, Popover) → não vaza layout do pai.
- **Focus management** automático: focus-trap em Dialog, focus-return ao fechar.
- **Pacote unificado:** `import { Dialog, Popover } from "radix-ui"` (recomendado pela doc oficial e adotado pelo projeto); named imports mantêm tree-shaking.
- Base do shadcn/ui — se você usa shadcn, está usando Radix por baixo.

## Procedimento mínimo
1. Instalar: `pnpm add radix-ui@1.6.7` (ou deixar o `shadcn add` instalar; o projeto usa `shadcn init -b radix`).
2. Compor o componente: `Dialog.Root`, `Dialog.Trigger`, `Dialog.Portal`, `Dialog.Overlay`, `Dialog.Content`, `Dialog.Title`, `Dialog.Close`.
3. Estilizar via classes Tailwind nos slots; usar `data-[state=open]:animate-in` para transições.
4. Para componente reutilizável, wrap num arquivo `components/ui/dialog.tsx` (estratégia shadcn; sob FSD, `shared/ui`).
5. Validar com teclado: Tab/Shift+Tab/Esc/Enter/setas funcionam por default.

## Anti-patterns
- Re-implementar focus-trap manualmente → Radix faz.
- Esquecer `Dialog.Title` (mesmo visualmente oculto) → quebra screen reader.
- Animar com `transition-all` puro sem `data-state` → flicker; usar variantes data-state.

## Mini-exemplo
```tsx
import { Dialog } from "radix-ui";

<Dialog.Root>
  <Dialog.Trigger className="rounded-md bg-primary px-3 py-2 text-primary-foreground">Open</Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-in" />
    <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-6">
      <Dialog.Title>Confirm</Dialog.Title>
      <Dialog.Description>This action cannot be undone.</Dialog.Description>
      <Dialog.Close>Cancel</Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/frontend/radix-ui.md`
**Documentação upstream:** documentação oficial da biblioteca na versão pinada em MEMORY.
