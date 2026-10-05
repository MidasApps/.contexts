# Papéis e permissões

Esta página explica como o app decide o que cada pessoa pode fazer: os papéis do sistema, os papéis personalizados que você pode criar e o significado das principais permissões.

## O que é

- **Permissão** é a autorização para uma ação específica, como "Convidar pessoas" ou "Ver o uso". Cada permissão tem um código, por exemplo `core.member.invite`.
- **Papel** é um conjunto de permissões com um nome. Você não atribui permissões soltas a uma pessoa: você atribui papéis.
- **Acesso** é a combinação de **onde** (a organização inteira, um projeto ou uma unidade) com **quais papéis** (de 1 a 10). Uma pessoa pode ter vários acessos na mesma organização.

Como as regras funcionam:

- **O acesso desce na hierarquia.** Papéis dados na organização valem em todos os projetos e unidades; papéis dados em um projeto valem nas unidades desse projeto.
- **As permissões se somam.** Se você tem dois papéis, ou acessos em dois níveis, vale a soma do que eles liberam.
- **Não existe "negar".** Nenhum papel tira uma permissão que outro papel deu.
- **Ninguém concede o que não tem.** Ao criar um papel, convidar alguém ou alterar papéis de um membro, você só pode conceder permissões que você mesmo tem.
- **Organização suspensa não libera nada.** Enquanto a organização estiver **Suspensa**, nenhuma permissão vale.

## Quem pode usar

| Ação | Permissão | Papéis que têm por padrão |
|---|---|---|
| Ver a seção **Papéis** | `core.role.read` | Proprietário, Administrador, Membro |
| Criar papéis | `core.role.create` | Proprietário, Administrador |
| Alterar papéis | `core.role.update` | Proprietário, Administrador |
| Excluir papéis | `core.role.delete` | Proprietário, Administrador |

Quem não pode criar papéis vê a lista e os papéis do sistema, mas sem os botões de criar, editar e excluir.

## Onde encontrar

**Configurações → Papéis**, no grupo **Organização** do menu de configurações.

Endereço: `/o/{organização}/settings/roles`

A página tem dois cartões: **Papéis personalizados** (os criados pela organização) e **Papéis do sistema** (fixos).

![Lista de papéis do sistema e da organização](/guide/roles-list.jpg)

*Na tela: **Configurações → Papéis**: os papéis do sistema e os criados pela organização.*

## Papéis do sistema

Existem em toda organização e não podem ser alterados.

| Papel | Descrição na tela | O que libera por padrão |
|---|---|---|
| **Proprietário** | Acesso total, inclusive excluir a organização. | Todas as permissões da organização. |
| **Administrador** | Gerencia membros, papéis, projetos e configurações. | Todas as permissões, menos excluir a organização (`core.organization.delete`). |
| **Membro** | Trabalha nos projetos e unidades a que tem acesso. | Ver organização, projetos, unidades, membros e papéis; usar o assistente e as conversas; consultar a base de conhecimento e o catálogo de dados; enviar arquivos; ver e iniciar fluxos; ver aprovações. |
| **Leitor** | Vê, mas não altera. | Apenas ver a organização, os projetos e as unidades. Não vê membros, não usa o assistente nem as conversas. |

Existe ainda o papel **Dispositivo**, usado só por dispositivos ativados, sem permissões de pessoa. Ele não aparece para ser atribuído a pessoas. Veja [Dispositivos](/docs/devices).

## Permissões principais

A tabela traz as permissões da plataforma, com o texto que aparece no seletor de permissões e os papéis que as têm por padrão (P = Proprietário, A = Administrador, M = Membro, L = Leitor). Módulos instalados podem acrescentar permissões próprias, que aparecem em grupos separados no seletor.

| Código | Na tela | Padrão |
|---|---|---|
| `core.organization.read` | Ver a organização | P, A, M, L |
| `core.organization.update` | Alterar nome e padrões da organização | P, A |
| `core.organization.delete` | Excluir a organização | P |
| `core.project.read` | Ver projetos | P, A, M, L |
| `core.project.create` | Criar projetos | P, A |
| `core.project.update` | Alterar projetos | P, A |
| `core.project.delete` | Excluir projetos | P, A |
| `core.unit.read` | Ver unidades | P, A, M, L |
| `core.unit.create` | Criar unidades | P, A |
| `core.unit.update` | Renomear e mover unidades | P, A |
| `core.unit.delete` | Excluir unidades | P, A |
| `core.member.read` | Ver membros | P, A, M |
| `core.member.invite` | Convidar pessoas | P, A |
| `core.member.update` | Alterar papéis de membros | P, A |
| `core.member.remove` | Remover membros | P, A |
| `core.role.read` | Ver papéis | P, A, M |
| `core.role.create` / `update` / `delete` | Criar, alterar e excluir papéis | P, A |
| `core.api-key.read` / `create` / `revoke` | Ver, criar e revogar chaves de API | P, A |
| `core.device.read` / `create` / `revoke` | Ver, ativar e revogar dispositivos | P, A |
| `core.audit-log.read` | Ver o registro de auditoria | P, A |
| `core.approval.read` | Ver pedidos de aprovação | P, A, M |
| `core.approval.decide` | Aprovar ou recusar pedidos | P, A |
| `core.chat.use` | Usar o chat | P, A, M |
| `core.conversation.send` | Enviar mensagens nas conversas | P, A, M |
| `core.conversation.read` | Ver as próprias conversas | P, A, M |
| `core.conversation.update` | Renomear, fixar e arquivar conversas | P, A, M |
| `core.conversation.delete` | Excluir conversas | P, A, M |
| `core.voice.use` | Usar a voz no chat | P, A, M |
| `core.file.upload` | Enviar arquivos | P, A, M |
| `core.web-tools.use` | Usar ferramentas de busca na web | P, A, M |
| `core.mcp.use` | Usar ferramentas MCP | P, A |
| `core.knowledge.read` | Consultar a base de conhecimento | P, A, M |
| `core.knowledge.write` | Adicionar à base de conhecimento | P, A |
| `core.knowledge.delete` | Excluir da base de conhecimento | P, A |
| `core.catalog.read` | Ver o catálogo de dados | P, A, M |
| `core.catalog.query` | Consultar dados do catálogo | P, A, M |
| `core.connector.read` / `write` | Ver e configurar conectores | P, A |
| `core.agent-settings.read` / `update` | Ver e alterar configurações de agentes | P, A |
| `core.prompt.read` / `write` | Ver e alterar instruções dos agentes | P, A |
| `core.usage.read` | Ver o uso | P, A |
| `core.workflow-run.read` | Ver execuções de workflows | P, A, M |
| `core.workflow-run.start` | Iniciar workflows | P, A, M |
| `core.workflow-run.cancel` | Cancelar execuções de workflows | P, A |
| `core.workflow-run.approve-demo` | Aprovar a ação da demonstração de aprovação | P, A, M |
| `core.schedule.read` / `write` | Ver, criar e alterar agendamentos | P, A |
| `core.trace.read` | Ver traces dos agentes | P, A |
| `core.eval.read` / `write` | Ver e iniciar avaliações | P, A |
| `core.flag.read` / `write` | Ver, ligar e desligar funcionalidades da organização | P, A |

As permissões que começam com `platform.` são da equipe da plataforma e não podem ser dadas por uma organização. Veja [Administração da plataforma](/docs/admin).

## Passo a passo

![Editor de novo papel com a lista de permissões](/guide/roles-editor.jpg)

*O editor aberto por **Novo papel**.*

### Criar um papel personalizado

1. Vá em **Configurações → Papéis** e clique em **Novo papel**.
2. Preencha **Nome** (até 80 caracteres) e, se quiser, **Descrição**.
3. Em **Permissões**, marque o que o papel libera. As permissões aparecem agrupadas por módulo; as da plataforma ficam no grupo **Plataforma**, que mostra quantas estão marcadas e quantas existem no grupo. As permissões que você não tem aparecem desativadas e não podem ser marcadas.
4. Clique em **Criar papel**. Aparece **Papel {nome} criado.**

Um papel precisa ter pelo menos uma permissão e pode ter até 200.

### Editar um papel personalizado

1. Em **Papéis personalizados**, clique em **Editar** na linha do papel.
2. Altere nome, descrição ou permissões.
3. Clique em **Salvar papel**. As mudanças valem para todas as pessoas que têm esse papel.

### Excluir um papel personalizado

1. Remova o papel de todos os membros que o têm (veja [Membros e convites](/docs/members)).
2. Em **Papéis personalizados**, clique em **Excluir** na linha do papel.
3. Confirme em **Excluir papel**. Esta ação não pode ser desfeita.

### Atribuir um papel a alguém

Papéis são atribuídos em **Configurações → Membros** (ícone de lápis ao lado do acesso) ou no convite (**Convidar → Papéis**). Cada acesso aceita até 10 papéis.

## Exemplo

Exemplo: uma clínica veterinária quer que as recepcionistas usem o assistente e consultem a base de conhecimento, mas sem ver os membros da organização.

O papel Membro não serve, porque inclui "Ver membros". A administradora cria um papel sob medida:

| Campo | Valor |
|---|---|
| Nome | Recepção |
| Descrição | Atende clientes com o assistente, sem gerenciar a equipe. |
| Permissões | Ver a organização; Ver projetos; Ver unidades; Usar o chat; Enviar mensagens nas conversas; Ver as próprias conversas; Consultar a base de conhecimento |

Como o papel aparece na API (formato do contrato `access.Role`, valores ilustrativos):

```json
{
  "id": "Rl7Qx2Mv9Kp4Wn6Bz1Ts",
  "tenantId": "Xk2pQ7vR9mWb3TnL8sYc",
  "name": "Recepção",
  "description": "Atende clientes com o assistente, sem gerenciar a equipe.",
  "permissions": [
    "core.organization.read",
    "core.project.read",
    "core.unit.read",
    "core.chat.use",
    "core.conversation.send",
    "core.conversation.read",
    "core.knowledge.read"
  ],
  "createdAt": "2026-10-01T10:00:00.000Z",
  "updatedAt": "2026-10-01T10:00:00.000Z"
}
```

Como a herança funciona para a recepcionista Paula:

| Acesso de Paula | Onde vale na prática |
|---|---|
| Recepção no projeto "Atendimento" | Projeto "Atendimento" e todas as unidades dele (Filial Norte, Filial Sul) |
| Leitor no projeto "Financeiro" | Só leitura do projeto "Financeiro" e das unidades dele |

> **Paula:** Por que não consigo ver a lista de membros?
>
> **Administradora:** O papel Recepção não tem a permissão "Ver membros". É de propósito.

## Dicas e boas práticas

- Comece pelos papéis do sistema e crie papéis personalizados só quando eles não bastarem.
- Dê nomes que descrevam a função ("Recepção", "Financeiro"), não a pessoa.
- Use a descrição para explicar para que o papel serve; ela aparece na lista de papéis.
- Como não existe "negar", para restringir alguém você precisa tirar papéis, não acrescentar.
- Revise os papéis personalizados quando novos módulos forem instalados: eles podem trazer permissões novas.
- Mantenha pelo menos dois Proprietários na organização.

## Erros comuns

| Mensagem/situação | O que significa | Como resolver |
|---|---|---|
| Você não pode conceder permissões que não possui. | O papel inclui permissões que você não tem. | Tire essas permissões ou peça a alguém com mais acesso. |
| Este papel ainda está atribuído a membros. Remova as atribuições antes de excluí-lo. | Alguém ainda tem o papel. | Troque o papel dessas pessoas em **Membros** e tente de novo. |
| Uma das permissões escolhidas não existe. | A lista de permissões enviada inclui um código que o app não reconhece. | Recarregue a página e revise as permissões. |
| Dê um nome ao papel. | O campo **Nome** ficou vazio. | Preencha o nome. |
| Use no máximo 80 caracteres. | O nome é longo demais. | Encurte o nome. |
| Escolha pelo menos uma permissão. | Nenhuma permissão marcada. | Marque ao menos uma. |
| A organização precisa de pelo menos um proprietário. | A mudança deixaria a organização sem Proprietário. | Mantenha ou atribua outro Proprietário. |
| Papel removido (na lista de membros) | O acesso aponta para um papel que não existe mais. | Edite os papéis desse acesso. |

## Veja também

- [Membros e convites](/docs/members)
- [Organizações e projetos](/docs/organizations)
- [Unidades](/docs/units)
- [Dispositivos](/docs/devices)
- [Glossário](/docs/glossary)
