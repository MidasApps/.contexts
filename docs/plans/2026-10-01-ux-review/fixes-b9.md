# B9: Human-readable labels fixes

Batch B9 of `consolidated.md`: U-17, U-31, U-33. Every finding still held when re-checked on
`ace7eb1b` (raw `workflowId`, `scheduleId`, `experimentId`, `datasetId`, `flag.key`, tool ids,
`moduleId`, `request.permission` and `<code>{schedule.cron}</code>` were the visible labels at the
cited lines). Decision: `app/docs/decisions/0052-human-labels-for-code-defined-ids.md` (labels are
message keys derived from the id; no `labelKey` on the workflow catalog, tool or flag contracts).

| Finding | Source | Status | Commit | Test |
|---|---|---|---|---|
| U-17 label resolvers and catalogs | S-M4 fix 1 | fixed | `ae8ce840` feat(i18n): add label catalogs for workflows, tools, flags and agents | `shared/lib/labels/catalog-label-keys.test.ts` (9 cases); `shared/lib/labels/use-catalog-labels.test.tsx` (workflow, tool, command, permission, flag, agent, module labels; fallbacks; locale) |
| U-17 workflows and schedules (runs list, filter, run page, start, schedule and cancel dialogs, admin runs) | S-M4, ADM-26 | fixed | `5b1fea1d` feat(workflows): name workflows and schedules instead of their ids; `89af03b7` fix(client): keep schedule action hooks unconditional | `widgets/schedule-table/ui/ScheduleTable.test.tsx` "names the workflow and the schedule's slug instead of their ids"; `views/settings-workflows/ui/SettingsWorkflowsView.test.tsx` "lists the organization's runs…" (workflow label, "Por um agendamento: Todos os dias às 09:00 (America/Sao_Paulo)", no schedule id) and the start/schedule/cancel cases by label; `views/admin-workflows/ui/AdminWorkflowsView.test.tsx` "lists runs…" ("Agendamento: De hora em hora, aos 15 min (UTC)", no schedule id) |
| U-17 chat (tool cards, delegation steps, forms, submitted forms, four-eyes card, table/chart headers, unknown agents, fallback summary) | C-08 | fixed | `0589e091` feat(chat): name tools, commands and agents in the conversation | `entities/message/ui/chat-message.test.tsx` (steps and tool card by label); `features/generative-ui/ui/generative-part.test.tsx` (agent `label` header, chart `xLabel`, no approval id); `widgets/chat-panel/ui/chat-panel.tools.test.tsx`; `features/chat-approval/ui/tool-confirmation.test.tsx` "names a command tool by its permission label when there is no preview" |
| U-17 flags | S-M4, S-m10 (flags), follow-up 85 | fixed | `60067936` feat(i18n): name feature flags in the viewer's language | `views/settings-flags/ui/SettingsFlagsView.test.tsx` (localized name and description, key secondary, dialog by name); `views/admin-flags/ui/AdminFlagsView.test.tsx` (name above key) |
| U-17 agent tools, module, roles | S-M4, ADM-30 | fixed | `beb0a71e` feat(agents): label agent tools, modules and roles | `views/settings-agents/ui/SettingsAgentsView.test.tsx` ("Criar projetos" with id secondary, connector tool keeps its name, editor checkbox by label); `views/admin-agents/ui/AdminAgentsView.test.tsx` (role as hint) |
| U-17 experiments, datasets, eval dialog agents, prompt eval link | S-M4, ADM-12, ADM-31 | fixed | `e2b20eb6` feat(admin): name eval experiments by agent, dataset and start | `entities/eval-experiment/model/use-experiment-label.test.tsx`; `views/admin-evals/ui/AdminEvalsView.test.tsx` (row and chart series by name); `views/settings-evals/ui/SettingsEvalsView.test.tsx` (agent options by name); `views/admin-agent-prompts/ui/AdminAgentPromptsView.test.tsx` (link "Ver o experimento nas avaliações" → `/admin/evals?a=…`) |
| U-17 general settings read-only | S-p2 | fixed | `225129f7` feat(client): name zones, currencies and knowledge collections | `views/settings-general/ui/SettingsGeneralView.test.tsx` "shows the details read-only…" (offset + zone, "BRL — Real brasileiro") |
| U-17 knowledge collections | S-p8 | fixed | same | `views/settings-knowledge/ui/collection-name.test.tsx` (project by name, "Projeto removido", "Outro projeto da organização"; module via manifest label) |
| U-31 permission labels | C-07, S-m10 | fixed | `b9d918f7` feat(access): show permission labels instead of permission ids | `features/chat-approval/ui/tool-confirmation.test.tsx` "says what will run, under which permission…" (label, id in `title`); `views/settings-approvals/ui/SettingsApprovalsView.test.tsx` detail case; `use-catalog-labels.test.tsx` "has a label for every core permission in pt-BR/en-US/es-419" |
| U-33 cron in words, last fire on cards | S-m19, ADM-32 | fixed | `5b1fea1d` (as above) | `features/schedule-editor/model/describe-cron.test.tsx` (presets, weekdays per locale, custom → null); `ScheduleTable.test.tsx` "describes a preset cron in words…", "shows a custom cron as written", "shows the last fire on the card too" |
| ADR | — | done | `69add733` docs(client): record the human labels decision for code-defined ids | — |

Deferred: none.

## What changed

- `shared/lib/labels`: one resolver per kind (`useWorkflowLabel`, `useAgentLabel`, `useToolLabel`,
  `useCommandLabel`, `useFlagLabel`, `usePermissionLabel`, `useModuleLabel`) over convention keys,
  falling back to the id; ids are looked up only when they are safe message paths.
- Catalogs: `common.workflows.*`, `common.agents.*`, `common.flags.*`, `common.cron.*`,
  `common.evalExperiment.label`, `chat.tools.*`; the example module names its workflow; the
  permissions catalog gained the 33 core permissions it lacked (SP5, platform, conversation, voice),
  which also fixes raw ids in the role editor and API-key scopes.
- Schedules: `describeCron`/`useDescribeCron` (presets via `draftOfCron`, localized weekday and
  time), `useScheduleLabels`, `scheduleSlugOf`; runs a schedule started say when it fires.
- Contracts (additive, optional): `chat.DataTableProps` column `label`, `chat.ChartProps` `xLabel`;
  catalog and OpenAPI regenerated.
- `useFormatDateTime` is now stable per locale and zone, and the experiment tables read labels and
  URL state from context, so loading dataset names never remounts a cell under a click.

## Notes

- Staff-only surfaces that keep ids on purpose: the admin runs workflow filter (free text, no
  cross-tenant catalog), the admin agent catalog (what the runtime registered) and the trace
  targets. The experiment pair header still lists the chosen ids; the chart names them.
- `RunPage.tsx` merged with B3 (not-found state kept, title by workflow label).

## Verification (rebased tree, on top of `6f1a425d`)

- `pnpm exec vitest run --maxWorkers=2` in `packages/client` → 250 files, 1268 tests passed.
- `turbo run test` for `@core/contracts`, `@core/i18n`, `@core/module-example` → 425, 51, 30 passed.
- `turbo run typecheck lint` for client, contracts, i18n, module-example → 8/8 tasks ok;
  `typecheck` for `@core/agents`, `@core/web` → ok.
- `pnpm i18n:check` → ok (10 namespaces, 30 catalogs); `pnpm contracts:check` → ok (148 contracts,
  167 endpoints, 299 files).
- `git diff --quiet main -- .contexts .claude && echo framework-ok` → framework-ok.
