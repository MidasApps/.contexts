---
name: harness-engineering
description: Use para harness/agent engineering — system prompts, tool design, evals. Keywords: harness, agent design, system prompt.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Harness / Agent Engineering

Disciplina de construir o "andaime" ao redor de um LLM: system prompt, tool surface, memory, context strategy, guardrails e evals. Determina mais a qualidade do agent do que o modelo escolhido.

## Essência
- **System prompt:** identidade, capacidades, formato esperado, restrições. Não enche de regras óbvias.
- **Tool surface:** poucas tools bem-projetadas > muitas vagas. Cada tool faz UMA coisa, com schema preciso e descrição que diz **quando usar**.
- **Tool descriptions:** otimizadas para o LLM ler, não para humano. Casos de uso explícitos.
- **Context management:** progressive disclosure — só carrega o relevante. Sumarize/compress histórico longo.
- **Memory:** thread-based (conversa atual), long-term (perfil/preferências), retrieved (RAG por query).
- **Guardrails:** validação de input ANTES do LLM (Zod), validação de output DEPOIS (schema enforce, content filter), allowlist de tools por contexto.
- **Loop control:** `stopWhen` (n steps, tool específico, condição). Sem loop infinito.
- **Telemetry:** logar cada step (input, tool calls, tokens, latência, resultado). Indispensável para debug.
- **Evals:** testes automáticos com casos canônicos + métricas (correctness, format compliance, regression). Eval > "perguntei e funcionou".
- **Prompt caching:** estabilize prefixo (system + tools) para hit de cache em loops.
- **Failure modes:** plano para: model recusa, tool falha, output malformado, loop, custo excedido.

## Procedimento mínimo
1. Definir tarefa, sucesso observável, restrições (custo, latência, accuracy).
2. Desenhar tool surface mínima; cada tool com schema + descrição focada em "quando usar".
3. Escrever system prompt: identidade + formato + 2-5 exemplos.
4. Implementar loop com `stopWhen` e timeout.
5. Telemetry desde o dia 1 (step-by-step).
6. Eval set com 10-30 casos representativos; rodar em CI.
7. Iterar: identificar failure mode → corrigir prompt/tool/guardrail → re-rodar eval.

## Anti-patterns
- "Mais regras no prompt" como solução universal → muitas vezes o problema é tool design.
- Tool genérica `runQuery(sql)` → o LLM gera SQL ruim; faça `getUserById(id)`.
- Sem eval, só "testei manualmente" → regressão silenciosa.
- Loop sem stopWhen → custo descontrolado em produção.
- Mexer no prompt sem versionar → não dá pra A/B nem rollback.

## Mini-exemplo
```ts
const agent = {
  systemPrompt: `You are a triage agent for customer support tickets.
- Output format: { category: string, urgency: "low"|"high", suggestedReply: string }
- Use the search tool when context is missing; never invent ticket history.`,
  tools: [{
    name: "search_tickets",
    description: "Use when you need past tickets from this customer. Returns up to 5 most recent.",
    inputSchema: z.object({ customerId: z.string() }),
  }],
  stopWhen: stepCountIs(5),
};
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/ai/harness-engineering.md`
