# AI-Friendly Code — regra sempre-ativa

Código organizado para ser navegável e modificável por humanos E LLMs: arquivos curtos, funções coesas, nomes expressivos, baixo acoplamento, dependências explícitas.

## Princípios
- **Arquivos 150-500 linhas.** Acima disso, divide por responsabilidade. Exceção: schemas/tabelas declarativas longas.
- **Funções 30-50 linhas.** Exceção: JSX denso de componente de página, switch exaustivo.
- Um arquivo = uma responsabilidade clara. Nome do arquivo descreve o que exporta.
- Naming expressivo: `createOrderFromCart` > `process`. Verbos para ações, substantivos para dados.
- Dependências explícitas: imports no topo, sem side effects em import time, sem global hidden state.
- Baixo acoplamento: módulos comunicam por interface tipada, não por shape implícito.
- Comentários explicam **por quê**, não **o quê**. Código diz o quê.
- Evite cleverness: claro vence "clever" sempre.
- Estrutura previsível: convenções de pasta documentadas (ver skills `feature-based`/`fsd` se aplicável).

## Checklist (aplicar a todo turn)
- [ ] Arquivo novo fica dentro do orçamento de linhas.
- [ ] Função nova faz UMA coisa nomeável.
- [ ] Imports são absolutos/aliased, não `../../../`.
- [ ] Sem `export default` de função genérica (named export ajuda discovery).
- [ ] Sem meta-programming desnecessário.

## Anti-patterns
- Mega-arquivo `utils.ts` de 2000 linhas → quebrar por domínio.
- Função `handle(req, res, opts, flags, ctx)` com 8 params → objeto nomeado.
- `if (x && y && (z || w) && !q)` → variável intermediária nomeada.
- `// TODO` antigo sem owner/data → resolver ou criar issue.

## Mini-exemplo
```ts
export async function chargeCustomer(args: {
  customerId: CustomerId;
  amountCents: number;
  idempotencyKey: string;
}) {
  // ...
}
```

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/practices/ai-friendly-code.md`
