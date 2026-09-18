---
paths: ["**/*.tsx","**/*.jsx","app/**/*"]
---
# Accessibility — ativa em UI

UI atende WCAG 2.2 AA: HTML semântico, navegação por teclado, contraste, foco visível, ARIA quando semântico não basta. Acessibilidade é requisito, não polish.

## Princípios
- Semantic-first: `<button>`, `<a>`, `<nav>`, `<main>`, `<h1-h6>`, `<label>`. ARIA é fallback, não primeira opção.
- Toda interação navegável por teclado (Tab/Shift+Tab/Enter/Space/Esc/setas). Foco sempre visível (`:focus-visible`).
- Contraste mínimo 4.5:1 texto normal, 3:1 large text e UI components (WCAG 2.2 AA).
- Imagens informativas têm `alt`; decorativas têm `alt=""`. SVG semântico com `<title>`.
- Forms: `<label for>` ou `aria-label`. Erro associado via `aria-describedby` + `aria-invalid`.
- Componentes complexos (combobox, dialog, tabs) seguem ARIA Authoring Practices (ou usam Radix/headless-ui).
- Movimento e animação respeitam `prefers-reduced-motion`.
- `lang` no `<html>`. Texto em outra língua tem `lang` no elemento.
- Não usar cor como única indicação (erro vermelho + ícone + texto).

## Checklist (aplicar a todo turn)
- [ ] Elemento clicável é `<button>` ou `<a>`, não `<div onClick>`.
- [ ] Foco visível mantido (sem `outline: none` sem substituto).
- [ ] `<img>` tem `alt`; ícone-only button tem `aria-label`.
- [ ] Form tem `<label>` associado a cada input.
- [ ] Diálogo modal usa `role="dialog"` + focus-trap + esc-to-close.
- [ ] Contraste verificado com ferramenta (axe, Lighthouse).

## Anti-patterns
- `<div onClick={...}>Click me</div>` → `<button onClick={...}>Click me</button>`.
- Cor cinza claro em fundo branco (contraste 2:1) → escurecer.
- `placeholder` como único label → adicionar `<label>`.
- Modal sem focus-trap → tab escapa para fundo.

## Mini-exemplo
```tsx
<button
  type="button"
  aria-label="Close dialog"
  onClick={onClose}
  className="focus-visible:ring-2 focus-visible:ring-blue-500"
>
  <XIcon aria-hidden="true" />
</button>
```

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/rules/accessibility.md`
