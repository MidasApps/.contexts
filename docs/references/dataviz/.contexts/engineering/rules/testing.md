---
title: Regras de Testing
type: rules
scope: engineering
status: active
last_updated: 2026-07-13
related:
  - "@.contexts/engineering/rules/development.md"
  - "@.contexts/engineering/rules/validation.md"
  - "@.contexts/engineering/rules/security.md"
  - "@.contexts/engineering/rules/performance.md"
  - "@.contexts/engineering/practices/tdd.md"
  - "@.contexts/engineering/practices/bdd.md"
  - "@.contexts/engineering/stacks/testing/vitest.md"
  - "@.contexts/engineering/stacks/testing/playwright.md"
  - "@.contexts/engineering/processes/deploy.md"
  - "@.contexts/engineering/processes/pull-requests.md"
---

# Regras de Testing

Regras imperativas e enforce sobre como escrever, organizar e manter testes automatizados neste projeto. Cobrem o que testar, como nomear, como isolar, como evitar flakiness, como usar fakes/mocks/stubs e como tratar testes em boundaries críticos (HTTP, banco, LLM). Para regras gerais de código, ver `@.contexts/engineering/rules/development.md`. Para o método TDD como ritual de trabalho, ver `@.contexts/engineering/practices/tdd.md`. Para BDD e cenários comportamentais, ver `@.contexts/engineering/practices/bdd.md`. Para o manual da ferramenta de testes unitário/integração, ver `@.contexts/engineering/stacks/testing/vitest.md`. Para o manual de testes E2E, ver `@.contexts/engineering/stacks/testing/playwright.md`. Para o fluxo de execução no CI e gates de PR, ver `@.contexts/engineering/processes/deploy.md` e `@.contexts/engineering/processes/pull-requests.md`.

## Escopo

Aplica-se a todo código de teste do projeto: testes unitários, de integração, de contrato, de componente e end-to-end, em backend (Firebase Functions, serviços Node), frontend (Next.js, React) e camadas de IA (agentes Mastra, chamadas Vercel AI SDK, OpenAI, Gemini). Não cobre o método TDD/BDD como disciplina temporal (ver Practices), o manual específico de Vitest/Playwright (ver Stacks), nem o fluxo de CI e gates obrigatórios (ver Processes).

---

## 1. Princípio fundamental: testar comportamento, não implementação

- **Sempre** teste comportamento observável da unidade: input, output, side effects visíveis. Esse é o contrato.
- **Nunca** teste detalhes internos: nome de função privada, ordem de chamadas internas, estrutura de estado interno. Detalhes mudam, comportamento permanece.
- **Sempre** escreva o teste como um cliente da unidade. Se o teste precisa importar internals, a unidade está mal encapsulada ou o teste está no nível errado.
- **Nunca** ajuste o teste para "passar" mudando a expectativa quando o comportamento real está errado. Conserte a unidade, não o teste.
- **Sempre** prefira refatorar a unidade quando o teste fica difícil de escrever. Teste difícil é sinal de design ruim.

## 2. Forma do teste: AAA

- **Sempre** estruture cada teste em três blocos visualmente separados: **Arrange** (setup), **Act** (chamada), **Assert** (verificação).
- **Nunca** misture os três blocos. Asserts no meio do arrange escondem a intenção do teste.
- **Sempre** tenha **uma única ação** no bloco Act. Se precisa de duas chamadas para reproduzir o cenário, são dois testes ou o arrange está incompleto.
- **Nunca** tenha múltiplos asserts independentes verificando comportamentos diferentes no mesmo teste. Um teste = um comportamento.
- **Sempre** aceite múltiplos asserts no mesmo teste quando verificam **o mesmo comportamento sob ângulos diferentes** (ex: status code + corpo + header de uma resposta HTTP).

## 3. Nomenclatura

- **Sempre** nomeie o teste descrevendo o comportamento esperado em frase, não o nome do método. `it('rejects login when password is empty')`, não `it('login()')`.
- **Nunca** use nomes genéricos como `'works'`, `'should pass'`, `'test 1'`. Quem lê o relatório do CI precisa entender a falha sem abrir o arquivo.
- **Sempre** descreva o sujeito + condição + expectativa: `'returns 404 when user does not exist'`.
- **Nunca** use o nome do teste para descrever a implementação (`'calls userRepository.findById'`). Descreva o efeito (`'fetches the requested user'`).
- **Sempre** agrupe testes do mesmo sujeito em `describe` com o nome da unidade sob teste. Aninhar mais de dois níveis de `describe` é cheiro.

## 4. Isolamento

- **Sempre** garanta que cada teste roda independentemente. Reordenar a suíte não pode quebrar nada.
- **Nunca** compartilhe estado mutável entre testes via variáveis de módulo. Use `beforeEach` para setup fresco ou factories.
- **Sempre** limpe side effects de cada teste em `afterEach` (timers, mocks, listeners, conexões). Suíte que deixa lixo polui o próximo teste.
- **Nunca** dependa da ordem de execução dos testes para "configurar estado" para o próximo. Cada teste é autossuficiente.
- **Sempre** isole testes que tocam recursos externos (banco, filesystem, rede) por transação, namespace ou collection dedicada por teste. Paralelismo é o default; testes que não isolam falham em paralelo.

## 5. Determinismo

- **Sempre** torne o teste determinístico: mesma entrada produz mesmo resultado em qualquer máquina, qualquer hora.
- **Nunca** use `Date.now()`, `Math.random()`, `crypto.randomUUID()` ou clock real direto na unidade testada sem permitir injeção. Use clocks fake (`vi.useFakeTimers`, `vi.setSystemTime`) ou injete a fonte.
- **Sempre** congele o tempo em testes que dependem de relógio. `vi.useFakeTimers()` + `vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))`.
- **Nunca** confie em `setTimeout`/`setInterval` reais em teste. Use timers fake e avance manualmente.
- **Sempre** use seeds fixos para qualquer aleatoriedade necessária. Random sem seed é flakiness disfarçada.
- **Nunca** dependa de timezone do host. Sempre force `TZ=UTC` ou use datas com offset explícito.

## 6. Pirâmide e troféu de testes

- **Sempre** prefira a forma de **troféu** para aplicações web: muitos testes de integração, base sólida de unitários, poucos E2E, static analysis no topo.
- **Sempre** privilegie testes de **integração** quando estão na fronteira entre módulos do mesmo bounded context. Eles capturam mais bugs por unidade de manutenção do que unit puro com mock pesado.
- **Sempre** mantenha testes unitários para lógica pura, regras de domínio, parsing, formatação e funções utilitárias. Eles são rápidos e específicos.
- **Sempre** mantenha E2E mínimo e cirúrgico: cobrem **fluxos críticos de negócio** (login, checkout, criação principal), não cada variação de UI.
- **Nunca** escreva E2E para testar lógica que cabe em unit ou integração. E2E é caro, lento e flaky por natureza.

## 7. Fakes, stubs e mocks

- **Sempre** prefira **fakes** (implementações em memória funcionais) sobre mocks de comportamento. Fake de repositório, fake de fila, fake de clock — comportamento real, dados em memória.
- **Sempre** use **stubs** (valores pré-programados) para retornos de dependências externas que o teste não exercita.
- **Nunca** use **mocks** (espiões de chamadas) para verificar interações internas. Mock que checa "foi chamado com X" amarra o teste à implementação.
- **Sempre** use mock apenas para dependências de fronteira que **não devem** ser chamadas em teste (envio real de email, cobrança em gateway de pagamento). O assert é "não foi chamado" ou "foi chamado uma vez", não "foi chamado com argumentos exatos".
- **Nunca** mock o que você não possui sem testar com a integração real em outro nível. Mock de SDK de terceiro engana até o terceiro mudar o contrato.

## 8. Test data builders e factories

- **Sempre** use **factories** ou **builders** para criar objetos de domínio em teste. Construção manual repetida espalha conhecimento do shape pelo projeto.
- **Sempre** dê defaults sensatos na factory. O teste sobrescreve apenas o que importa para o cenário.
- **Nunca** inclua na factory campos que o teste não usa. Cada campo presente é uma promessa que o teste verifica.
- **Sempre** prefira `createUser({ email: 'x@y.com' })` sobre `{ id: '1', email: 'x@y.com', name: '...', createdAt: ..., ... }` repetido em todo teste.
- **Nunca** acoplar factories de teste a fixtures de banco. Factory monta objeto; fixture persiste. São responsabilidades diferentes.

## 9. Snapshot testing

- **Sempre** use snapshot **com parcimônia**, apenas para output estável, intencional e revisado linha-a-linha em PR (ex: HTML gerado por template fixo, JSON de serializer, mensagem de erro padronizada).
- **Nunca** use snapshot como atalho para "não preciso pensar no assert". Snapshot que ninguém lê é teste que ninguém valida.
- **Nunca** snapshot UI renderizada inteira como teste de comportamento. Snapshot de componente quebra a cada CSS class change e ninguém revisa.
- **Sempre** prefira asserts explícitos (`expect(result.status).toBe(404)`) sobre snapshot do response inteiro.
- **Sempre** trate atualização de snapshot (`--update`) como decisão consciente. Atualizar snapshot porque "estava quebrando" é desativar o teste.

## 10. Cobertura

- **Sempre** trate cobertura como **diagnóstico**, não como meta. Cobertura alta sem assertion significativa é teatro.
- **Nunca** persiga 100% de cobertura. Código gerado, glue code de framework e branches de erro defensivo nem sempre justificam o custo de testar.
- **Sempre** exija cobertura de **comportamento crítico** (regras de domínio, validações de boundary, autorização, billing, fluxos de pagamento) próxima de 100%, mesmo que a média do repo seja menor.
- **Nunca** aceite PR que reduz cobertura significativa em módulo crítico sem justificativa explícita.
- **Sempre** verifique se a linha coberta tem **assertion correspondente**. Linha executada pelo teste sem assert que a observe é cobertura falsa.

## 11. Flakiness zero

- **Sempre** trate teste flaky como **bug crítico**, no mesmo nível de bug de produção. Flaky test corrói confiança da suíte inteira.
- **Nunca** marque teste flaky como `.skip` ou `.retry` indefinidamente. Quarentena máxima de 7 dias com issue aberta, depois conserta ou apaga.
- **Sempre** identifique a causa raiz da flakiness: race condition, ordem de teste, timeout curto, network real, timer real, recurso compartilhado. Cada uma tem solução específica.
- **Nunca** aumente o timeout do teste como solução para flakiness. Timeout maior só atrasa o sintoma.
- **Sempre** use ferramentas de espera condicional (`waitFor`, `expect.poll`, `waitForSelector`) em vez de `sleep` fixo.
- **Nunca** use `await new Promise(r => setTimeout(r, n))` para sincronizar teste. É a forma mais comum de criar flakiness.

## 12. Testes em boundary HTTP

- **Sempre** teste route handlers e Server Actions chamando-os via fetch real (ou helper que monta `Request`), não invocando a função interna direto. O boundary é o que importa.
- **Sempre** valide o **status code**, o **shape do body** e os **headers críticos** (Content-Type, Cache-Control, Set-Cookie quando aplicável) na mesma assertion suite.
- **Nunca** teste apenas o "caminho feliz" de um handler. Teste pelo menos: input válido, input inválido (400), recurso ausente (404), erro de autorização (401/403).
- **Sempre** combine teste de boundary HTTP com schema Zod do response. Se o handler retornou shape errado, o teste pega. Ver `@.contexts/engineering/rules/validation.md`.
- **Nunca** monte `req.body` manualmente sem passar pelo mesmo middleware de parsing usado em produção. Teste que pula middleware testa cenário irreal.

## 13. Testes em boundary de banco

- **Sempre** prefira **banco real efêmero** (Firestore emulator, Postgres em container) sobre mock de repositório para testes de integração. Mock de banco esconde quirks do banco real.
- **Nunca** mock query SQL ou query Firestore em teste de integração. O bug do query mockado nunca aparece.
- **Sempre** isole testes em **namespace dedicado** (collection prefixada, schema dedicado, transação revertida) para permitir paralelismo.
- **Nunca** rode testes de integração de banco contra o banco de desenvolvimento compartilhado. Use sempre emulator local ou container dedicado.
- **Sempre** limpe dados criados pelo teste no `afterEach`. Banco sujo entre testes vira flakiness ou contaminação de assert.

## 14. Testes em boundary de LLM

- **Sempre** teste agentes e prompts em **dois níveis**: unitário com LLM mockado (resposta determinística pré-programada) e integração ocasional com LLM real em pipeline dedicado.
- **Nunca** rode chamadas reais a OpenAI/Gemini em cada CI commit. Custo, latência e não-determinismo destroem a suíte.
- **Sempre** valide structured output do LLM via schema Zod no próprio teste — o teste é o primeiro a sofrer se o modelo quebrar o contrato.
- **Nunca** teste qualidade semântica da resposta do LLM com assert literal de string. Use asserts de **estrutura** (campos presentes, tipos corretos, ranges válidos) e, quando necessário, asserts semânticos com outro LLM (LLM-as-judge), isolados em pipeline noturno.
- **Sempre** congele a temperatura para zero e use seed quando o provider suportar em testes que tocam LLM real. Não elimina não-determinismo, mas reduz.

## 15. Contract testing

- **Sempre** mantenha testes de contrato no consumidor para cada API externa de que dependemos (Stripe, OAuth, OpenAI, Gemini). Eles verificam que o **shape esperado** ainda é o que o provedor envia.
- **Sempre** use fixtures gravadas de respostas reais como base do contrato. Fixture inventada não detecta drift do provedor.
- **Nunca** confie no `.d.ts` do SDK como contrato. Tipo do SDK pode estar desatualizado ou opcional onde o runtime exige.
- **Sempre** rode contract tests contra fixtures em CI rápido e contra o provedor real em pipeline noturno separado.
- **Nunca** acople contract test ao corpo inteiro da resposta. Verifique apenas os campos que o nosso código consome.

## 16. Testes de componente React

- **Sempre** teste comportamento do componente, não estrutura DOM. Use queries por **role/label/text** (Testing Library), nunca por classe CSS ou test-id sem necessidade.
- **Nunca** assertee `container.innerHTML` ou árvore de elementos. Quebra a cada refactor de markup sem mudança de comportamento.
- **Sempre** simule interação como usuário real (`userEvent.click`, `userEvent.type`), não eventos sintéticos crus (`fireEvent`).
- **Nunca** use `data-testid` como primeira escolha. É fallback para casos sem role/label acessível — e isso é cheiro de acessibilidade ruim.
- **Sempre** combine teste de componente com asserts visíveis (texto na tela, role exposto). Se o teste passa mas o usuário não vê o resultado, o teste mente.

## 17. Testes E2E (Playwright)

- **Sempre** mantenha E2E em pipeline separado do CI de PR, ou em subset crítico no PR. E2E lento bloqueia merge.
- **Sempre** rode E2E contra build de produção (`next build && next start`), não dev server. Bugs de build não aparecem em dev.
- **Nunca** dependa de dados de produção em E2E. Cada teste cria seus próprios dados via API ou seed dedicado.
- **Sempre** use **page objects** ou helpers para encapsular seletores e ações repetidas. Selector espalhado em 30 testes é débito.
- **Nunca** use `page.waitForTimeout(n)`. Use `expect(locator).toBeVisible()` com auto-wait do Playwright. Ver `@.contexts/engineering/stacks/testing/playwright.md`.

## 18. Performance dos testes

- **Sempre** mantenha a suíte unitária + integração rápida no PR (alvo: menos de 2 minutos no CI). Suíte lenta vira suíte ignorada.
- **Nunca** rode setup pesado em `beforeAll` se cabe em `beforeEach` barato. Setup compartilhado vira acoplamento entre testes.
- **Sempre** paralelize por arquivo (default do Vitest, Playwright). Testes que não paralelizam têm problema de isolamento — conserte o teste, não desligue paralelismo.
- **Nunca** desabilite paralelismo globalmente para "estabilizar". Identifique os testes que dependem de recurso compartilhado e isole-os, ou serialize só eles.
- **Sempre** falhe rápido em CI: `--bail` ou equivalente em PRs onde a primeira falha já invalida o merge.

## 19. Organização e localização

- **Sempre** coloque o teste **próximo do código testado**: `foo.ts` + `foo.test.ts` no mesmo diretório. Distância entre teste e código é fricção.
- **Nunca** mantenha pasta `tests/` separada espelhando a estrutura do `src/`. Move um arquivo, esquece de mover o teste.
- **Sempre** use sufixos consistentes: `.test.ts` para unit/integração, `.spec.ts` para E2E, ou padronize no time e enforce com lint.
- **Nunca** misture testes E2E com testes unitários no mesmo diretório. E2E vive em pasta dedicada (`e2e/`, `playwright/`) por isolamento de runner e tooling.

## 20. Testes em produção e validação contínua

- **Sempre** trate health checks, smoke tests pós-deploy e canários como **testes em produção**, com a mesma disciplina de teste normal.
- **Nunca** considere "CI passou" suficiente para fluxo crítico. Smoke test pós-deploy é a última rede de proteção.
- **Sempre** use feature flags para validar comportamento novo em produção com tráfego restrito antes de exposição total.
- **Nunca** desabilite teste em produção em rollback. Bug que escapou para produção precisa virar teste antes do próximo release.

## 21. Manutenção da suíte

- **Sempre** delete teste obsoleto quando a funcionalidade é removida. Teste de código morto é débito.
- **Sempre** refatore o teste junto com a unidade. Teste copiado-e-colado entre versões da unidade tem o dobro do custo de manutenção.
- **Nunca** mantenha teste comentado no repositório. Apaga ou conserta. Comentado é zumbi.
- **Sempre** trate falha de teste em main como **bloqueador**: ninguém faz merge novo até consertar.
- **Nunca** force push para "limpar" teste falho que apareceu em main. Conserta de verdade.

## 22. Anti-patterns universais

- Mock de tudo até o teste virar verificação de mock e não de comportamento.
- Teste que repete a implementação do código (mesmo `if`, mesmo `for`, asserts iguais ao retorno literal).
- `expect(true).toBe(true)` ou asserts vazios.
- Teste sem assert (só chama a função e "espera não dar exception"). Se for esse o contrato, assert explícito: `expect(() => fn()).not.toThrow()`.
- `try/catch` no teste engolindo erro silenciosamente.
- Setup global que faz banco/network real em todo arquivo importado, mesmo testes que não precisam.
- Teste que depende de variável de ambiente sem default seguro — quebra na máquina do colega.
- Comentário `// TODO: fix this test` por mais de uma sprint.
- `.only` ou `.skip` commitado em main.
- Snapshot atualizado sem revisão visual do diff.
- Mock de função privada via reflexão (`(obj as any).privateMethod = ...`). Se você precisa disso, o design está errado.
- Teste de integração que limpa banco com `DROP TABLE` global em paralelo com outros testes. Use namespace isolado.
- E2E que loga com conta de admin compartilhada entre testes paralelos. Cada teste cria seu próprio usuário.
- "Teste passou local, falhou no CI" tratado como falha do CI. Quase sempre é teste com dependência implícita de máquina.
- Assertion sobre `console.log` em vez de retorno/estado. Logs não são API.
- Cobertura como gate único de PR sem revisão qualitativa dos testes adicionados.
