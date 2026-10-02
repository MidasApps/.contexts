# 0055. Grouped settings and admin navigation

- **Status:** accepted
- **Date:** 2026-10-02
- **Scope:** `app/packages/client` (`shared/lib/shell` navigation types, `app-shell/navigation`,
  `shared/ui/molecules/SectionNav`, `widgets/settings-nav`, `widgets/admin-sidebar`),
  `app/packages/i18n` (`shell.nav.groups`)
- **Refines:** decision 0015 (shell registries and module navigation)
- **Source:** UX review 2026-10-01, finding U-30 (S-m12, ADM-33)

## Context

The organization settings had 17 sections and the staff console 11 areas, each one flat list in
registry order. On a phone the settings sections became one horizontal row of pills, with the current
one often offscreen. The console order mixed customers, AI and operations areas.

## Decision

1. **A navigation item may name a group.** `ShellNavItem.group` is optional and takes one of
   `NAV_GROUPS` (`organization`, `access`, `customers`, `ai`, `operations`, `other`); the heading is
   the message `shell.nav.groups.<group>`. Items without a group (module contributions, which do not
   declare one) sit under `other`, after the grouped ones. `groupNavItems` orders groups by
   `NAV_GROUPS` and keeps the registry order inside each group.
2. **Settings groups:** organization (general, members, invitations, roles, units), access (API keys,
   devices), AI (agents, skills, knowledge, connectors), operations (workflows, approvals, usage,
   traces, evals, flags). **Admin groups:** customers (organizations, plans, users), AI (agents,
   evals, traces, logs, costs), operations (workflows, flags, connectors); the admin list is
   reordered to match.
3. **Rendering.** From `lg` (the side column of `SettingsTemplate`, decision 0053), `SectionNav` shows a labelled list per group (`ul` named by its
   heading). Below `lg`, grouped sections are a section picker (a `Select` with the same groups)
   that navigates on choice, instead of a row of pills. Ungrouped navigation (the profile, five
   sections) keeps the pill row and scrolls the current pill into view. The admin sidebar renders one
   `SidebarGroup` per group; while the staff role loads or fails it keeps the single "Platform" group
   with its skeleton or retry.

## Consequences

- A module can not yet place its settings or admin item in a core group; it shows under "Other".
  Adding `group` to the module manifest's navigation entries is additive when a module needs it.
- E2E checks of the settings nav on phones go through the picker, not the links.
- The admin overview's area list follows the new order.

## Alternatives considered

- **Collapsible groups.** Rejected: one more click for 17 short labels, and the current section can
  hide inside a closed group.
- **A "Sections" sheet on phones.** Rejected for now: the native-like picker is one control, keeps
  focus handling in Radix and needs no new component.
