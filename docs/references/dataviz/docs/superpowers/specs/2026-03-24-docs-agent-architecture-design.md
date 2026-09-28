# /docs — Agent Architecture Explorer

**Date**: 2026-03-24
**Status**: Approved

## Summary

A public `/docs` page that provides an interactive visual explorer for the multi-agent system architecture. It helps developers understand how agents think, what prompts they receive, which tools they use, and how data flows — so they can iterate and improve agent behavior.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Layout | Sidebar + interactive diagram | Sidebar for fast nav, diagram as landing for spatial understanding |
| Prompt display | Summary + expandable full text | Quick scan of key rules, full text available on demand |
| Tool display | Compact cards, click to expand | Scannable overview without overwhelming detail |
| Shared context | Dedicated page + inline badges per agent | Reference page for deep dive, badges show which contexts each agent receives |
| Auth | Public | No auth required — developer reference tool |
| Route | `/docs` (App Router, outside dashboard layout) | Standalone page, no DashboardLayout wrapper |

## Architecture

### Route Structure

```
app/docs/page.tsx          → renders DocsPage
src/pages/docs/ui/
  DocsPage.tsx             → main layout (sidebar + content)
  ArchitectureDiagram.tsx  → interactive SVG/HTML diagram (landing)
  AgentDetail.tsx          → agent detail view
  ToolCard.tsx             → expandable tool card
  ContextPage.tsx          → shared context reference
  PromptViewer.tsx         → collapsible prompt with syntax highlight
  docs-data.ts             → static data extracted from agent configs
```

### Data Source

All content is **statically defined** in `docs-data.ts`, extracted from:
- `src/shared/config/agents/*.ts` — agent prompts, descriptions, model tiers
- `src/features/canvas-orchestrator/tools/*.ts` — tool names, schemas, descriptions
- `src/shared/config/agents/shared-context.ts` — business rules, schema, SQL rules

This is a **read-only reference page** — it does not import agent configs at runtime. Content is a curated snapshot for documentation purposes.

### Pages / Views

**1. Landing — Architecture Diagram**
- Interactive diagram showing: User → API → Canvas Orchestrator → Tools → Sub-agents → Shared Context
- Each node is clickable, navigates to detail view
- Badges on orchestrator: model tier, max steps, tool count
- Sub-agents shown as grid with their question ("What happened?", "Why?", etc.)
- Shared context shown at bottom as linked badges

**2. Agent Detail View** (one per agent)
- Header: name, description, model tier badge, max steps badge
- Context badges: clickable links to shared context sections
- System prompt: summary of key rules (bullet points) + collapsible full prompt text
- Tools grid: 2-column grid of ToolCards
  - Each card: name, category badge (planning/query/block/layout/delegation), 1-line description
  - Click expands: input parameters, output schema, constraints
- For sub-agents: also shows which tools they receive (execute_sql, get_table_schema, get_sample_data)

**3. Shared Context Pages**
- Business Rules: glossary, rating scale, PDD brackets, reference formulas
- Schema: contratos (100 cols), pagamentos, fluxo_caixa — with types and descriptions
- SQL Rules: allowed operations, formatting rules, CTE patterns
- Dynamic Filters: how filter context is injected, SQL example

### Component Design

**Sidebar** (fixed, left):
- Sections: ARQUITETURA, ORQUESTRADOR, SUB-AGENTES (8 items), CONTEXTO (4 items)
- Active item highlighted with accent color
- Clicking navigates via React state (no page reload)

**PromptViewer**:
- Default: shows 5-8 bullet points summarizing key rules
- "Ver prompt completo" button expands to full prompt text
- Full text rendered with monospace font, preserving formatting
- Collapsible sections within prompt (if prompt has clear sections)

**ToolCard**:
- Compact: 1 row with name + category badge + description
- Expanded (on click): shows input params table, output structure, constraints
- Category colors: green=query/planning, blue=block/layout, red=delegation, gray=filter/schema

**ArchitectureDiagram**:
- HTML/CSS based (not SVG library) for simplicity and dark theme consistency
- Nodes positioned with flexbox/grid
- Connecting lines via CSS borders/pseudo-elements
- Hover: highlights node + connected edges
- Click: navigates to detail view

### Styling

- Same dark theme as rest of app (globals.css tokens)
- Fonts: Inter (body), JetBrains Mono (code/prompts)
- No additional CSS libraries — Tailwind only
- Responsive: sidebar collapses on smaller screens (but page targets desktop)

### State Management

- Simple `useState` for active view (landing / agent detail / context page)
- No server state, no data fetching — all content is static
- URL not synced to view (single page, internal navigation)

## Constraints

- Max 500 lines per component file
- No runtime imports from agent config files (static data only)
- No auth required
- Must match existing dark theme exactly
- All text in Portuguese
