# ADR formats optimized for LLM-powered development

**Architecture Decision Records written for AI consumption should invert the traditional documentation model: strip the narrative humans prefer and maximize the structured, version-specific, constraint-oriented signals that LLMs need to generate correct code.** The research below synthesizes findings from six classic ADR formats, emerging context engineering practices, and how tools like Claude Code, Cursor, and Copilot handle project knowledge — distilled into two concrete templates. The core insight is that LLM-targeted ADRs are not documentation at all. They are **context injection artifacts** — every token must earn its place by preventing a wrong decision the AI would otherwise make.

Traditional ADRs (Nygard, MADR, Alexandrian) were designed for humans reading sequentially. LLMs consume differently: they parse structured data faster than prose, they benefit from explicit constraints over implied context, and they degrade predictably as context windows fill. A January 2026 analysis identified a **context quality cliff around 2,500 tokens** where response accuracy drops measurably. Anthropic's own guidance states: "Good context engineering means finding the *smallest possible* set of high-signal tokens that maximize the likelihood of some desired outcome." The two-tier ADR system below is built on this principle.

---

## Why traditional ADR formats fail LLMs

The six major ADR formats — Nygard's original, MADR 4.0, Y-Statements, Alexandrian, Business Case, and Tyree & Akerman — were designed along a spectrum from minimal (Nygard: 4 fields) to comprehensive (Tyree & Akerman: 13 fields). None were designed for machine consumption, and each has specific failure modes when used as AI context.

**Nygard's format** (Status, Context, Decision, Consequences) is attractively minimal but buries the actionable decision inside narrative prose. An LLM scanning 30 ADRs for the relevant constraint on database choice must parse paragraphs of context to extract a single binding decision. **MADR 4.0**, the most popular structured format, adds valuable options analysis and YAML frontmatter, but its optional sections (Decision Drivers, Pros/Cons of Options, Confirmation) consume tokens on reasoning that matters for human buy-in but not for AI execution. **Y-Statements** ("In the context of X, facing Y, we decided Z, accepting W") come closest to LLM-optimal density, packing six semantic elements into a single structured sentence — but lack the version-specificity and constraint-encoding that AI agents need.

The fundamental mismatch: traditional ADRs explain *why* a decision was made (for humans who might disagree). LLM-targeted ADRs need to encode *what* was decided, *what constraints this creates*, and *what the AI must not do*. The reasoning matters only when the AI needs to evaluate whether a decision still applies to a novel situation.

---

## Design principles for LLM-consumable ADRs

Research across context engineering, AI coding assistant conventions, and RAG optimization converges on seven principles for structuring technical knowledge for LLM consumption:

**Structured over narrative.** Benchmarks show YAML is **20–30% more token-efficient** than JSON and significantly more accurate for LLM comprehension than XML. Markdown with clear heading hierarchy outperforms prose paragraphs for factual retrieval. Code examples outperform verbal descriptions of patterns. The Synthesized ADR should use a structured key-value format; the Detailed Reference ADR can blend structure with targeted prose.

**Constraint-forward, not rationale-forward.** The AI agent's primary need is knowing what it *must* and *must not* do. Leading with constraints — explicit version pins, forbidden patterns, required conventions — prevents the most expensive errors. Rationale serves as a secondary signal that helps the AI generalize to edge cases.

**Self-contained sections for chunking.** Kapa.ai's research shows LLMs lose implicit connections between sections when documents are chunked for retrieval. Each ADR must contain enough internal context to stand alone — no orphan references to "the decision above" or "as mentioned in ADR-003" without restating the relevant constraint.

**Progressive disclosure over monolithic loading.** Claude Code's CLAUDE.md best practice recommends **under 200 lines** for always-loaded context, with deeper documents available via `@docs/` references. The synthesized ADR layer should be compact enough to load dozens simultaneously; the detailed layer should be fetched on demand. This mirrors the llms.txt two-tier pattern (lightweight index + full content).

**Version specificity over general principles.** The AI has training data about React, PostgreSQL, and AWS — but that data may be 6–12+ months stale. ADRs must encode **exact versions, specific configuration choices, and deviations from framework defaults**. "Use Next.js App Router" is less useful than "Next.js 14.2.x, App Router only, no Pages Router, `output: 'standalone'` in next.config.js."

**Explicit negation.** LLMs trained on diverse codebases will suggest common patterns unless explicitly told not to. The "Never/Avoid" field is not optional — it directly prevents re-litigation of settled decisions. As one practitioner documented: without explicit ADR context, their AI suggested reverting a directory structure decision three separate times.

**Machine-parseable metadata.** YAML frontmatter enables programmatic filtering, status lifecycle management, and cross-referencing without consuming content tokens. Tags and scope fields let tooling load only relevant ADRs for a given task.

---

## The Synthesized ADR: compact context for AI agents

This format is designed to be loaded in bulk — 20–50 ADRs simultaneously in a system prompt, CLAUDE.md, or AGENTS.md file. Each ADR targets **80–150 tokens**, providing maximum decision density within context window budgets. The design draws from Y-Statements (density), Nygard (simplicity), and Cursor's glob-scoped rules (targeted activation).

### Template

```markdown
---
id: ADR-{NNN}
status: {accepted|superseded|deprecated}
superseded-by: ADR-{NNN}  # only if superseded
scope: {frontend|backend|infra|api|auth|testing|styling|global}
date: {YYYY-MM-DD}
---

## ADR-{NNN}: {Decision title as imperative statement}

**Decision:** {One-sentence declaration. Use active voice: "Use X for Y." Be specific about versions, configurations, and scope.}

**Context:** {1-2 sentences. The specific problem or force that required this decision. Not general background — the trigger.}

**Constraints:**
- {Binding constraint this decision creates}
- {Another constraint}

**Never:** {Explicitly forbidden alternatives or patterns, comma-separated}

**Versions:** {Exact versions, configs, or pinned dependencies if applicable}

**Related:** ADR-{NNN}, ADR-{NNN}
```

### Field guide

| Field | Purpose | Token budget |
|-------|---------|-------------|
| `id` / `status` / `scope` | Machine filtering. Lets tooling load only relevant ADRs. Status prevents acting on superseded decisions. | ~15 tokens (YAML) |
| **Decision** | The single most important line. Must be unambiguous and actionable — if the AI reads only this line, it should still make the right choice. | 15–30 tokens |
| **Context** | Prevents misapplication. The AI needs enough context to judge whether this ADR applies to the current task. Not a full rationale — just the triggering force. | 20–40 tokens |
| **Constraints** | Downstream effects the AI must respect. These are the "ripple effects" — if you chose PostgreSQL, the constraint might be "All queries via Prisma ORM, no raw SQL outside migrations." | 15–40 tokens |
| **Never** | The highest-ROI field. Directly prevents re-litigation and default-pattern suggestions. "Never use Redux" saves more tokens than explaining why Zustand was chosen. | 10–25 tokens |
| **Versions** | Addresses training data staleness. Pin exact versions so the AI generates code for the right API surface. | 5–15 tokens |
| **Related** | Enables graph traversal. If the AI hits an edge case, it knows which detailed ADRs to consult. | 5–10 tokens |

### Example: real-world Synthesized ADR

```markdown
---
id: ADR-007
status: accepted
scope: frontend
date: 2025-11-15
---

## ADR-007: Use Zustand for all client-side state management

**Decision:** Use Zustand 5.x with slices pattern for all client-side state. No other state management library permitted.

**Context:** App requires shared state across deeply nested component trees without prop drilling. Redux considered too verbose for team velocity targets.

**Constraints:**
- All shared state in `/store/` directory as typed slice files
- Server state handled exclusively by TanStack Query, never in Zustand
- No React Context for state management (only for dependency injection)

**Never:** Redux, MobX, Jotai, React Context for shared state, `useReducer` for cross-component state

**Versions:** zustand@5.0.2, @tanstack/react-query@5.62.x

**Related:** ADR-003, ADR-012
```

This example clocks in at roughly **120 tokens** — compact enough that 40 such ADRs consume only ~4,800 tokens, well within a CLAUDE.md or system prompt budget.

---

## The Detailed Reference ADR: deep context on demand

This format serves as the comprehensive record the AI consults when it encounters an edge case, needs to evaluate whether a decision still applies, or must understand the full reasoning behind a constraint. It draws from MADR 4.0 (structured options analysis), Tyree & Akerman (assumptions/constraints fields), and LLM documentation best practices (code examples, self-contained sections). Target: **300–600 tokens** per ADR.

### Template

```markdown
---
id: ADR-{NNN}
status: {proposed|accepted|deprecated|superseded}
superseded-by: ADR-{NNN}
date: {YYYY-MM-DD}
decision-makers: [{names or roles}]
scope: {frontend|backend|infra|api|auth|testing|styling|global}
tags: [{technology tags for search/retrieval}]
---

# ADR-{NNN}: {Decision title as imperative statement}

## Decision
{2-4 sentences. The complete decision statement including scope, versions,
and configuration specifics. Written as directives: "Use X. Configure Y.
Deploy via Z."}

## Context
{3-5 sentences. The forces, requirements, and constraints that motivated
this decision. Include the triggering event or requirement. State any
assumptions about the environment.}

## Options considered

### {Option A — the chosen option} ✅
{1-2 sentences describing the option.}
- **Strengths:** {comma-separated}
- **Weaknesses:** {comma-separated}

### {Option B}
{1-2 sentences.}
- **Strengths:** {comma-separated}
- **Weaknesses:** {comma-separated}
- **Rejected because:** {one sentence}

### {Option C}
{1-2 sentences.}
- **Strengths:** {comma-separated}
- **Weaknesses:** {comma-separated}
- **Rejected because:** {one sentence}

## Constraints and conventions
{Bulleted list of binding rules this decision creates. These are the
enforceable patterns the AI must follow.}

- {Constraint 1 — be specific: file paths, naming conventions, config values}
- {Constraint 2}
- {Constraint 3}

## Implementation pattern
{A short, canonical code example showing the correct pattern. This is
the single highest-value section for AI code generation — show, don't tell.}

```{language}
// Canonical example of the decided pattern
```

## Anti-patterns
{Code or patterns explicitly forbidden by this decision. Showing what NOT
to do is as valuable as showing what to do.}

```{language}
// ❌ Do NOT do this
```

## Version-specific notes
{Pin exact versions. Document any deviations from framework defaults.
Note any known breaking changes in upcoming versions if relevant.}

- **Current:** {package@version}
- **Config deviations:** {any non-default configuration}
- **Migration notes:** {if superseding a previous decision}

## Consequences
- **Positive:** {measurable benefits}
- **Negative:** {accepted tradeoffs}
- **Risks:** {what could make this decision wrong}

## Related decisions
- ADR-{NNN}: {title} — {relationship: depends-on|constrains|supersedes|relates-to}
- ADR-{NNN}: {title} — {relationship}
```

### What makes this format LLM-optimal

The **Implementation pattern** and **Anti-patterns** sections are the critical differentiators from traditional ADRs. Research consistently shows that LLMs generate more accurate code when given canonical examples versus prose descriptions. A code block showing the correct Zustand slice pattern does more work than three paragraphs explaining the architecture. The anti-pattern block is equally important — it provides negative examples that directly prevent the most common AI mistakes.

The **Options considered** section is compressed relative to MADR's full pros/cons lists. Each rejected option gets a single "Rejected because" line — enough for the AI to understand why it shouldn't suggest this alternative, without the exhaustive analysis humans use for consensus-building.

The **Constraints and conventions** section replaces MADR's "Consequences" with actionable directives. Instead of "Good, because it improves developer experience," this section says "All store files in `/store/` as `{domain}.store.ts`." The AI can pattern-match against this directly.

---

## How to organize and load ADRs for AI consumption

The two-tier system requires an organizational strategy that supports progressive disclosure. Drawing from the llms.txt pattern, Claude Code's `@docs/` convention, and Cursor's glob-scoped activation, the recommended structure is:

```
project-root/
├── CLAUDE.md (or AGENTS.md)     # Contains synthesized ADR index
├── .cursor/rules/
│   └── adrs.mdc                 # Auto-attached rule referencing ADRs
├── docs/
│   └── decisions/
│       ├── _index.md            # All synthesized ADRs in one file
│       ├── adr-001-full.md      # Detailed reference ADR
│       ├── adr-002-full.md
│       └── ...
```

The **synthesized ADR index** (`_index.md`) concatenates all active synthesized ADRs into a single file, loadable in one read. This file should be referenced from CLAUDE.md, AGENTS.md, or equivalent. For Claude Code, include it via `@docs/decisions/_index.md` in the CLAUDE.md with a note: "Read decisions index before making architectural choices." For Cursor, create an `adrs.mdc` rule with `alwaysApply: true` that references the index.

The **detailed reference ADRs** live as individual files, fetched on demand. When the AI encounters an edge case — "should I use raw SQL here?" — it can consult the specific detailed ADR for the database access pattern decision. This two-tier approach keeps always-loaded context lean (the index at ~5,000 tokens for 40 decisions) while making comprehensive reasoning available when needed.

**Cross-tool compatibility** is achievable via symlinks and reference patterns. Since AGENTS.md is emerging as the cross-tool standard (backed by the Linux Foundation, natively read by Cursor, Copilot, Windsurf, Codex, and others), teams should maintain AGENTS.md as the primary file and symlink tool-specific files to it: `ln -s AGENTS.md CLAUDE.md`.

---

## Token budget math and practical limits

Understanding the economics helps determine how many ADRs to synthesize versus reference. Based on current model context windows and typical AI coding session budgets:

| Component | Typical tokens | Notes |
|-----------|---------------|-------|
| System prompt / rules file | 1,000–3,000 | CLAUDE.md, .cursorrules, etc. |
| Synthesized ADR index (40 ADRs) | 4,000–6,000 | ~100–150 tokens each |
| Active file context | 15,000–50,000 | Files being edited/referenced |
| Conversation history | 10,000–40,000 | Grows with session length |
| **Available for code generation** | **~100,000–130,000** | Of a 200K window |

At **120 tokens per synthesized ADR**, a project can maintain **40–50 active synthesized ADRs** within a ~6,000-token budget — roughly 3% of a 200K context window. This is highly efficient. Each detailed reference ADR at 400–600 tokens can be loaded selectively, with 2–3 consulted per complex task adding only 1,200–1,800 tokens.

The key discipline is **pruning**. Deprecated and superseded ADRs should be removed from the synthesized index immediately. The detailed reference versions are retained for history, but the always-loaded layer must contain only active decisions. Cursor's glob-based activation and "agent-requested" rule types offer another optimization: ADRs scoped to `frontend` only load when working on frontend files.

---

## Emerging tools that make ADRs executable

The most significant development in this space is the shift from ADRs as passive documentation to **ADRs as enforceable governance**. Three tools illustrate this trajectory:

**Archgate** (open-source, 2026) pairs each ADR with a `.rules.ts` TypeScript file containing programmatic compliance checks. Running `archgate check` in CI blocks merges that violate documented decisions. The feedback loop is powerful: AI agents read ADRs as context, generate code, Archgate validates compliance, violations become new automated rules — governance improves over time without increasing overhead.

**Decision Guardian** (GitHub Action) automatically surfaces relevant ADRs on pull requests when modified code touches areas covered by documented decisions. This ensures ADRs stay visible without requiring developers to remember to consult them.

**GitHub Copilot Code Review** can enforce ADRs directly. A March 2026 demonstration showed Copilot catching ADR violations **seven times** in a single PR, citing the specific decision record and explaining the proper supersession process for changing it. The prerequisite: ADRs must live in the repository, not in Confluence or Notion where AI tools cannot reach them.

---

## Conclusion: ADRs as the governance layer for AI-assisted development

The two-tier format addresses a specific emerging problem: as AI agents write more code, the risk shifts from "developers making wrong architectural choices" to "AI agents re-litigating settled decisions or defaulting to training-data patterns that conflict with project conventions." Synthesized ADRs function as **constraint injection** — they tell the AI what the project has already decided so it generates code within those boundaries. Detailed Reference ADRs serve as **reasoning retrieval** — available when the AI needs to evaluate whether a decision applies to a novel situation.

Three non-obvious insights emerged from this research. First, the **"Never" field is the highest-ROI element** in any LLM-targeted ADR — explicitly forbidding common alternatives prevents more errors than explaining the chosen approach. Second, **code examples outperform prose** for AI consumption by a wide margin; a 10-line canonical implementation pattern does more work than 200 words of architectural description. Third, the **synthesized/detailed split mirrors how the best AI coding tools already work** — Claude Code's CLAUDE.md (compact, always-loaded) plus `@docs/` references (detailed, on-demand) is exactly this two-tier pattern applied to project knowledge generally.

The practical recommendation: start writing synthesized ADRs today for your most critical decisions (tech stack, state management, authentication, API patterns, deployment), load them into your AI coding assistant's context file, and measure whether the AI stops suggesting alternatives you've already rejected. That single test — does the AI respect your decisions? — reveals whether your ADR format is working.