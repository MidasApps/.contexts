# 0042. `/admin` console UI: charts, money, URL state and paging

- **Status:** accepted
- **Date:** 2026-10-01
- **Scope:** `app/packages/client/src/{views,widgets,features,entities}/admin-*`, `app/packages/client/src/shared/{lib/router,lib/format,ui/molecules/Chart}`, `app/apps/web/src/client/section-pages.tsx` (local decision; the framework is unchanged)
- **Records:** SP5 plan Tasks 12–13 (UI choices the spec left open)
- **Relates to:** decisions 0011 (client data), 0012 (router port), 0013 (money, time zone), 0014 (UI kit), 0039 (budgets), 0040 (traces, evals), 0041 (admin composition)

## Context

The staff console needs charts, shows model costs that the APIs return in micro-USD, keeps list
filters shareable, and reads lists that page in two different ways (cursor and page number). SP2's
route map had no query string for `/admin`, and the UI kit had no chart.

## Decision

1. **Charts: `recharts` 3.10.1** (latest stable, measured 2026-10-01; `react-is` 19.3.0 is its
   peer), the library behind shadcn charts.
   - The kit gets one molecule, `shared/ui/molecules/Chart/BarChartFigure`, written by hand in the
     shadcn chart pattern instead of copying the CLI's `chart.tsx`: the console needs grouped bars
     only, and the CLI component sets its colors through an inline `<style>` element, which a
     nonce-based CSP (decision 0016 keeps that mode ready) would have to allow.
   - Colors are the theme tokens `--chart-1…5` (the status accents, light and dark). Numbers are
     mono tabular. There is no decorative grid beyond hairlines (`dataviz.html`).
   - The drawing is `aria-hidden`. The same numbers follow in a visually hidden table with a
     caption, so assistive technology, the tests and "no color only" read the data itself. Every
     series is named in a text legend.
2. **Money.** Costs and caps arrive as integer micro-USD.
   - Budgets, caps and totals convert to `{ amountMinor, currency: "USD" }` rounded to the cent
     (`round(microUsd / 10 000)`) and go through `formatMoney` (`Intl.NumberFormat`).
   - One trace or span usually costs less than a cent. Those use `Intl.NumberFormat` currency with
     up to six fraction digits (`useFormatMicroUsd(value, "exact")`), so a real cost never reads
     as zero.
   - Forms take dollars through `MoneyInput` and send micro-USD (`cents × 10 000`).
3. **URL state.** The `admin` route gains an optional `search` record, and the router port gains
   `useSearch()` (web, desktop and memory adapters).
   - `useAdminSearch(keys)` reads and writes filters and the page with `replace`, keeps other
     parameters, and returns to page 1 when a filter changes.
4. **Paging.**
   - Console lists over Mastra storage (traces, experiments) page by number
     (`page`/`perPage`, `meta.hasMore`, decision 0040). `numberedPagination` feeds the same
     previous/next control as cursor lists; the page is `?page=` (1-based in the URL).
   - `GET /v1/admin/organizations` pages by cursor and has no search. The console reads its cursor
     pages in order (at most 20 pages of 100) and filters and pages on the client, so search by
     name and id works. Beyond 2 000 organizations the endpoint needs a search parameter.
5. **Routing.** `apps/web` keeps the single catch-all `admin/[[...section]]` route of SP2. A map
   in `section-pages.tsx` picks the shared view from the path's first segment; views read ids from
   the rest of the path. No logic lives in the route files (decision 0041).
6. **Access states.**
   - `AdminPageFrame` hides a page whose platform permission the staff role lacks (no-access state,
     no API call). It is a convenience: the layout and every `/v1/admin` handler still decide.
   - `AdminQuerySection` turns 403 `MFA_REQUIRED` into a second-factor notice, any other 403 into
     no-access, and anything else into an error with the request reference and a retry.
7. **Dates.** `/admin` has no tenant node, so there is no `displayTimeZone` from an access context.
   Instants are shown in the browser's time zone through `useFormatDateTime`, which already falls
   back to it.

## Consequences

- `recharts` brings Redux Toolkit and D3 modules into the client bundle of the pages that draw
  charts. The views are loaded per route, so the user area does not pay for them.
- Sub-cent costs and cent-rounded totals can differ by rounding when summed by hand; the API totals
  are shown as given.
- Client-side search of organizations stops scaling at 2 000 organizations.

## Alternatives rejected

- **The shadcn CLI `chart` component.** It relies on an inline `<style>` element and carries
  tooltip and legend variants the console does not use.
- **Hand-drawn SVG bars.** Axes, scales and tooltips would be re-implemented.
- **Cents everywhere.** A trace that cost 900 micro-USD would read `$0.00`.
- **Filters in component state.** A filtered list could not be shared or restored on reload.
