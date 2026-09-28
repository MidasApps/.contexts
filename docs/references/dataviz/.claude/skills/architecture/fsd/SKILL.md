---
name: fsd
description: Use ao aplicar Feature-Sliced Design para organizar camadas (app/pages/widgets/features/entities/shared). Keywords: FSD, feature-sliced, slice.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Feature-Sliced Design (FSD)

Metodologia de arquitetura de frontend que organiza código em camadas hierárquicas com dependência unidirecional. Carregue quando estruturar app novo ou refatorar layout monolítico.

## Essência
- **6 camadas (de baixo pra cima):** `shared` → `entities` → `features` → `widgets` → `pages` → `app`.
- **Dependency rule:** camada superior importa de inferior, nunca o contrário. Mesma camada não cruza.
- **Slice:** subdiretório de uma camada que representa um domínio de negócio (`entities/user`, `features/auth`).
- **Segments dentro de slice:** `ui/`, `model/` (store, types), `api/`, `lib/`, `config/`.
- **Public API por slice:** `index.ts` exporta o que é público. Fora do slice, só importa via `index`.
- `app/`: providers, router root, estilos globais. `shared/`: UI kit, utils, libs internas sem domínio.

## Procedimento mínimo
1. Identificar a camada correta para o código novo (regra: o quão alto ele compõe).
2. Criar slice se não existe: `<camada>/<slice>/` com `ui/`, `model/`, `api/`, `index.ts`.
3. Re-exportar API pública pelo `index.ts` do slice.
4. Verificar que imports respeitam dependency rule (lint `@feature-sliced/eslint-config` ajuda).
5. Mover dado/UI compartilhado entre slices da MESMA camada → promover para camada inferior (geralmente `entities` ou `shared`).

## Anti-patterns
- `features/foo` importando `features/bar` → extrair para `entities` ou compor em `widget`.
- Slice sem `index.ts` → imports profundos vazam internals.
- `shared/` com lógica de domínio → mover para `entities`.
- Pasta `components/` global → cada componente vive na camada/slice correta.

## Mini-exemplo
```
src/
  app/         providers, router
  pages/       home, settings (compõem widgets)
  widgets/     Header, Sidebar (compõem features+entities)
  features/    auth-by-email, create-order (caso de uso)
  entities/    user, order (modelo + UI básica)
  shared/      ui-kit, lib, api-client
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/architecture/fsd.md`
