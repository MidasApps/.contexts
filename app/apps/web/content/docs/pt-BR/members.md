# Membros e convites

Esta página mostra como ver quem tem acesso à organização, convidar pessoas, dar a um membro acesso em outro projeto ou unidade, trocar os papéis de um membro e remover acessos. Tudo isso fica nas seções **Membros** e **Convites** das configurações.

## O que é

- **Membro** é uma pessoa que tem pelo menos um acesso na organização.
- Cada acesso diz **onde vale** (a organização inteira, um projeto ou uma unidade de um projeto) e **quais papéis** a pessoa tem ali. Um membro pode ter vários acessos, por exemplo papel Membro em um projeto e papel Leitor em outro.
- O acesso vale no nível escolhido e em tudo abaixo dele: um acesso no projeto vale também para todas as unidades do projeto, e um acesso numa unidade vale também para as sub-unidades dela.
- **Convite** é a forma de dar acesso a alguém. Ele é vinculado a um e-mail, vale por 7 dias e só pode ser usado uma vez, pela conta com aquele e-mail.

Importante: o app **não envia o convite por e-mail**. Ao criar o convite, você recebe um link e precisa enviá-lo à pessoa pelo canal que preferir. Por segurança, o link aparece uma única vez.

## Quem pode usar

| Ação | Permissão | Papéis que têm por padrão |
|---|---|---|
| Ver a seção **Membros** | `core.member.read` | Proprietário, Administrador, Membro |
| Convidar pessoas, ver a seção **Convites** e revogar convites | `core.member.invite` | Proprietário, Administrador |
| Dar acesso em outro lugar e alterar papéis de membros | `core.member.update` | Proprietário, Administrador |
| Revogar um acesso e remover membros | `core.member.remove` | Proprietário, Administrador |

O papel Leitor não vê a seção **Membros**. Quem não tem `core.member.invite` não vê a seção **Convites** nem o botão **Convidar**.

Você só pode conceder papéis com permissões que você mesmo tem. Por exemplo, um administrador não consegue tornar alguém Proprietário, porque o Proprietário tem a permissão de excluir a organização, que o Administrador não tem.

## Onde encontrar

- **Configurações → Membros**: `/o/{organização}/settings/members`
- **Configurações → Convites**: `/o/{organização}/settings/invitations`
- Para ver todos os convites, e não só os pendentes: `/o/{organização}/settings/invitations?filter=all`

As duas seções ficam no grupo **Organização** do menu de configurações.

![Lista de membros da organização](/guide/members-list.jpg)

*Na tela: **Configurações → Membros**: quem tem acesso e com quais papéis.*

## Passo a passo

![Diálogo Convidar pessoa com e-mail, onde vale e papéis](/guide/members-invite-dialog.jpg)

*O diálogo **Convidar pessoa**: **E-mail**, **Onde vale** e os **Papéis** do convite.*

### Ver os membros

1. Vá em **Configurações → Membros**.
2. A tabela mostra cada pessoa em **Membro** (nome e e-mail; você aparece com o selo **Você**) e, em **Acesso**, cada lugar onde ela tem acesso com os papéis daquele lugar.
3. Use **Anterior** e **Próxima** para navegar entre as páginas da lista.

### Convidar uma pessoa

1. Em **Configurações → Membros** ou **Configurações → Convites**, clique em **Convidar**.
2. Em **E-mail**, digite o e-mail da pessoa.
3. Em **Onde vale**, escolha **Toda a organização** ou um projeto (use **Buscar projeto** para filtrar). Ao escolher um projeto, aparece o campo **Unidade**: deixe **Todo o projeto** ou escolha uma unidade (as sub-unidades aparecem como **Unidade › Sub-unidade**). O acesso vale no nível escolhido e em tudo abaixo dele.
4. Em **Papéis**, marque um ou mais papéis (até 10). O papel **Membro** já vem marcado.
5. Clique em **Enviar convite**.
6. Aparece **Convite criado para {e-mail}** com o campo **Link do convite**. Clique em **Copiar** e envie o link à pessoa.
7. Clique em **Concluir**, ou em **Convidar outra pessoa** para repetir o processo.

Se você tentar fechar a janela sem clicar em **Concluir**, o app pergunta **Fechar sem guardar?**, porque o link não será mostrado de novo. Se perder o link, revogue o convite e crie outro.

### Acompanhar os convites

1. Vá em **Configurações → Convites**.
2. Use as abas **Pendentes** (padrão) e **Todos**.
3. A tabela mostra **E-mail**, **Onde vale**, **Papéis**, **Situação** e **Expira em**.

| Situação | Significado |
|---|---|
| **Pendente** | Ainda não foi aceito e está dentro do prazo. |
| **Aceito** | A pessoa aceitou e já é membro. |
| **Revogado** | Alguém cancelou o convite; o link não funciona mais. |
| **Expirado** | Passaram os 7 dias sem aceite. |

Convites aceitos ou revogados não mostram data de expiração.

### Revogar um convite

1. Em **Configurações → Convites**, na linha do convite pendente, clique em **Revogar**.
2. Confirme em **Revogar convite**. O link enviado deixa de funcionar imediatamente.

Só convites pendentes podem ser revogados.

### Alterar os papéis de um membro

1. Em **Configurações → Membros**, na coluna **Acesso**, clique no ícone de lápis ao lado do acesso que quer alterar (**Editar papéis de {nome}**).
2. A janela **Papéis de {nome}** mostra onde aquele acesso vale (**Os papéis valem em:**).
3. Marque ou desmarque os papéis. É preciso manter pelo menos um, e o máximo é 10.
4. Clique em **Salvar papéis**.

Cada acesso é alterado separadamente. A organização sempre precisa de pelo menos um Proprietário.

Se a pessoa já tem acesso em um lugar e aceita um convite para esse mesmo lugar, o convite é marcado como aceito sem criar um segundo acesso; os papéis dela continuam os mesmos. Para mudá-los, use o ícone de lápis.

Um convite também deixa de funcionar se quem convidou perder a permissão de conceder aqueles papéis antes do aceite (por exemplo, se deixou de ser administrador). Nesse caso, outra pessoa com permissão precisa convidar de novo.

### Dar acesso a um membro em outro lugar

Use quando a pessoa já é membro e precisa de acesso em mais um projeto ou unidade, sem convite novo.

1. Em **Configurações → Membros**, na coluna **Acesso** da pessoa, clique em **Dar acesso**.
2. Em **Onde vale**, escolha **Toda a organização** ou um projeto.
3. Se escolheu um projeto, em **Unidade** deixe **Todo o projeto** ou escolha uma unidade.
4. Em **Papéis**, marque os papéis desse novo acesso.
5. Clique em **Dar acesso**. Aparece a confirmação **Acesso de {nome} adicionado.**

Se a pessoa já tem acesso naquele lugar, o app avisa: **Esta pessoa já tem acesso neste lugar.** Nesse caso, altere os papéis do acesso existente com o lápis.

### Revogar um acesso de um membro

Quando a pessoa tem mais de um acesso, cada um mostra o ícone **×** (**Revogar este acesso de {nome}**).

1. Clique no **×** ao lado do acesso que quer tirar.
2. A janela mostra onde o acesso valia. Clique em **Revogar acesso**.
3. A pessoa continua com os outros acessos. Aparece a confirmação **Acesso de {nome} revogado.**

Quando a pessoa tem um único acesso, use **Remover** (abaixo).

### Remover um membro

1. Em **Configurações → Membros**, clique em **Remover** na linha da pessoa.
2. Leia o aviso: todos os acessos da pessoa na organização **e as chaves de API dela** serão revogados.
3. Clique em **Remover membro**.

## Exemplo

Exemplo: um escritório de contabilidade com a organização "Contábil Prisma" e dois projetos, "Clientes PJ" e "Clientes PF".

Convites enviados pela sócia:

| E-mail | Onde vale | Papéis | Situação |
|---|---|---|---|
| joao@exemplo.com | Toda a organização | Administrador | Aceito |
| carla@exemplo.com | Projeto: Clientes PJ | Membro | Pendente |
| estagio@exemplo.com | Projeto: Clientes PF | Leitor | Expirado |

Membros depois dos aceites:

| Membro | Acesso |
|---|---|
| Sofia Prado (Você) | Toda a organização — Proprietário |
| João Lima | Toda a organização — Administrador |
| Bruno Reis | Projeto: Clientes PJ — Membro; Projeto: Clientes PF — Leitor |

Mais tarde, a sócia usa **Dar acesso** para que Carla também atenda a filial de Campinas, que é uma unidade do projeto Clientes PJ: **Onde vale** = Clientes PJ, **Unidade** = Campinas, **Papéis** = Membro. Como Carla já tinha acesso ao projeto inteiro, esse acesso extra só faz diferença se os papéis forem outros, por exemplo Administrador só em Campinas.

Como um convite aparece na API (formato do contrato `access.Invitation`, valores ilustrativos). O convite de Carla vale no projeto, então o campo `node` traz `level: "project"`:

```json
{
  "id": "Hq3Lm8Pz2Rk7Vn5Tc1Xw",
  "tenantId": "Xk2pQ7vR9mWb3TnL8sYc",
  "email": "carla@exemplo.com",
  "node": {
    "level": "project",
    "tenantId": "Xk2pQ7vR9mWb3TnL8sYc",
    "projectId": "Pj4Wd9Ks2Lq6Mn8Bv3Yr"
  },
  "roles": [{ "kind": "system", "key": "member" }],
  "status": "pending",
  "expiresAt": "2026-10-12T14:00:00.000Z",
  "invitedBy": "uK7m2Np4Qr8Sv1Tx5Wz3",
  "acceptedByUid": null,
  "createdAt": "2026-10-05T14:00:00.000Z",
  "updatedAt": "2026-10-05T14:00:00.000Z"
}
```

O link de convite tem este formato, com o idioma de quem convidou e o código depois de `#token=`:

```text
https://app.exemplo.com/pt-BR/invite#token=Zx9Cv8Bn7Mm6Aa5Ss4Dd3Ff2Gg1Hh0Jj9Kk8Ll7Qq6W
```

Diálogo entre a sócia e a nova colaboradora:

> **Sofia:** Te mandei o link do convite pelo chat. Abra com o seu e-mail carla@exemplo.com.
>
> **Carla:** Abri, criei a conta e cliquei em Aceitar convite. Já vejo o projeto Clientes PJ.

## Dicas e boas práticas

- Dê o menor acesso que resolve: prefira um projeto à organização inteira, e o papel Leitor quando a pessoa só precisa consultar.
- Tenha pelo menos dois Proprietários, para não depender de uma única pessoa.
- Envie o link do convite por um canal confiável. Quem tiver o link ainda precisa entrar com a conta do e-mail convidado para aceitar.
- Revogue convites pendentes que não serão mais usados.
- Antes de remover alguém, lembre que as chaves de API dessa pessoa também deixam de funcionar. Veja [Chaves de API](/docs/api-keys).
- Para criar papéis sob medida, veja [Papéis e permissões](/docs/roles).

## Erros comuns

| Mensagem/situação | O que significa | Como resolver |
|---|---|---|
| A organização precisa de pelo menos um proprietário. | A alteração ou remoção deixaria a organização sem Proprietário. | Torne outra pessoa Proprietário antes. |
| Você não pode conceder permissões que não possui. | Um dos papéis escolhidos tem permissões que você não tem. | Escolha outro papel ou peça a um Proprietário. |
| Digite um e-mail válido, por exemplo nome@empresa.com. | O e-mail está fora do formato. | Corrija o e-mail. |
| Escolha pelo menos um papel. | Nenhum papel foi marcado. | Marque ao menos um papel. |
| Esta pessoa já tem acesso neste lugar. | Já existe um acesso da pessoa no lugar escolhido em **Dar acesso**. | Use o lápis desse acesso para mudar os papéis. |
| Este convite expirou. Peça um novo convite. | Passaram os 7 dias. | Crie um convite novo. |
| Este convite já foi usado. | O link já foi aceito. | Nada a fazer; a pessoa já é membro. |
| Este convite foi enviado para outro e-mail. Entre com a conta convidada. | A pessoa entrou com outra conta. | Ela deve usar **Entrar com outra conta**. |
| Muitas tentativas. Aguarde um pouco e tente novamente. | Muitos pedidos em pouco tempo. | Aguarde e tente de novo. |
| Botão **Convidar** desativado | Você está sem conexão. | Aguarde a conexão voltar. |

## Veja também

- [Papéis e permissões](/docs/roles)
- [Organizações e projetos](/docs/organizations)
- [Unidades](/docs/units)
- [Auditoria](/docs/audit-log)
- [Chaves de API](/docs/api-keys)
- [Primeiros passos](/docs/getting-started)
