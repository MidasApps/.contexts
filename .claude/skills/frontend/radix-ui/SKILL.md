---
name: radix-ui
description: Use para primitivas headless Radix UI — acessibilidade, composição. Keywords: radix, headless, primitives.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Radix UI Primitives

Componentes **headless** (sem estilo) com acessibilidade WAI-ARIA correta out-of-the-box: Dialog, Popover, Dropdown, Tooltip, Tabs, Toast, Select, Combobox, etc.

## Essência
- **Headless:** Radix fornece comportamento + ARIA + keyboard nav; **você fornece o CSS** (Tailwind/CSS).
- **`asChild` prop:** ao invés de renderizar wrapper extra, passa props/ref para o filho. Crucial para `<Link asChild>` etc.
- **Estados via `data-*`:** `data-state="open"`, `data-disabled`, `data-orientation` — estilizar com Tailwind `data-[state=open]:...`.
- **Controle:** controlled (`open`/`onOpenChange`) ou uncontrolled (`defaultOpen`).
- **Portal por default** em overlays (Dialog, Popover) → não vaza layout do pai.
- **Focus management** automático: focus-trap em Dialog, focus-return ao fechar.
- **Imports granulares:** `@radix-ui/react-dialog`, `@radix-ui/react-popover` — paga só o que usa.
- Base do shadcn/ui — se você usa shadcn, está usando Radix por baixo.

## Procedimento mínimo
1. Instalar primitive: `pnpm add @radix-ui/react-dialog`.
2. Compor o componente: `Dialog.Root`, `Dialog.Trigger`, `Dialog.Portal`, `Dialog.Overlay`, `Dialog.Content`, `Dialog.Title`, `Dialog.Close`.
3. Estilizar via classes Tailwind nos slots; usar `data-[state=open]:animate-in` para transições.
4. Para componente reutilizável, wrap num arquivo `components/ui/Dialog.tsx` (estratégia shadcn).
5. Validar com teclado: Tab/Shift+Tab/Esc/Enter/setas funcionam por default.

## Anti-patterns
- Re-implementar focus-trap manualmente → Radix faz.
- Esquecer `Dialog.Title` (mesmo visualmente oculto) → quebra screen reader.
- Animar com `transition-all` puro sem `data-state` → flicker; usar variantes data-state.

## Mini-exemplo
```tsx
import * as Dialog from "@radix-ui/react-dialog";

<Dialog.Root>
  <Dialog.Trigger className="btn">Open</Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 bg-black/50 data-[state=open]:animate-in" />
    <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white p-6 rounded">
      <Dialog.Title>Confirm</Dialog.Title>
      <Dialog.Close>Cancel</Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/frontend/radix-ui.md`
**Documentação upstream:** documentação oficial da biblioteca na versão pinada em MEMORY.
