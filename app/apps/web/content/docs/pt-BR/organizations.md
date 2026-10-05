# Organizações e projetos

Esta página explica como escolher e criar organizações, como os projetos organizam o trabalho dentro delas, como editar, arquivar e excluir um projeto e como ajustar ou excluir a organização em **Configurações → Geral**.

## O que é

- **Organização** é o espaço de uma empresa ou equipe no app. Ela tem nome, padrões regionais (idioma, fuso horário e moeda), membros, papéis e configurações próprias. Uma mesma conta pode participar de várias organizações.
- **Projeto** é uma divisão da organização. Ele organiza unidades, módulos e pessoas. Cada projeto tem nome e, opcionalmente, uma descrição.
- **Unidade** é uma parte de um projeto, como um local ou uma equipe. Veja [Unidades](/docs/units).

A hierarquia é sempre esta:

```text
Organização
└── Projeto
    └── Unidade
        └── Subunidade
```

O acesso dado em um nível vale para tudo o que está abaixo dele. Quem recebe acesso à organização inteira enxerga todos os projetos; quem recebe acesso a um projeto enxerga só aquele projeto e as unidades dele.

Uma organização pode aparecer com o selo **Suspensa**. Enquanto estiver suspensa, nenhuma permissão dentro dela vale, para ninguém, até ela ser reativada pela equipe da plataforma.

Um projeto pode aparecer com o selo **Arquivado**. Ele continua na lista de projetos e com os mesmos dados; o selo avisa que ele não está mais em uso. Quem pode alterar o projeto pode reativá-lo a qualquer momento.

## Quem pode usar

| Ação | Permissão | Papéis que têm por padrão |
|---|---|---|
| Ver a organização e a seção **Geral** | `core.organization.read` | Proprietário, Administrador, Membro, Leitor |
| Alterar nome e padrões da organização | `core.organization.update` | Proprietário, Administrador |
| Ver projetos | `core.project.read` | Proprietário, Administrador, Membro, Leitor |
| Criar projetos | `core.project.create` | Proprietário, Administrador |
| Editar, arquivar e reativar um projeto | `core.project.update` | Proprietário, Administrador |
| Excluir um projeto | `core.project.delete` | Proprietário, Administrador |
| Excluir a organização | `core.organization.delete` | Proprietário |

**Criar uma organização** não depende de papel: o servidor decide se a sua conta pode criar organizações. Quando pode, a página **Organizações** mostra o cartão **Nova organização**; quando não pode, o cartão não aparece e a página pede que você solicite um convite. Quem cria a organização vira o **Proprietário** dela.

Sem `core.organization.update`, a seção **Geral** aparece somente para leitura, com o aviso **Somente administradores podem alterar estes dados.**

As permissões de projeto valem no projeto: quem recebeu um papel com `core.project.update` só em um projeto pode editar aquele projeto, e não os outros. Sem `core.project.update` e `core.project.delete`, o botão **Configurar projeto** não aparece.

## Onde encontrar

| Tela | Como chegar | Endereço |
|---|---|---|
| Organizações | Seletor de organização no topo da barra lateral → **Ver todas ou criar organização** | `/organizations` |
| Página da organização (lista de projetos) | Barra lateral → **Organização → Projetos** | `/o/{organização}` |
| Visão geral do projeto | Barra lateral → **Projeto → Visão geral** | `/o/{organização}/p/{projeto}` |
| Configurações gerais | Barra lateral → **Organização → Configurações → Geral** | `/o/{organização}/settings/general` |

O endereço `/o/{organização}/settings`, sem seção, abre a primeira seção de configurações que você pode ver.

![Lista de organizações da conta](/guide/organizations-list.jpg)

*A página **Organizações** lista as organizações de que você participa.*

![Página inicial da organização com a lista de projetos](/guide/organizations-home.jpg)

*A página inicial da organização mostra os projetos.*

![Visão geral de um projeto](/guide/organizations-project.jpg)

*A **Visão geral** de um projeto, com o menu do projeto na barra lateral.*

![Configurações gerais da organização](/guide/organizations-general.jpg)

*Na tela: **Configurações → Geral**: os dados da organização.*

## Passo a passo

### Trocar de organização

1. Clique no seletor de organização, no topo da barra lateral.
2. Escolha a organização na lista **Organizações**.
3. Aguarde a mensagem **Trocando de organização…**. O app abre a organização escolhida.

Você também pode abrir a paleta de comandos (**Ctrl+K** ou **⌘K**) e usar **Trocar para {nome}**.

### Criar uma organização

1. Abra a página **Organizações** (`/organizations`).
2. No cartão **Nova organização**, preencha **Nome da organização**. Ele aparece para todos os membros.
3. Em **Padrões regionais**, escolha **Idioma padrão**, **Fuso horário padrão** e **Moeda padrão**. Esses padrões valem para projetos novos e podem ser alterados depois.
4. Clique em **Criar organização**. Aparece a confirmação **Organização {nome} criada.**

Se o cartão não aparece, a sua conta não pode criar organizações. Peça um convite a quem administra a organização desejada.

### Criar um projeto

1. Abra a página da organização (**Organização → Projetos**).
2. Clique em **Novo projeto**. O botão também aparece no seletor de projeto da barra lateral e na paleta de comandos (**Criar projeto**).
3. Preencha **Nome do projeto**.
4. Se quiser, preencha **Descrição**. Ela ajuda as pessoas a entender para que serve o projeto.
5. Clique em **Criar projeto**. Aparece a confirmação **Projeto {nome} criado.**

### Abrir e usar um projeto

1. Na página da organização, clique no cartão do projeto, ou escolha o projeto no seletor da barra lateral.
2. A **Visão geral** mostra:
   - o nome, a descrição e a situação do projeto;
   - **Unidades** (ou **Subunidades**, quando você já está dentro de uma unidade), que você pode clicar para focar;
   - **Módulos** que você pode abrir no projeto, cada um com **Abrir módulo**.
3. Se você pode criar unidades, aparece o botão **Gerenciar unidades**, que leva a **Configurações → Unidades**.

### Editar o nome e a descrição de um projeto

1. Abra a **Visão geral** do projeto.
2. Clique em **Configurar projeto**, no topo da página, e escolha **Editar nome e descrição**.
3. Altere **Nome do projeto** ou **Descrição**. Para remover a descrição, deixe o campo em branco.
4. Clique em **Salvar**. Aparece a confirmação **Projeto {nome} atualizado.**

### Arquivar ou reativar um projeto

Arquive um projeto que terminou, mas cujos dados você quer manter à mão.

1. Na **Visão geral** do projeto, clique em **Configurar projeto → Arquivar projeto**.
2. Confirme em **Arquivar**. O projeto ganha o selo **Arquivado** e aparece a confirmação **Projeto {nome} arquivado.**
3. Para voltar a usá-lo, abra o projeto e clique em **Configurar projeto → Reativar projeto**.

### Excluir um projeto

1. Na **Visão geral** do projeto, clique em **Configurar projeto → Excluir projeto**.
2. Leia o aviso: o projeto e **todas as unidades dele** deixam de existir para todos os membros, e não é possível desfazer pelo app.
3. Clique em **Excluir projeto**. O app volta para a página da organização com a confirmação **Projeto {nome} excluído.**

Se o projeto só não é mais usado, prefira arquivar.

### Alterar nome e padrões da organização

1. Vá em **Configurações → Geral**.
2. No cartão **Organização**, altere **Nome**, **Idioma padrão**, **Fuso horário padrão** ou **Moeda padrão**.
3. Clique em **Salvar**.

Os padrões valem para quem não escolheu os seus e para valores novos. Cada pessoa pode ter as próprias preferências de idioma, fuso e moeda no perfil. A data de criação aparece no rodapé da seção (**Criada em {data}.**).

### Excluir a organização

Só o **Proprietário** vê esta opção.

1. Vá em **Configurações → Geral** e desça até o cartão **Excluir organização**.
2. Clique em **Excluir organização**.
3. Digite o nome da organização exatamente como ele aparece, com maiúsculas e acentos, e clique em **Excluir para sempre**.
4. Todos os membros, dispositivos e chaves de API perdem o acesso na hora. O app abre a página **Organizações** com a confirmação **Organização {nome} excluída.**

Não é possível desfazer pelo app. Se você só quer parar de usar a organização por um tempo, fale com o suporte da plataforma.

## Exemplo

Exemplo: uma rede de lojas de material de construção organiza o trabalho assim.

| Nível | Nome | Observação |
|---|---|---|
| Organização | Rede Construir | Idioma padrão Português (Brasil), fuso America/Sao_Paulo, moeda BRL |
| Projeto | Lojas físicas | Descrição: "Operação das lojas de rua" |
| Projeto | Loja on-line | Descrição: "Atendimento e pedidos pela internet" |
| Unidade (em Lojas físicas) | Loja Centro | Tipo Unidade |
| Unidade (em Lojas físicas) | Loja Bairro Alto | Tipo Unidade |

Como a organização aparece na resposta de `GET /v1/organizations/{organizationId}` (formato do contrato `tenancy.Organization`, com valores ilustrativos; o `id` da organização é igual ao `tenantId`):

```json
{
  "data": {
    "id": "Xk2pQ7vR9mWb3TnL8sYc",
    "tenantId": "Xk2pQ7vR9mWb3TnL8sYc",
    "name": "Rede Construir",
    "status": "active",
    "defaults": {
      "locale": "pt-BR",
      "timeZone": "America/Sao_Paulo",
      "currency": "BRL"
    },
    "createdAt": "2026-09-01T12:00:00.000Z",
    "updatedAt": "2026-09-15T08:30:00.000Z"
  }
}
```

Conversa típica entre a gerente e o administrador:

> **Gerente:** Abri a Rede Construir e só vejo o projeto Loja on-line.
>
> **Administrador:** O seu acesso foi dado só nesse projeto. Para ver as lojas físicas, preciso dar acesso no projeto Lojas físicas ou na organização inteira.

## Dicas e boas práticas

- Defina os padrões regionais da organização com cuidado: eles valem para quem ainda não escolheu as próprias preferências.
- Use a descrição do projeto para explicar o objetivo dele em uma frase.
- Prefira um projeto por grande frente de trabalho e use [unidades](/docs/units) para dividir cada projeto em locais ou equipes.
- Se uma pessoa só precisa de um projeto, dê acesso no projeto, não na organização inteira. Veja [Membros e convites](/docs/members).
- O início (`/`) sempre abre o último lugar que você usou. Se você saiu de uma organização, ele volta para a página **Organizações**.

## Erros comuns

| Mensagem/situação | O que significa | Como resolver |
|---|---|---|
| Você ainda não participa de nenhuma organização | Sua conta não tem acesso a nenhuma organização. | Crie uma organização (se o cartão aparecer) ou peça um convite. Use **Entrar com outra conta** se entrou com o e-mail errado. |
| Nenhum projeto ainda | A organização não tem projetos que você possa ver. | Crie um com **Novo projeto** ou peça acesso a quem administra. |
| Página não encontrada | O endereço não existe ou você não tem acesso a ele. | Confira o link ou volte ao início. |
| Você não tem acesso a esta página | Falta a permissão necessária. | Peça a quem administra a organização para liberar o acesso. |
| Você não tem permissão para fazer isso. | A ação exige uma permissão que você não tem. | Peça o papel adequado a um administrador. |
| Este item foi alterado por outra pessoa. Recarregue e tente novamente. | Alguém salvou alterações antes de você. | Recarregue a página e refaça a alteração. |
| Alguns campos estão inválidos. Revise e tente novamente. | Algum campo ficou vazio ou fora do formato. | Revise os campos destacados. |
| Selo **Suspensa** na organização | A organização está suspensa e nenhuma permissão vale. | Fale com o suporte da plataforma. |
| O nome digitado não é igual ao da organização. | Ao excluir a organização, o nome digitado não confere. | Digite o nome exatamente como aparece no título da janela. |
| Não vejo **Configurar projeto** | Você não tem `core.project.update` nem `core.project.delete` naquele projeto. | Peça o papel adequado a um administrador. |

## Veja também

- [Primeiros passos](/docs/getting-started)
- [Unidades](/docs/units)
- [Membros e convites](/docs/members)
- [Papéis e permissões](/docs/roles)
- [Auditoria](/docs/audit-log)
- [Módulos](/docs/modules)
