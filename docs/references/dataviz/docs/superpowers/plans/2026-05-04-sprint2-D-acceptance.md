# Sprint 2.D — Acceptance manual (retrieve_business_context)

## Pré-condições
- Sprint 1.D + 2.A entregues; `pnpm bq:bootstrap-meta`; pgvector populado via `pnpm rag:ingest`.
- `.env.local`: `MACRO_LIVE=true`, RAG vars de Sprint 2.A, `BIGQUERY_PROJECT_ID` set.
- `pnpm dev 2>&1 | tee /tmp/sprint2d.ndjson`

## Roteiro 1 — Persona+cliente match
1. Como Diretor FII / OM, briefing: "Análise de OC e ES da carteira"
2. Verificar logs: prompt de servidor cita template `diretor-fii-cri-om`
3. Retrieved chunks com `metadata.clientId='OM'`

✅ Aprovação: template renderizado + zero leak

## Roteiro 2 — Cache hit
1. Repetir mesmo briefing
2. Verificar `retrievalMeta.cacheHit=true`, latência <50ms

✅ Aprovação: cache funcional

## Roteiro 3 — Fallback RAG
1. Setar `RAG_EMBEDDING_PROVIDER=invalid` (simular falha)
2. Pedir briefing
3. Verificar `source='fallback'`, sistema responde com static-only

✅ Aprovação: degradação graciosa

## Roteiro 4 — Cross-tenant
1. Mudar para BRZ na UI; perguntar sobre OM
2. Verificar resposta não cita dados de OM

✅ Aprovação: ADR-0006 enforced

## Roteiro 5 — PII
1. Briefing contendo CPF
2. Verificar working memory armazena hash, não valor

✅ Aprovação: `pii-guard` ativo

## Roteiro 6 — 6 templates
Alternar 6 personas+clientes; conferir templates renderizados:

- `diretor-fii-cri` + OM → `diretor-fii-cri-om`
- `gestor-carteira-securitizadora` + OM → `gestor-carteira-securitizadora-om`
- `cfo-securitizadora` + BRZ → `cfo-incorporadora-brz`
- `controller` + IMCASA → `compliance-imcasa`
- `diretor-credito-banco` + CONX → `diretor-credito-banco-conx`
- `ceo-incorporadora` + BRZ → `ceo-incorporadora-brz`

## Critérios globais
- [ ] `pnpm test:run` verde
- [ ] `pnpm tsc --noEmit` clean
- [ ] `pnpm rag:smoke` recall@5 ≥ 0.8
- [ ] `__adversarial__/cross-tenant.test.ts` zero recall
- [ ] p95 retrieval <2.5s cache miss; <800ms cache hit
- [ ] Working memory: zero PII residual
- [ ] `pnpm build` sem warnings novos

## Referências
- ADR-0006: [Multi-tenancy strict isolation](../../adrs/decisions/0006-multi-tenancy-strict-isolation.md)
- Plano: `docs/superpowers/plans/2026-05-04-business-context-personas-evals.md`
- Spec: `docs/superpowers/specs/2026-05-04-sprint2-D-business-context-retrieval.md`
