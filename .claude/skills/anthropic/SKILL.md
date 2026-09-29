---
name: anthropic
description: "Use para modelos Anthropic (Claude). Keywords: anthropic, claude."
---
# Anthropic (modelos Claude)

Família Claude: Opus (mais capaz), Sonnet (balance), Haiku (rápido/barato). Ids atuais em `@.contexts/engineering/stacks/ai/anthropic.md` (`claude-sonnet-5-5`, `claude-opus-5-5`, `claude-fable-5-1`, `claude-haiku-4-5`). Foco aqui é capacidades e seleção; SDK em `anthropic-sdk`.

## Essência
- **Tiers:** Opus (raciocínio profundo, agentic), Sonnet (default), Haiku (alta vazão, baixo custo).
- **Context window:** 1M tokens nos modelos 5.x (Haiku 4.5: 200k). Output até 128k (Haiku: 64k).
- **Extended Thinking:** adaptativo (`thinking: { type: "adaptive" }` + `output_config.effort`, níveis `low`…`max`); expõe `thinking` block antes da resposta final. O modo manual com `budget_tokens` devolve 400 nos modelos atuais. No `claude-opus-5-5` o thinking não desliga e o `effort` default é `medium`.
- **Restrições dos 5.x:** `tool_choice` `any`/`tool`, `temperature`/`top_p`/`top_k` e prefill de assistant devolvem 400. Trate `stop_reason === "refusal"`.
- **Tool use:** declarar tools no request; modelo emite `tool_use` blocks; você executa e devolve `tool_result`.
- **Vision:** todos os modelos atuais aceitam imagens.
- **System prompt** separado de `messages` (parâmetro `system`).
- **Prompt Caching:** marcar `cache_control: { type: "ephemeral" }` em blocos estáveis (system, exemplos, docs longos) — leitura com ~90% de desconto, TTL 5 min (ou `ttl: "1h"`).
- **Batch API** (50% desconto, até 24h) para cargas async não-críticas.
- **Computer use / Bash / Text editor tools:** para agentes com side effects. Nos 5.x, computer use é `{ type: "computer_toolset_20260801" }` (sem beta header na API direta e no Google Cloud).
- **Structured output:** `output_config.format` (SDK: `client.messages.parse`) ou tool com `strict: true`.
- **Citations:** modelo pode citar fontes do contexto.

## Procedimento mínimo
1. Escolher tier por trade-off; default Sonnet.
2. System prompt no parâmetro `system`, não como primeira mensagem.
3. Conteúdo estável (instruções, exemplos) com `cache_control` ephemeral — economia gigante em loops.
4. Para problem-solving complexo, habilitar extended thinking adaptativo (`thinking: { type: "adaptive" }` e `output_config: { effort }`).
5. Tool use: declarar JSON Schema; validar input com Zod antes de executar.

## Anti-patterns
- Re-enviar 50KB de instruções a cada turn sem cache_control → custo explode.
- Tratar `thinking` block como resposta final → use o último `text` block.
- Forçar JSON com `<json>...</json>` em vez de `output_config.format` ou tool `strict` → frágil.
- Misturar system na `messages[0]` → vai para parâmetro `system`.

## Mini-exemplo
```ts
const res = await anthropic.messages.create({
  model: config.anthropicModelId, // ex. "claude-sonnet-5-5"
  max_tokens: 2048,
  output_config: { effort: "low" },
  system: [{ type: "text", text: BIG_INSTRUCTIONS, cache_control: { type: "ephemeral" } }],
  messages: [{ role: "user", content: userText }],
});
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/ai/anthropic.md`
