# 0001. OpenAPI is generated with native `z.toJSONSchema`

- **Status:** accepted
- **Date:** 2026-09-29
- **Scope:** `app/` (local decision of the boilerplate; the framework in `.contexts/` is unchanged)
- **Deviates from:** `.contexts/engineering/contracts/api.md` §15 and `contracts/schemas.md` §15, which name `@asteasolutions/zod-to-openapi`

## Context

`pnpm contracts:catalog` writes `docs/openapi/v1.yaml` from the contracts in `@core/contracts`. The catalog (`docs/catalog/**`) needs JSON Schema with the catalog meta as `x-*` keys and no raw meta keys (spec §16.4). The doctrine's library was measured on 2026-09-29: `@asteasolutions/zod-to-openapi@9.1.0` is the latest, with peer `zod ^4.0.0`, and it runs with Zod 4.6.5. A spike found four problems:

1. It needs `extendZodWithOpenApi(z)`, which patches the Zod prototype. That is a global import-time side effect, and rule `development` forbids side effects outside `composition.ts`.
2. It copies every `.meta()` key raw (`pii`, `kind`, `ui`…) into the output and has no hook like `z.toJSONSchema`'s `override`, so post-processing would be needed to get `x-*` keys.
3. `register(refId, schema)` clones the schema, so a nested contract used by reference was inlined instead of becoming a `$ref`.
4. The catalog's JSON Schema would come from `z.toJSONSchema` and the OpenAPI schemas from another generator, so there would be two representations of the same contract.

## Decision

Generate `components.schemas` with native `z.toJSONSchema(registry, { uri, override })`, the same call the catalog uses, and wrap it in a minimal OpenAPI 3.1 document (`jsonSchemaDialect` 2020-12). `paths` stays empty until `/v1` endpoints exist.

## Consequences

- One JSON Schema per contract, shared by the catalog and OpenAPI. Custom meta goes out only as `x-*`, and `contracts:check` enforces this.
- No Zod prototype patching and no extra runtime dependency.
- Endpoint documentation (operations, parameters, per-endpoint examples required by `api.md` §15) is not covered yet. When `/v1` routes land, revisit this decision: either add operations on top of these components, or adopt `zod-to-openapi` for paths only, if its prototype patch can be confined to the generator script.

## Amendments

- **2026-09-29 (SP1 Task 3).** The revisit above chose the first option: operations are built on top of these
  components with the same native `z.toJSONSchema`, from the endpoint descriptors of `@core/contracts`
  (`defineEndpoint`, `CORE_ENDPOINTS`; `packages/contracts/scripts/catalog/openapi-paths.ts`). Registered contracts
  inside an endpoint schema become `$ref`s to `components.schemas`; error responses reference `http.ErrorEnvelope`;
  `contracts:check` also fails on a dangling `$ref`. Per-endpoint examples (`api.md` §15) are still missing and
  are tracked as a follow-up.
