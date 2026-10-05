# Administração: IA

Esta página cobre as áreas do grupo **IA** da administração da plataforma: **Agentes e prompts**, **Modelos**, **Avaliações**, **Traces**, **Logs** e **Custos**. Nelas a equipe decide quais agentes cada organização usa, qual modelo atende cada função, quanto cada modelo custa, quais versões de prompt vão para produção e acompanha execuções e gastos. Para saber quem pode entrar na administração, veja [Administração da plataforma](/docs/admin).

Os preços e custos aparecem na tela em dólares (US$). Nos exemplos em JSON, que mostram os dados como a API os envia, o dinheiro vem em micro-dólares: `2000000` equivale a US$ 2,00.

## Agentes e prompts

**Para que serve:** ver os agentes que o runtime registrou, ligar ou desligar subagentes, ferramentas web e o modo de dados pessoais de cada organização, e gerenciar as versões dos prompts da plataforma.

- **URL:** `/admin/agents` e `/admin/agents/<id do agente>/prompts`
- **Permissões:** `platform.agent.manage` para a página e as configurações por organização; `platform.prompt.manage` para os prompts. As duas são só do `platform-admin`.

![Página Agentes e prompts](/guide/admin-agents.jpg)

*Na tela: `/admin/agents`.*

### Agentes registrados

A seção **Agentes registrados** mostra cada agente com o papel (**Supervisor**, **Entrada** ou **Subagente**), se está **Sempre disponível** ou **Habilitado por organização**, e as listas **Subagentes**, **Ferramentas**, **Skills** e **Permissões (teto)**. Os agentes com prompt versionado têm o botão **Ver prompts**.

| Agente | O que faz |
|---|---|
| Assistente | Supervisor: conversa com a pessoa e delega aos demais agentes |
| Conhecimento | Responde com a base de conhecimento, citando as fontes |
| Dados | Consulta o catálogo de dados |
| Ações | Executa comandos, com confirmação e aprovação quando exigido |
| Web | Pesquisa e lê páginas da web, quando liberado |

### Agentes por organização

1. Em **Agentes por organização**, escolha a organização. O endereço da página guarda a escolha.
2. Em **Agentes habilitados**, ligue ou desligue cada subagente para o qual o assistente pode delegar. Cada mudança é salva na hora, com uma mensagem como "Conhecimento habilitado em Clínica Exemplo."
3. Em **Ferramentas web**, ligue **Busca e leitura de páginas** ou **Navegador automatizado**. Ao ligar, confirme em **Ligar**. Os agentes da organização passam a acessar a web pública em todas as conversas.
4. Em **Dados pessoais nas mensagens**, escolha **Mascarar** (os dados pessoais são mascarados antes de chegar ao modelo) ou **Avisar** (o detector só registra o achado). Trocar para **Avisar** pede confirmação em **Só avisar**.

As ferramentas web só valem enquanto a flag `ai.web-tools` da plataforma estiver ligada (veja [Administração: operações](/docs/admin-operations)). Todas as mudanças ficam na auditoria.

Exemplo: a Clínica Exemplo pede que o agente Web pesquise artigos públicos. Você liga o subagente **Web** e a **Busca e leitura de páginas**, e mantém **Mascarar** nos dados pessoais.

Um agente registrado, como a API o envia:

```json
{
  "id": "knowledge",
  "name": "Knowledge",
  "description": "Answers questions about the organization's documents and data catalog from the knowledge base, citing every claim.",
  "role": "subagent",
  "enablement": "per-organization",
  "subagents": [],
  "tools": ["knowledge.searchKnowledge"],
  "toolsVaryByOrganization": false,
  "skills": ["knowledge-citations"],
  "permissions": ["core.chat.use", "core.knowledge.read", "core.catalog.read"]
}
```

Ao ligar um subagente, a página envia a nova lista de agentes habilitados da organização:

```json
{ "enabledAgents": ["knowledge", "data", "web"] }
```

### Versões do prompt

Nada é editado no lugar: cada alteração é uma nova versão, e uma versão só vai para produção depois de avaliada e ativada.

1. Em **Agentes registrados**, clique em **Ver prompts** no agente.
2. Clique em **Nova versão**. O texto parte da versão ativa ou, se ainda não houver versão, das instruções que o agente tem no código.
3. Edite o **Texto do prompt** (até 50.000 caracteres) e, se quiser, a **Nota** com o motivo da mudança.
4. Clique em **Criar versão**. Aparece, por exemplo, "Versão 3 criada."
5. Na linha da versão, clique em **Avaliar**. A avaliação roda o conjunto de avaliação do agente e pode levar alguns minutos. O resultado aparece por avaliador, com **Atingiu o mínimo** ou **Abaixo do mínimo**.
6. Se a coluna **Avaliação** mostrar **Aprovada**, clique em **Ativar** e confirme em **Ativar versão**. A versão passa a valer para todas as organizações.

Outras ações:

- **Reverter**: ativa uma versão anterior. É um novo registro de ativação, confirmado em **Reverter**.
- **Forçar ativação**: aparece quando a versão não tem avaliação aprovada. Exige um **Motivo**, que fica no histórico e na auditoria. Confirme em **Forçar ativação**.
- **Comparar**: mostra a diferença linha a linha entre duas versões, escolhidas em **De** e **Para**.

O **Histórico de ativações** lista cada ativação com **Versão**, **Quando**, **Quem**, **Tipo** (**Com avaliação** ou **Forçada**) e **Motivo**.

| Versão | Nota | Avaliação | Situação |
|---|---|---|---|
| v3 | Responde em tom mais formal | Não avaliada | |
| v2 | Cita sempre a fonte | Aprovada | Ativa |
| v1 | Primeira versão | Reprovada | |

### Cuidados

- "Avalie a versão: só uma avaliação aprovada libera a ativação." O botão **Ativar** fica desabilitado até a avaliação dar **Aprovada**.
- "O texto é igual ao da versão ativa. Altere algo para criar uma nova versão."
- "O texto pode ter no máximo 50.000 caracteres."
- "Informe o motivo da ativação forçada."
- "Este agente ainda não tem um conjunto de avaliação." Sem conjunto de avaliação, a versão não pode ser avaliada.

## Modelos

**Para que serve:** escolher o modelo de cada função dos agentes e definir o custo de cada modelo, sem novo deploy.

- **URL:** `/admin/models`
- **Permissão:** `platform.model.manage`, só do `platform-admin`.

![Página Modelos com o modelo e o custo de cada função](/guide/admin-models.jpg)

*Na tela: `/admin/models`: o modelo de cada função, com o custo ao lado, e as funções fixas do ambiente.*

### Modelo de cada função

Quatro funções de texto podem ser trocadas aqui:

| Função | Para que serve |
|---|---|
| Conversa | Agentes de chat |
| Tarefas rápidas | Títulos, resumos e verificações de segurança |
| Raciocínio | Planejamento de ações |
| Avaliador | Nota dos evals em modo real |

As funções **Embeddings**, **Transcrição**, **Fala** e **Voz em tempo real** aparecem só para consulta, com a nota "Definido no ambiente do runtime". Trocar o modelo de embeddings exige reindexar a base de conhecimento, e a voz segue suas próprias flags.

Cada opção da lista mostra o modelo e o preço, como "openai/gpt-6-luna — US$ 0,10 entrada · US$ 0,50 saída por 1M". Modelos de embeddings não aparecem nas funções de texto. Modelos de provedores sem chave configurada aparecem com "(provedor sem chave)" e não podem ser escolhidos.

### Custo dos modelos

A tabela **Custo dos modelos** tem as colunas **Modelo**, **Entrada (US$ / 1M tokens)**, **Saída (US$ / 1M tokens)**, **Origem**, **Provedor** e **Ações**.

- **Origem**: **Código** (preço que vem com o produto), **Equipe** (preço definido aqui) ou **Sai ao salvar**.
- **Provedor**: **Disponível**, **Sem chave** ou **A confirmar**.
- **Restaurar**: devolve o preço do código. Se o modelo não tem preço no código, ele fica como **Sai ao salvar** e sai da lista quando você salvar. Para desfazer, clique em **Manter**.
- **Remover**: tira da tabela um modelo que você acabou de adicionar. Fica desabilitado enquanto alguma função usa o modelo, com o aviso "Em uso: Conversa, Raciocínio", por exemplo.

### Passo a passo

1. Em **Modelo de cada função**, escolha o modelo de cada função de texto.
2. Se quiser outro preço, edite os campos de entrada e saída na tabela.
3. Para usar um modelo que não está na tabela, vá em **Adicionar modelo**, informe o **Modelo** no formato provedor/modelo (por exemplo `openai/gpt-6-luna`) e os preços de **Entrada (US$ / 1M tokens)** e **Saída (US$ / 1M tokens)**, e clique em **Adicionar modelo**.
4. Clique em **Salvar**. Aparece "Modelos salvos." e a data em "Atualizado em".

O salvamento fica na auditoria como `MODEL_SETTINGS_UPDATED`. Não é preciso reiniciar nada. A instância que salvou aplica a mudança na hora, e as demais em até 60 segundos.

Se o runtime estiver em modo simulado, você verá: "O runtime está em modo simulado: as funções usam modelos roteirizados. O que você salvar vale quando o modo real for ligado."

Exemplo: configuração local em 5 de outubro de 2026.

| Função | Modelo | Entrada | Saída |
|---|---|---|---|
| Conversa | openai/gpt-6-sol | US$ 2,00 | US$ 10,00 |
| Raciocínio | openai/gpt-6-sol | US$ 2,00 | US$ 10,00 |
| Tarefas rápidas | openai/gpt-6-luna | US$ 0,10 | US$ 0,50 |
| Avaliador | openai/gpt-6-luna | US$ 0,10 | US$ 0,50 |
| Embeddings | openai/text-embedding-3-small | US$ 0,02 | |

O `openai/gpt-6-astra` (US$ 10,00 de entrada e US$ 50,00 de saída por 1M tokens) tem preço cadastrado, mas nenhuma função o usa.

O que a página envia ao salvar:

```json
{
  "roles": {
    "chat": "openai/gpt-6-sol",
    "fast": "openai/gpt-6-luna",
    "reasoning": "openai/gpt-6-sol",
    "judge": "openai/gpt-6-luna"
  },
  "models": [
    { "modelId": "openai/gpt-6-luna", "inputMicroUsdPerMTok": 100000, "outputMicroUsdPerMTok": 500000 }
  ]
}
```

### O que é recusado e por quê

O salvamento é recusado se alguma função de texto:

- usar um modelo **sem preço**;
- usar um **modelo de embeddings**, que produz vetores e não texto;
- usar um modelo cujo **provedor não tem chave configurada**. Em modo simulado essa regra não vale, porque nenhum provedor é chamado.

Nesses casos aparece: "Não foi possível salvar: cada função precisa de um modelo com preço e de um provedor com chave configurada." A regra garante que toda chamada tenha preço, para que os orçamentos sempre contem dinheiro.

Outros avisos:

- "Use provedor/modelo, com o provedor google, openai ou anthropic."
- "Este modelo já está na tabela."
- "A equipe pode definir até 50 preços."
- "Informe um valor em dólares com até seis casas decimais."
- "Informe o preço."

### Cuidados

- O preço definido pela equipe não é conferido com o provedor. A **Origem** **Equipe** mostra quais preços vieram daqui.
- Os preços são os de contexto curto. Chamadas muito longas podem ser cobradas pelo provedor a uma taxa maior do que a registrada.

## Avaliações

**Para que serve:** ver os experimentos de avaliação, com as notas por avaliador e o veredito, comparar dois experimentos e consultar os datasets usados.

- **URL:** `/admin/evals`
- **Permissão:** `platform.eval.manage`, só do `platform-admin`.

![Página Avaliações da administração](/guide/admin-evals.jpg)

*Na tela: `/admin/evals`.*

### Experimentos

A aba **Experimentos** tem as colunas **Experimento**, **Dataset**, **Status** (**Na fila**, **Em andamento**, **Concluído** ou **Falhou**), **Veredito** (**Aprovado**, **Reprovado** ou **Pendente**), **Itens**, **Notas por avaliador**, **Início**, **Fim** e **Comparação**. Os experimentos aparecem quando o CI publica as avaliações ou quando alguém avalia uma versão de prompt.

Para comparar:

1. Clique em **Comparar** em um experimento. Ele fica como **Na comparação**.
2. Clique em **Comparar** em outro, mesmo que esteja em outra página.
3. Veja o gráfico **Nota média por avaliador** e o **Resultado por avaliador**, como "B melhor que A" ou "sem diferença".
4. Para recomeçar, clique em **Limpar comparação**.

Exemplo:

| Experimento | Veredito | Notas por avaliador |
|---|---|---|
| exp-0412 | Aprovado | fidelidade: 0,91 (mínimo 0,80) |
| exp-0398 | Reprovado | fidelidade: 0,72 (mínimo 0,80) |

### Datasets

A aba **Datasets** lista **Dataset**, **Escopo** (**Plataforma** ou **Organização** seguido do nome), **Versão**, **Agentes** e **Criado em**.

## Traces

**Para que serve:** ver as execuções de agentes e workflows de todas as organizações, com duração, tokens e custo.

- **URL:** `/admin/traces` e `/admin/traces/<id do trace>`
- **Permissão:** `platform.trace.read`, dos papéis `platform-admin` e `platform-support`.

![Página Traces](/guide/admin-traces.jpg)

*Na tela: `/admin/traces`.*

### Passo a passo

1. Filtre por **Organização**, **Agente**, **Status** (**OK** ou **Erro**), **De** e **Até**. As datas são dias inteiros, no fuso horário do seu navegador.
2. Clique em **Filtrar**.
3. Clique no trace para abrir o detalhe.

A tabela tem as colunas **Trace**, **Organização**, **Agente ou workflow**, **Status**, **Início**, **Duração**, **Tokens (entrada / saída)** e **Custo**. No detalhe, você vê o resumo, os spans com modelo, duração, tokens, custo e a entrada e a saída de cada um, e o link **Ver logs deste trace**.

Exemplo:

| Trace | Organização | Agente ou workflow | Status | Duração | Tokens | Custo |
|---|---|---|---|---|---|---|
| chat | Clínica Exemplo | Agente assistant | OK | 4,2 s | 3.120 / 410 | US$ 0,01 |
| usage-report | Plataforma | Workflow usage-report | Erro | 12,8 s | 0 / 0 | US$ 0,00 |

### Cuidados

- "Use letras minúsculas, números e hífens, começando por uma letra." O filtro **Agente** recebe o id do agente, como `assistant`.
- Um span sem preço conhecido mostra **Preço desconhecido**.

## Logs

**Para que serve:** ler as linhas de log recentes do processo web no ambiente local, das mais novas para as mais antigas.

- **URL:** `/admin/logs`
- **Permissão:** `platform.trace.read`, dos papéis `platform-admin` e `platform-support`.

![Página Logs](/guide/admin-logs.jpg)

*Na tela: `/admin/logs`.*

### Passo a passo

1. Filtre por **Nível mínimo** (**Debug ou acima**, **Info ou acima**, **Aviso ou acima** ou **Só erros**), **Texto da mensagem**, **Trace** ou **Requisição**.
2. Clique em **Aplicar**.
3. Para buscar linhas novas, clique em **Atualizar**.

Cada linha mostra o nível, a mensagem, o serviço e o ambiente, e pode abrir o trace ligado a ela. Uma linha, como a API a envia:

```json
{
  "timestamp": "2026-09-30T12:00:00.000Z",
  "level": "info",
  "message": "order_placed",
  "service": "web",
  "env": "local",
  "requestId": "01J8Z3K4M5N6P7Q8R9S0T1V2W3",
  "traceId": null,
  "fields": { "durationMs": 42 }
}
```

### Cuidados

- A página guarda só as últimas 500 linhas, e só do processo web.
- Fora do ambiente local, os logs ficam no Cloud Logging. A página mostra o link **Abrir o Cloud Logging**. Escolha lá o projeto do ambiente.

## Custos

**Para que serve:** acompanhar o custo de modelos no mês por organização, comparado ao limite de cada uma, e ver o uso por dia e por modelo.

- **URL:** `/admin/costs`
- **Permissão:** `platform.usage.read`, dos papéis `platform-admin` e `platform-support`.

![Página Custos](/guide/admin-costs.jpg)

*Na tela: `/admin/costs`.*

### O que a página mostra

- **Resumo do mês**: **Custo no mês**, quantas organizações estão **Em 80% ou mais** e quantas estão **Acima do limite**, com as execuções bloqueadas pelo orçamento.
- **Precisam de atenção**: as organizações perto do limite. O alerta dispara em 80% do limite mensal, e em 100% as execuções param.
- **Orçamentos**: tabela com **Organização**, **Custo no mês**, **Limite mensal**, **Limite de tokens**, **Origem do limite**, **Uso do limite** e **Ações**. Filtre por **Nível de uso**: **Todas**, **A partir do alerta** ou **Acima do limite**.
- **Uso por dia e por modelo**: custo e chamadas do período, direto do registro de uso.

### Passo a passo

1. Em **Orçamentos**, escolha o **Nível de uso** para ver só as organizações em alerta.
2. Clique em **Ajustar orçamento** na linha da organização. Você vai para o detalhe dela, em **Organizações** (o ajuste exige `platform.organization.update`).
3. Em **Uso por dia e por modelo**, escolha a **Organização** e o período em **De** e **Até**. Sem datas, vale o mês atual até hoje.

Os dias do uso são em UTC. O resumo diz, por exemplo: "De 01/10/2026 a 05/10/2026: US$ 48,30 em 1.204 chamadas e 3.900.000 tokens."

Exemplo de uso por modelo:

| Modelo | Provedor | Chamadas | Tokens de entrada | Tokens de saída | Custo |
|---|---|---|---|---|---|
| openai/gpt-6-sol | openai | 820 | 2.400.000 | 310.000 | US$ 7,90 |
| openai/gpt-6-luna | openai | 384 | 1.100.000 | 90.000 | US$ 0,16 |

O uso de uma organização em dois dias, como a API o envia:

```json
{
  "from": "2026-09-29",
  "to": "2026-09-30",
  "organizationId": "Or1aB2cD3eF4gH5iJ6kL",
  "totals": { "calls": 240, "inputTokens": 310000, "outputTokens": 42000, "costMicroUsd": 1250000, "unpricedCalls": 0 },
  "byDay": [
    { "day": "2026-09-29", "calls": 0, "inputTokens": 0, "outputTokens": 0, "costMicroUsd": 0, "unpricedCalls": 0 },
    { "day": "2026-09-30", "calls": 240, "inputTokens": 310000, "outputTokens": 42000, "costMicroUsd": 1250000, "unpricedCalls": 0 }
  ],
  "byModel": [
    { "provider": "openai", "model": "gpt-6-sol", "calls": 240, "inputTokens": 310000, "outputTokens": 42000, "costMicroUsd": 1250000, "unpricedCalls": 0 }
  ],
  "organizations": 1,
  "truncated": false,
  "generatedAt": "2026-09-30T12:00:00.000Z"
}
```

### Cuidados

- "Escolha um período de até 92 dias, com o início antes do fim." Use **Limpar o período** para voltar ao mês atual.
- Chamadas sem preço conhecido entram na contagem de tokens, mas não no custo. A página avisa quantas foram.
- Se houver muitas organizações, a página avisa que os números cobrem só parte delas. Filtre por organização para ver as demais.

## Veja também

- [Administração da plataforma](/docs/admin)
- [Administração: clientes](/docs/admin-customers)
- [Administração: operações](/docs/admin-operations)
- [Agentes](/docs/agents)
- [Avaliações](/docs/evals)
- [Traces](/docs/traces)
- [Uso e limites](/docs/usage)
