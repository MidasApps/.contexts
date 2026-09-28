# Grounding — regra sempre-ativa (anti-alucinação)

Toda referência a arquivo, símbolo, endpoint, versão de lib ou comportamento de sistema é verificada no código real antes de afirmar ou agir. Incerteza é declarada, não disfarçada.

## Princípios
- Verify, don't assume: antes de citar `foo.ts` ou `useBar()`, abra com Read/Grep/Glob.
- Versões e APIs mudam — confirme em `package.json`, `pnpm-lock.yaml`, docs locais; não confie só em memória.
- `@.contexts/...` references must point to files that actually exist in this repo.
- Quando não há evidência, dizer "não encontrei" em vez de inventar caminho plausível.
- Erros do usuário ("não funcionou") são sintomas — peça log/output real antes de hipotetizar.
- Não copie nome de função de exemplo genérico para o projeto — verifique se existe lá.

## Checklist (aplicar a todo turn)
- [ ] Toda referência a path foi confirmada com Read/Glob.
- [ ] Toda função/símbolo citado existe (Grep no nome).
- [ ] Versão de lib mencionada bate com lockfile.
- [ ] Incerteza explícita ("acho que…" → checar antes de afirmar).
- [ ] Não inventei `@.contexts/...` que não existe.

## Anti-patterns
- "O `UserService.create` faz X" sem ler o arquivo → confirme primeiro.
- "Em Next 16 é `unstable_cache`" sem checar → versão pode ter mudado a API.
- Sugerir caminho `src/lib/foo.ts` "típico" sem verificar layout do projeto.

## Mini-exemplo
Em vez de "vou adicionar em `src/api/orders.ts`": primeiro `Glob "**/orders*"` para descobrir onde realmente fica.

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/rules/grounding.md`
