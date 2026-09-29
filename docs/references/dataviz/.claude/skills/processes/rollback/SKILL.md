---
name: rollback
description: Use ao executar rollback em produção. Keywords: rollback, revert, incident, produção caiu.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Rollback

Reverter para o último estado bom conhecido quando deploy/release degrada SLO ou causa incidente. Decisão deve ser rápida (regra: revert primeiro, debug depois).

## Essência
- **Estratégias:**
  - **Re-deploy artifact anterior:** imutável, tag/SHA prévia. Mais comum.
  - **Traffic shift (blue/green/canary):** retornar para versão anterior na borda. Rollback instantâneo.
  - **Feature flag flip:** se mudança veio gated, desligar a flag — não precisa redeploy.
  - **DB rollback:** complexo se schema mudou; expand/contract migrations evita (skill `migration`).
- **Pré-condição para rollback rápido:** artifact imutável anterior disponível; banco compatível com versão anterior; feature flag granular para mudanças arriscadas.
- **Revert first, debug later:** se SLO está queimando, reverte; debug o artifact ruim em paralelo.
- **Forward fix vs rollback:** se fix é pequeno e seguro, forward; se incerto, rollback.
- **DB irreversível:** se migration novo já adicionou coluna NOT NULL e código velho não escreve → rollback de código quebra; daí a importância de expand-first.
- **Comunicação:** anúncio em status page, canal de incidente, stakeholders. Tempo é métrica.
- **Postmortem** blameless após estabilização: causa raiz, mitigação, ação preventiva.

## Procedimento mínimo
1. **Detectar** via alerta/usuário; abrir canal de incidente.
2. **Decidir:** rollback ou forward-fix? Se incerto → rollback.
3. **Executar:** flip flag / re-deploy versão N-1 / shift traffic.
4. **Verificar:** métricas voltam ao normal? users confirmam?
5. **Comunicar:** atualização em status page + stakeholders.
6. **Estabilizar:** monitorar 30+ min; pausa em deploys até root cause.
7. **Postmortem:** dentro de 48-72h. Ações concretas com owner + deadline.

## Anti-patterns
- "Deixa eu tentar arrematar com hotfix" — sem evidência clara, perde tempo enquanto users sofrem.
- Rollback que requer re-build → não é rollback rápido; consertar pipeline.
- Sem postmortem → mesma falha vai acontecer de novo.
- Postmortem com blame em pessoa → cultura quebra; focar sistemas.
- Migration breaking sem expand-first → rollback impossível sem perda de dado.

## Mini-exemplo
```
T+0:  alerta error_rate > 5% on /v1/orders
T+2:  on-call confirma; abre canal #inc-2026-05-25-01
T+5:  identifica deploy v1.4.0 como suspect (deploy há 12 min)
T+6:  decisão: rollback. Re-deploy v1.3.9 (artifact existente).
T+10: tráfego 100% na v1.3.9; error rate volta a baseline.
T+15: status page atualizada: "resolved". Causa em investigação.
+48h: postmortem; root cause: race em pricing cache. Ação: lock + test.
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/processes/rollback.md`
