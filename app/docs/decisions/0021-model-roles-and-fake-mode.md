# 0021. Model roles, providers and `AI_MODE=fake`

- **Status:** accepted
- **Date:** 2026-09-29
- **Scope:** `app/packages/agents/src/models`, `app/packages/agents/src/runtime/agent-env.schema.ts`, `app/apps/mastra` env (local decision; the framework is unchanged)
- **Records:** SP3 spec D3-04, D3-05 (§5.1, §5.3)

## Context

Agents, guardrail detectors, judges, embeddings and voice need different models. Ids change often and belong in config (`stacks/ai/gemini.md`, `stacks/ai/openai.md`). Tests, CI, e2e and offline development must run without provider keys and without flakiness, with stream parts, usage and tool calls that behave like a real provider.

## Decision

1. **D3-04 — Roles.** `chat`, `fast`, `reasoning`, `judge`, `embedding`, `transcription`, `speech`, `realtime`, each read from `AI_MODEL_<ROLE>` with the defaults of spec §5.1 (Gemini for text and embeddings, OpenAI for voice) and an optional `AI_MODEL_<ROLE>_FALLBACK`. `GOOGLE_AI_BACKEND` selects `ai-studio` (API key) or `vertex` (ADC). The model factory builds AI SDK provider instances with keys from the validated env only; nothing else reads `process.env`. In `real` mode a missing key fails the boot for text roles and disables voice features.
2. **D3-05 — Fake mode.** `AI_MODE=fake` is allowed only when `APP_ENV` is `local` or `dev` (CI runs as `local`). It uses a scripted, deterministic `LanguageModelV4` shipped in `@core/agents` (directives `[[fake:<scenario> <json>]]`, per-agent keyword rules, else a hash-based echo) that emits real stream parts and usage; a hashed bag-of-words embedding (1536 dims, L2-normalized); fake transcription and speech; and guardrail detector fakes that flag only `[[fake:injection]]`, `[[fake:pii]]` or `[[fake:moderation]]`.

## Consequences

- Every test, e2e run and eval gate runs offline; `pnpm evals:real` is opt-in.
- Tracing, usage ledger, approvals and UI behave the same in fake mode.
- A staging or prod deploy with `AI_MODE=fake` fails at boot.

## Alternatives rejected

- **`ai/test` mocks as the dev fake.** They are test utilities, not scripted scenarios, and are not meant to ship in a runtime package used by dev and e2e.
- **Model ids hard-coded per agent.** Upgrades and per-environment overrides would need code changes.
- **Recorded provider responses (cassettes).** Brittle across SDK versions, and they put real content in the repository.

## Amendments

- **2026-09-30 — voice composition (SP3 Task 26).** `createVoice` builds a `CompositeVoice`
  from the `transcription` and `speech` roles (fake voice models in fake mode). `CompositeVoice`
  in `@mastra/core` 1.71 wraps only `v2`/`v3` AI SDK models, and the factory's models are `v4`
  (AI SDK 7), so each role goes through an own `MastraVoice` provider that calls `transcribe` /
  `generateSpeech` from `ai`. No model configured means `null` (voice off, routes answer 503
  `FEATURE_UNAVAILABLE`). Realtime stays off: no realtime provider is pinned, the capability is
  reported as `false` and SP4 may inject a `MastraVoice` realtime provider. The routes
  `/voice/transcriptions` (≤ 5 MB, ≤ 60 s: WAV header before the model, reported duration after)
  and `/voice/speech` are custom Mastra routes with `requiresAuth` (FirebaseMastraAuth,
  `core.chat.use`); Mastra's `bodySizeLimit` does not apply to custom routes, so the handler caps
  the body itself.
