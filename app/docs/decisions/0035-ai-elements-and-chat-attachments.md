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

## Amendments

- **2026-10-01 — how AI Elements landed (SP4 Task 8).**
  - **Install.** `pnpm dlx shadcn@4.21.0 add https://elements.ai-sdk.dev/api/registry/<name>.json` ran in a
    scratch copy of `components.json`, `globals.css` and `cn.ts` (decision 0014: run in the workspace it would
    edit `package.json`, add the npm `cn` package and run `pnpm install` under other agents) for the 20
    components of the SP4 plan. It wrote 5 893 lines in 20 files, 21 shadcn primitives, and asked for 19
    dependencies.
  - **Port, not copy.** The files in `shared/ui/ai` are owned ports of that output: the existing Atomic kit
    instead of a second set of primitives, design tokens instead of palette classes (`text-yellow-600`…), every
    string from the `chat.elements` messages or a required prop, the 500-line rule (upstream `prompt-input` has
    1 463 lines, `code-block` 562), and WCAG 2.2 AA. Upstream stays the reference: compare with
    `shadcn view <url>`.
  - **Dependencies adopted:** `@ai-sdk/react` 4.0.125 (it pins `ai` 7.0.122 exactly; 4.0.129, the latest,
    needs `ai` 7.0.126, so it moves with the `ai` train), `streamdown` 2.6.0 (the plan's pin; 2.7.0 was one
    day old) and `use-stick-to-bottom` 1.1.6.
  - **Dependencies not adopted, and what replaces them:**

    | Upstream dependency | Used by | Here |
    |---|---|---|
    | `shiki`, `@streamdown/code` | `code-block`, markdown code | plain mono text + copy: shiki's regex engine is WebAssembly and the web CSP has no `wasm-unsafe-eval` (decision 0016) |
    | `@streamdown/mermaid`, `@streamdown/math`, `@streamdown/cjk` | `message` | not loaded: diagrams and math of untrusted text widen the attack surface for no v1 use case |
    | `motion` | `shimmer` | a CSS colour animation between two AA-safe text tokens (`animate-shimmer` in `globals.css`); the reduced-motion rule stops it |
    | `media-chrome` | `audio-player` | the native `audio` controls |
    | `tokenlens` | `context` | tokens only; cost belongs to the usage ledger (decision 0026) |
    | `embla-carousel-react`, hover card | `inline-citation` | a button that opens a popover (hover-only content fails WCAG 1.4.13) |
    | `nanoid`, `@radix-ui/react-use-controllable-state`, `cmdk` | `prompt-input` | not needed by the reduced composer |
    | npm `cn` | every file | `#/shared/lib/cn.ts` |

  - **Reduced on purpose.** `prompt-input` keeps the composer (textarea with Enter / Shift+Enter / Esc and IME
    handling, tools row, action menu, send/stop); its local attachment store, drag and drop, screenshot and
    model selector are out, because uploads go through the files API first (D4-08). `speech-input` is only the
    button: audio goes to `/v1/voice` (decision 0034), not to the browser's Web Speech API. `message` has no
    branches (the backend keeps one thread). `agent` shows a delegation, not an agent's configuration.
  - **Safe markdown** (`shared/lib/markdown`): streamdown without `rehype-raw` and with `skipHtml`, so raw
    HTML is never rendered; links only as absolute http(s) without credentials, with the host shown and
    `rel="noopener noreferrer nofollow"`; images are not loaded at all in v1 (a model-chosen URL would leak
    the reader's address), their alt text stays. `#cite-<n>` is the one fragment kept, for citations.
  - **Chat transport** (`shared/api/chat-transport.ts`): `DefaultChatTransport` over a `fetch` that asks for
    the Bearer token per request, sends a ULID `x-request-id`, retries once after a 401 with a forced refresh,
    reads `x-conversation-id`, and turns error envelopes into `ApiError`. The body is exactly `ChatRequest`.
  - **`chat` is a core message namespace** (`@core/i18n`), so it joins `RESERVED_MODULE_IDS`.
