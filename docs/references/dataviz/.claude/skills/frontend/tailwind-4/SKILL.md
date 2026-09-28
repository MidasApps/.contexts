---
name: tailwind-4
description: Use para Tailwind CSS 4 — utilitários, theming, design tokens. Keywords: tailwind, css, utility classes.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Tailwind CSS 4

Utility-first CSS com engine Rust (Oxide), config CSS-first via `@theme`, suporte nativo a CSS variables, container queries, has-selector, modos `data-*`. Compila rápido e gera só o CSS usado.

## Essência
- **CSS-first config:** define design tokens em CSS com `@theme { --color-primary-500: oklch(...); }` no arquivo de entrada (`globals.css`).
- **Sem `tailwind.config.js`** obrigatório — `@theme` substitui em casos comuns; JS config ainda permitido.
- **`@import "tailwindcss"`** carrega base+components+utilities.
- **Container queries:** `@container` + utilidades `@sm:` etc.
- **Has/group/peer:** `has-[input:checked]:bg-blue`, `group-hover:`, `peer-focus:`.
- **Data attributes:** `data-[state=open]:bg-foo` — combina lindo com Radix.
- **Arbitrary values:** `w-[37.5%]`, `bg-[#abc123]`, `[mask-image:...]`.
- **Layers:** `@layer base/components/utilities` para ordem de specificity.
- **Dark mode:** `@variant dark` ou classe `dark:`.
- **Plugins JS** ainda funcionam; cli `tailwindcss` direto ou via PostCSS/framework.

## Procedimento mínimo
1. `globals.css`:
   ```css
   @import "tailwindcss";
   @theme { --color-brand: oklch(0.7 0.2 250); --font-sans: "Inter", sans-serif; }
   ```
2. Use utilitários direto em JSX/HTML; evite `@apply` em demasia (perde do utility-first).
3. Componentes reutilizáveis com `class-variance-authority` ou `tailwind-variants` para variantes.
4. Animações via `transition-*`/`animate-*` ou `@keyframes` em layer.
5. Para evitar class hell, extraia componente (`<Button variant="primary" />`), não soup de utilitários em mil lugares.

## Anti-patterns
- `style={{ color: "red" }}` em vez de classe → quebra dark mode/theming.
- `@apply` em todo lugar reinventando CSS-in-CSS → use utilitários direto.
- Hardcoded color em utility (`bg-[#5a78e0]`) → adicionar ao `@theme`.
- Class list de 30 itens repetida em N lugares → extrair componente ou variant.

## Mini-exemplo
```tsx
<button className="
  inline-flex items-center gap-2 rounded-md
  bg-brand text-white px-3 py-2
  hover:bg-brand/90 focus-visible:ring-2 focus-visible:ring-brand
  data-[loading=true]:opacity-50
">
  Save
</button>
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/frontend/tailwind@4.md`
**Documentação upstream:** documentação oficial da biblioteca na versão pinada em MEMORY.
