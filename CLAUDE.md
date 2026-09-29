# Projeto sob DDC Framework v1.1.1

## Norte estratégico (sempre-ativo)
@.contexts/business/vision.md
@.contexts/business/glossary.md
@.contexts/business/compliance.md

## Produto (sempre-ativo)
@.contexts/product/vision.md
@.contexts/product/tone-of-voice.md
@.contexts/product/design-system.md
@.contexts/product/persona.md

## Rules sempre-ativas
As rules em `.claude/rules/` sem `paths` carregam automaticamente em todo turn:
security, validation, error-handling, observability, migration, data-modeling,
testing, api-design, grounding, schemas, ai-friendly-code, git, commits, environments.

Rules path-scoped (development, documentation, governance, performance,
accessibility, state-management, caching, internationalization) carregam quando
o arquivo trabalhado bate o glob.

## Skills (descoberta por demanda — invoque pelo `name:` do SKILL.md)
Layout plano: `.claude/skills/<name>/SKILL.md` (Claude Code não descobre subpastas). Categorias abaixo são só agrupamento lógico.
- **Architecture**: fsd, feature-based, atomic-design, hexagonal, ddd, clean-architecture
- **Practices**: tdd, bdd, sdd, clean-code, **verification-before-completion** *(ai-friendly-code virou rule)*
- **Stacks**: node-26, typescript-7, next-16, react-19, tailwind-4, shadcn-ui, radix-ui, zod-4, zustand-5, openai, anthropic, gemini, openai-sdk, anthropic-sdk, google-genai-sdk, vercel-ai-sdk, mastra-sdk, harness-engineering, firebase-functions, vitest, playwright, **database-firebase-firestore, database-postgres, database-pgvector, database-bigquery** *(prefixo por colisão com contracts)*
- **Contracts**: api, events, secrets, **contracts-firebase-firestore, contracts-postgres, contracts-pgvector, contracts-bigquery** *(schemas virou rule)*
- **Processes**: **using-ddc** *(bootstrap)*, **writing-plans-ddc** *(planos + briefs)*, deploy, release, monitoring, rollback, pull-requests *(environments, git, commits viraram rule)*
- **Business**: business-model, metrics, icp *(rebaixados do CLAUDE.md)*
- **Product**: policies *(design-system e persona subiram para CLAUDE.md)*
- **Decisions**: decisions

## Agents
tech-lead, full-stack, backend, frontend, data-architect, qa, code-reviewer, devops,
ddc-engineering, claude-engineering, claude-agents, claude-rules, claude-skills, claude-hooks.
Cada um declara suas skills preload e contextos always-read em `.claude/agents/`.

## Hooks
Configurados em `.claude/settings.json`:
- **session-start-announce** (SessionStart, inclusive `compact`) — **using-ddc** + catálogo + tail do progress ledger
- **suggest-skills** (PostToolUse Edit/Write + UserPromptSubmit) — skills e `@.contexts`
- **guard-conventional-commit** (PreToolUse Bash/PowerShell `git commit*`)
- **check-claude-md-size** + **grounding-warn** (Stop)

## Princípio operacional
Não duplique nada. Sempre referencie via `@.contexts/...`. Atualize o `.contexts/`
como single source of truth; `.claude/` apenas operacionaliza.

**Bootstrap:** SessionStart carrega `using-ddc`. Fluxo multi-step: `writing-plans-ddc`
→ implementer/reviewer briefs → ledger `.claude/agent-memory/progress.md` →
`verification-before-completion` antes de claim de done.

**ADR (baseline + harness):** `@.contexts/engineering/decisions/0001-ddc-engineering-baseline-and-harness-enforcement.md`
**ADRs vigentes de versão e convenção:** `.contexts/engineering/decisions/0003-cross-doc-convention-conflicts-resolved.md` (qual doc vence) e `.contexts/engineering/decisions/0004-latest-stable-baseline-and-documented-exceptions.md` (última estável + exceções E1–E5); `.contexts/engineering/decisions/0005-firestore-document-ids-use-automatic-ids.md` (Firestore usa ID automático; ULID só em `eventId`, `Idempotency-Key`, `X-Request-Id`). Índice: `.contexts/engineering/MEMORY.md`.
