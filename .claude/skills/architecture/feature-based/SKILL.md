---
name: feature-based
description: Use ao organizar código por feature em vez de por tipo. Keywords: feature-based, modular, bounded module.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Feature-based architecture

Organiza código por **feature/domínio** (vertical) em vez de por **tipo de arquivo** (horizontal). Carregue ao iniciar um projeto ou refatorar layout por-tipo (`controllers/`, `services/`, `models/`).

## Essência
- Backend: uma pasta por bounded context em `src/services/<context>/{domain,application,adapters,infrastructure}`. O frontend segue `fsd`; `src/features` é camada FSD, não backend.
- Co-location: arquivos que mudam juntos ficam juntos; testes colocados `foo.test.ts` ao lado do código.
- Cross-context: comunicação via API pública mínima (`services/orders/index.ts`, só named exports, sem `export *`), não import profundo. Dentro do contexto, importe o módulo direto.
- Compartilhamento sobe: código técnico usado por 2+ contextos vai para `src/services/shared/` (clients compartilhados, ex. Postgres); domínio compartilhado vira evento.
- Limite de acoplamento: contexto não importa internals de outro; apenas API pública.
- Interior do contexto: árvore de referência em `feature-based.md`; `hexagonal`, `ddd` e `clean-architecture` a detalham.

## Procedimento mínimo
1. Identificar feature: substantivo de negócio (orders, billing, auth).
2. Criar `src/services/<context>/` com `domain/`, `application/`, `adapters/` e `composition.ts` conforme necessidade.
3. Expor API pública via `index.ts` mínimo — só o que é consumido de fora.
4. Mover código técnico duplicado entre contextos para `services/shared/`.
5. ESLint com `no-restricted-imports` para impedir cross-context deep imports.

## Anti-patterns
- `src/controllers/`, `src/models/` e um `services/domain/` global paralelos → reorganizar por contexto.
- Feature gigante (`features/main/`) com tudo dentro → quebrar por subdomínio.
- Import `services/users/adapters/driven/db.ts` de outro contexto → expor via index ou publicar evento.

## Mini-exemplo
```
src/services/orders/
  domain/entities/order.ts
  application/use-cases/place-order.ts
  application/use-cases/place-order.test.ts
  adapters/driven/postgres-order-repository.ts
  composition.ts
  index.ts        // exporta só o que outros contextos consomem
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/architecture/feature-based.md`
