---
name: deploy
description: "Use ao planejar/executar deploy. Keywords: deploy, ship, release pipeline."
---
# Deploy

Levar código para um ambiente alvo de forma previsível, reversível, observável. Cada deploy = artefato imutável promovido por estágios.

## Essência
- **Build once, deploy many:** mesma imagem/artifact promovida de staging para prod. Nunca re-build para "fixar" prod.
- **Immutable artifacts:** container image, bundle, zip versionado com SHA/tag.
- **Estratégias:**
  - **Blue/green:** padrão quando o provider é atômico (Vercel, Cloud Run revisions). Rollback instantâneo.
  - **Canary:** risco médio/alto → `5% → 25% → 50% → 100%`, cada degrau ≥ 10 min com métricas saudáveis.
  - **Firebase Functions:** deploy granular obrigatório (`firebase deploy --only functions:<name>`), nunca todas.
  - **Feature flags:** deploy ≠ release. Código vai pra prod desligado.
- **Health checks:** liveness + readiness. Sem readiness = router manda tráfego pra container morto.
- **Migrations** rodam **antes** do deploy do código novo, e o código novo é compatível com schema velho e novo (ver rule `migration`).
- **Rollback path** documentado e testado antes de cada deploy não-trivial.
- **Runtime (ADR 0004):** build/CI/Docker em Node 26 (`node:26-alpine`); Functions deployam em `nodejs24` (exceção E1). Pins em `@.contexts/engineering/MEMORY.md`.
- **Observability:** janela de 30 min pós-deploy com erro/latência/throughput (tabela "Ação ligada ao 5xx" em `processes/monitoring.md`). Alertas configurados antes de deploy de risco.
- **Smoke tests** automáticos pós-deploy (login, criação do recurso principal, leitura paginada); falha na janela de 30 min → rollback automático.
- **Janela de deploy:** evitar sexta à noite/feriados para mudanças de risco; combinar com on-call.

## Procedimento mínimo
1. PR → CI roda: lint, type-check, test, build, security scan. Falhou → não mergeia.
2. Tag/SHA do artifact. Auto-deploy de `main` para staging.
3. Smoke + e2e em staging (QA manual quando há flag de risco).
4. Promoção para prod só a partir da tag `vX.Y.Z` + aprovação do environment `prod`; canary `5% → 25% → 50% → 100%` quando o risco pede.
5. Observar dashboard na janela de 30 min pós-deploy, com os gatilhos de rollback automático armados.
6. Rollback se degrada: revisão anterior do provider ou redeploy da tag anterior (skill `rollback`).

## Anti-patterns
- Deploy direto em prod sem staging → bug entra direto pro user.
- Migration breaking + código novo no mesmo deploy → janela de incompatibilidade.
- "Deploy hotfix" sem CI → race, regressão, sem rollback.
- Rollback por rebuild de commit arbitrário sem tag → sem ponto conhecido bom; use revisão anterior ou a tag anterior.
- Feature flag esquecida ligada `true` em todos envs → debt.

## Mini-exemplo
```
1. PR merged → CI build image sha-abc123
2. CD: promove sha-abc123 para staging
3. e2e/smoke OK em staging
4. Manual approval → canary prod 5%
5. cada degrau 10 min com métricas OK → 25% → 50% → 100%
6. janela de 30 min com gatilhos de rollback automático armados
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/processes/deploy.md`
