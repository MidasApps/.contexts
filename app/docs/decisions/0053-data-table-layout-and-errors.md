# 0053. Data table layout and errors

- **Status:** accepted
- **Date:** 2026-10-02
- **Scope:** `app/packages/client` (`shared/ui/organisms/DataTable`, `shared/lib/media`,
  `shared/ui/templates/SettingsTemplate`, `shared/ui/molecules/SectionNav`, `widgets/settings-nav`,
  `widgets/profile-nav`, `widgets/schedule-table`, the settings and profile list views,
  `views/admin-costs`)
- **Source:** UX review 2026-10-01, findings U-16 (S-M3, ADM-13), U-19 (SH-11, S-m1), U-56 (S-m2)

## Context

`DataTable` became a card list only below the `md` viewport (768 px). Settings put a 220 px section
column beside the content from `md` and capped the content at 720 px, so from 768 px a six- to
nine-column table had about 200 px (768 px) to 680 px (1280 px): it scrolled sideways and its row
actions sat off screen. The same table in the staff console (no section column) or beside the chat
panel (360 px) needs a different answer at the same viewport width, so a viewport breakpoint cannot
decide it.

Table errors carried only the `requestId`: a 403, a rate limit and a lost connection all showed the
generic error, unlike `QuerySection`, and the retry never showed pending. Seven views had their own
copy of the status mapping.

## Decision

1. **Cards by container width.** With `renderCard`, `DataTable` measures its own container
   (`useElementWidth`, a `ResizeObserver`) and renders cards when it is narrower than
   `minTableWidth`, by default 88 px per column and at least 480 px. Until it is measured (server
   render, jsdom) the old rule applies: cards below `md`. 88 px keeps every current settings table
   of up to seven columns a table in the 680 px settings column of a 1280 px screen, and every staff
   table of up to nine columns; the nine-column settings experiments list becomes cards there.
2. **Settings layout.** The section column sits beside the content only from `lg` (the pill row of
   `SectionNav` is used below it). Sections whose main content is a table pass `width="wide"` to
   `SettingsPageFrame` / `ProfilePageFrame`, which lifts the 720 px reading cap (kept for forms and
   for the no-access state). The template's `<section>` spaces its blocks (`flex-col gap-6`), so a
   view never stacks blocks touching.
3. **Row actions.** `ScheduleTable` keeps pause/resume (it shows pending) and run-now on the row;
   the caller's further actions (`rowMenuItems`: edit, delete) go in a "more actions" menu whose
   items keep the named accessible labels.
4. **Errors.** `DataTableStatus.error` carries the failure (`error: unknown`) and `retrying`.
   `DataTable` renders `NoAccessState` for a 403 and `ApiErrorState` otherwise (copy of the code,
   reference, sign-in-again for a lost session, pending retry). `dataTableStatusOf(query)` is the one
   mapping from a list query.

## Consequences

- A table's form depends on where it is placed, not only on the device; tests that need the table
  form in jsdom get it (no measurement), and a test can force a width by replacing
  `ResizeObserver` locally.
- e2e at 1280 px: the settings experiments list may be a list of cards
  (`settings-observability.spec.ts` accepts both); schedule edit/delete open the row menu first.
- Tables without `renderCard` keep the horizontal scroll; new list views should give a card.

## Alternatives

- **A larger viewport breakpoint for wide tables (`cardsBelow="xl"`).** Rejected: it would turn
  staff tables into cards at 1024–1279 px although they fit, and still miss the open chat panel.
- **Detecting overflow (`scrollWidth > clientWidth`).** Rejected: once the cards render there is no
  table to measure, so the layout cannot switch back reliably.
- **Only lifting the 720 px cap.** Rejected as the whole fix: the section column, not the cap, takes
  the width below about 1440 px.
