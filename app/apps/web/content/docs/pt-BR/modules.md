# Módulos

Módulos são as partes do app que trazem funções de negócio específicas da sua instalação. Esta página mostra o que é um módulo, onde ele aparece na navegação e nas configurações e como ajustá-lo. O módulo **Exemplo**, que já vem instalado como referência, serve de ilustração.

## O que é

O app tem um núcleo comum a todas as instalações: organizações, projetos, unidades, membros, papéis, chat e assim por diante. Um módulo acrescenta funções a esse núcleo sem mudar o que já existe. Um módulo pode trazer:

- **páginas próprias**, que abrem dentro de um projeto;
- **permissões próprias**, que aparecem junto com as demais na hora de montar um papel;
- **tipos de unidade próprios**, para organizar o projeto do jeito do negócio;
- **configurações da organização**, editadas em uma página própria dentro de **Configurações**;
- **recursos para os agentes**, como comandos, habilidades e fluxos que o assistente pode usar no chat;
- **rotas na API `/v1`**, para integrações.

Quem instala um módulo é a equipe técnica responsável pela instalação do app. Não existe uma tela para instalar ou remover módulos. O que você faz no app é:

- usar as páginas do módulo, de acordo com as suas permissões;
- ajustar as configurações do módulo na sua organização;
- decidir se os agentes do chat podem usar os recursos do módulo na sua organização.

### O módulo Exemplo

O módulo **Exemplo** existe para mostrar como um módulo funciona. Ele traz:

| O que traz | Nome no app |
|---|---|
| Página no projeto | **Módulo de exemplo**, com os blocos **Contexto atual**, **Configurações do módulo** e **Notas** |
| Configurações da organização | **Saudação** e **Orçamento padrão** |
| Tipo de unidade | **Área** |
| Recursos para agentes | a habilidade de notas e o fluxo **Entrada de notas** ("Cria uma nota na organização de quem pediu.") |
| Rota na API | a lista de notas da organização |

As notas são criadas por agentes, por fluxos de trabalho ou pelo chat. A página do módulo só mostra as notas e marca as arquivadas como **Arquivada**.

## Quem pode usar

Cada módulo declara as próprias permissões. O que você vê depende delas:

- **Páginas do módulo:** aparecem para quem tem a permissão que o módulo pede para cada página.
- **Configurações do módulo:** a página aparece para quem tem a permissão de leitura definida pelo módulo. Para salvar, é preciso a permissão de alteração.
- **Liberar o módulo para os agentes:** exige a permissão de alterar as configurações de agentes, `core.agent-settings.update`.

No módulo Exemplo, as permissões são estas:

| Permissão | Código | Papéis que a recebem por padrão |
|---|---|---|
| Ver os itens do módulo de exemplo | `example.item.read` | Proprietário, Administrador, Membro, Leitor |
| Criar e alterar itens do módulo de exemplo | `example.item.write` | Proprietário, Administrador |
| Ver as notas do módulo de exemplo | `example.note.read` | Proprietário, Administrador, Membro, Leitor |
| Criar notas no módulo de exemplo | `example.note.create` | Proprietário, Administrador, Membro |
| Arquivar notas do módulo de exemplo (exige a aprovação de outra pessoa) | `example.note.archive` | Proprietário, Administrador, Membro |

No Exemplo, `example.item.read` abre a página do módulo e as configurações, e `example.item.write` permite salvar as configurações.

Arquivar uma nota passa por aprovação: outra pessoa da organização precisa aprovar o pedido. Veja [Aprovações](/docs/approvals).

## Onde encontrar

![Página do módulo de exemplo dentro do projeto](/guide/modules-page.jpg)

*Um módulo aparece no menu do projeto; aqui, o módulo **Exemplo**.*

### No projeto

Dentro de um projeto, os módulos aparecem de duas formas:

- **No menu lateral do projeto**, com o nome que o módulo definiu. O módulo Exemplo aparece como **Exemplo**.
- **Na Visão geral do projeto**, no bloco **Módulos**: cada módulo é um cartão com o link **Abrir módulo**. Se nenhum aparecer, a mensagem é "Você não tem acesso a módulos neste projeto, ou nenhum está instalado."

O endereço de uma página de módulo segue o padrão:

```text
/o/<id-da-organização>/p/<id-do-projeto>/m/<id-do-módulo>
```

Para o módulo Exemplo, o final do endereço é `/m/example`. Um módulo com várias páginas acrescenta mais partes depois do id dele.

### Nas configurações

Cada módulo que tem configurações ganha uma entrada no menu de **Configurações**, no grupo **Outras**, com o nome do módulo. Para o Exemplo: **Configurações → Exemplo**.

O endereço segue o padrão:

```text
/o/<id-da-organização>/settings/m/<id-do-módulo>
```

### Liberação para os agentes

Em **Configurações → Agentes**, o bloco **Módulos** lista os módulos instalados ("Módulos instalados nesta aplicação. Ativar um módulo libera seus comandos, habilidades e agentes para a organização.").

## Passo a passo

### Abrir um módulo

1. Entre no projeto.
2. Clique no nome do módulo no menu lateral, ou em **Abrir módulo** no cartão do bloco **Módulos** da **Visão geral**.
3. A página do módulo abre dentro do app, com o restante da navegação disponível.

### Ajustar as configurações de um módulo

1. Abra **Configurações** e, no grupo **Outras**, clique no nome do módulo.
2. Preencha os campos do bloco **Configurações**. Cada campo mostra uma explicação logo abaixo.
3. Clique em **Salvar**. Quando der certo, aparece "Alterações salvas."

Antes do primeiro salvamento, a página avisa: "Ainda não foram salvas; os valores abaixo são os padrões." Se você só tem a permissão de leitura, o formulário aparece desativado com o aviso "Você pode ver estas configurações, mas não alterá-las."

As configurações valem para a organização inteira, ou seja, para todos os projetos dela.

### Liberar os recursos de um módulo para os agentes

1. Abra **Configurações → Agentes**.
2. No bloco **Módulos**, ligue a chave **Ativar o módulo** do módulo desejado.
3. Aparece a confirmação, por exemplo "Módulo Exemplo ativado."

Para desfazer, desligue a mesma chave. Ativar um agente do módulo já libera os comandos e habilidades dele, mesmo sem ligar a chave do módulo.

Essa chave controla só o que os agentes do chat podem usar. Ela não esconde nem mostra as páginas e as configurações do módulo, que dependem das permissões. Veja [Agentes](/docs/agents).

## Exemplo

Exemplo: uma rede de lojas usa o módulo Exemplo para testar o recurso antes de receber os módulos definitivos.

**1. A administradora configura o módulo.** Ela abre **Configurações → Exemplo** e preenche:

| Campo | Valor |
|---|---|
| **Saudação** | Bem-vindo ao painel das lojas |
| **Orçamento padrão** | R$ 1.500,00 |

Ela clica em **Salvar** e vê "Alterações salvas."

**2. Um membro abre o módulo.** No projeto "Filial Centro", ele clica em **Exemplo** no menu lateral. A página **Módulo de exemplo** mostra:

- **Contexto atual:** Organização, Projeto, Unidade ("Nenhuma unidade selecionada", se nenhuma estiver escolhida), Idioma, Fuso horário de exibição, Moeda padrão e Agora.
- **Configurações do módulo:** Saudação "Bem-vindo ao painel das lojas" e Orçamento padrão "R$ 1.500,00".
- **Notas:** a lista das notas da organização, com o botão **Carregar mais** quando houver mais notas.

Se as configurações ainda não tivessem sido salvas, o bloco mostraria "Módulo ainda não configurado". Para quem pode alterar, aparece o botão **Configurar**, que leva direto às configurações do módulo. Para os demais, aparece "Peça a um administrador da organização para configurar este módulo."

**3. Notas criadas pelo chat.** A administradora liga **Ativar o módulo Exemplo** em **Configurações → Agentes**. Depois, no chat, um membro pede: "Crie uma nota com o título Conferir estoque". A nota aparece no bloco **Notas** da página do módulo.

**4. Organização por áreas.** Em **Configurações → Unidades**, o tipo de unidade **Área**, trazido pelo módulo, fica disponível para dividir o projeto. Uma área pode ficar dentro do projeto ou dentro de outra área. Veja [Unidades](/docs/units).

**5. Integração.** O ERP da rede lê as notas pela API com uma chave que tem a permissão `example.note.read`. Veja [Chaves de API e integração](/docs/api-keys).

## Dicas e boas práticas

- **Não encontrou o módulo no menu?** Confira se o seu papel tem a permissão de leitura do módulo naquele projeto ou unidade. O menu só mostra o que você pode abrir.
- **Configure antes de divulgar.** Salve as configurações do módulo antes de avisar a equipe, para que todos vejam os valores certos desde o início.
- **Inclua as permissões do módulo nos papéis personalizados.** Elas aparecem junto com as permissões do núcleo na tela de papéis. Veja [Papéis](/docs/roles).
- **Separe ver de alterar.** Dê a permissão de alteração das configurações só a quem administra o módulo.
- **Libere para os agentes só o que a organização usa.** Ligar o módulo em **Configurações → Agentes** coloca os comandos dele à disposição do assistente.
- **Página com erro?** Se a página de um módulo não carregar, o restante do app continua funcionando e a página oferece uma nova tentativa.
- **Precisa de um módulo novo?** Fale com a equipe técnica da sua instalação. A instalação de módulos é feita no código do app, não pela interface.

## Erros comuns

| Mensagem/código | O que significa | Como resolver |
|---|---|---|
| "Você não tem acesso a módulos neste projeto, ou nenhum está instalado." | Nenhum módulo está disponível para você neste projeto | Peça a permissão de leitura do módulo a um administrador |
| Página "não encontrada" ao abrir um endereço `/m/...` | O módulo ou a página não existe nesta instalação | Confira o endereço ou abra o módulo pelo menu |
| Página de acesso negado ao abrir um módulo | Você não tem a permissão que a página exige naquele nível | Peça a permissão a um administrador |
| Página "não encontrada" em `/settings/m/...` | O módulo não existe ou não tem configurações | Abra as configurações pelo menu **Configurações** |
| "Você pode ver estas configurações, mas não alterá-las." | Você tem só a permissão de leitura do módulo | Peça a permissão de alteração, se precisar editar |
| `VALIDATION_FAILED` ("Alguns campos estão inválidos. Revise e tente novamente.") | Algum valor não segue as regras do módulo; por exemplo, a Saudação do Exemplo aceita de 1 a 80 caracteres | Corrija os campos indicados no formulário |
| `FORBIDDEN` ("Você não tem permissão para fazer isso.") | Você perdeu a permissão de alteração enquanto editava | Recarregue a página ou peça a permissão |
| "Módulo ainda não configurado" na página do módulo | As configurações do módulo nunca foram salvas | Use **Configurar** ou abra as configurações do módulo e clique em **Salvar** |
| O assistente não usa os comandos do módulo | O módulo não foi liberado para os agentes nesta organização | Ligue **Ativar o módulo** em **Configurações → Agentes** |

## Veja também

- [Agentes](/docs/agents)
- [Papéis](/docs/roles)
- [Unidades](/docs/units)
- [Aprovações](/docs/approvals)
- [Chat](/docs/chat)
- [Chaves de API e integração](/docs/api-keys)
- [Fluxos e agendamentos](/docs/workflows)
