---
title: Regras de Code Review
type: rules
scope: global
status: active
last_updated: 2026-07-13
---

# Regras de Code Review

Regras imperativas que governam a qualidade da revisão de código neste projeto. Cobrem o que autor e reviewer devem fazer, como comunicar, quando aprovar e quando bloquear. Não cobrem o workflow do PR em si (ver `@.contexts/engineering/processes/pull-requests.md`), o fluxo git (ver `@.contexts/engineering/processes/git.md`) nem o formato de commits (ver `@.contexts/engineering/processes/commits.md`).

## Escopo

Aplica-se a toda revisão de mudança de código submetida via pull request, independente da origem (humano, IA assistida, agente autônomo). Cobre escopo do PR, checklists de autor e reviewer, tom de comentários, SLA de resposta, critérios de aprovação, gates obrigatórios, revisão de mudanças sensíveis e ciclo de re-review.

## Escopo e tamanho do PR

- Sempre mantenha o PR focado em **um** objetivo. Nunca misture refatoração, feature e bugfix no mesmo PR.
- Nunca abra PR com mais de 400 linhas de diff efetivo (excluindo lockfiles, snapshots gerados e migrations puramente declarativas). Divida em PRs sequenciais quando ultrapassar.
- Sempre separe mudanças de formatação puramente automáticas (rename em massa, lint fixes globais) em PR dedicado.
- Nunca inclua dependências novas em PR de feature. Adicione a dependência em PR separado com justificativa (ver `@.contexts/engineering/rules/development.md`).
- Sempre descreva o "porquê" no corpo do PR. O "o quê" o diff já mostra.
- Nunca abra PR sem descrição. PR sem descrição é bloqueado por default.

## Checklist do autor antes de abrir

- Sempre rode lint, type-check e testes localmente antes de abrir. Nunca delegue ao CI a descoberta de falhas triviais.
- Sempre faça self-review do próprio diff no GitHub antes de marcar como pronto. Comente trechos não-óbvios para o reviewer.
- Sempre remova `console.log`, `TODO` sem dono, código comentado e prints de debug antes de abrir.
- Sempre confirme que migrations, scripts e mudanças destrutivas estão acompanhadas de plano de rollback documentado.
- Nunca abra PR com testes pulados (`it.skip`, `describe.skip`) sem comentário inline explicando o motivo e linkando issue de retomada.
- Sempre marque o PR como **draft** se ainda não estiver pronto para revisão. Nunca peça review em PR cujo CI ainda não passou.
- Sempre atualize a documentação afetada (`.contexts/`, READMEs, JSDoc público) no mesmo PR da mudança.

## Checklist do reviewer

- Sempre leia a descrição do PR antes de abrir o diff. Se a descrição não explicar o porquê, peça antes de revisar.
- Sempre revise: correção lógica, cobertura de testes, segurança, performance em caminhos quentes, legibilidade e aderência às convenções do projeto.
- Sempre verifique se a mudança respeita as regras de `@.contexts/engineering/rules/development.md`, `@.contexts/engineering/rules/security.md`, `@.contexts/engineering/rules/performance.md`, `@.contexts/engineering/rules/validation.md` e `@.contexts/engineering/rules/testing.md`.
- Nunca aprove PR cujo CI esteja vermelho ou pendente, exceto se o autor justificar a falha como não relacionada e abrir issue de rastreio.
- Sempre rode o código localmente quando a mudança afetar UX, integrações externas ou comportamento de runtime difícil de inferir do diff.
- Nunca aprove sem ter lido cada arquivo modificado. Se o PR é grande demais para revisar com atenção, peça split (ver regra de tamanho acima).
- Sempre verifique que testes novos efetivamente falham sem a mudança de produção. Sugira o autor confirmar isso quando houver dúvida.

## Tom e estilo de comentários

- Sempre classifique comentários por severidade. Use prefixos padronizados: `blocker:`, `issue:`, `suggestion:`, `nit:`, `question:`, `praise:`.
- Sempre use `blocker:` apenas para problemas que impedem o merge (bug, falha de segurança, quebra de contrato, regressão).
- Sempre use `nit:` para preferências cosméticas. Comentários `nit:` nunca bloqueiam aprovação.
- Sempre use `suggestion:` para melhorias opcionais. O autor decide aceitar ou não, e pode resolver sem responder.
- Sempre fraseie em primeira pessoa do plural ou no código, não no autor: "podemos extrair", "essa função poderia", não "você esqueceu", "você fez errado".
- Nunca use sarcasmo, ironia ou linguagem passivo-agressiva. Code review é técnico, não pessoal.
- Sempre proponha alternativa quando criticar. Comentário que só aponta problema sem direção de solução é incompleto.
- Nunca repita o mesmo comentário em múltiplos pontos. Faça uma vez com referência aos demais ou peça refactor genérico.
- Sempre use o recurso de "suggestion block" do GitHub quando a mudança proposta couber em poucas linhas.
- Nunca discuta decisões arquiteturais grandes no thread do PR. Abra issue ou ADR (ver `@.contexts/engineering/decisions/`) e referencie.

## Aprovação e bloqueio

- Sempre exija pelo menos uma aprovação humana antes do merge, mesmo em PR gerado por IA.
- Nunca aprove o próprio PR. Nunca aprove PR para o qual você co-autorou commits significativos.
- Sempre exija **duas** aprovações para: mudanças em autenticação, autorização, billing, pipelines de dados de produção, migrations destrutivas, mudanças em `.contexts/engineering/decisions/`, alterações em CI/CD que afetem deploy.
- Nunca aprove com comentários `blocker:` não resolvidos. Resolva o thread antes ou rebaixe a severidade com justificativa.
- Sempre marque "request changes" quando houver `blocker:` ou `issue:` aberto. Use "comment" para revisão parcial em andamento.
- Nunca faça merge enquanto houver thread não resolvido aberto por outro reviewer, exceto se o reviewer original aprovar a resolução.
- Sempre rebata aprovação se mudanças significativas forem empurradas após sua aprovação. Pequenos commits de typo/lint não exigem re-review.

## SLA de resposta

- Sempre responda a um pedido de review em até 1 dia útil. Se não puder, declare explicitamente e reatribua.
- Sempre responda a comentários do reviewer em até 1 dia útil. PR parado por mais de 3 dias úteis deve ser fechado ou movido para draft.
- Nunca deixe PR aberto por mais de 7 dias úteis sem atualização. PRs antigos acumulam conflitos e contexto perdido.
- Sempre priorize revisão de PRs que bloqueiam outros membros do time sobre seu próprio trabalho de feature.

## Resolução de threads

- Sempre o reviewer que abriu o thread é quem o resolve. Nunca resolva thread aberto por outro reviewer.
- Sempre responda comentários textualmente. Resolver sem responder é aceitável apenas para `nit:` aplicados ou `praise:`.
- Nunca feche PR para evitar resolver comentários. Resolva, discorde com justificativa ou escale.
- Sempre re-solicite review explicitamente após resolver todos os comentários. Não confie em o reviewer voltar sozinho.

## Re-review após mudanças

- Sempre re-revise PR que sofreu mudanças significativas (mais de 50 linhas adicionadas/modificadas após aprovação).
- Nunca exija re-review para commits de fixup, rebase, resolução de conflito trivial ou aplicação literal de suggestion blocks aprovadas.
- Sempre olhe primeiro o diff incremental desde sua última aprovação (range diff), não o diff completo.

## Quem revisa o quê

- Sempre solicite review do **code owner** do diretório afetado quando houver ownership declarada.
- Sempre solicite review de pelo menos um membro com contexto de domínio para mudanças em regras de negócio.
- Nunca atribua review apenas para quem está disponível. Atribua para quem deve aprovar pelo conteúdo.
- Sempre marque review opcional de outros stakeholders como "reviewer" e não como "required" para não bloquear.

## Gates obrigatórios (não-negociáveis)

- Nunca aprove PR que adiciona segredo, credencial ou token ao repositório.
- Nunca aprove PR que introduz dependência com vulnerabilidade conhecida (alta ou crítica) sem mitigação documentada.
- Nunca aprove PR que reduz cobertura de teste de módulos críticos abaixo do threshold acordado.
- Nunca aprove PR que desabilita teste, lint rule ou type-check sem comentário explicando e issue rastreando.
- Nunca aprove PR que altera contrato público (API, schema de banco, evento) sem versionamento ou plano de migração.

## Review de PRs gerados por IA

- Sempre marque PRs gerados por agente de IA com label `ai-generated` e indique o agente/modelo no corpo do PR.
- Sempre o autor humano responsável pelo PR de IA assume autoria editorial: revisa cada linha antes de pedir review, garante que testes existem e fazem sentido, valida que a solução é a mais simples possível.
- Nunca aprove PR de IA com base na confiança no modelo. Aplique o mesmo rigor de um PR humano, com atenção extra a: invenções de APIs inexistentes, testes que validam o próprio bug, código defensivo desnecessário, comentários redundantes, abstrações prematuras.
- Sempre exija que PR de IA explique no corpo qual prompt/contexto gerou a mudança, para reprodutibilidade.

## Review de migrations e mudanças destrutivas

- Sempre exija dois aprovadores para qualquer migration que altere ou remova dados em produção.
- Nunca aprove migration sem script de rollback testado em ambiente equivalente a produção.
- Sempre revise migrations contra `@.contexts/engineering/contracts/` para garantir aderência a convenções de modelagem.
- Nunca aprove DROP, TRUNCATE ou DELETE em massa sem backup explícito e janela de manutenção declarada.
- Sempre exija que mudanças destrutivas sejam precedidas por PR de deprecation em release anterior (soft delete, dual-write, feature flag) quando viável.

## Anti-patterns de review

- Nunca aprove sem revisar ("LGTM" cego em PR não-trivial).
- Nunca empilhe dezenas de `nit:` cosméticos enquanto problemas estruturais passam.
- Nunca exija refactor grande dentro do PR original. Sugira como follow-up.
- Nunca use review para discutir decisões já tomadas e documentadas em ADR. Reabra a decisão no canal próprio.
- Nunca aprove condicionalmente em palavras ("aprovo se você fizer X"). Ou aprova depois da mudança, ou marca request changes agora.
- Nunca faça force-push em PR sob review sem avisar o reviewer e perder seus comentários inline.

## Exemplos

### Comentário com severidade

Errado:

```
isso aqui tá errado, vc tem que validar antes
```

Certo:

```
blocker: precisamos validar `input` com schema antes de passar para `processOrder`,
senão dado malformado chega no banco. Sugiro usar o schema já definido em
`@/contracts/order.ts`.
```

### Suggestion block

Errado:

```
nit: o nome dessa variável poderia ser melhor
```

Certo (com suggestion block):

````
nit: renomear para refletir que é o usuário autenticado, não qualquer usuário.

```suggestion
const authenticatedUser = await getCurrentUser();
```
````

### Resposta a comentário

Errado (apenas resolver thread sem responder):

```
[thread resolvido sem resposta]
```

Certo:

```
boa, refatorei para usar o helper. Veja commit abc1234.
```

### Discordância respeitosa

Errado:

```
não, isso aí não faz sentido
```

Certo:

```
entendo a preocupação, mas acho que manter inline é melhor aqui porque essa
função é usada só nesse arquivo e extrair adiciona indireção sem reuso real.
Posso documentar o motivo em comentário se ajudar.
```

## Referências cruzadas

- Workflow e template de PR: `@.contexts/engineering/processes/pull-requests.md`
- Fluxo git e branches: `@.contexts/engineering/processes/git.md`
- Convenções de commit: `@.contexts/engineering/processes/commits.md`
- Regras gerais de desenvolvimento: `@.contexts/engineering/rules/development.md`
- Regras de segurança: `@.contexts/engineering/rules/security.md`
- Regras de performance: `@.contexts/engineering/rules/performance.md`
- Regras de validação: `@.contexts/engineering/rules/validation.md`
- Regras de testes: `@.contexts/engineering/rules/testing.md`
- Decisões arquiteturais: `@.contexts/engineering/decisions/`
- Convenções de modelagem: `@.contexts/engineering/contracts/`
