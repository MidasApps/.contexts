# 0065. Voice answers the budget refusal as `BUDGET_EXCEEDED` over `/v1`

- **Status:** accepted
- **Date:** 2026-10-04
- **Scope:** `app/packages/contracts` (`http/error-codes.ts`, `voice/endpoints.ts`), `app/packages/i18n` (`errors.json` in the three locales), `app/packages/services` (voice gateway and route tests), `app/packages/client` (`features/chat-voice`: push-to-talk and read aloud), `app/docs/openapi/v1.yaml` (local decision; the framework is unchanged)
- **Refines:** decisions 0026 (budgets and usage ledger), 0034 (chat voice, 2026-09-30 amendment); follow-up #29

## Context

Follow-up #29 said voice calls bypass the usage ledger, the tenant budget and the audit log. Most
of it was already fixed in SP4 Task 7 (decision 0034 amendment): the Mastra voice routes
(`packages/agents/src/voice/voice-governance.ts`) check the tenant budget before the provider call,
write one `usage.llm_calls` row per transcription or speech call (`agentId`
`voice-transcription|voice-speech`, the role's provider and model) and audit
`VOICE_TRANSCRIBED|VOICE_SYNTHESIZED`. `voice-governance.test.ts` covers this. The row was never
marked done.

One part still failed: the refusal did not reach `/v1` as a budget error. Over its cap, Mastra
answers 429 `{ error: { code: "BUDGET_EXCEEDED" } }`. `BUDGET_EXCEEDED` was not in
`CORE_ERROR_CODES`, so the gateway's error mapper ignored the envelope and mapped the bare 429 to
`RATE_LIMITED`. A member over budget was told to slow down, and a client could not tell the two
apart.

## Decision

1. **Core code.** `BUDGET_EXCEEDED` is added to `CORE_ERROR_CODES` (additive). It is the same code
   the chat's `tenant-budget-guard` puts in its tripwire, so chat and voice refuse with one code.
   With the code known, `mapMastraError` passes Mastra's envelope through with its status:
   `/v1/voice/*` answers 429 `BUDGET_EXCEEDED`. No change in the mapper or the voice gateway.
2. **Endpoints.** `voice.transcribe`, `voice.synthesize` and `voice.createRealtimeSession` declare
   `429: ["BUDGET_EXCEEDED"]` (all three check the budget before calling the provider), so the
   OpenAPI lists it next to `RATE_LIMITED`.
3. **Copy.** `errors.BUDGET_EXCEEDED` is added in `en-US`, `pt-BR` and `es-419` with the chat
   tripwire's wording; the client parity test requires a message for every core code.
4. **Client.** Push-to-talk (problem `budget`) and read aloud (reason `budget`) map
   `BUDGET_EXCEEDED` to its own state and show `errors.BUDGET_EXCEEDED`, as the chat's status
   line shows `errors.<CODE>` for a failed turn. Other failures keep their voice copy.
5. **No new ledger field.** Voice rows keep 0 tokens and `costMicroUsd: null`. The AI SDK's
   `transcribe` and `generateSpeech` results report no usage, and the price table only lists
   prices read from the provider's pricing page; audio prices (per minute, per character) are not
   verified yet. A seconds column would have no reader. The budget still refuses voice once chat
   spend reaches the cap, and the ledger shows each voice call per tenant.

## Consequences

- Clients can program against `BUDGET_EXCEEDED` on voice routes; `RATE_LIMITED` is again only the
  `voice-call` rate limit.
- Push-to-talk and read aloud tell a member over budget that the organization's AI budget ran out,
  in the same words as the chat, instead of "try again".
- Voice calls do not add to the spend that the cap measures until audio is priced; that work
  belongs with the price table (decision 0026), not here.
- Realtime sessions stay outside the ledger (decision 0034 amendment): the minted secret is
  budget-checked, and the audio flows between the browser and the provider.

## Alternatives rejected

- **A voice-specific mapping of 429 in `mapVoiceStatus`.** It would guess from the status and hide
  the real rate limit of the voice routes behind the budget code.
- **Pricing audio now.** It needs verified per-minute and per-character prices and a second price
  shape in the table. That is more than the follow-up asks and cannot be verified from here.
- **Recording voice through a Mastra span.** The routes already write the row and audit entry
  themselves; a synthetic span adds a second path to the same row.
