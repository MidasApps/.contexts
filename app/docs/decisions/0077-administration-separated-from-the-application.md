# 0077. The administration is separated from the application

- **Status:** accepted
- **Date:** 2026-10-14
- **Scope:** `app/packages/client/src/{shared/lib/router,shared/lib/shell,app-shell,widgets,views}`,
  `app/apps/web/src/app/[locale]/{(app),admin}`, `app/apps/desktop/src/{routes,app}`, the message catalogs,
  the e2e specs and the user guide; the framework in `.contexts/` is unchanged
- **Relates to:** decisions 0012 (router port), 0015 (shell registries), 0042 (admin console UI), 0055
  (grouped navigation), 0073 (user guide)

## Context

The signed-in UI mixed two jobs in one shell. Configuring the organization (eighteen settings sections),
the profile, and using the product (projects, the chat, module pages) all lived in the same sidebar.
The chat panel was even available on settings pages. `/admin` existed, but only as the platform staff's
console.

Products are built on top of the core as modules (decision 0015). They need a clean place where the
product is used, and the configuration should not compete with it. The application starts as web only,
as the base for development. The desktop keeps working, but nothing new is built for it.

## Decision

1. **Two surfaces.**
   - **The application (root): using the product.** It holds:
     - the organizations list;
     - the organization and project homes;
     - the chat;
     - module pages;
     - the approvals inbox.

     Deciding an agent's pending action is using the app, not configuring it. So approvals moved from
     `/o/:org/settings/approvals` to `/o/:org/approvals[/:id]`, with an item in the organization group
     of the app sidebar. The user menu still shows the waiting count.
   - **The administration (`/admin`): configuring it.** It holds:
     - the organization settings: `/admin/o/:org[/:section]`;
     - module settings: `/admin/o/:org/m/:module`;
     - the profile: `/admin/profile/:section`;
     - on web, the platform console: `/admin/platform/*`, formerly `/admin/*`.

   The app sidebar's last organization item is **Administração**. It leads to the first section the
   viewer can read.
2. **Who enters.**
   - Any signed-in user enters `/admin`: its layout uses the web-session guard.
   - Each section authorizes on its own, as before. The sidebar lists only what `can()` allows. The APIs
     are unchanged.
   - `/admin/platform` adds the staff-and-MFA guard in its own layout. Non-staff still get 404 there.
   - In support mode, only the console is replaced by the support notice. The organization's settings and
     the profile open read-only, as they did in the user area.
3. **One shell per surface.**
   - **`AdminLayout`:**
     - Organization switcher (picking an organization opens its settings).
     - Sidebar with the sections of the current part, grouped as in decision 0055:
       - the organization's sections;
       - "Minha conta" on profile pages;
       - the console's areas.
     - "Ir para" shortcuts:
       - to the organization's settings;
       - to the console, for staff on web;
       - "Abrir a aplicação".
     - Topbar naming the surface, the part and the page, with an "Abrir a aplicação" button.
     - Offline and support-mode banners.
     - No chat panel and no command palette.
   - Settings and profile pages lost their in-page section menu (`SectionNav`, and the
     `settings-nav`/`profile-nav` widgets, which are now `settings-frame`/`profile-frame`): the sidebar
     lists the sections.
   - The desktop root picks `AdminLayout` for the administration's routes. Its route files moved under
     `routes/admin/`, and it has no console.
4. **Entry and exit.**
   - Signing in from `/admin` comes back there: the existing `?next=` does this. The sign-in heading says
     "Entrar na administração".
   - Signing in at the root goes to the application.
   - `/admin` opens the console for staff on web. Everyone else lands on the last organization's settings,
     or on an empty state that offers the organizations page.
   - Signing out from the administration lands on a sign-in that returns to it.
5. **Route map.**
   - `Route` gains `approvals` and `admin-home`.
   - `ADMIN_SURFACE_ROUTE_IDS` names the administration's routes. The desktop shell and sign-out read it.
   - `WEB_ONLY_ROUTE_IDS` stays `admin` (the console) and `docs`.
   - `NavTarget` gains `approvals` and `administration`.

## Alternatives rejected

- **A separate Next.js app for the administration.** It would mean two deployments, two session
  bridges and duplicated providers for one codebase. A route segment with its own layout gives the same
  separation.
- **Keeping the settings sections in the page with a slim admin sidebar.** That leaves two menus for
  one job. A sidebar listing the sections matches the console's, which already worked this way.
- **Keeping approvals in the administration.** Approving is part of the work the agent does with the
  user, and the chat links to it. Hiding it behind configuration slows down the person who decides.
- **Redirects from the old paths.** There are no deployed users and no external links yet. The old
  paths now answer not-found.

## Consequences

- Product modules contribute pages to the application and settings to the administration. Neither
  surface needs to know about the other beyond the two shortcuts.
- The approvals messages keep their `settings.approvals` keys to avoid churn in the catalogs. The keys
  are not user-visible.
- The guide's screenshots predate the new shell. They are refreshed with the next screenshot pass.
- Bookmarks to `/o/:org/settings/*`, `/profile/*` and `/admin/<area>` break. This is acceptable before
  the first release.
