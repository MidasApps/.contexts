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
