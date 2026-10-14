# Console da plataforma (visão geral)

O console da plataforma, em `/admin/platform`, é a área da equipe que opera o produto para todas as organizações ao mesmo tempo. Esta página explica quem pode entrar, o que cada papel da equipe vê, a página inicial com os números da plataforma, o que fica registrado na auditoria e como funciona o acesso de suporte como outro usuário.

## Onde fica o console

O console fica dentro da administração (`/admin`), ao lado das configurações das organizações e de **Minha conta**. Veja [Primeiros passos](/docs/getting-started).

- Quem é da equipe e entra pela administração (página **Entrar na administração**) cai direto no console.
- Na barra lateral da administração, o grupo **Ir para** traz **Console da plataforma** (só para a equipe), **Configurações da organização** e **Abrir a aplicação**.
- Dentro do console, a barra superior mostra **Administração › Console da plataforma › {área}** e o selo **Equipe da plataforma**. O selo só aparece no console.

## Quem é da equipe da plataforma

O console só abre para quem cumpre as três condições abaixo:

1. Sua conta tem um registro **ativo** na equipe da plataforma, com um dos papéis `platform-admin` ou `platform-support`.
2. Sua conta de usuário está ativa.
3. Você entrou nesta sessão confirmando a **verificação em duas etapas** (segundo fator).

Se faltar qualquer uma delas, o endereço `/admin/platform` responde como se não existisse: você vê a página de "não encontrado", e não uma mensagem de acesso negado. Isso é intencional, para não revelar o console a quem não é da equipe. O resto da administração continua aberto para qualquer pessoa conectada.

O console existe só na versão web. O app de desktop não tem o console.

### Gerenciar a equipe

Um `platform-admin` gerencia a equipe em **Console da plataforma → Equipe** (`/admin/platform/team`, permissão `platform.staff.manage`).

- **Adicionar:** clique em **Adicionar à equipe**, digite o **E-mail da conta** (a pessoa precisa já ter conta no app), escolha o **Papel na equipe** e clique em **Adicionar**.
- **Mudar papel:** na linha da pessoa, clique em **Mudar papel**, escolha o papel e clique em **Salvar papel**.
- **Revogar:** clique em **Revogar** e confirme em **Revogar acesso**. A pessoa perde as permissões da plataforma na hora e os acessos de suporte abertos por ela são encerrados. A conta dela no app continua existindo.
- **Devolver acesso:** quem foi revogado continua na lista, como **Revogado**. Clique em **Devolver acesso** e escolha o papel.

Ninguém altera nem revoga o próprio acesso; a sua linha aparece com o selo **Você**. Assim a plataforma nunca fica sem o administrador que fez a mudança. As mudanças ficam na auditoria da plataforma (`PLATFORM_STAFF_GRANTED` e `PLATFORM_STAFF_REVOKED`).

Os dois papéis são fixos: não é possível criar outros papéis de equipe nem mudar o que cada um permite. A primeira pessoa da equipe de uma instalação nova ainda é cadastrada pelo comando `pnpm platform:grant-staff`, feito por quem cuida da infraestrutura.

### Verificação em duas etapas

Toda chamada do console exige uma sessão confirmada com o segundo fator. Se a página abrir, mas as chamadas do console forem recusadas por falta do segundo fator, cada área mostra o aviso **Confirme a verificação em duas etapas**, com o texto "A administração só responde a sessões confirmadas com o segundo fator. Saia e entre de novo informando o código." e o botão **Abrir segurança da conta**.

Para resolver:

1. Clique em **Abrir segurança da conta** e confira se o segundo fator está configurado (veja [Perfil](/docs/profile)).
2. Saia da conta.
3. Entre de novo e informe o código do segundo fator.

## Papéis da equipe e o que cada um vê

Há dois papéis na equipe da plataforma. O `platform-admin` tem todas as permissões `platform.*`. O `platform-support` consulta e faz acesso de suporte, mas não altera configurações.

| Área | URL | Permissão | `platform-admin` | `platform-support` |
|---|---|---|---|---|
| Início do console | `/admin/platform` | `platform.usage.read` | Sim | Sim |
| Organizações | `/admin/platform/organizations` | `platform.organization.read` (ver) e `platform.organization.update` (alterar) | Ver e alterar | Só ver |
| Planos | `/admin/platform/plans` | `platform.plan.manage` | Sim | Não |
| Usuários | `/admin/platform/users` | `platform.user.read` e `platform.user.impersonate` | Sim | Sim |
| Agentes e prompts | `/admin/platform/agents` | `platform.agent.manage` e `platform.prompt.manage` | Sim | Não |
| Modelos | `/admin/platform/models` | `platform.model.manage` | Sim | Não |
| Avaliações | `/admin/platform/evals` | `platform.eval.manage` | Sim | Não |
| Traces | `/admin/platform/traces` | `platform.trace.read` | Sim | Sim |
| Logs | `/admin/platform/logs` | `platform.trace.read` | Sim | Sim |
| Custos | `/admin/platform/costs` | `platform.usage.read` | Sim | Sim |
| Workflows | `/admin/platform/workflows` | `platform.workflow.manage` | Sim | Não |
| Flags | `/admin/platform/flags` | `platform.flag.manage` | Sim | Não |
| Conectores | `/admin/platform/connectors` | `platform.connector.read` | Sim | Sim |
| Auditoria | `/admin/platform/audit` | `platform.audit-log.read` | Sim | Sim |
| Equipe | `/admin/platform/team` | `platform.staff.manage` | Sim | Não |

No console, a barra lateral da administração agrupa as áreas em **Clientes**, **IA** e **Operação** e mostra só as que o seu papel pode abrir. Se você chegar por link a uma área sem permissão, verá a mensagem "Seu papel na equipe da plataforma não dá acesso a esta área. Peça a um administrador da plataforma."

Para voltar ao uso do app, clique em **Abrir a aplicação**, no grupo **Ir para** da barra lateral ou na barra superior. Para configurar uma organização, use **Configurações da organização**.

As áreas estão detalhadas em:

- [Console: clientes](/docs/admin-customers): Organizações, Planos e Usuários.
- [Console: IA](/docs/admin-ai): Agentes e prompts, Modelos, Avaliações, Traces, Logs e Custos.
- [Console: operações](/docs/admin-operations): Workflows, Flags e Conectores. A Auditoria e a Equipe estão explicadas nesta página.

## Página inicial do console

**Para que serve:** ver os números da plataforma de relance e abrir qualquer área que o seu papel permite.

- **Título:** **Console da plataforma**
- **URL:** `/admin/platform`
- **Permissão:** `platform.usage.read` (os dois papéis da equipe têm).

A seção **Números da plataforma** mostra, com a hora em "Atualizado em":

| Indicador | O que conta |
|---|---|
| Organizações ativas | Organizações com status ativo |
| Usuários ativos | Usuários com atividade nos últimos 7 dias |
| Custo no mês | Custo de modelos de todas as organizações no mês |
| Paradas por guardrail | Execuções interrompidas por guardrail nos últimos 7 dias. Pode aparecer como **Não medido** enquanto essas paradas não são registradas |
| Aprovações | Solicitações aprovadas nos últimos 7 dias |
| Avaliação dos agentes | Veredito do experimento mais recente: **Aprovada**, **Reprovada** ou **Sem resultado** |

Abaixo, a seção **Áreas** lista um cartão por área que você pode abrir, com uma frase sobre o que ela faz. Se os números não carregarem, as áreas continuam disponíveis e o erro aparece só na seção dos números, com a referência da requisição e um botão para tentar de novo.

Exemplo: um `platform-support` que abre `/admin/platform` vê os números e seis cartões: Organizações, Usuários, Traces, Logs, Custos e Conectores.

![Página inicial do console da plataforma](/guide/admin-overview.jpg)

*A página inicial de `/admin/platform`, com as áreas na barra lateral à esquerda.*

## Auditoria das ações da equipe

As ações da equipe que alteram algo ficam no registro de auditoria da plataforma. Quando a ação atinge uma organização, o registro indica qual. O acesso de suporte também é registrado na auditoria da própria organização, que o Proprietário consulta em [Auditoria](/docs/audit-log).

| Ação | Código na auditoria |
|---|---|
| Criar, editar ou excluir um plano | `PLAN_CREATED`, `PLAN_UPDATED`, `PLAN_DELETED` |
| Dar, mudar ou revogar o acesso de alguém da equipe | `PLATFORM_STAFF_GRANTED`, `PLATFORM_STAFF_REVOKED` |
| Trocar o plano, suspender ou reativar uma organização | `ORGANIZATION_UPDATED` |
| Salvar ou remover o ajuste de orçamento | `TENANT_BUDGET_UPDATED` |
| Alterar os agentes, as ferramentas web ou o modo de PII de uma organização | `AGENT_SETTINGS_UPDATED` |
| Salvar modelos e preços | `MODEL_SETTINGS_UPDATED` |
| Criar, avaliar e ativar versões de prompt | `PROMPT_VERSION_CREATED`, `PROMPT_EVALUATED`, `PROMPT_ACTIVATED`, `PROMPT_ACTIVATION_FORCED` |
| Ligar, desligar ou remover o ajuste de uma flag | `FEATURE_FLAG_UPDATED` |
| Cancelar uma execução de workflow | `WORKFLOW_RUN_CANCELED` |
| Pausar, retomar ou executar agora um agendamento | `SCHEDULE_PAUSED`, `SCHEDULE_RESUMED`, `SCHEDULE_RUN_REQUESTED` |
| Iniciar, encerrar ou deixar expirar um acesso de suporte | `IMPERSONATION_STARTED`, `IMPERSONATION_ENDED`, `IMPERSONATION_EXPIRED` |
| Cada requisição feita durante o acesso de suporte | `IMPERSONATED_REQUEST_SERVED` ou, se for uma tentativa de alteração recusada, `IMPERSONATED_WRITE_DENIED` |

### Consultar a auditoria da plataforma

A área **Auditoria** (`/admin/platform/audit`, grupo **Operação**) lista esses registros, do mais recente ao mais antigo. Os dois papéis da equipe (`platform.audit-log.read`) podem consultá-la.

1. No console, abra **Auditoria**.
2. A tabela mostra **Quando**, **Ação**, **Quem**, **Alvo**, **Organização** (ou **Toda a plataforma**) e **Resultado**. Tentativas de acesso recusadas aparecem como **Acesso à plataforma negado**, com o resultado **Negado**.
3. Para ver só um tipo de ação, use o filtro **Todas as ações**.
4. Para ver só o que tocou uma organização, abra o endereço com `?organizationId={organização}`, ou clique no identificador da organização na tabela para abrir a página dela. **Ver todas as organizações** tira esse filtro.

As ações dentro de cada organização (membros, papéis, projetos) ficam na auditoria da própria organização. Veja [Auditoria](/docs/audit-log).

## Acesso de suporte como outro usuário

**Para que serve:** ver o app exatamente como um usuário vê, dentro de uma organização, para investigar um chamado. O acesso é **somente leitura**, tem prazo e fica registrado.

- **URL:** `/admin/platform/users`
- **Permissões:** `platform.user.read` para ver a página e as sessões; `platform.user.impersonate` para iniciar e encerrar sessões. Os dois papéis da equipe têm as duas.

### Como entrar

1. Abra **Usuários** (`/admin/platform/users`).
2. Em **Buscar usuário**, digite o início do nome, o e-mail ou o id e clique em **Buscar**.
3. Na linha do usuário, clique em **Selecionar**.
4. Em **Iniciar acesso como usuário**, escolha a **Organização**.
5. Preencha o **Motivo**, com 10 a 500 caracteres. Por exemplo, o número do chamado.
6. Informe a **Duração em minutos**, de 1 a 60.
7. Clique em **Iniciar sessão**. Aparece "Sessão de suporte iniciada." e a sessão surge em **Sessão aberta nesta aba**.
8. Clique em **Abrir o app como este usuário**. A aba passa a mostrar o app como o usuário, mesmo se você recarregar a página.

Exemplo: a organização Clínica Exemplo pede suporte porque a usuária Ana não vê um projeto. Você inicia uma sessão de 30 minutos com o motivo abaixo:

```json
{
  "id": "Im1aB2cD3eF4gH5iJ6kL",
  "staffUid": "uid-equipe-0001",
  "targetUid": "uid-ana-0001",
  "tenantId": "Or1aB2cD3eF4gH5iJ6kL",
  "reason": "Chamado 4821: usuária não vê o projeto Lançamento.",
  "expiresAt": "2026-10-05T15:30:00.000Z",
  "endedAt": null,
  "createdAt": "2026-10-05T15:00:00.000Z",
  "status": "active"
}
```

### Durante a sessão

- Um aviso no topo diz, por exemplo: "Você está vendo o app como Ana em Clínica Exemplo, em modo somente leitura, até 15:30. Tudo o que abrir fica registrado."
- Você pode navegar e consultar. Qualquer tentativa de alterar algo é recusada e registrada como `IMPERSONATED_WRITE_DENIED`.
- O console não abre nesta aba. Se tentar, verá **O console da plataforma não abre no modo suporte**. As configurações da organização e o perfil abrem, somente leitura.

### Como sair

- No aviso do topo, clique em **Sair do modo suporte**. A sessão é encerrada e a aba volta para a sua conta da equipe, em `/admin/platform/users`, sem novo login.
- Ou, em **Sessão aberta nesta aba**, clique em **Encerrar sessão** e confirme em **Encerrar**.
- Ao fim da duração escolhida, a sessão expira sozinha. No próximo carregamento, a aba volta para a sua conta.

### Sessões de toda a equipe

A seção **Sessões de acesso de suporte** lista quem acessou como quem, em qual organização e por quê. Em **Mostrar**, escolha **Abertas agora** ou **Todas, mais recentes primeiro**. Você pode encerrar a sessão de um colega com **Encerrar** e confirmar com **Encerrar sessão**. O encerramento também fica na auditoria.

### Erros comuns

- "Selecione o usuário na busca." Você não clicou em **Selecionar** em nenhum usuário.
- "Escolha a organização." Falta a organização.
- "Explique o motivo com 10 a 500 caracteres."
- "Informe de 1 a 60 minutos."
- "Este usuário não existe ou não tem acesso a essa organização." O usuário precisa ter acesso à organização escolhida.
- "Você não pode iniciar esta sessão. Não é possível acessar como você mesmo, e a ação exige o papel de suporte."

## Configurações da organização ou console da plataforma?

As duas ficam na administração, mas têm alcances diferentes.

| | Configurações da organização | Console da plataforma |
|---|---|---|
| Endereço | `/admin/o/<organização>/<seção>` | `/admin/platform/<área>` |
| Quem usa | Membros da organização, conforme o papel deles nela | Só a equipe da plataforma, com segundo fator |
| Alcance | Uma organização | Todas as organizações |
| Exemplos | Membros, papéis, conectores, flags e limites próprios | Plano, orçamento, suspensão, modelos, prompts da plataforma |

A equipe da plataforma não ganha permissões dentro das organizações. Para ver o que um membro vê, use o acesso de suporte. Já mudanças como criar um conector ou convidar membros são feitas por quem administra a organização, nas configurações dela (veja [Organizações](/docs/organizations)).

## Veja também

- [Console: clientes](/docs/admin-customers)
- [Console: IA](/docs/admin-ai)
- [Console: operações](/docs/admin-operations)
- [Primeiros passos](/docs/getting-started)
- [Perfil](/docs/profile)
- [Organizações](/docs/organizations)
- [Glossário](/docs/glossary)
