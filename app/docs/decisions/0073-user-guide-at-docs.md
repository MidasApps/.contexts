# 0073. The user guide lives in the web app at `/docs`, as Markdown in Portuguese

- **Status:** accepted
- **Date:** 2026-10-05
- **Scope:** `app/apps/web/content/docs/`, `app/apps/web/src/server/docs/`, `app/apps/web/src/app/[locale]/docs/`, `app/packages/client/src/views/docs/`, the `docs` route of the shared router; the framework is unchanged
- **Relates to:** decision 0012 (the shared route map), decision 0013 (locales), decision 0035 (Markdown of model answers)

## Context

The app has no guide for its users. Each module explains itself only through the labels on its screens. The team asked for a `/docs` route that explains every module and feature, with sample data and scenarios a user can follow.

`app/docs/` already holds the engineering documents (decisions, contract catalog, OpenAPI). Those are written for developers and are not served by the app.

## Decision

1. **A route of the web app.**
   - `/{locale}/docs` is the index and `/{locale}/docs/{slug}` is one page.
   - It sits outside the signed-in shell, so a person reads it before signing in or without access to an organization.
   - It stays `noindex`, like the rest of the app.
   - `docs` is a route of the shared map with `page` (the slug), so screens link to it with `RouteLink`. The user menu has a "Documentação" entry.
   - It is web only: the desktop has no `/docs` route, like `/admin`.
2. **Markdown files, one per page.**
   - The pages live in `apps/web/content/docs/<locale>/<slug>.md` (`index.md` for the index).
   - `src/server/docs/docs-pages.ts` lists the pages in reading order, grouped for the sidebar.
   - The page reads its file with `node:fs` from the web app's folder, at request time inside `<Suspense>`, so an edited file shows at once. Only a slug from that list reaches the file system.
   - No MDX and no build step: a page is plain Markdown that any team member can edit.
   - Screenshots of the real screens, taken from the local stack with the demo seed, live in `apps/web/public/guide/` (JPEG, 1280×800). Pages show them as `![texto](/guide/<nome>.jpg)` with a caption. The proxy leaves `/guide/` alone, so they load without a locale. Screens that only show with data (an invitation, an approval request, a workflow run, a trace, the chat panel) are drawn as SVG mockups in the app's look, with the catalog labels and example data, and their captions say they are illustrations.
3. **Portuguese only, with a notice elsewhere.**
   - The guide is written in pt-BR, the source locale.
   - In `en-US` and `es-419` the same page opens with a translated notice, and the article carries `lang="pt-BR"`.
   - Only the frame of the page (sidebar label, notice, previous/next, menu entry) goes into the message catalogs.
4. **Rendered with Streamdown, like chat answers, with a link policy for our own text.**
   - Links to `/docs/...` stay in the app (the router adds the locale).
   - Absolute http(s) links open in a new tab.
   - Images load only from `/guide/`.
   - Every other URL is dropped and raw HTML is skipped. Fenced code uses the kit's `CodeBlock`.
5. **Grounded content.**
   - Each page names the screens, buttons and messages as the pt-BR catalogs write them, and the permissions as `core-permissions.ts` defines them.
   - Its examples follow the contracts' examples.
   - The business and product context of the project is not defined yet, so every scenario is introduced as an example with a generic business and invented data.
6. **Guarded by a test.** `docs-pages.test.ts` checks four things:
   - every listed page has a file that starts with a title;
   - no file is left out of the list;
   - slugs are unique;
   - every `/docs/...` link points at a listed page;
   - every screenshot shown exists, and no screenshot is left unused.

## Alternatives rejected

- **Serve `app/docs/` (decisions, catalog).** It is written for developers, in English, and changes with the code rather than with what users see.
- **Only drawn mockups.** A screenshot shows exactly what the user sees, so screens the demo seed fills are screenshots; mockups are kept for screens that need data the seed does not have.
- **MDX pages.** They would add a compiler and allow components in content. Plain Markdown covers tables, examples and code, and keeps the content editable by non-developers.
- **A separate documentation site.** It means another deploy and another domain, and it cannot link into the app's own routes with the user's locale.
- **Translate the guide into the three locales now.** That would triple the work and the drift on every change. A translated page can be added later as `content/docs/<locale>/<slug>.md` once the loader picks the UI locale first.
- **Behind sign-in.** The guide covers how to sign in, accept an invitation and reset a password, so it must be readable signed out. Nothing in it is private.

## Consequences

- A screen change that renames a button or a menu needs the guide updated in the same change. The link test catches broken links between pages, but not stale labels.
- A screen change also makes its screenshot stale. Screenshots are taken again from the local stack (demo seed) by hand; nothing compares them with the screens.
- If the web app is ever built as `output: "standalone"`, `content/docs` must be added to `outputFileTracingIncludes`; `next start` today runs from the app's folder.
