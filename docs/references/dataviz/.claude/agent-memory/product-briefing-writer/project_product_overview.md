---
name: Product Overview
description: Liquid DataViz is a BI platform for credit securitization (imobiliario) with multi-client BigQuery backend, 10+ dashboard pages, AI agents, and canvas orchestrator
type: project
---

Liquid DataViz is a SaaS BI dashboard for Brazilian real estate credit securitization (securitizacao de credito imobiliario).

**Why:** The product democratizes access to portfolio analytics for securitizers, investors, and auditors who lack SQL skills but need deep insights into credit portfolios.

**How to apply:** When writing documentation or analyzing features, always frame value in terms of credit securitization domain concepts (PDD, LTV, rating, elegibilidade, repasse bancario). The target audience includes portfolio managers, risk analysts, bank transfer operators, and executives.

Key facts:
- Multi-client: OM, BRZ, CONX, IMCASA (each with isolated BigQuery datasets)
- 10 dashboard pages + 3 annexes + admin + explore (AI canvas)
- 8 specialized AI agents with 47+ tools via Vercel AI SDK + Vertex AI
- Firebase Auth + Firestore for config/permissions, BigQuery for data
- Granular permissions down to individual indicator level
- Dark theme only, Orange (#F3A169) + Olive (#576558) palette
