---
name: anthropic
description: Use para modelos Anthropic (Claude). Keywords: anthropic, claude.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Anthropic (modelos Claude)

Família Claude: Opus (mais capaz), Sonnet (balance), Haiku (rápido/barato). Versão atual da geração 4.x. Foco aqui é capacidades e seleção; SDK em `anthropic-sdk`.

## Essência
- **Tiers:** Opus (raciocínio profundo, agentic), Sonnet (default), Haiku (alta vazão, baixo custo).
- **Context window:** 200k tokens (alguns modelos chegam a 1M em beta). Output até 64k.
- **Extended Thinking:** modelo expõe tokens de raciocínio antes da resposta final (`thinking` block) — útil em problemas complexos.
- **Tool use:** declarar tools no request; modelo emite `tool_use` blocks; você executa e devolve `tool_result`.
- **Vision:** todas variantes 4.x aceitam imagens.
- **System prompt** separado de `messages` (parâmetro `system`).
- **Prompt Caching:** marcar `cache_control: { type: "ephemeral" }` em blocos estáveis (system, exemplos, docs longos) — 90% desconto, TTL 5 min.
- **Batch API** (50% desconto, até 24h) para cargas async não-críticas.
- **Computer use / Bash / Text editor tools:** beta para agentes com side effects.
- **Citations:** modelo pode citar fontes do contexto.

## Procedimento mínimo
1. Escolher tier por trade-off; default Sonnet.
2. System prompt no parâmetro `system`, não como primeira mensagem.
3. Conteúdo estável (instruções, exemplos) com `cache_control` ephemeral — economia gigante em loops.
4. Para problem-solving complexo, habilitar extended thinking (`thinking: { type: "enabled", budget_tokens: N }`).
5. Tool use: declarar JSON Schema; validar input com Zod antes de executar.

## Anti-patterns
- Re-enviar 50KB de instruções a cada turn sem cache_control → custo explode.
- Tratar `thinking` block como resposta final → use o último `text` block.
- Forçar JSON com `<json>...</json>` em vez de tool use ou schema → frágil.
- Misturar system na `messages[0]` → vai para parâmetro `system`.

## Mini-exemplo
```ts
const res = await anthropic.messages.create({
  model: "claude-sonnet-4-5",
  max_tokens: 2048,
  system: [{ type: "text", text: BIG_INSTRUCTIONS, cache_control: { type: "ephemeral" } }],
  messages: [{ role: "user", content: userText }],
});
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/ai/anthropic.md`
