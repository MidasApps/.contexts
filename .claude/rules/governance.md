---
paths: [".claude/**",".contexts/**","CLAUDE.md"]
---
# Governance — ativa ao editar governança

Mudanças em rules/contexts seguem processo: ADR para decisão arquitetural, ownership claro, revisão periódica, sem duplicação entre arquivos.

## Princípios
- Toda decisão arquitetural significativa vira ADR (skill `decisions`) antes de virar rule/skill.
- Rules e skills têm dono claro (CODEOWNERS ou seção no README) — quem aprova mudança.
- Sem duplicação: se dois arquivos cobrem o mesmo tópico, um faz referência ao outro.
- Mudança em rule sempre-ativa afeta todo turn → custo alto, revisão obrigatória.
- Revisão periódica (trimestral) para deprecar rule que não reflete mais a prática.
- Versionamento: mudança breaking em rule (ex.: invertendo recomendação) destaca na PR.
- `.contexts/...` é fonte de verdade do projeto; `.claude/...` é a interface compilada para LLM e só resume + aponta `@.contexts/...` que existe.
- Versão/pacote atrás do `latest` só com linha de exceção no ADR 0004; ADR aceito não se edita — novo ADR supersede. Em conflito entre documentos, vence o mais específico (ADR 0003).

## Checklist (aplicar a todo turn)
- [ ] Mudança não-trivial em rule tem ADR associado ou referência.
- [ ] Owner identificável (CODEOWNERS, autor original).
- [ ] Nenhuma duplicação com outra rule/skill — cross-reference em vez.
- [ ] Path-scoped rule tem `paths:` que realmente reflete o escopo.
- [ ] Linha-base de tamanho respeitada (rules sempre-ativas ≤ 80 linhas).
- [ ] Removidas rules que não se aplicam mais.

## Anti-patterns
- Adicionar rule "sempre-ativa" para preferência pessoal → custa tokens em todo turn.
- Copiar conteúdo entre rules → mantenha único + referencie.
- Mudar rule sem PR review → governance vira opinião individual.

## Mini-exemplo
ADR `0007-adopt-cursor-pagination.md` registra decisão; rule `api-design` referencia-o em uma linha em vez de re-explicar trade-offs.

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/rules/governance.md`
