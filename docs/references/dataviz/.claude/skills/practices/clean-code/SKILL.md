---
name: clean-code
description: Use para princípios de clean code: nomes, funções, comentários, formatação. Keywords: clean code, refactor, smells.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Clean Code

Práticas para legibilidade e manutenção: nomes que revelam intenção, funções pequenas e focadas, comentários só para o "por quê", evitar duplicação, lidar com erros de forma sistemática.

## Essência
- **Nomes:** revelam intenção, são pronunciáveis e pesquisáveis. Verbos para funções, substantivos para classes/dados.
- **Funções pequenas:** fazem UMA coisa. Idealmente < 20 linhas; raramente > 50.
- **Argumentos:** 0-2 ideal; 3 ok; 4+ vira objeto nomeado.
- **Sem side effects ocultos:** função `validate()` não deve atualizar DB.
- **DRY:** três strikes regra — extrair na terceira ocorrência, não na primeira.
- **Comentários:** explicam **por quê**; código diz **o quê**. Comentário desatualizado é pior que ausência.
- **Erros:** exceptions > códigos de erro de retorno; não engolir; mensagem útil.
- **Boy Scout Rule:** deixe o código melhor do que encontrou.

## Procedimento mínimo
1. Ler código com o nome em mente: ele diz o que faz?
2. Identificar função > 30 linhas; extrair sub-funções com nomes expressivos.
3. Remover comentário que diz o óbvio; reescrever código se a explicação é necessária.
4. Renomear variável `tmp`, `data`, `result` para algo de domínio.
5. Eliminar números mágicos → constante nomeada.

## Anti-patterns
- `function process(d, x, y, z, opts, flags)` → objeto nomeado + função extraída.
- Comentário `// hack: trust me` sem o porquê → expandir ou consertar.
- `if (status === 1)` → `if (status === OrderStatus.Paid)`.
- Catch genérico `catch(e){}` que engole → log + rethrow ou map.

## Mini-exemplo
```ts
// antes
function p(u, a) { if (u.t === 1 && a > 0) return u.b + a; }
// depois
function applyCredit(user: User, amountCents: number): Cents {
  if (user.type !== "premium") return user.balanceCents;
  return user.balanceCents + amountCents;
}
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/practices/clean-code.md`
