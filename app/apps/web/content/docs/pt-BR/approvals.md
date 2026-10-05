# Aprovações

Algumas ações são importantes demais para uma pessoa só decidir. Nesses casos, a plataforma pede que uma segunda pessoa aprove antes de executar. Esta página mostra como funciona a caixa de aprovações, como decidir um pedido e onde consultar o histórico.

## O que é

Uma **solicitação de aprovação** é um pedido para executar uma ação que exige a decisão de outra pessoa. É a regra dos "quatro olhos": **quem pede nunca aprova o próprio pedido**.

Os pedidos podem surgir de dois lugares:

- **No chat**: quando o assistente vai executar uma ação que exige aprovação, a conversa mostra o cartão **Aprovação necessária**. Se outra pessoa precisa decidir, aparece **Aguardando aprovação de outra pessoa** com o link **Abrir aprovações**. Veja [Chat](/docs/chat).
- **Em um fluxo**: uma etapa de um fluxo pode pedir aprovação. A execução fica **Suspensa** até a decisão. Veja [Fluxos e agendamentos](/docs/workflows).

Cada pedido tem:

- um resumo do que será feito;
- quem pediu;
- **Onde:** o local da ação (organização, projeto ou unidade);
- um prazo, depois do qual o pedido expira;
- a permissão da ação;
- uma prévia, quando existe. Para ações com alterações, a prévia mostra **Antes** e **Depois**. Para pedidos de fluxos, mostra o link **Ver o progresso do fluxo**. Sem prévia, aparece "Sem prévia disponível."

Um pedido pendente expira 7 dias depois de criado.

### Estados de um pedido

| Estado | O que significa |
|---|---|
| Pendente | Aguarda decisão. |
| Aprovada | Alguém aprovou e a ação vai ser executada. |
| Executada | A ação foi aprovada e executada. |
| Falhou | A ação foi aprovada, mas não foi executada. |
| Recusada | Alguém recusou. A ação não será executada. |
| Cancelada | O pedido foi cancelado, por exemplo junto com o fluxo que o aguardava. |
| Expirada | Ninguém decidiu dentro do prazo. |

## Quem pode usar

- Para **ver** a página de aprovações, você precisa da permissão Ver pedidos de aprovação (`core.approval.read`).
- Para **decidir** (aprovar ou recusar), você precisa de três coisas ao mesmo tempo:
  1. a permissão Aprovar ou recusar pedidos (`core.approval.decide`);
  2. a própria permissão da ação pedida (por exemplo, se a ação exclui algo, você precisa poder excluir aquilo);
  3. acesso ao local da ação. Quem aprova num projeto decide apenas pedidos daquele projeto.
- **Quem pediu nunca decide**, mesmo que tenha todas as permissões.

Quando você não pode decidir, a tela explica o motivo em vez de mostrar os botões:

| Mensagem | Motivo |
|---|---|
| "Você pediu esta aprovação. Outra pessoa com permissão precisa decidir." | O pedido é seu. |
| "Seu acesso não cobre o local desta solicitação, então você não pode decidi-la." | Você não tem acesso ao projeto ou à unidade do pedido. |
| "Você não tem permissão para decidir esta solicitação. É preciso poder decidir aprovações e ter a permissão da própria ação." | Falta `core.approval.decide` ou a permissão da ação. |

## Onde encontrar

- Menu: **Configurações → Operação → Aprovações**.
- Atalho: abra o menu da sua conta, no rodapé da barra lateral, e clique em **Aprovações**.
- Endereço da caixa: `/o/{organização}/settings/approvals`.
- Abas: `?tab=mine` (**Pedidas por mim**) e `?tab=history` (**Histórico**). Sem `tab`, abre **Aguardando minha decisão**.
- Página de um pedido: `/o/{organização}/settings/approvals/{pedido}`.

![Página Aprovações](/guide/approvals-inbox.jpg)

*Na tela: **Configurações → Aprovações**.*

### O aviso no menu da conta

Quando há pedidos aguardando a sua decisão na organização aberta:

- um ponto âmbar aparece sobre a sua foto, no rodapé da barra lateral;
- dentro do menu da conta, o item **Aprovações** mostra o número de pedidos que aguardam você.

O número conta só os pedidos pendentes feitos por **outras pessoas**. Os seus próprios pedidos não entram. O item só aparece se você pode ver aprovações nesta organização.

## Passo a passo

### Ver o que aguarda a sua decisão

1. Abra **Configurações → Operação → Aprovações**.
2. A aba **Aguardando minha decisão ({quantidade})** mostra os pedidos pendentes feitos por outras pessoas.
3. A aba **Pedidas por mim ({quantidade})** mostra os seus pedidos que ainda aguardam decisão.
4. A aba **Histórico** mostra os pedidos já concluídos: executados, recusados, cancelados ou expirados.

A lista se atualiza sozinha a cada 15 segundos e quando você volta para a janela.

### Aprovar um pedido

![Página Solicitação de aprovação com os detalhes do pedido, o motivo e os botões Aprovar e Recusar](/guide/approvals-detail.svg)

*Ilustração com dados de exemplo: a **Solicitação de aprovação**, com os detalhes, o **Motivo (opcional)** e os botões **Aprovar** e **Recusar**.*

1. Na aba **Aguardando minha decisão**, clique no resumo do pedido para abrir a **Solicitação de aprovação**.
2. Confira os detalhes: **Pedida em**, **Expira em**, **Permissão da ação** e **Referência**. Confira também a prévia.
3. Se quiser, escreva um **Motivo (opcional)**. Quem pediu vê o motivo, e ele fica na auditoria. O limite é de 500 caracteres.
4. Clique em **Aprovar**.
5. A ação é executada na hora. Você vê uma destas mensagens:
   - "Solicitação aprovada e ação executada."
   - "Solicitação aprovada."
   - "A solicitação foi aprovada, mas a ação falhou ao executar."

Você também pode aprovar direto na lista, sem abrir o pedido. Os botões aparecem embaixo de cada item da aba **Aguardando minha decisão**.

### Recusar um pedido

1. Abra o pedido ou encontre-o na aba **Aguardando minha decisão**.
2. Se quiser, escreva o **Motivo (opcional)**.
3. Clique em **Recusar**.
4. Na janela **Recusar esta solicitação?**, confirme em **Recusar solicitação**.
5. A mensagem "Solicitação recusada." confirma a decisão. Quem pediu pode fazer um novo pedido.

### Consultar o histórico

1. Clique na aba **Histórico**.
2. Cada item mostra o estado, quem pediu, quando foi atualizado e o motivo informado, se houver.
3. Use a paginação no fim da lista para ver pedidos mais antigos.
4. Clique no resumo para abrir o pedido. A página mostra também **Decidida por**.

Para voltar à caixa, clique em **Voltar para aprovações**. Você volta para a mesma aba de onde saiu.

## Exemplo

Exemplo: em um escritório de contabilidade, um assistente da equipe pede, pelo chat, para excluir uma fatura lançada em duplicidade. A exclusão de faturas exige aprovação. A coordenadora financeira recebe o pedido.

A caixa da coordenadora mostra:

| Resumo | Estado | Pedida por | Onde | Prazo |
|---|---|---|---|---|
| Excluir a fatura 42 | Pendente | Pedida por Carlos Mendes | Projeto Clientes 2026 | Expira em 12/10/2026 10:15 |
| Criar nota: Ligar para o fornecedor | Pendente | Pedida por Ana Souza | Organização | Expira em 12/10/2026 13:02 |

O primeiro pedido, no formato que a API devolve:

```json
{
  "id": "Ap7xQ2mN4bV6cX8zL0kJ",
  "tenantId": "Jd8sK2lPq0WnR5tYu3bV",
  "node": {
    "level": "project",
    "tenantId": "Jd8sK2lPq0WnR5tYu3bV",
    "projectId": "Pr4oJ8eC2tX6yZ0aB3cD"
  },
  "permission": "sample.invoice.delete",
  "requestedBy": { "type": "user", "id": "uK9l8M7n6O5p4Q3r2S1t" },
  "action": {
    "kind": "sample-delete-invoice",
    "input": { "invoiceId": "Iq2wE4rT6yU8iO0pA1sD" },
    "summary": "Excluir a fatura 42"
  },
  "status": "pending",
  "decidedBy": null,
  "reason": null,
  "expiresAt": "2026-10-12T13:15:00.000Z",
  "createdAt": "2026-10-05T13:15:00.000Z",
  "updatedAt": "2026-10-05T13:15:00.000Z"
}
```

A coordenadora confere o pedido, escreve o motivo e clica em **Aprovar**. O corpo enviado é:

```json
{
  "reason": "Confirmado com o financeiro."
}
```

A ação é executada e o pedido vai para o **Histórico**:

| Resumo | Estado | Pedida por | Decidida por | Motivo informado |
|---|---|---|---|---|
| Excluir a fatura 42 | Executada | Carlos Mendes | Juliana Prado | Confirmado com o financeiro. |
| Criar nota: Ligar para o fornecedor | Recusada | Ana Souza | Juliana Prado | Nota em duplicidade. |
| Atualizar cadastro do cliente | Expirada | Carlos Mendes | — | — |

O segundo pedido veio de um fluxo. Ao ser recusado, a execução do fluxo terminou sem criar a nota.

### Quando uma ação aprovada falha

Se o estado ficar **Falhou**, o pedido mostra "A ação foi aprovada, mas não foi executada. Peça a quem a solicitou para pedir de novo." Logo abaixo aparecem o motivo e uma referência, por exemplo:

- "A execução foi interrompida antes de terminar. Confira se a ação teve efeito antes de pedir de novo."
- "Referência: req_01J9A2B3C4 (EXECUTION_INTERRUPTED)"

Guarde essa referência se precisar falar com o suporte.

## Dicas e boas práticas

- Sempre confira a prévia (**Antes** e **Depois**) e o local (**Onde:**) antes de aprovar. Aprovar executa a ação na hora.
- Escreva um motivo quando recusar. Ele ajuda quem pediu a corrigir o pedido e fica na auditoria.
- Decida rápido os pedidos que travam um fluxo. A execução fica **Suspensa** até alguém decidir, e o pedido expira em 7 dias.
- Se você precisa aprovar pedidos de vários projetos, peça um papel com acesso a todos eles. Acesso a um único projeto não cobre os outros.
- Se aparecer o aviso **Nem todas as solicitações pendentes foram carregadas**, decida os pedidos da lista para ver os demais.

## Erros comuns

| Mensagem/situação | O que significa | Como resolver |
|---|---|---|
| "Você não pode decidir uma solicitação que você mesmo pediu. Outra pessoa precisa decidir." | Você tentou decidir o seu próprio pedido. | Peça a outra pessoa com permissão para decidir. |
| "Você não tem permissão para decidir esta solicitação neste local." | Você não tem a permissão de decidir ou a permissão da ação no local do pedido. | Peça a quem administra a organização para ajustar o seu papel. |
| "Esta solicitação não está mais pendente: foi decidida, cancelada com o fluxo ou expirou. A lista foi atualizada." | Outra pessoa decidiu antes, o fluxo foi cancelado ou o prazo acabou. | Confira o estado atual na aba **Histórico**. |
| "Esta solicitação não existe mais ou você perdeu o acesso a ela." | O pedido sumiu ou você perdeu acesso. | Volte para a caixa e confira se está na organização certa. |
| "Solicitação não encontrada" | O endereço aponta para um pedido que não existe nesta organização ou que você não pode ver. | Clique em **Voltar para aprovações**. |
| "A solicitação foi aprovada, mas a ação falhou ao executar." | A aprovação valeu, mas a ação deu erro. | Peça a quem solicitou para pedir de novo. Se continuar, informe a referência ao suporte. |
| "Não foi possível conectar. Verifique sua conexão e tente novamente." | Você está sem conexão. Os botões ficam desativados enquanto você está offline. | Reconecte-se e tente de novo. |

## Veja também

- [Fluxos e agendamentos](/docs/workflows)
- [Chat](/docs/chat)
- [Papéis e permissões](/docs/roles)
- [Membros](/docs/members)
- [Perfil](/docs/profile)
- [Glossário](/docs/glossary)
