# Fluxos e agendamentos

Fluxos de trabalho (workflows) são sequências de etapas que a plataforma executa por você, do início ao fim, sem que alguém precise acompanhar cada passo. Nesta página você aprende a iniciar um fluxo, acompanhar as execuções, entender por que uma execução parou para esperar uma aprovação e programar fluxos para rodar sozinhos com agendamentos.

## O que é

Um **fluxo** é um processo definido em código pela plataforma ou por um módulo instalado. Você não cria fluxos novos pela tela; você escolhe um fluxo que já existe e o executa.

- Uma **execução** é cada vez que um fluxo roda. Ela tem um identificador próprio, um estado (por exemplo, **Em execução** ou **Concluída**) e uma linha do tempo.
- Um **agendamento** faz um fluxo rodar sozinho em dias e horários fixos, como "todos os dias às 09:00".
- Alguns fluxos têm uma etapa que **pede aprovação** a outra pessoa. A execução fica parada (estado **Suspensa**) até alguém decidir o pedido em [Aprovações](/docs/approvals).

Só aparecem na tela os fluxos que a sua organização pode usar:

- fluxos que podem ser **iniciados manualmente**;
- fluxos que podem ser **agendados**.

Fluxos internos da plataforma (manutenção, limpeza, exportações) rodam sozinhos e não aparecem para você. Na instalação básica, os fluxos disponíveis para as organizações são:

| Fluxo | Pode iniciar manualmente | Pode agendar | Para que serve |
|---|---|---|---|
| Demonstração de aprovação | Sim | Não | Pede a outra pessoa que aprove uma nota antes de criá-la. |
| Relatório de uso | Não | Sim | Consolida o uso de modelos por organização e dia, exporta e envia alertas de orçamento. |

Módulos instalados podem acrescentar outros fluxos a essa lista.

## Quem pode usar

O que você vê e faz depende das permissões do seu papel na organização:

| Ação | Permissão necessária |
|---|---|
| Ver a página e as execuções | Ver execuções de workflows (`core.workflow-run.read`) |
| Iniciar um fluxo e usar **Executar de novo** | Iniciar workflows (`core.workflow-run.start`) |
| Cancelar uma execução | Cancelar execuções de workflows (`core.workflow-run.cancel`) |
| Ver a aba **Agendamentos** | Ver agendamentos (`core.schedule.read`) |
| Criar, editar, pausar, retomar, executar agora e excluir agendamentos | Criar e alterar agendamentos (`core.schedule.write`) |

Se você não tem `core.schedule.read`, a página mostra só as execuções, sem as abas. Para ver o nome de quem iniciou uma execução, você também precisa poder ver os membros; sem isso, aparece o identificador da pessoa.

## Onde encontrar

- Menu: **Configurações → Operação → Fluxos e agendamentos**.
- Endereço da lista: `/o/{organização}/settings/workflows`.
- Aba de agendamentos: `/o/{organização}/settings/workflows?tab=schedules`.
- Página de uma execução: `/o/{organização}/settings/workflows/runs/{execução}`.

A aba escolhida, os filtros e a página da lista ficam no endereço. Se você recarregar, compartilhar o link ou voltar de uma execução, a tela continua igual.

![Página Fluxos e agendamentos](/guide/workflows-runs.jpg)

*Na tela: **Configurações → Fluxos e agendamentos**.*

## Passo a passo

### Iniciar um fluxo

1. Abra **Configurações → Operação → Fluxos e agendamentos**.
2. Clique em **Iniciar fluxo**, no topo da página.
3. Em **Fluxo**, escolha um fluxo da lista (**Escolha um fluxo**).
4. Preencha os **Dados de entrada**. Você pode usar o formulário ou clicar em **Editar como JSON** para escrever um objeto JSON. Para voltar ao formulário, clique em **Editar como formulário**.
5. Clique em **Iniciar**.
6. A mensagem "Execução de {fluxo} iniciada." aparece e você vai direto para a página da execução.

A execução roda em seu nome, com as suas permissões nesta organização. O servidor valida os dados de entrada com o formato do fluxo, mesmo que o formulário já tenha aceitado.

### Acompanhar as execuções

1. Na aba **Execuções**, veja a tabela com as colunas **Execução**, **Estado**, **Iniciada por**, **Início** e **Última mudança**.
2. Use os filtros **Fluxo** (ou **Todos os fluxos**) e **Estado** (ou **Qualquer estado**) para encontrar o que procura.
3. Se nada aparecer com os filtros, clique em **Limpar filtros**.
4. Clique em **Abrir** para ver a página de uma execução.

A lista mostra 20 execuções por página. No celular, cada execução aparece como um cartão.

### Entender a página de uma execução

![Página de uma execução suspensa aguardando aprovação](/guide/workflows-run.svg)

*Ilustração com dados de exemplo: uma execução **Suspensa** que aguarda aprovação, com a **Linha do tempo** e os botões **Abrir aprovações** e **Cancelar execução**.*

A página **Execução de {fluxo}** mostra:

- **Linha do tempo**: o fluxo, o **Identificador** da execução, quem a iniciou e o estado atual.
- O aviso "Esta página se atualiza sozinha enquanto a execução está em andamento." enquanto ela ainda pode mudar. Quando termina, aparece "A execução terminou. O estado não muda mais."
- **Etapas**: os eventos das etapas recebidos do servidor enquanto a página está aberta, como **Etapa iniciada**, **Etapa concluída** e **Etapa suspensa**.
- Quando a execução falha, um aviso explica o que fazer.

### Cancelar uma execução

1. Na lista, clique em **Cancelar** na linha da execução, ou abra a execução e clique em **Cancelar execução**.
2. Leia a confirmação. Ela diz: "A execução para e não pode ser retomada. O que ela já fez não é desfeito."
3. Clique em **Cancelar execução** para confirmar, ou em **Manter execução** para desistir.

Você só pode cancelar uma execução que ainda não terminou. As execuções nos estados **Concluída**, **Falhou**, **Cancelada** e **Parada por guardrail** não podem mais ser canceladas.

### Executar de novo depois de uma falha

1. Abra a execução que falhou ou foi parada por uma proteção.
2. Clique em **Executar de novo**.
3. A janela **Iniciar fluxo** abre com o mesmo fluxo já escolhido. Preencha os **Dados de entrada** de novo e clique em **Iniciar**.

O botão **Executar de novo** só aparece quando a execução terminou com falha e o fluxo ainda pode ser iniciado manualmente.

### Criar um agendamento

1. Abra a aba **Agendamentos**.
2. Clique em **Novo agendamento**.
3. Escolha o **Fluxo**. Só aparecem fluxos que podem ser agendados.
4. Preencha o **Nome curto**: letras minúsculas, números e hífens, por exemplo `relatorio-diario`. Ele não pode ser alterado depois.
5. Em **Frequência**, escolha **A cada hora**, **Todos os dias**, **De segunda a sexta**, **Toda semana**, **Todo mês** ou **Expressão cron**. Depois complete o **Horário**, o **Minuto da hora**, o **Dia da semana** ou o **Dia do mês** (de 1 a 28), conforme a frequência.
6. Confira o **Fuso horário**. Os horários valem neste fuso.
7. Se o fluxo precisa de dados, preencha os **Dados de entrada**. Se não precisa, deixe vazio.
8. Confira a lista **Próximos 5 disparos**, calculada pelo servidor.
9. Clique em **Criar agendamento**.

Cada execução de um agendamento roda em nome de quem o criou, com as permissões que essa pessoa tiver na hora do disparo.

### Gerenciar agendamentos

Na tabela de agendamentos você vê as colunas **Workflow**, **Cron e fuso**, **Status** (**Ativo** ou **Pausado**), **Próximo disparo**, **Último disparo** e **Ações**. O próximo disparo aparece no fuso do agendamento e no seu fuso.

- **Pausar**: pede confirmação. O fluxo deixa de rodar sozinho até você retomar. Disparos perdidos durante a pausa não são repostos.
- **Retomar**: volta a disparar a partir do próximo horário.
- **Executar agora**: pede confirmação e começa uma execução extra agora, em nome de quem criou o agendamento. O próximo disparo não muda.
- **Editar** (no menu de mais ações): muda a frequência, o fuso ou os dados de entrada. Clique em **Salvar agendamento**.
- **Excluir** (no menu de mais ações): pede confirmação. O fluxo deixa de rodar sozinho, e as execuções já feitas continuam na lista.

## Exemplo

Exemplo: uma rede de lojas quer receber todo dia útil, às 08:30, o consolidado de uso de IA da organização. A gerente de operações cria um agendamento do **Relatório de uso** com a frequência **De segunda a sexta**, horário 08:30 e fuso `America/Sao_Paulo`.

O agendamento fica assim na tabela:

| Workflow | Cron e fuso | Status | Próximo disparo | Último disparo |
|---|---|---|---|---|
| Relatório de uso | Dias úteis às 08:30 (America/Sao_Paulo) | Ativo | 06/10/2026 08:30 | 05/10/2026 08:30 |

O mesmo agendamento, no formato que a API devolve:

```json
{
  "id": "schedule_3fa9c0e1b2d4a6f8-relatorio-diario",
  "tenantId": "Jd8sK2lPq0WnR5tYu3bV",
  "workflowId": "usage-report",
  "cron": "30 8 * * 1-5",
  "timezone": "America/Sao_Paulo",
  "inputData": {},
  "status": "active",
  "nextFireAt": "2026-10-06T11:30:00.000Z",
  "lastFireAt": "2026-10-05T11:30:00.000Z",
  "createdBy": "uA1b2C3d4E5f6G7h8I9j",
  "createdAt": "2026-10-01T14:00:00.000Z",
  "updatedAt": "2026-10-01T14:00:00.000Z"
}
```

Na mesma organização, um atendente inicia a **Demonstração de aprovação** com o título "Ligar para o fornecedor". A execução para e espera a aprovação de outra pessoa. A lista de execuções fica assim:

| Execução | Estado | Iniciada por | Início | Última mudança |
|---|---|---|---|---|
| Demonstração de aprovação `01J8Z3K4M5N6P7Q8R9S0T1V2W3` | Suspensa | Pelo usuário Ana Souza — Aguarda aprovação | 05/10/2026 10:02 | 05/10/2026 10:02 |
| Relatório de uso `01J8Z1A2B3C4D5E6F7G8H9J0K1` | Concluída | Por um agendamento: relatorio-diario | 05/10/2026 08:30 | 05/10/2026 08:31 |
| Demonstração de aprovação `01J8YZ9X8W7V6U5T4S3R2Q1P0N` | Falhou | Pelo usuário Bruno Lima | 04/10/2026 16:40 | 04/10/2026 16:40 |

A execução suspensa, no formato da API:

```json
{
  "runId": "01J8Z3K4M5N6P7Q8R9S0T1V2W3",
  "workflowId": "approval-demo",
  "tenantId": "Jd8sK2lPq0WnR5tYu3bV",
  "status": "suspended",
  "startedBy": "uA1b2C3d4E5f6G7h8I9j",
  "scheduleId": null,
  "approvalRequestId": "Ap7xQ2mN4bV6cX8zL0kJ",
  "failure": null,
  "createdAt": "2026-10-05T13:02:00.000Z",
  "updatedAt": "2026-10-05T13:02:01.000Z"
}
```

Os dados de entrada enviados ao iniciar essa execução foram:

```json
{
  "inputData": {
    "title": "Ligar para o fornecedor",
    "body": "Confirmar a entrega da próxima semana."
  }
}
```

### Como uma execução espera por aprovação

1. Uma etapa do fluxo cria um pedido de aprovação em nome de quem iniciou a execução.
2. A execução passa para **Suspensa** e a lista mostra **Aguarda aprovação**.
3. Na página da execução aparece: "A execução continua quando outra pessoa aprovar ou rejeitar o pedido." Se você pode ver aprovações, aparece também o link **Abrir aprovações**.
4. Outra pessoa decide o pedido em [Aprovações](/docs/approvals). Quem pediu nunca aprova o próprio pedido.
5. Se o pedido for aprovado, a execução continua e as etapas seguintes rodam em nome de quem a iniciou. Se for recusado, expirar ou for cancelado, a execução termina sem aplicar a ação.

Se você cancelar uma execução suspensa, a confirmação avisa: "A execução para e não pode ser retomada. O pedido de aprovação que ela aguardava é cancelado junto."

### Estados de uma execução

| Estado | O que significa |
|---|---|
| Pendente | A execução foi criada e ainda não começou. |
| Em execução | Uma etapa está rodando agora. |
| Em espera | A execução está esperando para continuar. |
| Suspensa | A execução parou numa etapa, por exemplo esperando uma aprovação. |
| Pausada | A execução foi pausada. |
| Concluída | Todas as etapas terminaram. |
| Falhou | Uma etapa falhou ou a execução falhou fora de uma etapa. |
| Cancelada | Alguém cancelou a execução. |
| Parada por guardrail | Uma proteção de segurança barrou o conteúdo da execução. |

## Dicas e boas práticas

- Use nomes curtos que digam o que o agendamento faz, como `relatorio-diario` ou `fechamento-mensal`. Como o nome curto não muda depois, escolha com cuidado.
- O intervalo mínimo entre disparos é de 15 minutos. Para frequências maiores, prefira **A cada hora** ou **Todos os dias** em vez de uma expressão cron.
- Use **Dia do mês** de 1 a 28 para o agendamento existir em todos os meses.
- Como os agendamentos rodam com as permissões de quem os criou, um agendamento pode parar de funcionar se essa pessoa perder acesso. Nesse caso, peça a alguém com permissão para recriá-lo.
- Antes de cancelar uma execução, lembre que o que ela já fez não é desfeito.
- Se uma falha se repetir, anote o **Identificador** da execução antes de falar com o suporte.
- Os disparos de todos os agendamentos dependem de um recurso da plataforma (**Agendamentos de workflows**). Se a equipe da plataforma desligar esse recurso, nenhum agendamento dispara. Quando ele volta, um disparo perdido roda uma vez. A organização não controla esse recurso.

## Erros comuns

| Mensagem/situação | O que significa | Como resolver |
|---|---|---|
| "Não foi possível carregar a lista de fluxos. Iniciar e agendar ficam indisponíveis até ela carregar." | A lista de fluxos da organização não carregou. | Recarregue a página. Se continuar, tente mais tarde. |
| "Nenhum fluxo desta organização pode ser iniciado manualmente." | Nenhum fluxo disponível aceita início manual. | Use agendamentos, se houver fluxos agendáveis, ou fale com quem administra a organização. |
| "Nenhum fluxo desta organização pode ser agendado." | Nenhum fluxo disponível aceita agendamento. | Não é possível criar agendamentos nesta organização por enquanto. |
| "Este fluxo não pode ser iniciado manualmente." | O fluxo escolhido só roda por agendamento ou pela plataforma. | Escolha outro fluxo ou crie um agendamento. |
| "Este fluxo não pode ser agendado." | O fluxo escolhido não aceita agendamento. | Escolha outro fluxo. |
| "O intervalo entre disparos é curto demais. Use pelo menos 15 minutos." | A frequência pede disparos com menos de 15 minutos entre eles. | Escolha uma frequência maior. |
| "Já existe um agendamento com este nome curto. Escolha outro." | O nome curto já está em uso na organização. | Escolha outro nome curto. |
| "Revise a frequência: horário, dia ou expressão inválidos." | A frequência ou a expressão cron está incompleta ou errada. | Confira os campos. A expressão cron tem cinco campos, por exemplo `0 9 * * 1-5`. |
| "Escreva um objeto JSON válido." | Os dados de entrada em JSON têm erro de sintaxe. | Corrija o JSON ou volte ao formulário. |
| "Alguns campos estão inválidos. Revise e tente novamente." | O servidor recusou os dados de entrada. | Confira os campos obrigatórios do fluxo. |
| "Uma etapa falhou" / "A execução falhou fora de uma etapa" | A execução terminou com falha. | Revise os dados de entrada e execute o fluxo de novo. Se a falha continuar, informe o identificador da execução ao suporte. |
| "Uma proteção interrompeu a execução" | Uma proteção de segurança barrou o conteúdo desta execução. | Revise os dados de entrada antes de executar de novo. Se achar que foi engano, informe o identificador da execução ao suporte. |
| "Execução não encontrada" | A execução não existe mais ou pertence a outra organização. | Clique em **Voltar às execuções** e confira se você está na organização certa. |
| "Você não tem permissão para fazer isso." | Falta uma permissão para a ação. | Peça a quem administra a organização para ajustar o seu papel. |

## Veja também

- [Aprovações](/docs/approvals)
- [Uso e orçamento](/docs/usage)
- [Rastros (traces)](/docs/traces)
- [Recursos (flags)](/docs/flags)
- [Papéis e permissões](/docs/roles)
- [Glossário](/docs/glossary)
