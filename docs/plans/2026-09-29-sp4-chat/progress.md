# SP4 progress

Plan: docs/plans/2026-09-29-sp4-chat.md
- 2026-09-30 Task 0: decisions 0031-0035 record D4-01..D4-08 (D4-02 and D4-04 gated by the Task 1 spike).
- 2026-09-30 Task 1: spike done (a PASS; b PASS without the request signal; c PASS with server-set memory; d PASS path A); 0031/0032 amended; report reports/spike-durable-chat.md.
- 2026-09-30 Task 2: durable chat routes (/chat/:agentId, observe, abort) with tool preview and run owners; agents unit + mastra emulator (streaming, stop, approval round trip) green.
- 2026-09-30 Task 3: conversation, chat request, patch, approval decision, message metadata, 6 generative UI props (ui-component) and voice contracts; chat/voice endpoints; core.conversation.* and core.voice.use (member+); audit actions for approvals, deletes and voice; FEATURE_UNAVAILABLE; rate limits chat-turn and voice-call.
- 2026-09-30 Task 4: conversations context (Firestore metadata, id = memory thread id): search tokens, start/get/list/update/delete, active runs with the 5-stream cap; owner-read rules; three composite indexes; unit + emulator (repository, rules) green.
- 2026-09-30 Task 5: /v1/chat (send, GET …/stream resume, POST …/stop) over the Mastra chat gateway: owner check, core.conversation.send, chat-turn rate limit, 5 streams per tenant, attachments inlined as data URLs, approval decisions audited before forwarding, activeRunId stored before answering and cleared when the upstream closes; /chat/* body cap (413/411) before parsing; 0031/0032 amended (session affinity as the v1 multi-instance choice).
