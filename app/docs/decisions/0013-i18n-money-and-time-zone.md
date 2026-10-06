# 0013. i18n catalogs, locale negotiation, money and time-zone formatting

- **Status:** accepted
- **Date:** 2026-09-29
- **Scope:** `app/packages/i18n` (`@core/i18n`), `app/packages/client`, `app/apps/web`, `app/apps/desktop`, module message catalogs (local decision; the framework is unchanged)
- **Refines:** SP2 spec §5; umbrella spec §6; `.contexts/engineering/rules/internationalization.md`; `.contexts/engineering/contracts/api.md` §8.1–§8.2

## Context

`rules/internationalization.md` requires translated keys (never literal copy), ICU MessageFormat, `Intl` for every format, UTC storage, locale in the URL by subpath, an explicit fallback chain and a CI gate against missing keys. The core ships three locales and two hosts: web (`next-intl`) and desktop (`use-intl`, the same runtime `next-intl` wraps). Money travels as `{ amountMinor, currency }` and dates as UTC ISO 8601 (`contracts/api.md` §8).

## Decision

1. **Locales:** `SUPPORTED_LOCALES = ["pt-BR", "en-US", "es-419"]`; `SOURCE_LOCALE = "pt-BR"`. Fallback chain: `en-US → pt-BR`, `es-419 → pt-BR` (the source is the only complete catalog by construction). A missing key never shows the raw key; it falls back and logs a structured warning.
2. **Catalogs:** JSON per locale and namespace in `@core/i18n` (`common`, `auth`, `shell`, `profile`, `settings`, `admin`, `errors` keyed by API error `code`, `core` for contract `labelKey`s). Modules bring one namespace named after the module id. `loadMessages(locale, extraNamespaces)` deep-merges the fallback chain. Message types come from the `pt-BR` catalog (`AppConfig` augmentation).
3. **Negotiation.** Web, authenticated pages included, keeps the locale in the URL segment (`localePrefix: "always"`, `app/[locale]/…`): this is the rule's default URL strategy and lets pages stay static per locale under Cache Components. Order: URL segment → `NEXT_LOCALE` cookie (mirrors the profile preference; written on sign-in and on language change) → `Accept-Language` → `pt-BR`. `/v1` is excluded from the locale middleware. Desktop: profile preference → `navigator.languages` → `pt-BR`. Changing language = `PATCH /v1/me`, cookie update, navigation to the same path in the new locale.
4. **Money:** `formatMoney({ amountMinor, currency }, locale)` with `Intl.NumberFormat(locale, { style: "currency", currency })`; minor digits come from `resolvedOptions().maximumFractionDigits` (JPY 0, KWD 3), never a hand table. `parseMoneyInput(text, locale, currency)` accepts the locale's group and decimal separators (taken from `formatToParts`) and returns integer `amountMinor`, rejecting ambiguous input (two decimal separators, too many fraction digits). Default currency for new amounts = `AccessContext.regional.currency` (unit → project → organization, SP1).
5. **Time zone:** values travel in UTC ISO. Display uses `regional.displayTimeZone` (user → node → project → organization); the browser zone only without tenant context. The intl provider receives `timeZone`. Date inputs convert local wall time in that zone to UTC (`zonedWallTimeToUtc`, DST-aware) before sending. Calendar rules use `nodeTimeZone` (SP5).
6. **Gate:** `pnpm i18n:check` (package script + root turbo task, uncached, CI step): every locale has every `pt-BR` key, placeholders match, every message parses as ICU, no empty strings; module catalogs included.
7. **Direction:** all three locales are LTR; the root layout still sets `dir` from the locale and components use logical properties, so an RTL locale needs no refactor.

## Consequences

- `@core/i18n` depends on no internal package (lint boundary); `@core/contracts` cannot import it, so module manifests accept any canonical BCP 47 locale and `i18n:check` enforces the supported set.
- Translators edit JSON; the source catalog is written by developers alongside the code (extraction tooling is out of scope for v1).
- `es-419` and `en-US` ship complete at every commit because the gate requires key parity; fallback is a safety net, not a workflow.
- **Amended 2026-09-29 (SP2 Task 1–3 review):** the runtime fallback of `loadMessages` is silent by design — it does not report which keys fell back. `pnpm i18n:check` (CI) is the only place that reports missing keys; a runtime warning would repeat that check on every render. `negotiateLocale` canonicalizes the saved choice (`pt-br` → `pt-BR`), and `parseMoneyInput` reads group/decimal separators from the locale's plain number format, never from the currency format (zero-digit currencies such as JPY have no decimal part there).

## Alternatives rejected

- **Locale from cookie only on authenticated pages (no URL segment).** Request-time locale makes every page dynamic under Cache Components and contradicts the rule's URL strategy.
- **A formatting library (dinero.js, date-fns-tz).** `Intl` covers money, dates, lists and relative time; the rule forbids parallel libraries.
- **`i18next` on both hosts.** `next-intl`/`use-intl` share one runtime and are the framework's documented choice for Next.
