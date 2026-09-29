---
name: fsd
description: "Use ao aplicar Feature-Sliced Design para organizar camadas (app/views/widgets/features/entities/shared). Keywords: FSD, feature-sliced, slice."
---
# Feature-Sliced Design (FSD)

Metodologia de arquitetura de frontend que organiza código em camadas hierárquicas com dependência unidirecional. Carregue quando estruturar app novo ou refatorar layout monolítico.

## Essência
- **6 camadas (de baixo pra cima):** `shared` → `entities` → `features` → `widgets` → `views` → `app`. `views` é a camada `pages` do FSD renomeada: `src/pages/` é lido pelo Next como Pages Router.
- **Dependency rule:** camada superior importa de inferior, nunca o contrário. Mesma camada não cruza.
- **Slice:** subdiretório de uma camada que representa um domínio de negócio (`entities/user`, `features/auth`).
- **Segments dentro de slice:** `ui/`, `model/` (store, types), `api/`, `lib/`, `config/`.
- **Public API por slice:** `index.ts` mínimo (só named exports, sem `export *`) exporta o que é público. Fora do slice, só importa via `index`; dentro do slice importe o módulo direto.
- `src/app-providers/` (camada `app` do FSD; `src/app/` é o roteamento do Next): providers, instanciação de stores, estilos globais. `shared/`: UI kit, utils, libs internas sem domínio.
- Schemas: `model/<name>.schema.ts` no slice ou em `entities`. `src/contracts/<context>/` fica fora das camadas (só contratos cliente/servidor). Backend não mora aqui: ver `feature-based`.

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
  views/       home, settings (FSD pages; compõem widgets)
  widgets/     Header, Sidebar (compõem features+entities)
  features/    auth-by-email, create-order (caso de uso)
  entities/    user, order (modelo + UI básica)
  shared/      ui-kit, lib, api-client
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/architecture/fsd.md`
