---
name: shadcn-ui
description: Use para componentes shadcn/ui (base Radix, style new-york, Tailwind 4.3.3, radix-ui 1.6.7) — init, add, components.json, theming, variantes cva, forms. Keywords: shadcn, ui components, components.json, cva, cn, shadcn init.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# shadcn/ui

Não é uma lib — é uma **coleção de componentes copiados para o seu repo** (via CLI), construídos sobre Radix UI + Tailwind. Você possui o código e customiza livremente. Stack do projeto: `radix-ui@1.6.7`, `tailwindcss@4.3.3`, React 19.3.0.

## Essência
- Instala por componente: `npx shadcn@latest add button dialog form`. Código vai pra `components/ui/` (sob FSD/atomic: `shared/ui`, ajustando `aliases` no `components.json`).
- Cada componente é arquivo TS/TSX no seu projeto — edite à vontade.
- Variantes com **`class-variance-authority` (cva)** + utilitário `cn()` (clsx + tailwind-merge).
- **Theming via CSS variables** em `globals.css`: `--background`, `--foreground`, `--primary` etc. Dark mode flipa as variáveis.
- Composição sobre **Radix primitives** — herda accessibility (focus-trap, keyboard, ARIA).
- **Forms:** `Form` + `react-hook-form` + Zod resolver (escolha canônica).
- Não tente "upgradar lib" — compare com `shadcn view <componente>` ou re-rode `shadcn add <componente> --overwrite` e revise o git diff (não existem `shadcn diff`/`shadcn update`).
- **Base Radix, não Base UI:** a CLI atual tem `init -b base|radix|aria`; `-d/--defaults` cai em Base UI + preset Nova. O projeto usa `shadcn init -b radix` e nunca `-d`.
- `components.json`: `style: "new-york"` (valor legado que a CLI lê como base Radix; presets novos `nova`/`vega`/… só com ADR); `baseColor` ∈ neutral, stone, zinc, mauve, olive, mist, taupe.
- Primitives via pacote unificado `radix-ui`.

## Procedimento mínimo
1. `pnpm dlx shadcn@latest init -b radix` configura `components.json`, `cn()` helper, CSS variables (sob FSD, ajuste `aliases` para `@/shared/ui` e `@/shared/lib`).
2. `npx shadcn@latest add <component>` por demanda.
3. Customizar componente diretamente no arquivo gerado; commitar.
4. Para variantes novas, estender `cva()` do próprio componente.
5. Para forms, usar `<Form>` (RHF) + `<FormField>` + Zod schema (`z.email()`, constante `LoginSchema` em `login.schema.ts`, fora do componente). Componente de domínio (`LoginForm.tsx`) vai em `features/`, não em `ui/`.

## Anti-patterns
- Tentar importar de `@shadcn/ui` como lib → não é lib; copia código.
- Wrapper sobre wrapper para "padronizar" Button → edita o Button diretamente.
- Mudar CSS variables inline → mudar em `globals.css` para afetar tema todo.

## Mini-exemplo
```tsx
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

<Dialog>
  <DialogTrigger asChild><Button variant="outline">Open</Button></DialogTrigger>
  <DialogContent>...</DialogContent>
</Dialog>
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/frontend/shadcn-ui.md`
**Documentação upstream:** documentação oficial da biblioteca na versão pinada em MEMORY.
