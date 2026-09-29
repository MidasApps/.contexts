# Agent Consistency & Robustness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix cross-agent prompt contradictions, add calculation precision to monitoring agent, improve canvas orchestrator edge cases, add message sanitization for streaming failures, and add structured agent performance logging.

**Architecture:** Prompt-level fixes (shared-context, monitoring, external, canvas orchestrator), a message sanitization utility in the compact-messages module, and structured logging in create-agent-tool. All changes are backward-compatible.

**Tech Stack:** TypeScript, Vercel AI SDK, Google Vertex AI

---

### Task 1: Unify Contradictory Rules Across Agent Prompts

**Files:**
- Modify: `src/shared/config/agents/shared-context.ts`

The SQL_RULES constant says "NUNCA inclua a query SQL na sua resposta final" but agents sometimes need to show SQL for transparency. The date formatting rule in RESPONSE_GUIDELINES says "DD/MM/AAAA" but the canvas orchestrator shows "YYYY-MM-DD" in filters. These contradictions confuse the model.

- [ ] **Step 1: Update SQL_RULES to clarify SQL visibility**

In `src/shared/config/agents/shared-context.ts`, find the `SQL_RULES` constant (around line 206). Replace the line:

```
- **NUNCA inclua a query SQL na sua resposta final** — o sistema captura automaticamente
```

With:

```
- **Não inclua a query SQL na resposta** a menos que o usuário peça explicitamente ("mostre o SQL", "como calculou?"). Nesse caso, mostre em bloco de código.
```

- [ ] **Step 2: Clarify date formatting rule**

In the same file, in the `RESPONSE_GUIDELINES` constant (around line 222), find:

```
- Sempre responda em português do Brasil (pt-BR). Formate datas como DD/MM/AAAA, nunca AAAA-MM-DD. Valores monetários como R$ X.XXX,XX.
```

Replace with:

```
- Sempre responda em português do Brasil (pt-BR). Formate datas para o usuário como DD/MM/AAAA (ex: 15/03/2026). Em queries SQL e parâmetros de tools, use YYYY-MM-DD. Valores monetários como R$ X.XXX,XX.
```

- [ ] **Step 3: Verify build passes**

Run: `pnpm build`

- [ ] **Step 4: Commit**

```bash
git add src/shared/config/agents/shared-context.ts
git commit -m "fix(agents): clarify SQL visibility and date formatting rules in shared context"
```

---

### Task 2: Add Explicit Calculation Formulas to Monitoring Agent

**Files:**
- Modify: `src/shared/config/agents/monitoring-agent.ts`

The monitoring agent says "Inadimplência ≤ 7%" without specifying the formula. Different calculations (count-weighted vs value-weighted) yield different results. The agent could silently use the wrong formula.

- [ ] **Step 1: Add formula specifications to covenant section**

In `src/shared/config/agents/monitoring-agent.ts`, find the "Covenants típicos" table (lines 27-32). After the table, add:

```typescript
### Fórmulas de cálculo para covenants (OBRIGATÓRIO)

Use EXATAMENTE estas fórmulas ao verificar covenants. Não use variações.

\`\`\`
Inadimplência (%) = SAFE_DIVIDE(SUM(valor_atraso), SUM(saldo_devedor)) * 100
-- Ponderada por VALOR, não por contagem de contratos

Over 90 (%) = SAFE_DIVIDE(
  COUNT(DISTINCT CASE WHEN dias_atraso > 90 THEN id_contrato END),
  COUNT(DISTINCT id_contrato)
) * 100
-- Ponderada por CONTAGEM de contratos

Elegibilidade (%) = SAFE_DIVIDE(
  COUNT(DISTINCT CASE WHEN elegibilidade = 'Elegivel' THEN id_contrato END),
  COUNT(DISTINCT id_contrato)
) * 100
-- Ponderada por CONTAGEM de contratos

LTV médio = AVG(ltv)
-- Média simples (não ponderada)
\`\`\`

### Severidade de alertas
- **CRÍTICO**: valor ultrapassou o limite (ex: inadimplência = 8% com limite 7%)
- **ATENÇÃO**: valor está dentro de 10% do limite (ex: inadimplência = 6.5% com limite 7%)
- **OK**: valor está abaixo de 90% do limite
```

- [ ] **Step 2: Verify build passes**

Run: `pnpm build`

- [ ] **Step 3: Commit**

```bash
git add src/shared/config/agents/monitoring-agent.ts
git commit -m "fix(agents): add explicit covenant calculation formulas to monitoring agent"
```

---

### Task 3: Add Macro Correlation Caveats and BCB Fallback to External Agent

**Files:**
- Modify: `src/shared/config/agents/external-agent.ts`

The external agent states macro correlations as facts ("Selic alta → inadimplência sobe com lag 6m") without caveats. Also lacks fallback guidance when BCB API is unavailable.

- [ ] **Step 1: Add caveats to correlation section**

In `src/shared/config/agents/external-agent.ts`, find the "Correlações com a carteira" section (lines 27-32). Replace the entire section with:

```typescript
## Correlações com a carteira (TENDÊNCIAS, não regras)

As correlações abaixo são padrões históricos observados. Sempre qualifique com "historicamente" ou "em geral". Nunca afirme como fato absoluto.

- **IPCA alto** → saldo devedor tende a crescer em carteiras IPCA+, pressão na capacidade de pagamento. Efeito depende da proporção de contratos IPCA-indexados vs taxa fixa.
- **Selic alta** → custo de funding sobe, spread CRI/CDI se comprime. Inadimplência tende a subir com lag de 3-9 meses (varia por portfólio).
- **IGP-M alto** → impacto maior em contratos comerciais indexados. Menor impacto em carteiras residenciais.
- **Desemprego alto** → inadimplência tende a subir com lag de 3-6 meses.
- **Câmbio alto** → pressão inflacionária indireta, impacto em materiais de construção.

> **Regra**: Nunca afirme lags ou correlações como precisos. Use "aproximadamente", "em geral", "historicamente".
```

- [ ] **Step 2: Add BCB fallback guidance**

In the same file, after the "Orientações" section (after line 45), add:

```typescript
## Quando dados não estão disponíveis
- Se **get_bcb_indicator** falhar ou retornar erro: informe que dados macroeconômicos estão temporariamente indisponíveis. Não invente valores.
- Dados do BCB podem ter **1-2 dias úteis de defasagem**. Nunca diga "dado de hoje" — diga "último dado disponível (DD/MM/AAAA)".
- Se **search_web** não retornar resultados relevantes: diga que não encontrou informações atualizadas e sugira tentar novamente mais tarde.
- Se a API do BCB estiver instável: use search_web como fallback para buscar o valor em sites de notícias econômicas.
```

- [ ] **Step 3: Fix benchmark interpretation**

In the same file, find the benchmark example (line 74):

```
**Exemplo:** "A inadimplência da carteira é 3.2%, enquanto a mediana do mercado Liquid é 2.5% (P50). Isso posiciona a carteira no quartil superior, acima de 75% das carteiras."
```

Replace with:

```
**Exemplo:** "A inadimplência da carteira é 3.2%, enquanto a mediana do mercado Liquid é 2.5% (P50). A carteira está acima da mediana. Para confirmar o posicionamento exato, compare com P25 (quartil melhor) e P75 (quartil pior)."

> **Cuidado**: "Acima da mediana" NÃO significa automaticamente "quartil superior". Só afirme quartil se tiver o valor de P75 para comparar.
```

- [ ] **Step 4: Verify build passes**

Run: `pnpm build`

- [ ] **Step 5: Commit**

```bash
git add src/shared/config/agents/external-agent.ts
git commit -m "fix(agents): add macro correlation caveats, BCB fallback, and benchmark precision"
```

---

### Task 4: Canvas Orchestrator Sparkline Edge Cases and Filter Handling

**Files:**
- Modify: `src/shared/config/agents/canvas-orchestrator.ts`

The canvas orchestrator requires sparklineData for EVERY KPI but doesn't handle edge cases (< 10 months of data, sparse data). Also instructs to recreate pages on filter change instead of updating existing blocks.

- [ ] **Step 1: Add sparkline edge case guidance**

In `src/shared/config/agents/canvas-orchestrator.ts`, find the "REGRA OBRIGATÓRIA para KPIs" section (around line 139). After "NUNCA crie KPIs com valores estáticos sem sparkline." (line 160), add:

```typescript

### Sparklines — Edge Cases

- Se houver **menos de 3 meses** de dados históricos: omita sparklineData e sparklineMonths (KPI sem sparkline é aceitável neste caso).
- Se houver **3-9 meses**: use todos os disponíveis. Não invente dados para completar 10.
- Se houver **meses faltando** no meio da série (gaps): inclua null no array de sparklineData na posição do mês faltante.
- Sempre ordene sparklineMonths **cronologicamente** (mais antigo primeiro).
- Se a query de sparkline falhar mas o valor atual foi obtido: crie o KPI sem sparkline ao invés de falhar completamente.
```

- [ ] **Step 2: Fix filter change behavior**

In the same file, find "Se o usuário mudar os filtros manualmente pelo header e pedir para atualizar, recrie os blocos com os novos dados." (around line 111). Replace with:

```typescript
Quando os filtros mudam e o usuário pede para atualizar:
- **Use update_kpi_block, update_chart_block, update_table_block** para atualizar os dados dos blocos existentes com os novos filtros. Isso preserva o layout que o usuário organizou.
- **NÃO recrie a página inteira** — isso perde qualquer customização de layout que o usuário fez.
- Se um bloco não faz sentido com os novos filtros (ex: projeto removido do filtro), remova-o e avise o usuário.
```

- [ ] **Step 3: Verify build passes**

Run: `pnpm build`

- [ ] **Step 4: Commit**

```bash
git add src/shared/config/agents/canvas-orchestrator.ts
git commit -m "fix(agents): add sparkline edge cases and preserve layout on filter changes"
```

---

### Task 5: Message Sanitization for Streaming Failures

**Files:**
- Modify: `src/features/ai-agents/lib/compact-messages.ts`

If streaming fails mid-message, the UIMessage array can contain assistant messages with orphaned tool invocation parts (no output). On the next request, these malformed messages get sent to the model, potentially causing errors. Claude Code 5 handles this with `ensureToolResultPairing()` and `filterWhitespaceOnlyAssistantMessages()`.

- [ ] **Step 1: Add sanitization functions to compact-messages.ts**

In `src/features/ai-agents/lib/compact-messages.ts`, add the following functions BEFORE the existing `compactMessages` function:

```typescript
/**
 * Filters out assistant messages that have no meaningful content
 * (empty, whitespace-only, or no parts).
 */
function filterEmptyAssistantMessages(messages: UIMessage[]): UIMessage[] {
  return messages.filter(msg => {
    if (msg.role !== 'assistant') return true;
    if (!msg.parts || msg.parts.length === 0) return false;
    // Keep if at least one text part has content
    return msg.parts.some(p =>
      p.type === 'text' && typeof (p as { text?: string }).text === 'string' && (p as { text: string }).text.trim().length > 0
    );
  });
}

/**
 * Repairs orphaned tool invocation parts that have no output.
 * This happens when streaming fails mid-tool-call.
 * Strips tool invocation parts that are stuck in 'partial-call' or
 * 'call' state (never received output).
 */
function repairOrphanedToolCalls(messages: UIMessage[]): UIMessage[] {
  return messages.map(msg => {
    if (msg.role !== 'assistant' || !msg.parts) return msg;

    const repairedParts = msg.parts.filter(part => {
      // Keep all non-tool parts
      if (!part.type.startsWith('tool-')) return true;
      const tp = part as { state?: string };
      // Keep tool parts that have completed (output available or error)
      if (tp.state === 'output-available' || tp.state === 'output-error') return true;
      // Strip tool parts stuck in partial/streaming state (orphaned)
      return false;
    });

    // If all parts were stripped, keep a placeholder
    if (repairedParts.length === 0) {
      return {
        ...msg,
        parts: [{ type: 'text' as const, text: '[Resposta interrompida]' }],
      };
    }

    return { ...msg, parts: repairedParts };
  });
}
```

- [ ] **Step 2: Integrate into compactMessages pipeline**

In the same file, update the `compactMessages` function to apply sanitization BEFORE compaction:

```typescript
export function compactMessages(messages: UIMessage[]): UIMessage[] {
  // Step 1: Sanitize — remove empty messages and repair orphaned tool calls
  let sanitized = filterEmptyAssistantMessages(messages);
  sanitized = repairOrphanedToolCalls(sanitized);

  // Step 2: Compact — trim old messages if conversation is long
  if (sanitized.length <= MAX_RECENT_TURNS) {
    return sanitized;
  }

  const oldMessages = sanitized.slice(0, -MAX_RECENT_TURNS);
  const recentMessages = sanitized.slice(-MAX_RECENT_TURNS);

  const compactedOld: UIMessage[] = oldMessages.map(msg => {
    if (msg.role !== 'assistant') return msg;
    const textParts = (msg.parts ?? []).filter(p => p.type === 'text');
    if (textParts.length === 0) {
      return {
        ...msg,
        parts: [{ type: 'text' as const, text: '[Resposta anterior com dados — detalhes omitidos para economia de contexto]' }],
      };
    }
    return { ...msg, parts: textParts };
  });

  return [...compactedOld, ...recentMessages];
}
```

- [ ] **Step 3: Verify build passes**

Run: `pnpm build`

- [ ] **Step 4: Commit**

```bash
git add src/features/ai-agents/lib/compact-messages.ts
git commit -m "feat(agents): add message sanitization for streaming failures and empty messages"
```

---

### Task 6: Structured Agent Performance Logging

**Files:**
- Modify: `src/features/ai-agents/create-agent-tool.ts`

No logging exists for agent performance. Without data, it's impossible to know which agents are slow, which tools are called most, or where token budget is spent.

- [ ] **Step 1: Add structured logging after successful agent execution**

In `src/features/ai-agents/create-agent-tool.ts`, find the "Final yield with all data" section (around line 170-177). BEFORE the final yield, add:

```typescript
// Structured performance log for Cloud Logging analysis
console.log(JSON.stringify({
  event: 'agent_complete',
  agent: config.id,
  model: config.model,
  elapsedMs: Date.now() - startTime,
  steps: result.steps.length,
  toolCalls: result.steps.flatMap(s => s.toolCalls.map(tc => tc.toolName)),
  textLength: result.text.length,
  sessionId: dynamicContext.sessionId,
}));
```

- [ ] **Step 2: Add structured logging on agent error**

In the same file, find the catch block (around line 178-189). BEFORE the error yield, add:

```typescript
console.error(JSON.stringify({
  event: 'agent_error',
  agent: config.id,
  model: config.model,
  elapsedMs: Date.now() - startTime,
  error: error instanceof Error ? error.message.slice(0, 200) : 'Unknown',
  sessionId: dynamicContext.sessionId,
}));
```

- [ ] **Step 3: Verify build passes**

Run: `pnpm build`

- [ ] **Step 4: Commit**

```bash
git add src/features/ai-agents/create-agent-tool.ts
git commit -m "feat(agents): add structured performance logging for agent calls"
```

---

## File Map Summary

| File | Action | Task(s) |
|------|--------|---------|
| `src/shared/config/agents/shared-context.ts` | Modify | 1 |
| `src/shared/config/agents/monitoring-agent.ts` | Modify | 2 |
| `src/shared/config/agents/external-agent.ts` | Modify | 3 |
| `src/shared/config/agents/canvas-orchestrator.ts` | Modify | 4 |
| `src/features/ai-agents/lib/compact-messages.ts` | Modify | 5 |
| `src/features/ai-agents/create-agent-tool.ts` | Modify | 6 |

**All 6 tasks are independent and touch different files. Can be executed in any order.**
