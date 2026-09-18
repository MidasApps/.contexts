---
paths: ["**/messages/**","**/i18n/**","**/*.intl.ts"]
---
# Internationalization — ativa em arquivos de i18n

Todo texto visível ao usuário é uma key i18n. Pluralização, gênero, datas, números usam ICU. Fallback chain configurada. Nada de strings hard-coded.

## Princípios
- Keys hierárquicas e estáveis: `orders.list.empty.title`, não `text123`.
- Conteúdo na key default-locale (en/pt-BR); outras locales são traduções.
- ICU MessageFormat para plural/select/gender: `"{count, plural, one {# item} other {# items}}"`.
- Datas/números via `Intl.DateTimeFormat`/`Intl.NumberFormat` com locale ativa — nunca format manual.
- Fallback chain: locale específica (`pt-BR`) → genérica (`pt`) → default (`en`). Key faltando → log + fallback.
- Sem concatenação de strings traduzidas — frase inteira como uma key com placeholders.
- Pluralização nunca por `if (count === 1)` no código — sempre ICU.
- Direção: respeitar `dir="rtl"` quando locale é RTL (ar, he).

## Checklist (aplicar a todo turn)
- [ ] String visível ao usuário está em arquivo de messages, não inline.
- [ ] Key é descritiva e hierárquica.
- [ ] Plural usa `{count, plural, ...}`, não branching em JS.
- [ ] Data/moeda formatada com `Intl.*`.
- [ ] Faltando tradução em locale secundária → log/CI warning, não crash.
- [ ] Sem string concatenada (`"Hello " + name`); usar template ICU `"Hello {name}"`.

## Anti-patterns
- `<h1>Welcome</h1>` em código → `<h1>{t("home.welcome")}</h1>`.
- `count === 1 ? "1 item" : count + " items"` → ICU plural.
- `new Date().toLocaleString()` sem locale → passar locale.
- Concatenar partes traduzidas → frase inteira por key.

## Mini-exemplo
```json
// messages/en.json
{ "cart.summary": "{count, plural, one {# item totaling {total}} other {# items totaling {total}}}" }
```
```ts
t("cart.summary", { count, total: format.currency(amount) });
```

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/rules/internationalization.md`
