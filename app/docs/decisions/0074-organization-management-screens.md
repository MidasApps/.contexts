# 0074. Screens for project lifecycle, organization deletion, grants at units and the audit log

- **Status:** accepted
- **Date:** 2026-10-05
- **Scope:** `app/packages/client` (`features/manage-project`, `features/delete-organization`,
  `features/manage-membership`, `features/invite-member`, `entities/unit` `UnitSelect`,
  `entities/audit-log`, `views/settings-audit-log`, `views/project-home`, `views/settings-general`,
  `views/settings-members`, `app-shell/navigation`), the `audit-log` settings route, `app/packages/i18n`
- **Refines:** decision 0055 (grouped settings navigation)

## Context

A review of every feature against its API found operations with an endpoint and a permission but
no screen: edit, archive and delete a project (`core.project.update`, `core.project.delete`), delete
the organization (`core.organization.delete`), give an existing member access at one more place or
revoke one grant (`POST`/`DELETE` memberships), and read the organization audit log
(`core.audit-log.read`). The role editor already listed those permissions, so a role could hold a
permission that unlocked nothing visible. Invitations could not target a unit either: the node
picker offered the organization and its projects only.

## Decision

1. **Project actions live on the project home, not in the organization settings.** "Project
   settings" (a menu in the page header) edits name and description, archives or reactivates, and
   deletes. It reads the permissions of the project's access context, so a member whose role holds
   `core.project.update` only in that project gets them too. Regional overrides of a project stay
   API-only.
2. **Deleting the organization asks for its name.** A danger card at the bottom of Settings → General,
   shown with `core.organization.delete` (owners). The button arms only when the typed name matches.
   Afterwards the organization's queries are removed, not refetched (every access is revoked), and
   the member lands on `/organizations`.
3. **Grants at units.** `UnitSelect` (unit entity) lists one project's unit tree with "Whole project"
   first; the invitation dialog and the new "Give access" dialog show it below the project picker.
   `NodeSelect` shows a unit node's project. API keys and device activations keep project-level
   pickers for now.
4. **Per-grant revoke only when a member has more than one grant.** With a single grant, revoking it
   equals removing the member, which "Remove" already does with the API keys warning.
5. **Audit log is a settings section** (`/o/:organizationId/settings/audit-log`, group
   `organization` after units), read only, newest first, filtered by action through the URL
   (`?action=`). Action and target labels are catalog messages; an unknown target type shows its raw
   kind. Member names show only with `core.member.read`.

## Alternatives rejected

- **A "Projects" settings section with a table of projects.** The organization home already lists
  them; a second list would duplicate it and could not use project-level permissions.
- **A plain confirm for deleting the organization.** It removes every member's access at once; a
  typed name is the usual guard against a slip.
- **Units in `NodeSelect` itself.** It would load every project's unit tree to fill one list.

## Consequences

- The settings navigation has eighteen sections; the e2e permission check covers the new one.
- A new audited action needs a label in the three catalogs (`settings.auditLog.actions`); the audit
  log view test fails otherwise.
