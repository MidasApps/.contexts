---
name: clean-code
description: "Use para princípios de clean code: nomes, funções, comentários, formatação. Keywords: clean code, refactor, smells."
---
# Clean Code

Práticas para legibilidade e manutenção: nomes que revelam intenção, funções pequenas e focadas, comentários só para o "por quê", evitar duplicação, lidar com erros de forma sistemática.

## Essência
- **Nomes:** revelam intenção, são pronunciáveis e pesquisáveis. Verbos para funções, substantivos para classes/dados.
- **Funções pequenas:** fazem UMA coisa. Tamanho típico 30-50 linhas (rule `ai-friendly-code`); não extraia só para cumprir contagem.
- **Argumentos:** 0-2 ideal; 3 ok; 4+ vira objeto nomeado.
- **Sem side effects ocultos:** função `validate()` não deve atualizar DB.
- **DRY:** três strikes regra — extrair na terceira ocorrência, não na primeira.
- **Comentários:** explicam **por quê**; código diz **o quê**. Comentário desatualizado é pior que ausência.
- **Erros:** erro esperado do contrato → `Result` tipado; excepcional → `throw` de classe com `code` (nunca `new Error("...")` genérico); não engolir. Ver rule `error-handling`.
- **Boy Scout Rule:** deixe o código melhor do que encontrou.

## Procedimento mínimo
1. Ler código com o nome em mente: ele diz o que faz?
2. Identificar função > 50 linhas; extrair sub-funções só quando o nome novo ilumina algo.
3. Remover comentário que diz o óbvio; reescrever código se a explicação é necessária.
4. Renomear variável `tmp`, `data`, `result` para algo de domínio.
5. Eliminar números mágicos → constante nomeada.

## Anti-patterns
- `const process = (d, x, y, z, opts, flags) => …` → objeto nomeado + função extraída.
- Comentário `// hack: trust me` sem o porquê → expandir ou consertar.
- `if (status === 1)` → `if (status === "paid")` com `status: OrderStatus` (`z.enum(["pending", "paid", "cancelled"])`).
- Catch genérico `catch(e){}` que engole → log + rethrow ou map.

## Mini-exemplo
```ts
// antes
const p = (u, a) => { if (u.t === 1 && a > 0) return u.b + a; };
// depois
export const applyCredit = (user: User, amountMinor: number): number => {
  if (user.type !== "premium") return user.balanceMinor;
  return user.balanceMinor + amountMinor;
};
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/practices/clean-code.md`
