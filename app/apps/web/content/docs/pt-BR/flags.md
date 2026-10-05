# Recursos (flags)

Alguns recursos da plataforma podem ser ligados ou desligados sem mudar o aplicativo. Esses interruptores se chamam *feature flags*. Esta página mostra quais recursos a sua organização pode desligar para si, como voltar a usá-los e como devolver a decisão à plataforma.

## O que é

Cada recurso opcional tem um **valor da plataforma**: ligado ou desligado, definido pela equipe que opera a plataforma. A sua organização pode fazer uma **alteração** só para ela, dentro de regras simples:

- a organização pode **desligar** um recurso que a plataforma mantém ligado;
- a organização pode **voltar a usar** um recurso que ela mesma desligou;
- a organização pode **seguir a plataforma**, ou seja, remover a própria alteração;
- a organização **não pode ligar** um recurso que a plataforma desligou.

A página explica isso com o aviso: "A organização só pode desligar um recurso para si mesma, ou voltar a usá-lo. Ela não pode ligar um recurso que a plataforma desligou."

Só aparecem os recursos que a plataforma permite à organização ajustar. Os demais, como o **Interruptor de emergência da IA**, as **Ferramentas de web**, a **Memória observacional** e os **Agendamentos de workflows**, são controlados apenas pela equipe da plataforma e não aparecem nesta tela.

Na instalação básica, os recursos ajustáveis pela organização são:

| Recurso | Para que serve | Valor inicial da plataforma |
|---|---|---|
| Voz no chat | Transcrição e fala por ambiente e organização. | Desligado |
| Voz em tempo real | Sessões de voz em tempo real; o áudio vai direto entre o navegador e o provedor e ainda não é medido. | Desligado |

Como os dois começam desligados, o mais comum é você ver **Desligado pela plataforma** e nenhuma ação disponível até a equipe da plataforma ligar o recurso. Módulos instalados podem acrescentar outros recursos a essa lista.

## Quem pode usar

| Ação | Permissão necessária |
|---|---|
| Ver os recursos e os valores | Ver funcionalidades da organização (`core.flag.read`) |
| Desligar, voltar a usar e seguir a plataforma | Ligar e desligar funcionalidades da organização (`core.flag.write`) |

Sem `core.flag.write`, você vê a tabela, mas sem botões. Os botões também somem quando você está sem conexão.

## Onde encontrar

- Menu: **Configurações → Operação → Recursos**.
- Endereço: `/o/{organização}/settings/flags`.

![Página Recursos](/guide/flags-list.jpg)

*Na tela: **Configurações → Recursos**.*

## Passo a passo

### Ler a tabela de recursos

A tabela tem as colunas:

| Coluna | O que mostra |
|---|---|
| **Recurso** | O nome, a descrição e a chave técnica do recurso (por exemplo `chat.voice`). |
| **Valor da plataforma** | **Ligado** ou **Desligado**. Enquanto a organização tem uma alteração, aparece "Não informado enquanto a organização altera o recurso". |
| **Alteração da organização** | **Sem alteração**, **Ligado pela organização** ou **Desligado pela organização**. |
| **Valor em uso** | O que vale de fato para a organização agora: **Ligado** ou **Desligado**. |
| **Ações** | Os botões disponíveis para o recurso. |

No celular, cada recurso aparece como um cartão com as mesmas informações.

### Desligar um recurso para a organização

1. Abra **Configurações → Operação → Recursos**.
2. Na linha do recurso, clique em **Desligar para a organização**.
3. Leia a confirmação **Desligar {recurso} para a organização?**. Ela avisa: "O recurso deixa de funcionar para todos os membros desta organização."
4. Clique em **Desligar**.
5. A mensagem "{recurso} desligado para a organização." confirma. A coluna **Alteração da organização** passa a mostrar **Desligado pela organização**.

### Voltar a usar um recurso

1. Na linha do recurso desligado pela organização, clique em **Voltar a usar**.
2. Na confirmação **Voltar a usar {recurso}?**, clique em **Voltar a usar**.
3. A mensagem "A organização voltou a usar {recurso}." confirma.

**Voltar a usar** grava uma alteração "ligado" da organização. O recurso só funciona se a plataforma o mantiver ligado.

### Seguir a plataforma

1. Na linha de um recurso com alteração da organização, clique em **Seguir a plataforma**.
2. Na confirmação **Seguir a plataforma em {recurso}?**, leia o aviso: "A alteração da organização é removida e o recurso passa a ter o valor da plataforma, ligado ou desligado."
3. Clique em **Seguir a plataforma**.
4. A mensagem "{recurso} segue a plataforma." confirma. A coluna **Alteração da organização** volta a mostrar **Sem alteração**.

Use **Seguir a plataforma** quando quiser que a organização acompanhe automaticamente as decisões da plataforma, em vez de manter uma escolha própria.

### Quando não há botão

- **Desligado pela plataforma**: a plataforma desligou o recurso e a organização não tem alteração. Não há o que fazer pela tela.
- Se houver alteração da organização num recurso que a plataforma desligou, aparece só **Seguir a plataforma**.

Toda mudança fica registrada no registro de auditoria da organização.

## Exemplo

Exemplo: uma clínica veterinária usa a voz no chat para que os atendentes ditem anotações. Durante uma reforma, a recepção fica barulhenta e as transcrições saem ruins. A gerente decide desligar a voz por algumas semanas, só para a clínica.

Antes da mudança:

| Recurso | Valor da plataforma | Alteração da organização | Valor em uso | Ações |
|---|---|---|---|---|
| Voz no chat | Ligado | Sem alteração | Ligado | **Desligar para a organização** |
| Voz em tempo real | Desligado | Sem alteração | Desligado | Desligado pela plataforma |

Depois de clicar em **Desligar para a organização** e confirmar:

| Recurso | Valor da plataforma | Alteração da organização | Valor em uso | Ações |
|---|---|---|---|---|
| Voz no chat | Não informado enquanto a organização altera o recurso | Desligado pela organização | Desligado | **Voltar a usar**, **Seguir a plataforma** |
| Voz em tempo real | Desligado | Sem alteração | Desligado | Desligado pela plataforma |

O recurso **Voz no chat**, como a API devolve depois da mudança:

```json
{
  "key": "chat.voice",
  "owner": "platform-team",
  "reason": "Voice transcription and speech per environment and organization (sending audio needs compliance clearance).",
  "kind": "rollout",
  "default": false,
  "createdAt": "2026-09-30T00:00:00.000Z",
  "expiresAt": "2027-09-30T00:00:00.000Z",
  "value": false,
  "tenantOverride": false,
  "expired": false
}
```

Nesse retorno, `value` é o **Valor em uso** e `tenantOverride` é a **Alteração da organização** (`false` = desligado pela organização, `true` = ligado pela organização, `null` = sem alteração). O texto de `reason` é a descrição técnica do recurso; a tela mostra a descrição traduzida.

Quando a reforma termina, a gerente clica em **Seguir a plataforma**. A alteração é removida e a clínica volta a usar o valor da plataforma, que está ligado.

## Dicas e boas práticas

- Prefira **Seguir a plataforma** a **Voltar a usar** quando não houver motivo para manter uma escolha própria. Assim a organização acompanha as mudanças da plataforma sem ajuste manual.
- Avise os membros antes de desligar um recurso. Ele deixa de funcionar para todos na organização.
- Se um recurso que você precisa aparece como **Desligado pela plataforma**, fale com o suporte da plataforma. A organização não consegue ligá-lo.
- Para recursos de voz, confira também as permissões de uso da voz no chat dos papéis. Veja [Papéis e permissões](/docs/roles).

## Erros comuns

| Mensagem/situação | O que significa | Como resolver |
|---|---|---|
| "Nenhum recurso ajustável" | A plataforma não oferece, neste momento, recursos que a organização possa desligar. | Não há o que ajustar. Fale com o suporte se esperava ver um recurso. |
| Aparece **Desligado pela plataforma** sem botão | A plataforma desligou o recurso. | Só a equipe da plataforma pode ligá-lo. |
| "Este recurso está desativado no momento." | Você tentou usar um recurso desligado (pela plataforma ou pela organização). | Confira a coluna **Valor em uso** nesta página. |
| "Este recurso não está disponível no momento." | O recurso não está disponível para você agora. | Confira esta página e as permissões do seu papel. |
| "Você não tem permissão para fazer isso." | Falta `core.flag.write`, ou o recurso não pode ser ajustado pela organização. | Peça a quem administra a organização para ajustar o seu papel. |
| "Este item foi alterado por outra pessoa. Recarregue e tente novamente." | Outra pessoa mudou o recurso ao mesmo tempo. | Recarregue a página e confira o valor atual. |

## Veja também

- [Chat](/docs/chat)
- [Organizações](/docs/organizations)
- [Papéis e permissões](/docs/roles)
- [Fluxos e agendamentos](/docs/workflows)
- [Administração da plataforma](/docs/admin-operations)
- [Glossário](/docs/glossary)
