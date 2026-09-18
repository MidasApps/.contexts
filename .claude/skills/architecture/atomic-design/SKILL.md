---
name: atomic-design
description: Use ao estruturar componentes UI em átomos, moléculas, organismos, templates, pages. Keywords: atomic design, atoms, molecules.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Atomic Design

Hierarquia de componentes UI proposta por Brad Frost: **atoms → molecules → organisms → templates → pages**. Carregue ao estruturar design system ou biblioteca de componentes.

## Essência
- **Atoms:** primitivas indivisíveis (Button, Input, Label, Icon).
- **Molecules:** combinações pequenas com propósito (SearchField = Input + Button).
- **Organisms:** seções complexas autocontidas (Header, ProductCard).
- **Templates:** layout de página sem dados reais (skeleton de posições).
- **Pages:** templates com dados concretos (rota/screen).
- Dependência sobe apenas: organism usa molecules e atoms; molecule usa atoms.
- Atoms são "dumb": sem estado de negócio, recebem props.
- Atomic design ≠ FSD; foca só em UI, não em arquitetura completa.

## Procedimento mínimo
1. Identificar nível: é primitiva (atom) ou composição (molecule+)?
2. Criar `src/components/<nivel>/<Nome>/` com `<Nome>.tsx`, `<Nome>.stories.tsx`, `index.ts`.
3. Manter atoms sem dependência de estado global; aceitar props para customização.
4. Documentar variantes em Storybook por nível.
5. Subir composição para o nível imediatamente acima quando reutilizada.

## Anti-patterns
- Categorizar tudo como organism porque parece "complexo" → re-analisar granularidade.
- Atom acessando store global → dumb-up: receber por prop.
- Organism com lógica de fetch → mover fetch para page/template (data-fetching layer).

## Mini-exemplo
```
components/
  atoms/Button/Button.tsx
  molecules/SearchField/SearchField.tsx
  organisms/Header/Header.tsx
  templates/DashboardTemplate/DashboardTemplate.tsx
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/architecture/atomic-design.md`
