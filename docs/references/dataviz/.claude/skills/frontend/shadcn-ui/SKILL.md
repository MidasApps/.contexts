---
name: shadcn-ui
description: Use para componentes shadcn/ui — composição, theming, variantes. Keywords: shadcn, ui components.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# shadcn/ui

Não é uma lib — é uma **coleção de componentes copiados para o seu repo** (via CLI), construídos sobre Radix UI + Tailwind. Você possui o código e customiza livremente.

## Essência
- Instala por componente: `npx shadcn@latest add button dialog form`. Código vai pra `components/ui/`.
- Cada componente é arquivo TS/TSX no seu projeto — edite à vontade.
- Variantes com **`class-variance-authority` (cva)** + utilitário `cn()` (clsx + tailwind-merge).
- **Theming via CSS variables** em `globals.css`: `--background`, `--foreground`, `--primary` etc. Dark mode flipa as variáveis.
- Composição sobre **Radix primitives** — herda accessibility (focus-trap, keyboard, ARIA).
- **Forms:** `Form` + `react-hook-form` + Zod resolver (escolha canônica).
- Não tente "upgradar lib" — re-rode `shadcn add` para pegar versão nova e mesclar manualmente.

## Procedimento mínimo
1. `npx shadcn@latest init` configura `components.json`, `cn()` helper, CSS variables.
2. `npx shadcn@latest add <component>` por demanda.
3. Customizar componente diretamente no arquivo gerado; commitar.
4. Para variantes novas, estender `cva()` do próprio componente.
5. Para forms, usar `<Form>` (RHF) + `<FormField>` + Zod schema.

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
