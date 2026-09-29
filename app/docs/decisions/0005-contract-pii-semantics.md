# 0005. Field pii is authoritative; contract pii is a summary

- **Status:** accepted
- **Date:** 2026-09-29
- **Scope:** `app/packages/contracts` (registry, `contracts:catalog`, `catalog.ai.json`) and every future consumer of catalog meta (local decision of the boilerplate; the framework in `.contexts/` is unchanged)
- **Refines:** spec `docs/superpowers/specs/2026-09-29-agentic-app-core-design.md` §16.4 ("the field pii is the authoritative one")

## Context

A contract carries `pii` twice: once in its catalog meta and once on each field (`.meta({ description, pii })`). The spec says field pii is authoritative, but not what the contract-level value means, how the AI catalog uses each one, or how later readers (the agent tools `describeEntity` and `listEntities`, which arrive in SP3) should treat them.

Two readings conflict:

- **Classification.** Contract pii says how sensitive the whole record is: hide the entity when it is `sensitive`.
- **Summary.** Contract pii is the highest pii found in the record: it warns, but the fields decide what is shown.

With the first reading, a single `sensitive` field (for example a tax id on a customer) would hide the whole entity from agents, and its `none` fields would be lost. The code already follows the second reading: `defineContract` enforces contract pii ≥ max(field pii), and `buildAiCatalog` redacts by field.

## Decision

1. **Field pii is authoritative.** Every field at every nesting level has `description` and `pii` (`MISSING_FIELD_META`). A field's pii is at least the highest pii nested in it, including the pii of an object catchall (`PII_BELOW_FIELDS`). Redaction, pruning and any future masking read field pii.
2. **Contract pii is a summary.** It must be ≥ max(field pii) (`PII_BELOW_FIELDS` on `<contract>`). An author may set it higher, but that changes nothing about which fields are shown. It exists for humans reading the catalog and for coarse filters such as "does this contract hold any personal data".
3. **The AI catalog drops a contract only when every field is `sensitive`** (and the contract is therefore `sensitive`). Otherwise the contract stays, with these changes:
   - `sensitive` fields and schema properties are removed at every level;
   - `personal` example values and defaults become `"[redacted]"`;
   - an example key the schema does not declare goes out only when `additionalProperties` is a schema that declares its own `x-pii` (or a contract `$ref`), and is then classified by that schema. A missing, `true`, `{}` (`z.looseObject`) or unclassified `additionalProperties` drops the key. Authors who want record or catchall values in AI examples put `.meta({ description, pii })` on the value schema.
4. **Consumers must not read contract pii as "hide this entity".** The future `describeEntity` and `listEntities` tools, and anything else that reads the catalog, decide visibility per field from field pii and from the asker's permissions (spec §16.4: `personal` reaches the model only inside the tenant, with the asker's read permission; `sensitive` never does). They use contract pii only as a summary.

## Alternatives rejected

- **Contract pii classifies the entity (hide when `sensitive`).** One sensitive column would hide every harmless field of an entity, and authors would split contracts only to stay visible.
- **Drop contract pii and derive it.** The meta schema and the spec require it, and a declared value that must cover the fields catches forgotten field meta at definition time.
- **Let undeclared example keys through when `additionalProperties` is open.** An undeclared key cannot be classified, so it could carry anything.

## Consequences

- `catalog.ai.json` can list a contract whose `x-pii` is `sensitive`. Readers look at its fields.
- Record and catchall values without their own meta never appear in AI examples. This is conservative, and fixing it only needs meta on the value schema.
- SP3 tool code that filters entities must be reviewed against point 4.
- Code: `packages/contracts/src/contracts/field-meta-rules.ts` (`inspectSchema`) and `packages/contracts/scripts/catalog/ai-catalog.ts` (`buildAiCatalog`, `redactExampleValue`).
