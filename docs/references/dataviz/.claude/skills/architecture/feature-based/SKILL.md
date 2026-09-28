---
name: feature-based
description: Use ao organizar código por feature em vez de por tipo. Keywords: feature-based, modular, bounded module.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Feature-based architecture

Organiza código por **feature/domínio** (vertical) em vez de por **tipo de arquivo** (horizontal). Carregue ao iniciar um projeto ou refatorar layout por-tipo (`controllers/`, `services/`, `models/`).

## Essência
- Pasta por feature: tudo que pertence a "orders" vive em `src/features/orders/` (UI, lógica, tipos, testes, schemas).
- Co-location: arquivos que mudam juntos ficam juntos.
- Cross-feature: comunicação via interface pública (`features/orders/index.ts`), não import profundo.
- Compartilhamento sobe: código usado por 2+ features vai para `shared/` ou camada de domínio comum.
- Limite de acoplamento: feature não importa internals de outra; apenas API pública.
- Variantes: pode coexistir com camadas (`features/orders/ui/`, `features/orders/server/`).

## Procedimento mínimo
1. Identificar feature: substantivo de negócio (orders, billing, auth).
2. Criar `src/features/<name>/` com subpastas conforme necessidade (`ui/`, `server/`, `schemas/`, `__tests__/`).
3. Expor API pública via `index.ts` — só componentes/hooks/funções consumidos de fora.
4. Mover código duplicado entre features para `shared/` (utilitário) ou `entities/` (domínio).
5. ESLint com `no-restricted-imports` para impedir cross-feature deep imports.

## Anti-patterns
- `src/controllers/`, `src/services/`, `src/models/` paralelos → reorganizar por feature.
- Feature gigante (`features/main/`) com tudo dentro → quebrar por subdomínio.
- Import `features/users/server/db.ts` de outra feature → expor via index ou subir.

## Mini-exemplo
```
src/features/orders/
  ui/OrderList.tsx
  server/createOrder.ts
  schemas/order.ts
  __tests__/createOrder.test.ts
  index.ts        // exporta OrderList, createOrder, OrderSchema
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/architecture/feature-based.md`
