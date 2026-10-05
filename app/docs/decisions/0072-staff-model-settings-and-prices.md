# 0072. Staff choose the model of each role and the price of each model

- **Status:** accepted
- **Date:** 2026-10-05
- **Scope:** `app/packages/agents/src/models`, `app/packages/agents/src/console/model-console-routes.ts`, `app/packages/services/src/services/platform` (`/v1/admin/models`), `/admin/models`; refines decisions 0021 and 0026, the framework is unchanged
- **Relates to:** decision 0043 (staff operations over the runtime's console routes)

## Context

Decision 0021 picks the model of each role from `AI_MODEL_*` environment variables. A change of model needs a new deploy, and only the team that deploys can make it. Decision 0026 prices calls from a table in code. A model the table does not list costs `null` in the usage ledger, so budgets fall back to counting tokens and the cost pages show it as unpriced.

On 2026-10-05 the local stack moved to OpenAI models because the Gemini key's project was refused (`403 denied access`). Two things followed. Nothing priced the OpenAI text models, and the chosen roles included `gpt-6-astra`, the most expensive model, for planning. The team wants to choose the best value per role and to keep the expensive models off. It wants to do that from `/admin`, with the cost of each model in sight.

## Decision

1. **Text roles are staff settings.**
   - `chat`, `fast`, `reasoning` and `judge` follow what staff save in `/admin/models`. Without a save they follow `AI_MODEL_*` as before.
   - `embedding` stays in the environment, because a new embedding space needs a reindex (decision 0022). The voice roles also stay there, behind their own flags (decision 0034).
   - The page shows those roles read-only.
2. **Prices are code plus staff.**
   - The code table keeps the prices read from the providers' pages, with the date read.
   - Staff may add a model with its price, or set another price for a model in code.
   - The ledger prices each call with the staff price over the code price.
3. **A role must name a priced model whose provider has a key.**
   - The runtime refuses a save otherwise, with `400 VALIDATION_FAILED`.
   - Fake mode asks for no key, since it calls no provider.
   - This keeps every call priced, so budgets always count money.
4. **One document, owned by the runtime.**
   - The settings live in Firestore `model-settings/platform`.
   - The runtime reads them through `/console/models`. `/v1/admin/models` requires staff with MFA and `platform.model.manage` (platform-admin), forwards the save, and audits `MODEL_SETTINGS_UPDATED` on the platform log.
5. **No restart.**
   - Each runtime instance keeps a copy for 60 s and reads it again in the background, so a model call never waits on Firestore.
   - Role models resolve their target on every call, so agents built at boot follow a change.
   - The instance that saves applies the change at once; the others within 60 s.
6. **Local defaults on 2026-10-05.** These are the best value of the OpenAI line the key can reach:
   - `chat` and `reasoning` on `openai/gpt-6-sol` (US$ 2 / 10 per 1M tokens);
   - `fast` and `judge` on `openai/gpt-6-luna` (US$ 0.10 / 0.50);
   - embeddings on `openai/text-embedding-3-small` (US$ 0.02).

   `gpt-6-astra` (US$ 10 / 50) stays priced but unused.

## Alternatives rejected

- **Keep models in the environment only.** Every change needs a deploy, and the cost of a choice is not visible where it is made.
- **Store the settings in Postgres next to the ledger.** Platform settings already live in Firestore (plans, flags), and the runtime already reads Firestore at boot.
- **A per-organization model choice.** No organization has asked for it. It would also multiply the price and budget cases. Custom agents already pick between `chat` and `reasoning` (decision 0046).

## Consequences

- A price staff set is not checked against the provider. The page shows its origin ("Equipe"), and the code price returns when staff restore it.
- Prices are the short-context rates. OpenAI bills prompts above 272K input tokens at a higher rate, so such a call is under-counted.
- Moving the stack back to Gemini needs only a save in `/admin/models`, once a working key exists.
