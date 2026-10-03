# 0062. Tenant eval datasets: creating a dataset and managing its items

- **Status:** accepted
- **Date:** 2026-10-03
- **Scope:** `app/packages/contracts/src/contracts/observability/{eval-dataset-item.schema.ts,endpoints.ts}`, `app/packages/agents/src/console/{dataset-console.ts,console-routes.ts}`, `app/packages/services/src/services/{observability,evals}`, `app/apps/web/src/app/v1/evals/datasets/**`, `app/packages/client/src/{features/manage-eval-datasets,entities/eval-experiment,views/settings-evals}` (local decision; the framework is unchanged)
- **Records:** SP0 follow-up 66; SP5 spec §7 (manual dataset items)
- **Relates to:** decisions 0040 (console routes, tenant isolation), 0045 (tenant settings pages), 0049 (experiment by id)

## Context

The `/settings` evals page listed an organization's datasets but said that items could not be
listed, added or edited and that a dataset could not be created: no tenant endpoint served them.
SP5 spec §7 asks for manual items. Mastra already stores datasets and versioned items; `/v1`
reaches them only through the runtime's `/console/*` routes (decision 0040).

## Decision

1. **Four `/v1` endpoints, tenant-scoped like the existing ones.** The organization is always
   `?organizationId=` authorized by `requireTenant`, never a body field (the bodies are strict).
   - `POST /v1/evals/datasets` (`core.eval.write`): `{ name }`, 201 with the dataset; a name the
     organization already uses answers 409 `CONFLICT`.
   - `GET /v1/evals/datasets/{datasetId}/items` (`core.eval.read`): numbered pages
     (`page`, `perPage`, `meta.hasMore`), like the experiments list.
   - `POST /v1/evals/datasets/{datasetId}/items` (`core.eval.write`): `{ input, expectedOutput? }`,
     201 with the item.
   - `DELETE /v1/evals/datasets/{datasetId}/items/{itemId}` (`core.eval.write`): 204.
   No new permission key: the existing read and write keys of evals fit. No `Idempotency-Key`: none
   of these is a costly call, and a repeated item is visible and deletable.
2. **Same console gateway pattern.** `ConsoleGateway` gains `listDatasetItems`, `addDatasetItem`,
   `deleteDatasetItem` and `createDataset` over `GET|POST /console/datasets/:id/items`,
   `DELETE /console/datasets/:id/items/:itemId` and `POST /console/datasets`. The gateway maps 409
   to `CONFLICT`; the runtime's DELETE answers `200 { data: { itemId } }` so every console answer
   is parsed against a contract, and `/v1` answers 204. The item routes require a tenant (400
   without one): there is no staff variant.
3. **Tenant isolation in the runtime.** The runtime reads the dataset with
   `datasets.get({ id, organizationId })` and checks the record's `organizationId` again, so another
   tenant's dataset, a platform dataset (no organization) and a missing one all answer 404, even if
   a storage filter were ignored. An item to delete must belong to that dataset.
4. **Items are text.** A manual item stores the input as a string (what an agent target receives,
   like the platform eval cases) and the expected answer as the ground truth string, with
   `metadata.origin = "manual"`. The view contract `observability.EvalDatasetItem` shows `input`
   and `expectedOutput` as text; a structured value (a feedback item's
   `{ conversationId, messageId }`) is rendered as JSON. Both texts are `personal` (members type
   them) and capped at 4000 characters, the cap of a platform case.
5. **New datasets target the assistant.** A created dataset is empty, `targetType: "agent"`,
   `targetIds: ["assistant"]`: the supervisor is always evaluable, so it can be used in the start
   dialog at once.
6. **UI.** In the datasets tab each dataset opens its items (`?tab=datasets&dataset=<id>`, paged
   by `?page=`), with a back button. With `core.eval.write` (and online) the page offers "New
   dataset", "Add item" and a confirmed delete per item; loading, empty and error states use the
   page's `QuerySection`, `EmptyState` and `ApiErrorAlert` like the rest. The "what this page does
   not do yet" alert is removed.

## Consequences

- An organization admin can build an eval set by hand and run an experiment on it without staff.
- Every add or delete makes a new Mastra dataset version; experiments already run keep their
  results. The client refreshes the whole evals scope after a change, so the dataset's version
  updates too.
- Editing an item in place, deleting or renaming a dataset, choosing other target agents and
  structured inputs (messages, tool mocks) are not built; they can extend these routes.

## Alternatives rejected

- **The raw Mastra `/api/datasets` routes from `/v1`.** Decision 0040 keeps them off `/v1`: they
  have no tenant check of their own.
- **A `DATASET_NAME_TAKEN` error code.** 409 `CONFLICT` already means it on this endpoint, and the
  client shows it on the name field.
- **`unknown` input in the view contract.** It would leave the shape untyped for clients and the
  catalog; text keeps the contract strict and still shows feedback items.
