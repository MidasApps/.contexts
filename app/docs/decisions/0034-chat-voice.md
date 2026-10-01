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
- **2026-10-01 — per-tenant voice flags (SP5 Task 8, decision 0039).**
  - The gate is now the flag `chat.voice`, read per tenant through the runtime's flag reader
    (30 s cache). Mastra checks it after the caller's context is known, so a tenant whose flag is off
    gets 503 while others keep voice. Realtime also needs `chat.voice.realtime`, checked per call;
    the minter only needs real mode and an OpenAI realtime model with a key.
  - `AI_VOICE_ENABLED` and `AI_VOICE_REALTIME_ENABLED` no longer gate anything themselves. They seed
    the environment default of the two flags (`flagEnvironmentDefaults`; unset voice = on in local
    only) until a value is stored for the environment. A stored environment value, then a tenant
    override, win over the seed.
  - The compliance hold stands: outside local the default stays off, and only staff may turn voice
    on for an environment or a tenant (`/v1/admin/flags`, audited). A tenant's own admins may
    switch voice off, never on above the environment value.
  - A flag store failure with nothing cached keeps voice off (fail closed).

- **2026-10-01 — the client and how it knows voice is on (SP4 Task 12).**
  - **`GET /v1/voice/availability?organizationId=`** → `{ voice, realtime }` (`voice.VoiceAvailability`,
    permission `core.voice.use`). `/v1/flags` needs `core.flag.read`, which only admins hold, so a member
    had no way to learn the flag. The route reads the same flag values as the runtime and fails closed
    (unset flag, store failure or no reader → off). The voice routes still check the flag on every call.
  - **Hidden until on.** `useChatVoice` asks only for a member with `core.voice.use` and returns nothing
    until the answer says `voice: true`: no push-to-talk, no options, no "read aloud". A 503 on a later
    call (the flag was switched off meanwhile) is said in words.
  - **Push-to-talk.** `features/chat-voice/model/push-to-talk.ts`: `MediaRecorder` (Opus in WebM where
    the browser has it), 60 s and 5 MB caps, the microphone released when the recording stops. A pointer
    records while held; the keyboard (Enter or Space on the button, `Ctrl+Space` anywhere) toggles, since
    holding a key is not possible for everyone (WCAG 2.5.1); Esc discards. The transcript lands in the
    draft; "send after transcribing" is a thread option, off by default.
  - **Read aloud.** A message action fetches `POST /v1/voice/speech` and plays the blob in the native
    `audio` element; "read answers aloud" is a thread option, off by default. Text over 4000 characters is
    read up to the limit.
  - **Privacy.** Audio lives in memory until sent or played, is never written to storage, and no error
    report carries it. Both options last as long as the thread (they are not persisted).
  - **CSP.** Web and desktop add `media-src 'self' blob:` for the speech blob.
  - **Realtime.** The toggle shows only when `realtime` is true and goes away once the session route
    answers 503. The default connector posts the SDP offer to the provider's WebRTC endpoint with the
    ephemeral secret; it was never exercised (fake mode answers 503) and the CSP does not allow the
    provider origin. Opening it belongs with the metering work this decision already requires.
  - **Desktop.** The Tauri capability file grants no microphone permission because Tauri has none: the
    webview asks by itself. macOS needs `NSMicrophoneUsageDescription` in the bundle before voice is
    enabled there; that is not added yet.
