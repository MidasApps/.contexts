# Agentes e habilidades

Nesta área, a organização decide quais agentes de IA as pessoas podem usar no [Assistente](/docs/chat): cria agentes próprios, liga e desliga os agentes da plataforma e dos módulos, acrescenta instruções da organização e escreve habilidades, que ensinam aos agentes como executar uma tarefa do jeito da casa.

## O que é

Há três tipos de agente:

| Tipo | Quem define | Como as pessoas usam |
|---|---|---|
| **Assistente** | A plataforma | É o padrão de toda conversa. Conversa com as pessoas, planeja o trabalho e delega aos agentes ativados. Está sempre ativo. |
| **Agentes da plataforma** e de módulos | A plataforma e os [módulos](/docs/modules) instalados | O Assistente delega tarefas a eles quando estão ativados (por exemplo, o Agente de conhecimento, o de dados, o de ações e o de pesquisa na web). |
| **Agentes da organização** | Quem administra a organização | São escolhidos diretamente no seletor **Agente** ao iniciar uma conversa. O Assistente **não** delega tarefas a eles. |

Um agente da organização é só configuração: um nome, uma descrição, instruções, um modelo, as ferramentas que ele pode usar, as habilidades que ele consulta e o alcance dele na base de conhecimento. Nenhum código da organização roda na plataforma. O agente segue as mesmas regras de segurança do Assistente (orçamento, moderação, proteção contra tentativas de contornar instruções, tratamento de dados pessoais), e cada ferramenta ainda exige a permissão de **quem conversa**.

Uma **habilidade** é um texto de instruções em Markdown que o agente consulta quando precisa. Ela não executa código nem dá novas ferramentas ao agente. Existem habilidades da plataforma, dos módulos e as escritas pela organização.

## Quem pode usar

| O que você quer fazer | Permissão | Quem tem por padrão |
|---|---|---|
| Ver as páginas **Agentes** e **Habilidades** | `core.agent-settings.read` | Proprietário e Administrador |
| Criar, editar, ativar, desativar e excluir agentes e habilidades; mudar as regras da organização | `core.agent-settings.update` | Proprietário e Administrador |
| Ver as instruções da organização de cada agente da plataforma | `core.prompt.read` | Proprietário e Administrador |
| Escrever, avaliar e ativar versões dessas instruções | `core.prompt.write` | Proprietário e Administrador |
| Conversar com um agente da organização | `core.conversation.send` | Proprietário, Administrador e Membro |

Quem tem só a leitura vê tudo, mas a página avisa: "Você pode ver os agentes, mas não pode alterá-los." (ou "Você pode ver as habilidades, mas não pode alterá-las."). Veja [Papéis e permissões](/docs/roles).

## Onde encontrar

- **Configurações** → grupo **IA** → **Agentes**. Endereço: `/o/{organização}/settings/agents`.
- **Configurações** → grupo **IA** → **Habilidades**. Endereço: `/o/{organização}/settings/skills`.

No topo da página **Agentes**, há atalhos para **Abrir conectores** e **Ver habilidades**. A página **Habilidades** tem o atalho **Abrir agentes**.

A página **Agentes** tem, de cima para baixo:

1. **Agentes da organização**: os agentes criados pela organização, com o uso do plano ("N de M agentes do plano em uso.").
2. **Agentes da plataforma**: os agentes da plataforma e dos módulos, cada um com o interruptor **Ativar {agente}**, a origem (**Plataforma** ou **Módulo {módulo}**) e o botão **Ver detalhes**, que mostra as **Ferramentas** (marcadas como "somente leitura" ou "altera dados"), as **Habilidades** e as **Instruções da organização**.
3. **Módulos**: os módulos instalados, cada um com o interruptor **Ativar o módulo {módulo}**.
4. **Regras da organização**: valem para todos os agentes da organização.

![Página Agentes](/guide/agents-list.jpg)

*Na tela: **Configurações → Agentes**.*

![Página Habilidades](/guide/agents-skills.jpg)

*Na tela: **Configurações → Habilidades**.*

## Passo a passo

![Editor de novo agente](/guide/agents-editor.jpg)

*O editor aberto por **Novo agente**.*

### Criar um agente da organização

1. Em **Agentes da organização**, clique em **Novo agente**.
2. Preencha **Nome** (até 100 caracteres) e **Descrição** (até 1.000 caracteres). A descrição diz para que serve o agente.
3. Escreva as **Instruções**: como o agente deve agir. Elas vêm depois das regras da plataforma e nunca as substituem. O contador abaixo do campo mostra o limite do plano (por padrão, 8.000 caracteres).
4. Em **Modelo**, escolha **Padrão** ou **Raciocínio (mais forte)**. A plataforma define qual modelo de IA cada opção usa. Não dá para escolher um modelo específico de um provedor.
5. Em **Ferramentas**, marque o que o agente pode fazer. Cada ferramenta mostra se é "somente leitura" ou se "altera dados". As que alteram dados sempre pedem confirmação ou aprovação na conversa. A busca na base de conhecimento e as ferramentas da web não aparecem nesta lista: a primeira é controlada pelo campo **Base de conhecimento**, e as da web ficam só com o agente de pesquisa na web.
6. Marque **Ferramentas de leitura dos conectores** se o agente deve usar as ferramentas que os [conectores](/docs/connectors) da organização marcam como somente leitura.
7. Em **Habilidades da plataforma** e **Habilidades da organização**, marque as habilidades que o agente deve consultar.
8. Em **Base de conhecimento**, escolha o alcance da pesquisa. Atenção: num agente novo, o padrão é **Não pesquisa**.
9. Deixe **Disponível para conversas** ligado para as pessoas poderem escolher o agente.
10. Clique em **Criar agente**. A página confirma "Agente {nome} criado."

Opções de **Base de conhecimento**:

| Opção | O que o agente pesquisa |
|---|---|
| **Não pesquisa** | Nada. O agente não pesquisa a base de conhecimento. |
| **Documentos da organização** | Só os documentos da organização inteira. |
| **Organização e projeto ativo** | Os documentos da organização e os do projeto em que a conversa acontece. |
| **Tudo o que a pessoa pode pesquisar** | Tudo o que quem conversa pode pesquisar, incluindo o catálogo de dados. |

O alcance só restringe: ele nunca deixa o agente ver um documento que a pessoa que conversa não poderia pesquisar.

### Editar, desativar ou excluir um agente

- **Editar:** abre o mesmo formulário. Clique em **Salvar** ao terminar.
- **Desativar:** pede confirmação. Ninguém inicia nem continua conversas com o agente até ele ser ativado de novo, e a mudança pode levar até um minuto para valer. **Ativar** reverte.
- **Excluir:** pede confirmação em **Excluir agente**. O agente deixa de existir, mas as conversas já feitas continuam disponíveis para leitura.

Se uma ferramenta ou habilidade marcada deixar de existir (por exemplo, um módulo foi removido), o formulário avisa: "Não está mais disponível; desmarque para remover."

### Ativar agentes da plataforma e módulos

1. Em **Agentes da plataforma**, use o interruptor **Ativar {agente}**. Quando um agente está ativado, o Assistente pode delegar tarefas a ele.
2. Em **Módulos**, use **Ativar o módulo {módulo}** para liberar os comandos, as habilidades e os agentes do módulo para a organização. Se um agente do módulo já está ativado, a página avisa: "Um agente ativado deste módulo já libera seus comandos e habilidades."

### Configurar as regras da organização

Em **Regras da organização**:

- **Ferramentas da web**: permitem que os agentes acessem a internet pública. A plataforma também precisa liberar este recurso.
  - **Busca e leitura de páginas**: o agente da web pesquisa e lê páginas públicas.
  - **Navegador automatizado**: o agente da web usa um navegador por meio de um conector do tipo **Navegador**.
- **Dados pessoais nas mensagens**:
  - **Avisar**: a mensagem segue como foi escrita e o uso de dados pessoais é registrado.
  - **Ocultar**: os dados pessoais são removidos da mensagem antes de chegar ao modelo.

A página confirma "Configuração salva." a cada mudança.

### Acrescentar instruções da organização a um agente da plataforma

As instruções da organização são acrescentadas às instruções da plataforma e nunca as substituem. Cada alteração cria uma versão, e uma versão só vale depois de **avaliada** e **ativada**.

1. Em **Agentes da plataforma**, clique em **Ver detalhes** no agente e vá até **Instruções da organização**.
2. Clique em **Escrever instruções**.
3. Escreva o texto em **Instruções**: tom, prioridades e limites. Em **Nota**, diga o que mudou e por quê (opcional).
4. Clique em **Salvar versão**. A página avisa "Versão N salva. Avalie para poder ativar."
5. Na tabela **Versões**, clique em **Avaliar**. A avaliação pode levar alguns minutos. O resultado aparece na coluna **Avaliação**: **Aprovada**, **Reprovada** ou **Não avaliada**.
6. Com a versão **Aprovada**, clique em **Ativar** e confirme. A versão passa a valer em todas as conversas da organização com aquele agente.
7. Para desfazer, use **Voltar para esta** numa versão anterior.

Alguns agentes ainda não aceitam instruções da organização. Nesses casos, a página mostra: "Este agente ainda não aceita instruções da organização." Sobre avaliações, veja [Avaliações](/docs/evals).

### Criar uma habilidade da organização

1. Em **Configurações** → **Habilidades**, na seção **Habilidades da organização**, clique em **Nova habilidade**.
2. Em **Nome**, use letras minúsculas, números e hífens, começando por uma letra (até 60 caracteres), por exemplo `relatorio-semanal`. O nome é único na organização.
3. Em **Descrição** (até 1.024 caracteres), diga **quando** o agente deve usar a habilidade. O agente decide por este texto.
4. Em **Instruções**, escreva o passo a passo em Markdown.
5. Deixe **Ativada** ligado e clique em **Criar habilidade**.
6. Abra o agente da organização que deve usar a habilidade (página **Agentes**) e marque-a em **Habilidades da organização**. Uma habilidade só chega a um agente da organização quando é selecionada nele.

A seção **Habilidades em uso pelos agentes** mostra todas as habilidades carregadas pelos agentes, com a **Origem** (**Plataforma**, **Módulo** ou **Organização**), os **Agentes** que as usam e a **Situação** (**Em uso** ou **Sem agente ativado**).

Desativar uma habilidade faz os agentes que a selecionaram deixarem de recebê-la (pode levar até um minuto). Excluir uma habilidade não quebra os agentes: eles continuam funcionando sem ela.

## Exemplo

> Cenário ilustrativo, com dados fictícios.

### Agente "Guia de integração" de uma escola de idiomas

A escola quer um agente que responda às dúvidas de professores recém-contratados a partir do manual interno, que já está na [base de conhecimento](/docs/knowledge).

| Campo | Valor |
|---|---|
| **Nome** | Guia de integração |
| **Descrição** | Responde às dúvidas de professores novos a partir do manual da escola. |
| **Modelo** | Padrão |
| **Ferramentas** | Nenhuma |
| **Ferramentas de leitura dos conectores** | Desligado |
| **Habilidades da plataforma** | `knowledge-citations` |
| **Habilidades da organização** | `politica-de-faltas` |
| **Base de conhecimento** | Documentos da organização |
| **Disponível para conversas** | Ligado |

Texto de exemplo para **Instruções**:

```markdown
Você ajuda professores recém-contratados da escola.

- Responda só com base no manual e nos documentos da organização.
- Cite o documento usado em toda resposta.
- Use frases curtas e linguagem simples.
- Se a resposta não estiver nos documentos, diga isso e sugira falar com a coordenação.
- Nunca informe dados de alunos, salários ou senhas.
```

Habilidade da organização usada pelo agente:

| Campo | Valor |
|---|---|
| **Nome** | `politica-de-faltas` |
| **Descrição** | Use quando o professor perguntar como registrar ou justificar a falta de um aluno. |
| **Instruções** | (texto abaixo) |

```markdown
## Como orientar sobre faltas

1. Pergunte se a falta é do aluno ou do professor.
2. Para falta de aluno, explique o registro conforme o manual, citando a seção usada.
3. Para falta de professor, oriente a avisar a coordenação com antecedência.
4. Não prometa abono: quem decide é a coordenação.
```

Uma conversa com o agente, escolhido no seletor **Agente**:

> **Você:** Um aluno faltou ontem com atestado. Como eu registro?
>
> **Assistente:** Pelo manual, a falta com atestado é registrada no diário da turma e o atestado é entregue à secretaria em até 5 dias úteis [1]. O abono é decidido pela coordenação.

O cabeçalho da conversa mostra "Agente: Guia de integração", e as citações funcionam como no Assistente.

O mesmo agente, como devolvido pela API da plataforma (`GET /v1/agents/{agentId}`), no formato do exemplo do contrato:

```json
{
  "id": "Ag4sK2lPq0WnR5tYu3bV",
  "tenantId": "Jd8sK2lPq0WnR5tYu3bV",
  "name": "Guia de integração",
  "description": "Responde às dúvidas de professores novos a partir do manual da escola.",
  "instructions": "Você ajuda professores recém-contratados da escola. ...",
  "model": "chat",
  "tools": [],
  "connectorTools": false,
  "coreSkills": ["knowledge-citations"],
  "customSkills": ["Sk4sK2lPq0WnR5tYu3bV"],
  "knowledgeScope": "organization",
  "enabled": true,
  "createdBy": "uA1b2C3d4E5f6G7h8I9j",
  "createdAt": "2026-09-29T14:30:00.000Z",
  "updatedAt": "2026-09-29T14:30:00.000Z"
}
```

Na API, `model` vale `chat` (**Padrão**) ou `reasoning` (**Raciocínio (mais forte)**), e `knowledgeScope` vale `none`, `organization`, `project` ou `all`, na mesma ordem das opções da tela.

### Outras ideias de agentes

| Organização (exemplo) | Agente | Modelo | Base de conhecimento | Ferramentas |
|---|---|---|---|---|
| Clínica veterinária | Dúvidas de protocolo | Padrão | Documentos da organização | Nenhuma |
| Rede de lojas | Consulta de estoque | Padrão | Não pesquisa | Consultar dados |
| Escritório de contabilidade | Análise de fechamento | Raciocínio (mais forte) | Organização e projeto ativo | Consultar dados, Descrever um dado do catálogo |

## Dicas e boas práticas

- **Escreva uma descrição clara.** Ela é o que as pessoas leem para saber para que serve o agente.
- **Comece com poucas ferramentas.** Marque só o que o agente precisa. Ferramentas que alteram dados sempre passam por confirmação, mas menos opções deixam o agente mais previsível.
- **Lembre-se de mudar a base de conhecimento.** Um agente novo começa em **Não pesquisa** e não cita documentos até você escolher outra opção.
- **Use Raciocínio (mais forte) quando a tarefa pede análise.** Para perguntas simples, **Padrão** costuma bastar. Acompanhe o gasto em [Uso e orçamento](/docs/usage).
- **Instruções curtas e diretas funcionam melhor** que textos longos. Diga o que fazer, o que não fazer e o que responder quando não souber.
- **Nunca coloque senhas, tokens ou dados pessoais** nas instruções nem nas habilidades.
- **Prefira habilidades para procedimentos reaproveitáveis.** Uma habilidade pode servir a vários agentes. A descrição deve dizer claramente quando usá-la.
- **Teste numa conversa** depois de cada mudança. Desativações e mudanças em habilidades podem levar até um minuto para valer.
- **Em ambientes de demonstração** sem chave de provedor de IA (modo simulado), os agentes da organização só repetem a mensagem recebida. Isso não indica erro de configuração.

## Erros comuns

| Mensagem/situação | O que significa | Como resolver |
|---|---|---|
| "O limite do plano foi atingido: exclua um agente para criar outro." | A organização chegou ao número máximo de agentes do plano (por padrão, 5). | Exclua um agente que não é usado ou fale com quem administra o plano. |
| "O limite do plano foi atingido: exclua uma habilidade para criar outra." | A organização chegou ao número máximo de habilidades do plano (por padrão, 10). | Exclua uma habilidade ou fale com quem administra o plano. |
| "Use no máximo N caracteres." | As instruções passaram do limite do plano. | Encurte o texto ou mova parte dele para uma habilidade. |
| "Revise as ferramentas selecionadas." / "Revise as habilidades da plataforma selecionadas." | Alguma ferramenta ou habilidade marcada não é oferecida pela plataforma. | Desmarque os itens que não estão mais disponíveis e salve de novo. |
| "Já existe uma habilidade com este nome na organização." | O nome da habilidade se repete. | Escolha outro nome. |
| "Use letras minúsculas, números e hífens, começando por uma letra (até 60 caracteres)." | O nome da habilidade está fora do formato. | Use algo como `relatorio-semanal`. |
| "Avalie a versão antes de ativar." / "Execute uma avaliação aprovada antes de ativar esta versão." | A versão das instruções ainda não foi aprovada na avaliação. | Clique em **Avaliar** e espere o resultado **Aprovada**. |
| "A versão N foi reprovada na avaliação e não pode ser ativada." | O texto piorou o comportamento do agente nos testes. | Ajuste o texto, salve uma nova versão e avalie de novo. |
| "Este agente ainda não tem um conjunto de avaliação." | Não há testes para avaliar aquele agente. | Fale com a equipe da plataforma. |
| "O texto é igual ao da versão ativa." | Você salvou sem mudar nada. | Altere o texto antes de salvar. |
| "Um serviço necessário está indisponível no momento. Tente novamente em instantes." | A plataforma não conseguiu conferir as ferramentas e habilidades marcadas. | Tente salvar de novo em alguns instantes. |
| O agente não aparece no seletor **Agente** do chat | O agente está desativado, **Disponível para conversas** está desligado, ou a mudança ainda não chegou (até um minuto). | Confira o estado na página **Agentes** e aguarde um minuto. |

## Veja também

- [Assistente (chat)](/docs/chat)
- [Base de conhecimento](/docs/knowledge)
- [Conectores](/docs/connectors)
- [Avaliações](/docs/evals)
- [Módulos](/docs/modules)
- [Uso e orçamento](/docs/usage)
- [Rastros](/docs/traces)
- [Papéis e permissões](/docs/roles)
