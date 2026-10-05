# Administração: operações

Esta página cobre as áreas do grupo **Operação** da administração da plataforma: **Workflows**, **Flags**, **Conectores** e **Auditoria** (esta explicada em [Administração da plataforma](/docs/admin)). Nelas a equipe acompanha e cancela execuções de todas as organizações, pausa ou dispara agendamentos, liga e desliga funcionalidades por ambiente ou por organização e consulta os conectores que cada organização configurou. Para saber quem pode entrar na administração, veja [Administração da plataforma](/docs/admin).

## Workflows

**Para que serve:** ver as execuções de workflows de todas as organizações e da plataforma, encontrar as que aguardam aprovação, cancelar uma execução e controlar os agendamentos.

- **URL:** `/admin/workflows`
- **Permissão:** `platform.workflow.manage`, só do `platform-admin`.

A página tem duas abas: **Execuções** e **Agendamentos**. O endereço guarda a aba, os filtros e a execução aberta, então você pode compartilhar o link.

![Página Workflows da administração](/guide/admin-workflows.jpg)

*Na tela: `/admin/workflows`.*

### Execuções

A tabela tem as colunas **Workflow**, **Organização** (ou **Plataforma**), **Status**, **Iniciada por**, **Início**, **Última mudança** e **Ações**. Em **Iniciada por** aparece o agendamento, o usuário ou **Plataforma**. Uma execução suspensa mostra **Aguarda aprovação**.

Os status possíveis são **Pendente**, **Em execução**, **Em espera**, **Suspensa**, **Pausada**, **Concluída**, **Falhou**, **Cancelada** e **Parada por guardrail**.

Passo a passo para cancelar uma execução:

1. Filtre por **Organização**, **Workflow** (o id, por exemplo `usage-report`) e **Status**, e clique em **Aplicar**. Para ver só as que esperam aprovação, clique em **Aguardando aprovação**.
2. Clique em **Detalhes** para ver a linha do tempo da execução.
3. Clique em **Cancelar** na linha. O botão só aparece enquanto a execução não terminou, ou seja, quando não está **Concluída**, **Falhou**, **Cancelada** ou **Parada por guardrail**.
4. Leia o aviso: a execução para agora e não pode ser retomada. Se ela aguardava uma aprovação, a solicitação de aprovação é cancelada junto.
5. Confirme em **Cancelar execução**, ou desista com **Manter execução**.

O cancelamento fica na auditoria como `WORKFLOW_RUN_CANCELED`.

Exemplo:

| Workflow | Organização | Status | Iniciada por | Início |
|---|---|---|---|---|
| approval-demo | Clínica Exemplo | Suspensa (Aguarda aprovação) | Usuário Ana Souza | 05/10/2026 09:12 |
| usage-report | Plataforma | Concluída | Plataforma | 05/10/2026 06:00 |
| approval-demo | Escola Modelo | Falhou | Usuário Bruno Lima | 04/10/2026 17:40 |

A segunda linha, como a API a envia:

```json
{
  "runId": "01J8Z3K4M5N6P7Q8R9S0T1V2W3",
  "workflowId": "usage-report",
  "tenantId": null,
  "status": "success",
  "startedBy": null,
  "scheduleId": null,
  "approvalRequestId": null,
  "createdAt": "2026-10-05T06:00:00.000Z",
  "updatedAt": "2026-10-05T06:00:12.000Z"
}
```

### Agendamentos

A aba **Agendamentos** mostra os agendamentos da plataforma e de todas as organizações, com **Workflow**, **Cron e fuso**, **Status** (**Ativo** ou **Pausado**), **Próximo disparo**, **Último disparo** e **Ações**. Escolha uma organização para ver só os dela. Os agendamentos da plataforma aparecem quando nenhuma organização está escolhida.

As ações de cada agendamento:

- **Pausar**: o agendamento deixa de disparar até ser retomado. Execuções em andamento continuam. Confirme em **Pausar agendamento**.
- **Retomar**: volta a disparar a partir do próximo horário do cron. Os disparos que não aconteceram durante a pausa não são repostos. Confirme em **Retomar agendamento**.
- **Executar agora**: começa uma execução extra agora, sem mudar o próximo disparo do cron. Confirme em **Executar agora**.

Num agendamento de uma organização, **Executar agora** roda em nome de quem criou o agendamento e com as permissões atuais dessa pessoa. A equipe não roda o workflow como a organização.

As três ações ficam na auditoria (`SCHEDULE_PAUSED`, `SCHEDULE_RESUMED` e `SCHEDULE_RUN_REQUESTED`).

Exemplo de agendamento da plataforma, como a API o envia:

```json
{
  "id": "schedule_platform-usage-report",
  "scope": "platform",
  "tenantId": null,
  "workflowId": "usage-report",
  "cron": "15 * * * *",
  "timezone": "UTC",
  "status": "active",
  "nextFireAt": "2026-10-05T12:15:00.000Z",
  "lastFireAt": null,
  "createdBy": null,
  "createdAt": "2026-09-29T14:30:00.000Z",
  "updatedAt": "2026-09-29T14:30:00.000Z"
}
```

### Cuidados

- Pausar um job da **Plataforma** para de rodar para **todas** as organizações: por exemplo, a expiração de aprovações, a limpeza de dados ou o relatório de uso. A confirmação, **Pausar job da plataforma**, avisa isso. Pause só durante um incidente e retome em seguida.
- "Use o id do workflow: minúsculas, números e hifens." O filtro **Workflow** espera o id, não o nome.
- Se o link aponta para uma execução que não está na lista carregada, você verá "Execução não encontrada nesta lista". Ela pode estar em outra página ou fora dos filtros.
- Os eventos de cada etapa não aparecem na administração. A linha do tempo mostra o que a execução registra.

## Flags

**Para que serve:** ligar e desligar funcionalidades no ambiente inteiro ou só para uma organização. As flags são declaradas no código, cada uma com responsável, motivo e validade.

- **URL:** `/admin/flags`
- **Permissão:** `platform.flag.manage`, só do `platform-admin`.

A tabela tem as colunas **Flag**, **Tipo** (**Kill-switch**, **Rollout** ou **Operação**), **Validade**, **Ambiente** e, quando uma organização está escolhida, **Ajuste da organização**.

As flags do produto:

| Flag | Tipo | Padrão | Para que serve |
|---|---|---|---|
| `ai.kill-switch` | Kill-switch | Desligada | Para todas as execuções de agentes, chat e voz durante um incidente |
| `ai.web-tools` | Operação | Ligada | Chave da plataforma sobre as ferramentas web que cada organização liga |
| `chat.voice` | Rollout | Desligada | Transcrição e fala no chat, por ambiente e por organização |
| `chat.voice.realtime` | Rollout | Desligada | Conversas por voz em tempo real |
| `ai.memory.observational` | Rollout | Desligada | Memória observacional dos agentes, lida quando o runtime inicia |
| `workflows.schedules` | Operação | Ligada | Disparos dos agendamentos de workflows, da plataforma e das organizações |

Todas têm o responsável `platform-team`. Exemplo de uma flag como a API a envia:

```json
{
  "key": "ai.kill-switch",
  "owner": "platform-team",
  "reason": "Stops every agent and chat run during an incident.",
  "kind": "kill-switch",
  "default": false,
  "createdAt": "2026-09-30T00:00:00.000Z",
  "expiresAt": "2027-09-30T00:00:00.000Z",
  "value": false,
  "tenantOverride": null,
  "expired": false
}
```

![Página Flags](/guide/admin-flags.jpg)

*Na tela: `/admin/flags`.*

### Mudar o valor no ambiente

1. Encontre a flag em **Buscar flag**, pela chave ou pelo nome.
2. Use a chave da coluna **Ambiente**.
3. Leia a confirmação: o valor vale para todas as organizações e fica na auditoria.
4. Confirme em **Ligar** ou **Desligar**. Aparece, por exemplo, "chat.voice ligada."

### Ajustar para uma organização

1. Em **Ajuste por organização**, escolha a organização.
2. Na coluna **Ajuste da organização**, veja **Sem ajuste**, **Ajuste: ligada** ou **Ajuste: desligada**, e o **Valor efetivo**.
3. Clique em **Ligar** ou **Desligar** e confirme. O ajuste vale só para a organização escolhida.
4. Para a organização voltar a seguir o valor do ambiente, clique em **Remover ajuste** e confirme em **Remover ajuste**.

A equipe pode ajustar qualquer flag por organização. Todas as mudanças ficam na auditoria como `FEATURE_FLAG_UPDATED`.

Exemplo: a Clínica Exemplo vai testar a voz no chat antes das outras organizações. Com `chat.voice` desligada no ambiente, você escolhe a Clínica Exemplo e clica em **Ligar**. A coluna passa a mostrar **Ajuste: ligada** e **Valor efetivo: ligada**.

### Cuidados

- Ligar um kill-switch interrompe na hora o que ele descreve, no ambiente inteiro ou na organização escolhida. Com `ai.kill-switch` ligada, os usuários veem "Este recurso está desativado no momento."
- Mudar `ai.memory.observational` aqui não altera um runtime que já está rodando: o valor é decidido quando o runtime inicia.
- Desligar `ai.web-tools` desliga as ferramentas web de todas as organizações, mesmo das que as ligaram.
- Flags vencidas aparecem com **Expirada** e num alerta no topo. Use **Mostrar só as expiradas** para vê-las. Elas devem ser removidas ou renovadas no código.
- Se os ajustes da organização não carregarem, você verá "Não foi possível carregar os ajustes da organização." Clique em **Recarregar**.

## Conectores

**Para que serve:** consultar os sistemas externos que cada organização liberou para os agentes dela. Os segredos nunca aparecem aqui.

- **URL:** `/admin/connectors`
- **Permissão:** `platform.connector.read`, dos papéis `platform-admin` e `platform-support`.

A área é **somente leitura**: a equipe da plataforma não altera nem desativa conectores. Quem administra a organização faz isso nas configurações dela (veja [Conectores](/docs/connectors)).

![Página Conectores da administração](/guide/admin-connectors.jpg)

*Na tela: `/admin/connectors`.*

### Passo a passo

1. Em **Escolher organização**, escolha a organização. Os conectores são listados uma organização por vez.
2. Leia a tabela, com as colunas **Conector**, **Tipo**, **Status**, **Alcance**, **Ferramentas**, **Segredo** e **Atualizado em**.

- **Tipo**: **API (OpenAPI)**, **Servidor MCP**, **Postgres (leitura)** ou **Navegador**.
- **Status**: **Ativo**, **Desativado** ou **Com erro**.
- **Alcance**: os endereços liberados ou, num conector Postgres, as tabelas que ele pode ler.
- **Ferramentas**: quantas ferramentas estão liberadas e quantas rodam sem aprovação.
- **Segredo**: **Segredo configurado** ou **Sem segredo**.

Exemplo para a Clínica Exemplo:

| Conector | Tipo | Status | Alcance | Ferramentas | Segredo |
|---|---|---|---|---|---|
| Agenda | API (OpenAPI) | Ativo | api.agenda.exemplo.com | 4 ferramentas, 2 sem aprovação | Segredo configurado |
| Relatórios | Postgres (leitura) | Com erro | public.consultas e mais 2 | 1 ferramenta, 1 sem aprovação | Segredo configurado |

### Cuidados

- Se a organização não tem conectores, você verá "Esta organização não tem conectores". Eles são criados nas configurações da organização por quem a administra.
- Um conector **Com erro** só pode ser corrigido pela própria organização. Oriente quem a administra.

## Veja também

- [Administração da plataforma](/docs/admin)
- [Administração: clientes](/docs/admin-customers)
- [Administração: IA](/docs/admin-ai)
- [Workflows](/docs/workflows)
- [Aprovações](/docs/approvals)
- [Flags](/docs/flags)
- [Conectores](/docs/connectors)
