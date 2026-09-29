---
name: rollback
description: "Use ao executar rollback em produção. Keywords: rollback, revert, incident, produção caiu."
---
# Rollback

Reverter para o último estado bom conhecido quando deploy/release degrada SLO ou causa incidente. Decisão deve ser rápida (regra: revert primeiro, debug depois).

## Essência
- **Estratégias (ordem de preferência):**
  1. **Feature flag flip:** segundos, risco mínimo — preferido sempre que a flag cobre o comportamento.
  2. **Deploy revert atômico:** promover a revisão anterior (Vercel rollback, `gcloud run services update-traffic --to-revisions=<prev>=100`). Functions: redeploy da tag anterior (`git checkout vX.Y.(Z-1)` + build + `firebase deploy --only functions:<name>`), **por function** (`--only functions:<name>`), nunca o projeto inteiro.
  3. **Forward fix** via hotfix (skill `release`).
  - **DB:** forward-only por default; expand-and-contract é o que torna o rollback de código possível (rule `migration`).
- **Pré-condição para rollback rápido:** artifact imutável anterior disponível; banco compatível com versão anterior; feature flag granular para mudanças arriscadas.
- **Revert first, debug later:** se SLO está queimando, reverte; debug o artifact ruim em paralelo.
- **Forward fix vs rollback:** pergunta operacional — "posso voltar para a versão X em < 5 min com confiança?" Sim → rollback. Migration incompatível já aplicada, bug em todas as versões recentes ou < 1% dos usuários sem perda de dado → forward fix.
- **DB irreversível:** se migration novo já adicionou coluna NOT NULL e código velho não escreve → rollback de código quebra; daí a importância de expand-first.
- **Comunicação:** thread em `#incidents` (todo comando `gcloud`/`firebase` registrado lá), status page se o impacto é externo, PM/sales se há cliente afetado.
- **Postmortem** blameless após estabilização: causa raiz, mitigação, ação preventiva.

## Procedimento mínimo
1. **Detectar** via alerta/usuário; abrir thread em `#incidents`.
2. **Decidir** (oncall + tech lead; em P1 o oncall decide sozinho) em < 5 min: flag, rollback ou forward fix.
3. **Executar:** flip flag / re-deploy versão N-1 / shift traffic.
4. **Verificar:** métricas voltam ao normal? users confirmam?
5. **Comunicar:** atualização em status page + stakeholders.
6. **Estabilizar:** monitorar 30+ min; pausa em deploys até root cause.
7. **Postmortem:** agendado em até 48h, blameless. Ações concretas com owner + prazo.

## Anti-patterns
- "Deixa eu tentar arrematar com hotfix" — sem evidência clara, perde tempo enquanto users sofrem.
- Rollback por redeploy de commit arbitrário sem tag → sem ponto conhecido bom; use revisão anterior do provider ou a tag de release anterior.
- Sem postmortem → mesma falha vai acontecer de novo.
- Postmortem com blame em pessoa → cultura quebra; focar sistemas.
- Migration breaking sem expand-first → rollback impossível sem perda de dado.

## Mini-exemplo
```
T+0:  alerta error_rate > 5% on /v1/orders
T+2:  on-call confirma; abre thread em #incidents
T+5:  identifica deploy v1.4.0 como suspect (deploy há 12 min)
T+6:  decisão: rollback. Re-deploy v1.3.9 (artifact existente).
T+10: tráfego 100% na v1.3.9; error rate volta a baseline.
T+15: status page atualizada: "resolved". Causa em investigação.
+48h: postmortem; root cause: race em pricing cache. Ação: lock + test.
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/processes/rollback.md`
