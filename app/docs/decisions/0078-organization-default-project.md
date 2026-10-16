# 0078. Default project: an organization may be created with its one project

- **Status:** accepted
- **Date:** 2026-10-07
- **Scope:** `packages/services` tenancy (`create-organization.ts`) and identity (`Me`), `packages/contracts` (`identity.Me`), `packages/client` (`features/default-project`, the organization home, the project switcher, the command palette), `scripts/src/e2e/e2e-env.ts` (local decision; the framework is unchanged)
- **Refines:** decisions 0006 (tenancy model), 0012 (routing), 0050 (what `GET /v1/me` tells the shell)

## Context

Every organization holds projects, and the shell makes the user create and choose one before a
module page can be reached (`/o/:org/p/:project/m/:moduleId`, decision 0012). An application whose
users never work with more than one project per organization could not skip that step: a new
organization was empty, and `/o/:org` always showed the project list. A module cannot react to the
creation of an organization, so it cannot create the project itself.

## Decision

1. **A server option, off by default.** `ORGANIZATION_DEFAULT_PROJECT=true` (services env) turns it
   on. Off, nothing changes.
2. **On: the organization is created with its one project, in the same transaction.**
   `createOrganization` writes the project and its `PROJECT_CREATED` audit entry next to the
   organization, the owner grant and their entries. The project takes the organization's name. Its
   id is generated before the transaction function, so a retried attempt writes the same project.
3. **The client learns it from `GET /v1/me`.** `Me.organizationDefaultProject` is the option's
   value. It is a setting of the deployment, not something the caller may do, so it sits beside
   `capabilities`, not inside it. There is no build-time flag.
4. **On: the shell stops offering project creation while the organization has a project.** "New
   project" leaves the organization home's header, the project switcher and the command palette.
   The empty state of an organization without projects keeps it.
5. **On: a single visible project is opened directly.** When the viewer sees exactly one project
   and the list has no further page, `/o/:org` replaces itself with the project home and the
   project switcher is not rendered. With more than one visible project the list and the switcher
   work as before.

## Consequences

- The API is unchanged: `POST /v1/organizations/{id}/projects`, the agent command that creates
  projects and project deletion keep working with the option on. An organization that ends up with
  more projects shows the list and the switcher; one that ends up with none shows the empty state
  with its create action, which is the way back.
- Turning the option on changes nothing for existing organizations: no project is created for
  them.
- `Me` gains a required field; every `Me` fixture carries it.
- The e2e environment pins the option off, because its journeys assert the project list of
  single-project organizations. The on mode is covered by unit and emulator tests and has no
  journey of its own.
- The organization breadcrumb and the "Projects" navigation item still point at `/o/:org`; with one
  visible project they land on the project home.
- The local seed and the agent runtime's core server do not read the option: the seed creates its
  projects by name, and the runtime creates no organization.

## Alternatives rejected

- **A feature flag in the flag registry.** Decision 0039 keeps flags for rollout per tenant, with
  an owner and an expiry; this is a property of the deployment, read before any organization
  exists.
- **Creating the project from the client after the organization.** Two requests: a failure between
  them leaves an empty organization, and API callers would not get the project.
- **Reusing `createProject` inside `createOrganization`.** It opens its own transaction and
  authorizes against a grant that is not committed yet.
- **Refusing project creation over the API when the option is on.** An organization without
  projects (created before the option, or after a deletion) would have no way to get one.
- **A fixed project name.** The server stores no translated text; the organization's name is
  already there and reads well wherever the project is shown.
- **`capabilities.createProject`.** The server would still accept the request, so the field would
  not say what `capabilities` promises.
