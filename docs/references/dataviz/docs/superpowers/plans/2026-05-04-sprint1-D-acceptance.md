# Sprint 1.D — Acceptance manual (dynamic instructions, glossary, profiles, macro)

## Pré-requisitos

```bash
# Cloud SQL local + RAG infra (heritage da Sprint 1.A)
./scripts/db-up.sh
pnpm migrate

# .env.local
echo "MACRO_LIVE=true" >> .env.local              # set false p/ usar fallback
echo "BIGQUERY_PROJECT_ID=<seu-projeto>" >> .env.local
echo "BIGQUERY_LOCATION=US" >> .env.local
echo "SQL_GENERATIONS_LOGGING=false" >> .env.local  # mantido false durante smoke

# Subir app capturando logs
pnpm dev 2>&1 | tee /tmp/sprint1d.ndjson
```

Abrir <http://localhost:3005>, autenticar, ir para `/dashboard/explore`.

---

## Roteiro 1 — Trocar persona (linguagem + jargão diferentes)

1. No header (ou seletor de persona — ajustar UI quando criada), escolher persona **CFO de Securitizadora**.
2. Pedir: **"Como está a inadimplência da carteira?"**
3. Esperar resposta com:
   - Linguagem **executiva** (frases curtas, pouco jargão técnico-contábil)
   - Citação de **WAL**, **OC**, **ES**, **PDD**, **rating**
   - Foco em **carteira agregada**
4. Trocar persona para **Analista de Cobrança**.
5. Pedir a **mesma** pergunta.
6. Esperar resposta com:
   - Linguagem **operacional** (instruções práticas)
   - Citação de **valor_atraso**, **matriz_cobranca**, **perfil_cobranca**, **recuperacao**
   - Foco em **contrato individual**

✅ **Aprovação**: tom claramente diferente entre as duas respostas; jargão âncora alinhado com cada persona.

---

## Roteiro 2 — Macro snapshot ao vivo (BCB SGS)

1. Persona CFO ativa. `MACRO_LIVE=true`.
2. Pedir: **"Considere a Selic atual e diga se o spread da carteira CRI cobre o custo de oportunidade."**
3. Esperar:
   - Resposta cita **Selic** com valor recente do BCB SGS.
   - Logs do servidor mostram fetch para `https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/12`.
   - Span `recordSpan` com `name: 'span'` ou ausência (depende do path) — mas o snapshot deve aparecer no system prompt do orchestrator.
4. Inspecionar `/tmp/sprint1d.ndjson` para confirmar que o system prompt contém `## Macro snapshot (..., BCB_SGS)`.

✅ **Aprovação**: Selic citada com valor real; cache 1h ativo (segunda pergunta na mesma sessão não faz fetch).

---

## Roteiro 3 — Glossário lookup

1. Pedir: **"O que é razão PMT/Saldo?"**
2. Esperar:
   - Modelo chama tool `lookup_glossary` com `term: 'razão pmt/saldo'` ou similar.
   - Tool retorna `{found: true, definition: ...}` OU `{found: false, suggestions: [...]}`.
   - Resposta cita `glossaryVersion: '2026-05-04'` quando aplicável.
3. Pedir termo desconhecido proposital: **"O que é FPR?"**
4. Esperar `{found: false, suggestions: [...]}` — modelo pode pedir esclarecimento.

✅ **Aprovação**: tool acionada, resposta usa definição estruturada.

---

## Roteiro 4 — Fallback macro (sem rede)

1. Parar app. `echo "MACRO_LIVE=false" >> .env.local`. Reiniciar.
2. Pedir qualquer pergunta que use macro snapshot.
3. Inspecionar logs: `## Macro snapshot (2026-05-01, fallback)` — `source: fallback`, valores do `macro-fallback.json` (Selic 14.75%, IPCA 4.5%, etc.).

✅ **Aprovação**: app não quebra sem rede; macro carregado do JSON local.

---

## Roteiro 5 — ICP altera foco

1. Persona **Diretor FII de CRI**. ICP: `fundo-cri-listado`.
2. Pedir: **"Avalie a carteira."**
3. Esperar resposta com KPIs de **DY**, **duration**, **P/VP**, **OC**, **ES**, **subordinação**.
4. Trocar ICP para `incorporadora-mcmv-grande`.
5. Pedir mesma pergunta.
6. Esperar foco em **VSO**, **VGV**, **margem**, **velocidade de vendas**, **MCMV faixa**.

✅ **Aprovação**: ICP visivelmente direciona o tipo de KPI mencionado.

---

## Roteiro 6 — Persona/ICP inválidos (fail-closed gracioso)

1. Via DevTools / fetch direto, enviar body com `personaId: 'inexistente'`.
2. Esperar: orchestrator cai em fallback (system prompt sem dynamic context); UI funciona normalmente; log de servidor mostra `[orchestrator] dynamic context failed, using base prompt: UNKNOWN_PERSONA personaId=inexistente`.
3. NÃO esperar 400 do route — decisão arquitetural é não bloquear UX (vide Task 14.3).

✅ **Aprovação**: degradação silenciosa; warn log presente.

---

## Critérios globais de aprovação

- [ ] `pnpm test:run` verde (≥139 tests)
- [ ] `pnpm tsc --noEmit` clean
- [ ] `pnpm build` (Next.js) passa
- [ ] Roteiros 1-6 manualmente verificados
- [ ] System prompts do orchestrator contêm bloco `# Contexto dinâmico` quando IDs presentes (verificar via logs)
- [ ] Sem regressão em fluxos sem `personaId` (compatibilidade preservada)

## Encerrar

```bash
./scripts/db-down.sh
```

## Referências

- ADR-0006: [Multi-tenancy strict isolation](../../adrs/decisions/0006-multi-tenancy-strict-isolation.md)
- ADR-0011: [Semantic Recall TTL + PII Scrubbing](../../adrs/decisions/0011-semantic-recall-ttl-pii-scrubbing.md)
- Plano-fonte: `2026-05-04-sprint1-D-dynamic-instructions-glossary.md`
- 12 personas: `src/shared/config/business-context/personas/`
- 6 ICPs: `src/shared/config/business-context/icps/`
- Macro fallback: `src/shared/config/business-context/macro-fallback.json`
- Builder dinâmico: `src/shared/config/agents/build-system.ts`
