# Auditoria

A **Auditoria** mostra quem fez o quê na organização: quem criou um projeto, quem deu ou tirou um acesso, quem revogou uma chave de API. Esta página explica como ler a lista e como filtrar por um tipo de ação.

## O que é

- Cada alteração importante feita na organização gera um **registro**. Os registros não podem ser editados nem apagados por ninguém da organização.
- Cada registro diz **quando** aconteceu, **qual ação** foi feita, **quem** fez, **em quê** (o alvo) e o **resultado**.
- Quando a ação altera dados, o registro mostra **quais campos** mudaram, como `name` ou `status`, mas **nunca os valores** antigos ou novos. Assim a auditoria não guarda dados pessoais além do necessário.
- Tentativas recusadas também ficam registradas, com o resultado **Negado**.

| Resultado | Significado |
|---|---|
| **Feito** | A ação foi concluída. |
| **Negado** | A ação foi recusada, por exemplo por falta de permissão. |
| **Falhou** | A ação foi tentada, mas deu erro. |
| **Aguardando aprovação** | A ação depende de alguém aprovar. Veja [Aprovações](/docs/approvals). |

Em **Quem**, aparece o nome do membro quando você pode ver a lista de membros. Ações feitas por uma integração aparecem como **Integração (chave de API)**, por um equipamento como **Dispositivo** e por rotinas automáticas como **Sistema**. Quando a equipe de suporte da plataforma agiu como um usuário, o registro indica **pelo suporte**.

## Quem pode usar

| Ação | Permissão | Papéis que têm por padrão |
|---|---|---|
| Ver a **Auditoria** | `core.audit-log.read` | Proprietário, Administrador |
| Ver o nome de quem fez cada ação | `core.member.read` | Proprietário, Administrador, Membro |

Sem `core.audit-log.read`, a seção não aparece no menu e o endereço mostra **Você não tem acesso a esta página**. Para dar essa permissão a outra pessoa sem torná-la administradora, crie um papel personalizado com ela. Veja [Papéis e permissões](/docs/roles).

## Onde encontrar

- **Configurações → Auditoria**: `/o/{organização}/settings/audit-log`
- Já filtrada por uma ação: `/o/{organização}/settings/audit-log?action=MEMBERSHIP_GRANTED`

A seção fica no grupo **Organização** do menu de configurações.

## Passo a passo

### Ver o que aconteceu

1. Vá em **Configurações → Auditoria**.
2. A tabela mostra os registros do mais recente para o mais antigo, com as colunas **Quando**, **Ação**, **Quem**, **Alvo** e **Resultado**.
3. Em **Alvo**, a primeira linha diz o tipo (por exemplo **Projeto** ou **Acesso**), a segunda traz o identificador e, quando houver, **Campos:** lista o que mudou.
4. Use **Anterior** e **Próxima** para navegar entre as páginas.

### Filtrar por uma ação

1. Clique no filtro **Todas as ações**, acima da tabela.
2. Digite parte do nome da ação em **Buscar ação**, por exemplo "acesso".
3. Escolha a ação, por exemplo **Acesso revogado**. A tabela mostra só os registros dessa ação.
4. Para voltar a ver tudo, escolha **Todas as ações**.

O filtro fica no endereço da página. Você pode copiar o link e enviá-lo para outra pessoa com a mesma permissão.

## Exemplo

Exemplo: na organização "Rede Construir", o gerente quer saber por que a vendedora Carla perdeu o acesso à Loja Centro.

1. Ele abre **Configurações → Auditoria** e filtra por **Acesso revogado**.
2. A tabela mostra:

| Quando | Ação | Quem | Alvo | Resultado |
|---|---|---|---|---|
| 03/10/2026 17:42 | Acesso revogado | João Lima | Acesso | Feito |
| 01/10/2026 09:10 | Acesso revogado | Integração (chave de API) | Acesso | Negado |

3. O primeiro registro mostra que João revogou o acesso. O segundo mostra que uma integração tentou revogar outro acesso e foi recusada.

Como um registro aparece em `GET /v1/organizations/{organizationId}/audit-logs` (formato do contrato `audit.AuditLogEntry`, com valores ilustrativos):

```json
{
  "id": "Al7Kq2Wm9Pz4Rt6Yv1Xc",
  "tenantId": "Xk2pQ7vR9mWb3TnL8sYc",
  "occurredAt": "2026-10-03T20:42:00.000Z",
  "action": "PROJECT_UPDATED",
  "actor": { "type": "user", "id": "uK7m2Np4Qr8Sv1Tx5Wz3" },
  "target": { "type": "project", "id": "Pj4Wd9Ks2Lq6Mn8Bv3Yr" },
  "outcome": "success",
  "requestId": "01K6Z8Q3M4N5P6R7S8T9V0W1X2",
  "changes": ["name", "status"]
}
```

## Dicas e boas práticas

- Dê `core.audit-log.read` a quem cuida de segurança ou conformidade, mesmo que essa pessoa não administre o dia a dia.
- Ao investigar um problema, comece filtrando pela ação e depois olhe a data.
- Os horários aparecem no seu fuso horário (escolhido no perfil ou o padrão da organização).
- Ao falar com o suporte, informe a data, a ação e o identificador do alvo do registro.

## Erros comuns

| Mensagem/situação | O que significa | Como resolver |
|---|---|---|
| Você não tem acesso a esta página | Falta `core.audit-log.read`. | Peça a um Proprietário ou Administrador. |
| Nenhum registro desta ação | Nada dessa ação aconteceu na organização. | Escolha **Todas as ações** ou outra ação. |
| Em **Quem** aparece um identificador em vez do nome | Você não pode ver a lista de membros, ou a pessoa já saiu da organização. | Peça `core.member.read`, ou procure o identificador com quem administra. |

## Veja também

- [Membros e convites](/docs/members)
- [Papéis e permissões](/docs/roles)
- [Organizações e projetos](/docs/organizations)
- [Aprovações](/docs/approvals)
