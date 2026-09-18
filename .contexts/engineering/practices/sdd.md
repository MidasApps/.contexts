# Spec-Driven Development (SDD)

> Disciplina de desenvolvimento em que uma especificação formal precede e dirige a construção do código. A spec é o artefato primário versionado e revisado; o código é uma realização de uma spec previamente escrita, validada e aprovada — não uma descoberta paralela. Mudança de comportamento começa, sempre, pela spec.

SDD inverte a ordem usual de muitos workflows: em vez do código ser a fonte da verdade e a documentação um subproduto eventualmente envelhecido, a spec é a fonte da verdade e o código é gerado, escrito ou regenerado para satisfazê-la. O contrato existe antes da implementação. Múltiplas implementações podem satisfazer a mesma spec; nenhuma implementação tem autoridade sobre o que a spec diz.

Este documento descreve SDD como uma prática única com duas tradições complementares: a tradição clássica de API-first / contract-first development, formalizada nos workflows de design de APIs do Stripe, Twilio e da comunidade OpenAPI ao longo dos anos 2010, e a tradição contemporânea de SDD assistida por IA, articulada por Sean Grove em *The New Code* (2024) e materializada em ferramentas como GitHub Spec Kit, Kiro (AWS), Amazon Q Developer specs e Tessl. As duas tradições compartilham princípios; divergem no tipo de spec produzida e no consumidor que ela governa.

---

## O princípio fundamental

SDD opera sobre um único compromisso disciplinar: **toda mudança de comportamento começa pela spec, nunca pelo código**. Esse compromisso, levado a sério, reordena o fluxo de trabalho:

1. Antes de codar, escreve-se ou atualiza-se a spec.
2. A spec é revisada e aprovada como código é revisado — com pull request, discussão e merge.
3. Implementação (humana ou gerada por agente) parte da spec aprovada.
4. Validação compara o sistema construído com a spec, não a spec com o sistema.
5. Divergência entre código e spec é resolvida atualizando a spec primeiro, depois reconciliando o código.

Quando essa ordem é invertida — código primeiro, spec depois — o que se tem é documentação, não SDD. O nome correto para "gerar OpenAPI a partir do código que já existe" é *code-first com documentação derivada*, não spec-first.

---

## As duas tradições

### Tradição clássica: API-first / contract-first

A tradição madura. A spec é um artefato técnico formal que descreve a fronteira de um sistema — tipicamente uma API HTTP, um serviço RPC, um schema de mensagens ou um contrato entre serviços. As notações canônicas são:

- **OpenAPI (antiga Swagger)** — spec de APIs HTTP/JSON, hoje padrão de facto. Estrutura paths, operações, parâmetros, request/response schemas, autenticação, exemplos.
- **JSON Schema** — validação estrutural de payloads, frequentemente reusada por OpenAPI, AsyncAPI e outros.
- **Protocol Buffers / gRPC** — schema-first com geração obrigatória de stubs em múltiplas linguagens.
- **GraphQL SDL (Schema Definition Language)** — tipos, queries, mutations, subscriptions declaradas antes dos resolvers.
- **AsyncAPI** — equivalente do OpenAPI para mensageria, eventos e streaming.
- **Avro / Protobuf schemas** — contratos de eventos em pipelines de dados.

A spec dirige a geração de:

- **Clients tipados** em N linguagens (open-source generators para OpenAPI, plugins de Protobuf, codegen GraphQL).
- **Servidores stub** com routing, validação de input e binding já prontos.
- **Mocks e fixtures** para desenvolvimento paralelo e testes de contrato.
- **Documentação interativa** (Swagger UI, GraphiQL, Redoc) gerada a cada mudança.
- **Testes de contrato** que comparam request/response reais com o que a spec promete.

Workflow canônico clássico:

1. Stakeholders e arquitetos discutem o contrato em uma sessão de design.
2. Um draft de OpenAPI/Proto/SDL é proposto em PR.
3. Reviewers — incluindo consumidores da API, não só os autores — questionam, sugerem e aprovam.
4. Spec é merged. Clients são gerados; mocks são publicados.
5. Equipes do backend e do frontend desenvolvem em paralelo contra o contrato congelado.
6. CI valida que a implementação real responde de acordo com a spec.

Referências de indústria: o "API Design Process" do Stripe é canônico — toda mudança em superfície pública passa por design doc, RFC interna, revisão cross-functional, antes de uma única linha de implementação. O Twilio publica continuamente OpenAPI specs como contrato versionado. O Kubernetes nasceu inteiramente Proto-first.

#### Consumer-Driven Contracts (CDC)

Variante clássica importante. Em vez de o provedor declarar unilateralmente o contrato, cada **consumidor declara o subset da API que efetivamente usa**. A ferramenta canônica é o Pact:

- O consumidor escreve testes locais contra um mock que registra as interações esperadas.
- As interações registradas viram um pact (artefato JSON) publicado em um broker.
- O provedor verifica em CI que sua implementação real satisfaz todos os pacts dos consumidores.
- Mudança breaking quebra o build do provedor antes de chegar em produção.

CDC inverte a posse do contrato: ele é definido pelo uso real, não pela intenção. Útil em ecossistemas com muitos consumidores e contrato evoluindo.

### Tradição contemporânea: SDD assistida por IA

A tradição emergente, articulada conforme agentes de codificação ficaram capazes de gerar código não-trivial a partir de prosa estruturada. Sean Grove cunhou a tese em *The New Code* (2024): **a spec é o novo código**, e o ato criativo central do desenvolvimento se desloca de escrever instruções para máquinas em uma linguagem de programação para escrever intent em prosa estruturada que máquinas (LLMs/agentes) implementam.

Diferenças em relação à tradição clássica:

- **A spec é prosa estruturada em markdown**, não JSON/YAML/SDL. Captura intent, requirements funcionais, constraints, edge cases, critérios de aceitação, em linguagem natural deliberada.
- **O consumidor primário da spec é um agente de codificação** (Claude Code, Cursor, Copilot Workspace, Amazon Q Developer, Kiro). Humanos a leem, revisam e aprovam; agentes a executam.
- **A spec é regenerável → o código é regenerável**. Como o agente reconstrói a implementação a partir da spec, o código deixa de ser o artefato precioso e passa a ser saída derivável.
- **O ciclo é iterativo em fases**: spec → plan → tasks → implementation, com revisão humana em cada fronteira.

Ferramentas que materializam essa tradição:

- **GitHub Spec Kit** (2024) — toolkit open-source que estrutura specs em markdown com seções canônicas e integra com Copilot/Claude para geração.
- **Kiro (AWS)** — IDE com workflow nativo de spec-first em três fases (Requirements → Design → Tasks).
- **Amazon Q Developer specs** — feature de Q Developer para gerar implementações a partir de specs versionadas.
- **Tessl** — ambiente de "spec-native development" onde a spec, e não o código, é o artefato versionado em git.

O framework **DDC (Domain-Driven Context)** deste repositório é, ele próprio, uma instância de SDD aplicada a contextos de engenharia: cada documento em `.contexts/` é uma spec estruturada que dirige o comportamento de agentes operando no projeto. O agente roteador (`@ddc-engineering`) é simultaneamente leitor e produtor de specs.

#### Estrutura canônica de uma spec contemporânea

Uma spec markdown para agente de IA segue tipicamente uma estrutura de cinco seções (formato Kiro/Spec Kit consolidado):

1. **Context / Background** — por que esta feature existe, qual problema resolve, qual escopo abrange. Inclui referências cruzadas para specs vizinhas.
2. **Requirements** — o que o sistema deve fazer, articulado em frases declarativas. Frequentemente em formato EARS (Easy Approach to Requirements Syntax): "When [trigger], the system shall [response]".
3. **Design / Approach** — como será implementado em alto nível. Arquitetura proposta, decisões de tradeoff, alternativas consideradas e rejeitadas. Aponta para decisions (@decisions) e architecture (@architecture) já existentes.
4. **Tasks / Implementation Plan** — quebra do trabalho em passos executáveis, ordenados, cada um auto-contido o suficiente para ser executado isoladamente por um agente.
5. **Acceptance Criteria** — como saberemos que está pronto. Lista de comportamentos verificáveis, idealmente mapeáveis a testes (@practices/tdd, @practices/bdd) ou evals (para componentes de IA).

#### Specs para componentes de IA

No stack do projeto, que inclui Vercel AI SDK, Mastra, OpenAI e Gemini, a spec de uma feature de IA generativa precisa ir além do contrato HTTP. Inclui:

- **Intent do agente** — qual o papel, qual a persona, quais ferramentas pode usar.
- **System prompt** ou estrutura do prompt — versionada como artefato literal da spec.
- **Constraints comportamentais** — o que o agente nunca deve fazer, qual tom, qual idioma.
- **Critérios de avaliação (evals)** — exemplos de entrada e saída esperada, métricas qualitativas, testes adversariais.
- **Fallback e degradação** — comportamento quando o modelo falha, quando latência excede limite, quando ferramenta retorna erro.

Esta camada da spec é o que evita o desalinhamento entre intenção e comportamento real do agente — o equivalente, para sistemas de IA, do que contratos OpenAPI são para APIs HTTP.

---

## Princípios comuns às duas tradições

Apesar das diferenças de notação e consumidor, as duas tradições compartilham invariantes:

- **Spec antes de código.** Sempre.
- **Spec é versionada como código.** Vive em git, passa por PR, tem histórico de mudanças, suporta blame e diff.
- **Spec é revisada por mais de uma pessoa.** Idealmente incluindo o consumidor do contrato — outro time, outro serviço, outro agente, o usuário final.
- **Mudança de comportamento começa pela spec.** Bug? A spec não previa o caso ou a implementação diverge — corrige-se a spec primeiro, depois o código.
- **Spec é validável.** Tradição clássica: testes de contrato e schema validation. Tradição contemporânea: evals, testes de aceitação derivados, revisão manual antes do merge.
- **Separação spec ↔ implementação.** Permite múltiplas implementações (poliglota, refactor radical, troca de provedor) sem mudar o contrato.

---

## Diferenciação rápida

SDD coabita com práticas vizinhas; confundi-las dilui as quatro.

- **TDD** (@practices/tdd) — testes como spec executável de unidades pequenas. O teste é simultaneamente especificação e validação; a unidade testada é tipicamente uma função ou classe. SDD opera em granularidade maior: contratos de fronteira, features inteiras, comportamentos de agente. Coabitam: a spec define o quê e o porquê; TDD molda como a unidade interna emerge para satisfazê-la.
- **BDD** (@practices/bdd) — cenários de comportamento de negócio descobertos colaborativamente em conversa cross-functional (three amigos), formulados em linguagem ubíqua, frequentemente em Gherkin. Foco no exemplo concreto. SDD enfatiza o documento spec formal/estruturado, não necessariamente Gherkin nem three amigos; o ponto de partida é a spec como entregável de design, não a conversa como ritual. As duas se sobrepõem em "specs executáveis" — BDD pode ser visto como uma forma de SDD onde a spec é uma coleção de cenários comportamentais.
- **DDD** (@architecture/ddd) — modela o domínio em bounded contexts com linguagem ubíqua. Estrutura conceitual, não método de produção de código. SDD captura intent e contrato em artefatos versionados; DDD informa o vocabulário que esses artefatos usam. Complementares: linguagem ubíqua DDD é o vocabulário natural das specs.
- **Clean Code** (@practices/clean-code) — princípios de qualidade aplicáveis com ou sem SDD.

Resumo operacional:

| Pergunta | Resposta |
|---|---|
| Quem é o consumidor primário do artefato? | TDD: o próprio dev; BDD: business + dev + QA; SDD clássico: outro serviço/cliente; SDD contemporâneo: agente de IA. |
| Qual o nível de granularidade? | TDD: função/classe; BDD: cenário de comportamento; SDD: fronteira de sistema ou feature inteira. |
| Qual a notação canônica? | TDD: linguagem de programação; BDD: Gherkin/linguagem ubíqua; SDD: OpenAPI/Proto/SDL/markdown estruturado. |
| O artefato sobrevive ao código? | TDD: vive junto; BDD: vive junto como documentação executável; SDD: pode preceder o código por meses e sobrevive a refactors completos. |

---

## Quando aplicar SDD

SDD entrega ROI quando ao menos uma das condições é verdadeira:

- **APIs públicas ou contratos com múltiplos consumidores** — o custo de breaking change é alto e a spec é o canal mais barato de coordenação. Tradição clássica.
- **Sistemas distribuídos com times separados** — frontend e backend, microsserviços, integrações cross-team. A spec permite paralelismo desbloqueado.
- **Desenvolvimento com agentes de IA** — sempre que o código será gerado ou modificado por um agente, a spec é o que mantém o resultado alinhado com a intenção. Tradição contemporânea.
- **Features com requirements complexos** que merecem design upfront — workflows de aprovação, cálculos regulatórios, máquinas de estado não triviais, fluxos com múltiplas branches.
- **Componentes de IA generativa** com personas, ferramentas, system prompts e constraints que precisam ser versionados e auditáveis.
- **Plataformas e produtos com SDKs** — a spec é o contrato exposto aos integradores.

## Quando NÃO aplicar SDD

A disciplina tem custo de cerimônia. Há contextos onde ela gera fricção sem retorno:

- **Spike e protótipos exploratórios** cujo destino é o lixo. Especificar formalmente um experimento descartável é desperdício.
- **UI puramente experimental** ou trabalho de design exploratório onde o comportamento ainda não está definido o suficiente para ser escrito.
- **Features triviais** sem regras de negócio significativas — CRUD direto, formulários simples, telas de listagem padrão.
- **Bugfix urgente bem localizado** — escrever spec retroativa para uma vírgula trocada é teatro. (Quando o bug expõe ambiguidade real na spec original, aí sim atualiza-se a spec primeiro.)
- **Scripts one-shot e migrations descartáveis.**
- **Trabalho onde requirements mudam mais rápido do que se escreve a spec** — sintoma de problema upstream, não problema de SDD. Resolva o problema antes.

A heurística honesta: se o custo de especificar excede o custo de errar a implementação e refazer, SDD não paga. Para tudo que cruza fronteira formal, sobrevive longevamente ou será construído por um agente, paga.

---

## Trade-offs honestos

SDD tem custos reais que precisam ser explicitados:

- **Overhead inicial.** Escrever spec antes consome tempo que parece "improdutivo" para quem mede produtividade em linhas de código. O retorno aparece em coordenação, em refactor seguro e em código gerável.
- **Risco de over-specification.** Specs que tentam prever tudo se tornam impossíveis de manter e empurram trabalho criativo para fora do processo. A spec deve descrever o que importa, não toda decisão local de implementação.
- **Spec pode envelhecer.** Se não tratada como código (com PR, review, CI verificando consistência com implementação), spec diverge e vira documentação fantasma. A regra "spec é código" não é metáfora — é exigência operacional.
- **Agentes podem gerar código que não respeita partes sutis da spec.** LLMs podem ignorar constraints implícitas, edge cases mencionados de passagem, ou requisitos não-funcionais. **Revisão humana do código gerado contra a spec não é opcional.**
- **Specs em prosa têm ambiguidade.** Diferente de OpenAPI (validável estruturalmente), uma spec markdown depende da disciplina de quem escreve. Mitigação: estrutura padronizada, exemplos concretos, critérios de aceitação verificáveis.
- **Custo de manter spec ↔ código em sync após mudanças no código.** Bug fixes feitos diretamente no código sem atualizar spec corroem a confiança no artefato. CI que detecta drift entre spec e implementação real ajuda — pact verification (clássica), eval suites (IA), schema validation em runtime.

---

## Prática concreta no stack do projeto

### APIs públicas: OpenAPI primeiro

Para qualquer endpoint HTTP exposto externamente ou consumido por outro serviço/frontend, escreva OpenAPI 3.x antes da rota Next.js. A spec é committada em `apis/<service>/openapi.yaml` (ou equivalente) e revisada via PR. A partir dela:

- Tipos TypeScript são gerados para uso no servidor (ex.: `openapi-typescript` ou `orval`).
- Clients tipados são gerados para frontends e SDKs.
- Mocks são publicados para desenvolvimento paralelo de frontend.
- CI valida que respostas reais da rota satisfazem a spec.

### Inputs / outputs internos: Zod como spec

Para fronteiras internas entre módulos, server actions, RPCs internos e validação de payloads, Zod (@stacks/validation/zod@4) é a forma canônica de spec executável. O schema Zod é simultaneamente:

- Contrato declarativo (a "spec").
- Validador runtime (a verificação).
- Fonte de tipos TypeScript (a integração).

A regra: schema Zod **antes** da rota/action/função que o consome. Mudança de contrato começa pelo schema. Veja @rules/validation para regras imperativas de uso.

### Eventos e mensagens: schemas versionados

Para eventos publicados em Firebase Functions, Pub/Sub ou qualquer barramento, defina o schema do payload como spec separada (Zod ou JSON Schema), versionada explicitamente. Consumidores referenciam a versão; mudança breaking exige novo versionamento, não edição in-place.

### Features de produto desenvolvidas com agente: spec markdown estruturada

Para features que serão construídas com auxílio de Claude Code ou outro agente, especialmente as não-triviais, escreva spec markdown em `specs/<feature-slug>.md` (ou estrutura equivalente do projeto) antes de pedir geração. Estrutura mínima:

```markdown
# Feature: <nome>

## Context
Por que existe, qual problema resolve, escopo, referências a @decisions e @architecture.

## Requirements
Lista declarativa de comportamentos obrigatórios.
- When <trigger>, the system shall <response>.
- ...

## Design
Abordagem técnica, módulos afetados, schemas afetados, decisões de tradeoff.

## Tasks
1. ...
2. ...
3. ...

## Acceptance Criteria
- [ ] ...
- [ ] ...
```

O agente parte da spec aprovada. Código gerado é revisado contra ela; divergência exige atualização explícita da spec ou correção do código.

### Componentes de IA generativa: spec inclui prompt e evals

Para agentes implementados com Vercel AI SDK, Mastra ou SDKs nativos (OpenAI, Gemini), a spec da feature inclui:

- Persona e papel do agente.
- System prompt como artefato literal versionado.
- Ferramentas (tools) disponíveis e suas assinaturas.
- Constraints comportamentais (idioma, tom, limites éticos, recusas obrigatórias).
- Eval suite mínima: exemplos de entrada e saída esperada, casos adversariais, métrica de sucesso.

Modificação de comportamento do agente começa pela spec — não por edit direto no prompt em produção.

### DDC: este próprio framework

O framework DDC (`.contexts/`) é uma instância recursiva de SDD: cada arquivo em `engineering/{decisions,rules,architecture,practices,stacks,contracts,processes}` é uma spec que dirige o comportamento de agentes (humanos e LLMs) operando no projeto. O agente `@ddc-engineering` é roteador e produtor de specs. Mudança de convenção de engenharia começa pela criação ou atualização de um documento aqui, não por mudança direta no código.

---

## Anti-patterns

Práticas que se vestem de SDD sem sê-lo:

- **Code-first com OpenAPI gerado depois, chamado de "spec-first".** Se a spec deriva do código, o contrato é definido pela implementação — não pelo design. É documentação retroativa, não SDD.
- **Spec escrita depois da implementação para satisfazer processo.** Teatro burocrático. A spec não dirigiu nada; ratificou o que já foi feito.
- **Spec para tudo, inclusive trivialidades.** "Spec de tres parágrafos para um endpoint de health check" sinaliza disciplina mal calibrada — derruba o ROI da prática.
- **Spec sem critério de aceitação.** Spec que descreve intent mas não diz como sabemos que está pronto convida implementação que parece atender mas não atende.
- **Aceitar código de agente sem verificar contra a spec.** O agente gerou; o desenvolvedor mergeou. Sem revisão humana confrontando spec ↔ código, o desalinhamento se acumula e a spec vira ficção.
- **Spec versionada mas nunca atualizada.** Bug fix direto no código sem atualizar a spec correspondente. Em meses, spec e código divergiram silenciosamente.
- **Spec como wishlist sem priorização ou viabilidade.** Specs que listam tudo que seria bom ter, sem distinção entre obrigatório, desejado e fora de escopo, paralisam a fase de implementação.
- **Spec sem owner.** Ninguém é responsável por mantê-la em sync. Vira documento órfão.
- **Pular fases do ciclo iterativo.** Pular do requirements direto para implementation sem o estágio de design ou de tasks colapsa SDD em "prompt único enorme" e perde os pontos de revisão humana.
- **Spec ambígua passada a agente sem revisão.** "O agente vai descobrir" — não vai. Vai inventar coerentemente algo plausível mas errado.

---

## Critérios de saúde da prática

Sinais de que SDD está saudável no projeto:

- PRs que adicionam comportamento contêm mudança de spec **antes** ou **junto com** mudança de código — visível no diff.
- Code review é precedida por spec review; spec review tem participantes além do autor.
- Spec é referenciada em discussões de produto, não apenas em onboarding técnico.
- Implementações geradas por agente são revisadas confrontando-se com a spec; discrepâncias são tratadas (correção ou atualização da spec).
- CI verifica consistência entre spec e implementação onde possível (schema validation, contract tests, evals).
- Quando o time troca uma ferramenta da stack, a spec do contrato sobrevive — apenas a implementação muda.

Sinais de degradação:

- Specs antigas com timestamps de última edição muito anteriores ao código que descrevem.
- "Vou atualizar a spec depois" virou padrão e nunca acontece.
- PRs que tocam comportamento sem tocar spec correspondente passam sem comentário.
- Agente gera código e o resultado vai direto para o merge sem revisão.
- Specs que ninguém lê — só são editadas por quem as escreveu originalmente.
- Discussão técnica acontece em chat efêmero, nunca chega à spec.

---

## Referências canônicas

- Sean Grove — *The New Code* (2024). A articulação contemporânea de "spec is the new code".
- GitHub Spec Kit — github.com/github/spec-kit. Toolkit open-source para SDD assistida por IA.
- AWS Kiro — workflow IDE com fases Requirements / Design / Tasks como estrutura nativa de SDD.
- Amazon Q Developer specs — documentação oficial AWS sobre specs como entrada para geração.
- Tessl — abordagem de "spec-native development" com spec versionada em git como artefato primário.
- OpenAPI Initiative — spec.openapis.org. O padrão de facto para API-first.
- Pact — pact.io. Consumer-Driven Contracts em prática.
- Stripe API Design Guide — stripe.com/blog/api-design (e materiais derivados). Referência de design-first em escala.
- Twilio API Design — engineering.twilio.com. Documentação de processo contract-first.
- AsyncAPI — asyncapi.com. Equivalente do OpenAPI para mensageria.

---

## Referências cruzadas no projeto

- `@practices/tdd` — disciplina complementar; testes como spec executável de unidades, SDD como spec de fronteira e feature.
- `@practices/bdd` — disciplina vizinha; cenários colaborativos como uma forma específica de spec comportamental.
- `@practices/clean-code` — princípios de qualidade aplicáveis ao código que satisfaz a spec.
- `@architecture/ddd` — linguagem ubíqua como vocabulário natural das specs.
- `@architecture/hexagonal` — ports são exatamente as fronteiras onde contratos formais de SDD se materializam.
- `@rules/validation` — regras imperativas sobre uso de Zod como spec executável de inputs/outputs.
- `@stacks/validation/zod@4` — Zod como notação de spec runtime no stack TypeScript.
- `@stacks/ai/vercel-ai-sdk`, `@stacks/ai/mastra-sdk`, `@stacks/ai/openai`, `@stacks/ai/gemini` — runtimes onde specs de componentes de IA são executadas.
- `@stacks/backend/firebase-functions` — handlers cujos contratos de payload precisam ser especificados.
- `@contracts/schemas` — convenções de modelagem aplicáveis às specs de dados.
- `@contracts/api` — convenções de modelagem aplicáveis às specs de API.
- `@decisions` — decisões arquiteturais que informam o design de cada spec.
