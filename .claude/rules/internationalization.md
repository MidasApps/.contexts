---
paths: ["**/messages/**","**/i18n/**","**/*.intl.ts","**/*.tsx"]
---
# Internationalization — ativa em i18n e UI

Todo texto visível ao usuário é uma key i18n. Pluralização, gênero, datas, números usam ICU. Fallback chain configurada. Nada de strings hard-coded.

## Princípios
- Keys hierárquicas e estáveis: `orders.list.empty.title`, não `text123`.
- Um locale source explícito; os demais são traduções. Locale na URL por subpath (`/pt-BR/...`), resolvido no `proxy.ts` (Next 16).
- ICU MessageFormat para plural/select/gender: `"{count, plural, one {# item} other {# items}}"`.
- Datas/números/moeda via `Intl.*` com locale passado explicitamente — nunca format manual nem locale default do runtime. Dinheiro chega como `amountMinor` + `currency`; converter pela casa decimal da moeda só na formatação.
- Fallback chain: locale específica (`pt-BR`) → genérica (`pt`) → default (`en`). Key faltando → log + fallback.
- Sem concatenação de strings traduzidas — frase inteira como uma key com placeholders.
- Pluralização nunca por `if (count === 1)` no código — sempre ICU.
- `<html lang>` e `dir` definidos pelo locale ativo. E-mail/push no locale persistido do destinatário. Prompt de LLM declara o locale alvo.

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
t("cart.summary", { count, total: formatMoney({ amountMinor, currency }, locale) }); // Intl.NumberFormat(locale, { style: "currency", currency })
```

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/rules/internationalization.md`
