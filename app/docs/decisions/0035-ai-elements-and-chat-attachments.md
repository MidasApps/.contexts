# 0035. AI Elements in the client and chat attachments

- **Status:** accepted
- **Date:** 2026-09-30
- **Scope:** `app/packages/client/src/shared/ui/ai`, `/v1/chat` attachments, `app/packages/client/src/features/chat-upload` (local decision; the framework is unchanged)
- **Records:** SP4 spec D4-07, D4-08 (§2, §4.3, §7)
- **Relates to:** decision 0014 (shadcn UI kit, Atomic)

## Context

AI Elements (a shadcn registry) covers the chat components, but its own CLI always runs
`shadcn@latest`, which bypasses the pinned CLI. Attachments must never hand the model provider a
signed or localhost URL.

## Decision

1. **D4-07 — AI Elements.** Components are installed from
   `https://elements.ai-sdk.dev/api/registry/<name>.json` with the pinned shadcn CLI
   (`pnpm dlx shadcn@4.21.0 add …`) into `shared/ui/ai` and re-exported by name from
   `shared/ui/ai/index.ts`. The copied code is owned by the repo; new dependencies are pinned in
   `catalog:` after `npm view`.
2. **D4-08 — attachments.** Files are uploaded first through SP3 `files`; the message carries
   `attachments: [fileId]` (≤ 10, `ready`, same tenant and owner). `/v1` inlines images and PDFs
   ≤ 10 MB from Storage as `file` parts (data URLs). Video (≤ 200 MB) is passed only when the
   `chat` role provider supports it; otherwise a text note part says it is not viewable. Larger
   documents, or "add to knowledge base", go to `POST /v1/knowledge/sources`. Accepted
   attachments are listed in the user message metadata.

## Consequences

- Components can be restyled with the design tokens; upstream fixes come by re-running the pinned CLI.
- Inlining costs `/v1` memory per request (bounded by 10 × 10 MB).

## Alternatives rejected

- **`ai-elements` CLI.** Runs `shadcn@latest`, not the pin.
- **Signed URLs to the provider.** Leaks a bearer URL to a third party and fails with local emulators.
