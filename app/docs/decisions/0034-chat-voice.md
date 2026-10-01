# 0034. Chat voice: push-to-talk and read aloud, realtime optional

- **Status:** accepted
- **Date:** 2026-09-30
- **Scope:** `/v1/voice/*`, `app/packages/client/src/features/chat-voice` (local decision; the framework is unchanged)
- **Records:** SP4 spec D4-06 (§4.5, §7)
- **Relates to:** decision 0021 (voice roles), SP3 Task 26 voice routes

## Context

SP3 serves `/voice/transcriptions` and `/voice/speech` on Mastra. Next route handlers do not
terminate WebSockets, and realtime voice with tools would bypass the approval pipeline.

## Decision

**D4-06.** Push-to-talk records with `MediaRecorder` (≤ 60 s, ≤ 5 MB) and posts to
`/v1/voice/transcriptions` (multipart, the one binary exception of `api.md` §4); the text goes to
the prompt for review (auto-send off by default). TTS uses `POST /v1/voice/speech` (text ≤ 4000)
and streams audio. Realtime is optional behind flag `chat.voice.realtime` (off by default,
experimental): `/v1/voice/realtime-sessions` mints a short-lived client secret (TTL ≤ 60 s) with
the supervisor's instructions and **no tools**; the browser connects over WebRTC; fake mode
answers 503 `FEATURE_UNAVAILABLE`. Permission `core.voice.use`; 30 transcriptions/min per user.

## Consequences

- Voice reuses the chat pipeline: transcribed text is a normal message, with approvals and audit.
- Voice calls still bypass the usage ledger (SP3 follow-up #29) and need the compliance review of
  follow-up #30 before exposure.

## Alternatives rejected

- **Mastra `OpenAIRealtimeVoice` over WebSocket.** Needs a WebSocket terminator outside Next.
- **Realtime with tools.** Skips the per-call authorize and approval pipeline.

## Amendments

- **2026-09-30 — voice is gated and governed (SP4 Task 7, SP3 follow-ups #29 and #30).**
  - **Platform flag `AI_VOICE_ENABLED`** (agent env). Unset, voice is on in `local` only. While it
    is off, every Mastra voice route answers 503 before the body is read, and `/v1/voice/*` answers
    503 `FEATURE_UNAVAILABLE`. It stays off outside local until compliance approves sending member
    audio to the provider (DPA, legal basis, training opt-out, region; follow-up #30). A per-tenant
    switch is not built: it belongs with the SP5 feature flags.
  - **Ledger, budget and audit.** `transcribe` and `generateSpeech` produce no Mastra span, so the
    voice routes do it themselves. A context middleware on `/voice/*` writes the caller's context and
    caps the body at 5 MiB. Before the provider call, the tenant budget is checked (429
    `BUDGET_EXCEEDED`; a failing check answers 503, fail-closed). After it, a `usage.llm_calls` row
    is written (`agentId` `voice-transcription|voice-speech`, the role's provider and model,
    0 tokens, cost `null` until audio is priced), and `VOICE_TRANSCRIBED|VOICE_SYNTHESIZED` is
    audited with the duration. Ledger and audit write failures are logged; the call already happened.
  - **`/v1/voice`.** Users only, permission `core.voice.use` at the organization (`organizationId`
    query), rate limit `voice-call` (30/min per user). Transcriptions are `multipart/form-data` with
    one `audio` field. The declared length is checked before the form is parsed, and the type comes
    from the magic bytes (webm, ogg, mp4, wav), never from the declared type. Audio that is too
    large, of another type or longer than 60 s answers 400 `VALIDATION_FAILED`.
  - **Realtime.** `POST /v1/voice/realtime-sessions` → Mastra `/voice/realtime-sessions`. A secret is
    minted only when `AI_VOICE_REALTIME_ENABLED=true`, voice is on, the mode is real and the
    realtime role is OpenAI with a key: `POST /v1/realtime/client_secrets`, 60 s, the supervisor's
    instructions, `tools: []`. Otherwise the route answers 503. The realtime audio then flows
    between the browser and the provider, outside the usage ledger, so realtime needs its own
    metering before it is enabled anywhere.
