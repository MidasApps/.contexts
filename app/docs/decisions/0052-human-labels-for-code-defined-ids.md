# 0052. Human labels for code-defined ids

- **Status:** accepted
- **Date:** 2026-10-02
- **Scope:** `app/packages/client` (`shared/lib/labels`, workflow, schedule, eval, flag, agent, chat
  and approval views), `app/packages/i18n` (`common`, `chat`, `permissions` catalogs),
  `modules/example` (messages), `app/packages/contracts` (`chat.DataTableProps`, `chat.ChartProps`)
- **Refines:** decision 0013 (i18n), decision 0015 (module manifests and namespaces), decision 0039
  (feature flags)
- **Source:** UX review 2026-10-01, findings U-17 (S-M4, C-08, ADM-12, ADM-26, ADM-30, ADM-31,
  S-p2, S-p8, part of S-m10), U-31 (C-07, S-m10), U-33 (S-m19, ADM-32); follow-up 85

## Context

Workflows, agents, agent tools, feature flags and permissions are defined in code and travel as
ids (`approval-demo`, `knowledge_searchKnowledge`, `ai.kill-switch`, `core.project.create`). The UI
showed those ids as names, so pt-BR pages read half in code ("Execução de approval-demo"). Most rows
carry only the id: a run has `workflowId` and `scheduleId`, an approval has `permission`, a chat
tool part has the stream's tool name, and the staff console lists runs of every organization with
no tenant catalog at hand. The review suggested a `labelKey` on the workflow catalog, tool and flag
contracts.

## Decision

1. **Labels are message keys derived from the id, by convention; the convention is the contract.**
   One resolver per kind in `shared/lib/labels` (`useWorkflowLabel`, `useAgentLabel`,
   `useToolLabel`, `useCommandLabel`, `useFlagLabel`, `usePermissionLabel`, `useModuleLabel`) tries
   the candidate keys in order and falls back to the id:
   - workflows: `common.workflows.<id>.{name,description}`, then the module's
     `<moduleId>.workflows.<rest>.{name,description}` for an id `<moduleId>-<rest>`; the server's
     description is the description fallback;
   - agents: `common.agents.<key>`, then `<moduleId>.agents.<rest>`;
   - tools: `chat.tools.<id>` (the stream name's `_` read back as `.`), then a command tool's
     permission label (`command.<commandId>` → the contract's `meta.permission`), then
     `<moduleId>.tools.<rest>`; connector tools keep their own names, the organization chose them;
   - flags: `common.flags.<dotted key>.{name,description}`; the registry `reason` stays the
     governance text and the description fallback;
   - permissions: `permissions.<id>`, then `<moduleId>.permissions.<rest>`;
   - modules: the manifest `labelKey` (from the registry when the shell provides it).
   Ids are looked up only when they are safe message paths; anything else goes straight to the
   fallback.
2. **No `labelKey` on the workflow catalog, tool or flag contracts.** A key sent with the catalog
   would label the start dialog but not the runs, schedules and approvals that carry only the id,
   and two sources could disagree. Modules name their workflows, agents and tools in their own
   manifest messages, which `defineModule` already confines to their namespace.
3. **Ids stay reachable, as secondary text.** Where support needs them (a schedule's slug, an
   experiment id, a tool id, a flag key for staff, a permission id in a tooltip) they are shown in
   muted mono under the name, never as the name.
4. **Schedules read as when they fire.** A preset-shaped cron (`draftOfCron`) is described in words
   with the localized weekday and time ("Dias úteis às 09:00"); other expressions are shown as
   written. A run a schedule started names that schedule by its description and zone when the page
   knows the schedule, else says "a schedule"; the schedule id is never shown.
5. **Experiments are named "{agent} · {dataset} · {start}"**, from the agent label, the dataset list
   the page reads and the start time.
6. **Agent-built tables and charts may carry their own headers.** `chat.DataTableProps` columns gain
   an optional `label` and `chat.ChartProps` an optional `xLabel`, written by the agent in the
   conversation's language; the header falls back from `labelKey` to `label` to the row key
   (additive, optional fields).
7. **Every core permission has a label** in the three locales; a client test keeps it so.

## Consequences

- Adding a core workflow, agent, tool or flag means adding its copy to `common`/`chat` in the three
  locales; without it the UI shows the id, not a broken key. A module does the same in its manifest
  messages.
- The staff console names schedules from the schedules list it already caches, and the experiments
  tab reads the dataset list once to name datasets.
- Follow-up 85 (English flag descriptions) is resolved for the tenant flags page; staff still see the
  registry reason, which is governance text.

## Alternatives considered

- **`labelKey` in the contracts (catalog, tool, flag).** Rejected for decision 2's reasons; it would
  also need the server to know client message namespaces.
- **Humanizing ids (`usage-report` → "Usage report").** Rejected: it produces English in pt-BR pages
  and cannot name commands or permissions.
