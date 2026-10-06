# 0057. Type scale tokens, shell and slot skeletons, and offline holds on forms

- **Status:** accepted
- **Date:** 2026-10-02
- **Scope:** `app/packages/client` (`shared/ui/styles/globals.css`, `shared/lib/cn.ts`, every file
  that used `text-[Npx]`, `shared/ui/templates/AppShellSkeleton`, `widgets/admin-nav`,
  `features/generative-ui`, `shared/ui/organisms/SchemaForm`, `features/admin-prompt-*`),
  `app/apps/web` (user area and `/admin` layouts), `app/apps/desktop` (`desktop-shell.tsx`)
- **Refines:** decision 0014 (tokens from DESIGN.md: its "typography" row), decision 0032
  (generative UI registry), decision 0056 (offline holds in `ConfirmDialog`)
- **Source:** UX review 2026-10-01, batch B14 (U-62, U-25, U-35);
  report `docs/plans/2026-10-01-ux-review/fixes-b14.md`

## Context

- About 220 class names used arbitrary font sizes (`text-[13px]`, `text-[11.5px]`,
  `text-[12.5px]` and eight rarer ones). The `.design-system/` prototypes use these sizes on
  purpose, but DESIGN.md names only Tailwind's `text-*` scale, so each size was written as a pixel
  value in many places.
- While the session was checked, the web user area and `/admin` showed a full-screen spinner, and
  the desktop gate did the same; the sidebar, topbar and page header then appeared at once. Admin
  page actions appeared only after the staff role loaded. The generative UI placeholder was 96 px
  for a chart about 320 px tall.
- `SchemaForm`, the new prompt version form and the forced activation form submitted while
  offline and failed with a network error, while `ConfirmDialog` already held its confirm.

## Decision

1. **Type scale.** `globals.css` declares seven `@theme` font sizes between and around Tailwind's
   steps. Each replaces the pixel values listed:

   | Token | Size | Replaces | Typical use |
   |---|---|---|---|
   | `text-micro` | 0.59375rem (9.5 px) | 9, 9.5 px | mono uppercase tags, xs avatar initials |
   | `text-tiny` | 0.65625rem (10.5 px) | 10, 10.5 px | counters, uppercase group headings |
   | `text-label` | 0.6875rem (11 px) | 11 px | overline labels, keyboard keys, chart ticks |
   | `text-caption` | 0.71875rem (11.5 px) | 11.5 px | ids, hints, secondary metadata |
   | `text-xs` (Tailwind) | 0.75rem (12 px) | 12 px | small status text |
   | `text-body-sm` | 0.78125rem (12.5 px) | 12.5 px | secondary body, dense lists, code |
   | `text-body` | 0.8125rem (13 px) | 13 px | dense UI body: tables, menus, panels |
   | `text-title` | 0.9375rem (15 px) | 14.5, 15 px | card and section titles |

   The new tokens set no `--text-*--line-height`. Tailwind then emits only `font-size`, exactly as
   it did for the arbitrary values (checked with the Tailwind 4.3.3 compiler), so the replace keeps
   every line height. The rounding of 9, 10 and 14.5 px to the nearest step changes those
   components by 0.5 to 1 px. The 12 px uses become `text-xs`, which also sets a 16 px line height
   on short single-line status text. `cn` registers the tokens as font sizes for tailwind-merge, so
   `text-caption` never drops a text colour. A guard test fails on any new `text-[Npx]` in the client.
   `.design-system/DESIGN.md` stays read-only (decision 0014), so this table is the record of the
   extension; decision 0014's typography row now also points here.
2. **Shell skeleton.** `AppShellSkeleton` (template) draws the `AppShellTemplate` geometry with no
   data: the sidebar column (260 px, or 60 px when collapsed) from `md` only, the 56 px topbar, the
   content gutters and a page header, with one polite `status` inside the only `main`. Web uses it
   as the Suspense fallback of the user area and `/admin`. An inner boundary reads the sidebar
   cookie before the session check, so a collapsed sidebar keeps its width (the static shell
   assumes it is expanded). Desktop uses it while the session is restored, with the stored sidebar
   state.
3. **Slot skeletons.** `AdminPageFrame` holds the actions slot with a button-sized skeleton while
   the staff role loads, and removes it only once the role lacks the permission. A generative UI
   registry entry may declare `skeletonClassName` for its lazy placeholder; the core chart
   declares `h-80`.
4. **Offline forms.** `SchemaForm`, the new prompt version form and the forced activation form
   hold their submit while offline. They show the offline notice inside the form, so the reason is
   visible in dialogs where the shell banner is covered, and they send once the connection is back.

## Consequences

- Components name a step of the scale; a new size is a new token here, not a pixel value.
- Cold loads and refreshes keep the frame in place. The web static shell can still go from
  260 px to 60 px for a user who collapsed the sidebar, because the static HTML cannot read the
  cookie.
- Admin features and the six shared admin widgets have colocated tests for success, pending,
  failure with the request reference and offline. The axe e2e matrix also covers the invite
  states, not found, an open confirmation, the second-factor enrollment, the SMS challenge, the
  support access banner and es-419.

## Alternatives considered

- **Give each new step its own line height.** This would follow the "line height per size"
  convention, but without screenshots of every screen it could move layouts. It can be added
  later, token by token.
- **Fold everything into Tailwind's `text-xs`/`text-sm`.** This drops the 11.5, 12.5 and 13 px
  rhythm the prototypes use and changes almost every screen.
- **Edit `.design-system/DESIGN.md`.** It is read-only, product-specific input (decision 0014).
