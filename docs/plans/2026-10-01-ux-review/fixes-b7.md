# B7: Settings correctness fixes

Batch B7 of `consolidated.md`: U-15, U-18, U-57, U-59, U-61. Every finding still held when
re-checked on `16d3c59e` (B1, B3 and B9 had landed; none of them touched these defects).
Decision: `app/docs/decisions/0054-run-failures-and-connector-load-errors.md`.

| Finding | Source | Status | Commit | Test |
|---|---|---|---|---|
| U-15 empty permission picker | S-M2 | fixed | `fix(access): explain a missing permission catalog in role and key forms` | `views/settings-roles/ui/SettingsRolesView.test.tsx` "explains a failed permission catalog inside the editor and recovers on retry", "keeps every create and edit entry point waiting…", "disables row edits while the permission catalog loads"; `views/settings-api-keys/ui/SettingsApiKeysView.test.tsx` "explains a failed permission catalog instead of an empty scope list, and retries" |
| U-18 workflow input as raw JSON | S-M5 | fixed | `feat(workflows): fill workflow input from its schema, not raw JSON` | `shared/ui/organisms/JsonSchemaFields/json-schema-plan.test.ts`, `json-input-draft.test.ts`, `JsonSchemaFields.test.tsx`; `shared/lib/labels/catalog-label-keys.test.ts` (input keys); `views/settings-workflows/ui/SettingsWorkflowsView.test.tsx` "starts a startable workflow from fields of its input schema…", "edits the input as JSON when asked, and back as fields", "puts the server's field refusals next to the field", "edits a schedule's input in the fields of its workflow…", no input group for a workflow without a schema |
| U-57 failed run without reason or next step | S-m7 | fixed (trace link and input prefill deferred, follow-up 95) | `feat(contracts): carry run failures and connector load errors`; `feat(workflows): explain failed runs and offer to run them again` | `agents/src/workflows/runs/workflow-run-view.test.ts` "says which step a failed run stopped at, never the error message", "tells a guardrail stop from a failure…"; `SettingsWorkflowsView.test.tsx` "says why a run failed and at which step, and offers to run the workflow again", "names a guardrail stop, and offers no rerun without the start permission" |
| U-59 connector error unexplained; no secret step after create | S-m13 | fixed | `feat(contracts): …`; `feat(connectors): record why a connector failed to load and show it` | `contracts/.../connectors.schema.test.ts` (lastError shape, `connectorNeedsSecret`); `agents/src/connectors/connector-registry.test.ts` "connector load errors" (3 cases); `services/.../firestore-connector-repository.emulator.test.ts` "records and clears the runtime's load error…"; `views/settings-connectors/ui/SettingsConnectorsView.test.tsx` "says why a connector did not load…", "goes straight to the secret after creating a connector that needs one" |
| U-61 ingestion notices lost on reload | S-m17 | fixed | `fix(client): keep knowledge ingestion notices across reloads` | `views/settings-knowledge/ui/SettingsKnowledgeView.test.tsx` "keeps an ingestion started here across a reload, and shows its failure on return", "ignores stored ingestions it cannot read" |

Deferred: part of U-57 only (follow-up 95): a link from the run to its trace (traces carry no
`runId`) and prefilling "run again" with the failed run's input (the run view carries no input;
it is personal data). "Run again" ships with the workflow preselected; the dialog already takes
`initialInput`.

## What changed

- `entities/role`: `PermissionCatalogField` reads `GET /v1/permissions` itself, with loading,
  error (code copy, reference, retry; also for the actor's grants at the key's node) and empty
  states; `usePermissionCatalogReady` keeps submit disabled until the catalog has permissions.
  Every role create and edit entry point waits while the catalog loads.
- `shared/ui/organisms/JsonSchemaFields`: a planner over the catalog's JSON Schema (flat object of
  string, long text, number, integer, boolean, string enum; `ui.labelKey`/`ui.widget`/`ui.order`
  from contract meta are honoured), a draft model (limits checked per field, empty optional
  fields left out, decimal commas, server `inputData.*` details mapped to fields) and the UI with
  "Editar como JSON". Other shapes are JSON text; no schema (or no properties) asks for nothing.
  The schema is never printed. Used by the start-run and schedule dialogs; editing a schedule
  whose workflow declares no schema but still sends input keeps it editable as JSON.
- Labels: `common.workflows.<id>.input.<field>` (and the module variant) per decision 0052.
- Runs: `failure { code: STEP_FAILED | TRIPWIRE | RUN_FAILED, stepId }` derived from the Mastra
  snapshot, never the message or the guardrail reason; the timeline names it, the run page says
  what to do next and offers "Executar de novo".
- Connectors: the runtime records `lastError { code, at }` through `ConnectorsPort.recordLoad`
  only when the outcome changes; status stays `active` (so the connector can heal); the page
  shows "Com erro" with the reason and time; creating a connector that authenticates opens the
  secret dialog.
- Knowledge: started ingestions live in `sessionStorage` per organization (schema-checked,
  try/catch on every access) and are followed again on return.
