---
name: deploy
description: Use ao planejar/executar deploy. Keywords: deploy, ship, release pipeline.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Deploy

Levar código para um ambiente alvo de forma previsível, reversível, observável. Cada deploy = artefato imutável promovido por estágios.

## Essência
- **Build once, deploy many:** mesma imagem/artifact promovida de staging para prod. Nunca re-build para "fixar" prod.
- **Immutable artifacts:** container image, bundle, zip versionado com SHA/tag.
- **Estratégias:**
  - **Rolling:** substitui instâncias gradualmente. Default em K8s/Cloud Run.
  - **Blue/green:** ambiente paralelo, switch DNS/router. Rollback instantâneo.
  - **Canary:** % crescente de tráfego no novo. Métricas guiam promoção.
  - **Feature flags:** deploy ≠ release. Código vai pra prod desligado.
- **Health checks:** liveness + readiness. Sem readiness = router manda tráfego pra container morto.
- **Migrations** rodam **antes** do deploy do código novo, e o código novo é compatível com schema velho e novo (ver rule `migration`).
- **Rollback path** documentado e testado antes de cada deploy não-trivial.
- **Observability:** dashboard de deploy com erro/latência/throughput. Alertas configurados antes de deploy de risco.
- **Smoke tests** automáticos pós-deploy: 1-2 endpoints críticos verificados.
- **Janela de deploy:** evitar sexta à noite/feriados para mudanças de risco; combinar com on-call.

## Procedimento mínimo
1. CI roda: build, test, security scan, type-check. Falhou → não promove.
2. Tag/SHA do artifact. Promovido para staging automaticamente.
3. Smoke + e2e em staging.
4. Promoção para prod: canary 5% → 25% → 100% conforme métricas.
5. Observar dashboard nos primeiros 15-30 min.
6. Rollback se SLO degrada: reverter para tag anterior (artifact imutável já existe).

## Anti-patterns
- Deploy direto em prod sem staging → bug entra direto pro user.
- Migration breaking + código novo no mesmo deploy → janela de incompatibilidade.
- "Deploy hotfix" sem CI → race, regressão, sem rollback.
- Rollback que precisa "rebuildar versão antiga" → não é imutável.
- Feature flag esquecida ligada `true` em todos envs → debt.

## Mini-exemplo
```
1. PR merged → CI build image sha-abc123
2. CD: promove sha-abc123 para staging
3. e2e/smoke OK em staging
4. Manual approval → canary prod 10%
5. 10 min metrics OK → promote to 100%
6. dashboard monitorado por 30 min; alertas armados
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/processes/deploy.md`
