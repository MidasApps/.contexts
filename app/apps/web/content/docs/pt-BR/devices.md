# Dispositivos e app desktop

Esta página trata de duas coisas diferentes que costumam ser confundidas: os **dispositivos compartilhados**, que entram na organização com um código de ativação e não pertencem a ninguém, e o **app para desktop**, que é o próprio app instalado no computador de uma pessoa.

## O que é

### Dispositivos compartilhados

Um dispositivo é um equipamento de uso comum, como um tablet na recepção ou um terminal no balcão, que precisa acessar a organização sem usar a conta pessoal de alguém.

- O dispositivo é ativado com um **código de uso único** gerado por um administrador.
- O código tem 8 caracteres, aparece agrupado como `7KQ2-M9XA` e **vale por 10 minutos**.
- Você escolhe **Onde vale** (a organização, um projeto ou uma unidade) e quais **Papéis do dispositivo** ele recebe. O dispositivo só acessa o nível escolhido e o que está abaixo dele.
- O dispositivo só aparece na lista **depois** que o código é usado nele.
- Revogar um dispositivo tira o acesso imediatamente, e ele não consegue entrar de novo.

O papel de sistema **Dispositivo** ("Acesso de um dispositivo ativado, sem permissões de pessoa") vem marcado por padrão. Ele só permite ver a organização. Se o dispositivo precisa fazer mais, crie antes um papel personalizado com as permissões certas (veja [Papéis](/docs/roles)) e marque esse papel na ativação. Você só consegue conceder ao dispositivo permissões que você mesmo tem.

O código é digitado no software que roda no próprio dispositivo, na tela de ativação dele. Essa tela não faz parte do app web nem do app para desktop: ela pertence ao software do equipamento, preparado pela equipe técnica da sua instalação.

### App para desktop

O app para desktop é a versão do app instalada no computador. Ele **não é** um dispositivo compartilhado: nele, cada pessoa entra com a própria conta, como no navegador.

O que o app para desktop tem:

- entrada, cadastro, recuperação de senha e aceite de convites;
- escolha de organização, página da organização e dos projetos;
- o chat com o assistente;
- as páginas dos módulos instalados;
- as **Configurações** da organização, inclusive as configurações de módulos;
- o **Perfil** (conta, preferências, segurança, sessões e notificações).

O que o app para desktop **não** tem:

- a área de administração da plataforma (`/admin`), que só existe no app web;
- este guia de ajuda (`/docs`), que também só existe no app web.

O app para desktop lembra o seu acesso entre uma abertura e outra. Para isso, ele guarda um segredo de sessão no cofre de senhas do sistema operacional (Gerenciador de Credenciais no Windows, Keychain no macOS, Secret Service no Linux). Esse segredo é trocado a cada uso. A sessão aparece no seu perfil como **App para desktop**.

## Quem pode usar

### Dispositivos compartilhados

Por padrão, os papéis **Proprietário** e **Administrador** têm as três permissões:

| Permissão | Código | O que libera |
|---|---|---|
| Ver dispositivos | `core.device.read` | Abrir a página e ver a lista |
| Ativar dispositivos | `core.device.create` | Usar o botão **Ativar dispositivo** |
| Revogar dispositivos | `core.device.revoke` | Usar o botão **Revogar** em um dispositivo ativo |

Quem vê a lista mas não pode ativar dispositivos recebe a mensagem "Peça a um administrador para ativar dispositivos."

### App para desktop

Qualquer pessoa com conta pode usar o app para desktop. O que ela vê depende das mesmas permissões que tem no app web.

## Onde encontrar

- **Dispositivos compartilhados:** **Configurações → Dispositivos**, no grupo **Acesso** do menu de configurações. Endereço: `/o/<id-da-organização>/settings/devices`.
- **Sessões do app para desktop:** menu do usuário → **Sessões**. Endereço: `/profile/sessions`.

A lista de dispositivos mostra estas colunas:

| Coluna | O que mostra |
|---|---|
| **Dispositivo** | O nome dado na ativação |
| **Onde vale** | A organização, o projeto ou a unidade do dispositivo |
| **Última atividade** | A última vez que o dispositivo acessou o app, ou "Sem atividade" |
| **Ativado em** | A data da ativação |
| **Situação** | **Ativo** ou **Revogado** |

![Página Dispositivos](/guide/devices-list.jpg)

*Na tela: **Configurações → Dispositivos**.*

## Passo a passo

![Diálogo Ativar dispositivo](/guide/devices-dialog.jpg)

*O diálogo **Ativar dispositivo**: nome, onde vale e papéis do dispositivo; no fim, **Gerar código**.*

### Gerar um código de ativação

1. Abra **Configurações → Dispositivos**.
2. Clique em **Ativar dispositivo**. O botão fica desativado enquanto você estiver sem conexão.
3. Em **Nome do dispositivo**, escreva um nome fácil de reconhecer, por exemplo "Tablet da recepção". Use no máximo 80 caracteres.
4. Em **Onde vale**, escolha a organização, um projeto ou uma unidade.
5. Em **Papéis do dispositivo**, mantenha **Dispositivo** e marque os papéis personalizados de que ele precisa. É obrigatório escolher pelo menos um papel.
6. Clique em **Gerar código**.
7. Aparece a janela **Código para** seguido do nome do dispositivo, com o **Código de ativação**, um botão para copiar e a contagem regressiva **Expira em**.
8. No dispositivo, abra a tela de ativação e digite o código. Tanto faz usar letras maiúsculas ou minúsculas, com ou sem hífen.
9. Clique em **Concluir**.

Se os 10 minutos acabarem antes de o código ser usado, aparece "O código expirou". Clique em **Gerar novo código** para recomeçar, ou em **Fechar**.

O código aparece só nessa janela. Depois de fechá-la, não é possível vê-lo de novo. Se precisar, gere outro.

### Revogar um dispositivo

1. Abra **Configurações → Dispositivos**.
2. Na linha do dispositivo, clique em **Revogar**. O botão só aparece em dispositivos com situação **Ativo**.
3. Confirme em **Revogar dispositivo**.

O dispositivo perde o acesso imediatamente e não consegue entrar de novo. Para voltar a usar o mesmo equipamento, gere um novo código e ative-o como um dispositivo novo.

### Entrar no app para desktop

1. Abra o app para desktop.
2. Entre com a sua conta, do mesmo jeito que no navegador.
3. Escolha a organização e o projeto.

Nas próximas aberturas, o app entra direto, sem pedir a senha, enquanto a sessão estiver válida.

### Encerrar a sessão do app para desktop

- **No próprio computador:** use **Sair** no menu do usuário. A sessão é encerrada no servidor e o segredo é apagado do cofre do sistema.
- **De outro lugar (computador perdido, por exemplo):** abra o menu do usuário → **Sessões**, encontre a linha **App para desktop** e clique em **Revogar**. Confirme em **Revogar sessão**. O app é desconectado na próxima atividade.
- **Em todos os lugares de uma vez:** em **Sessões**, use **Sair de todos os dispositivos**. Todas as sessões são encerradas, inclusive a atual.

## Exemplo

Exemplo: uma clínica tem um computador na recepção para que qualquer atendente registre a chegada dos pacientes.

1. A administradora cria um papel personalizado "Recepção" só com as permissões de que o equipamento precisa.
2. Em **Configurações → Dispositivos**, ela clica em **Ativar dispositivo** e preenche:
   - **Nome do dispositivo:** Computador da recepção
   - **Onde vale:** o projeto "Unidade Jardim"
   - **Papéis do dispositivo:** Dispositivo e Recepção
3. Ela clica em **Gerar código** e recebe `4HX7-P2QM`.
4. Na tela de ativação do software da recepção, alguém digita `4hx7p2qm`. O código é aceito mesmo em minúsculas e sem hífen.
5. O dispositivo aparece na lista assim:

| Dispositivo | Onde vale | Última atividade | Ativado em | Situação |
|---|---|---|---|---|
| Computador da recepção | Unidade Jardim | 05/10/2026 09:12 | 05/10/2026 | Ativo |

Meses depois, o computador é trocado. A administradora clica em **Revogar** na linha "Computador da recepção" e ativa o equipamento novo com outro código.

Exemplo: um gerente de uma rede de lojas usa o app para desktop no notebook. O notebook é furtado. De um navegador, ele abre o menu do usuário → **Sessões**, revoga a linha **App para desktop** e depois troca a senha.

## Dicas e boas práticas

- **Gere o código só quando estiver na frente do dispositivo.** Ele vale só 10 minutos e é de uso único.
- **Dê nomes que digam onde o equipamento está**, como "Tablet do caixa 2" ou "Terminal do estoque". Isso facilita encontrar o dispositivo certo na hora de revogar.
- **Limite o lugar.** Se o equipamento só atende uma unidade, escolha essa unidade em **Onde vale**.
- **Use papéis enxutos.** Crie um papel personalizado só com o que o equipamento faz, em vez de usar um papel de pessoa.
- **Revogue equipamentos que saíram de uso** e confira a coluna **Última atividade** de tempos em tempos.
- **Não use o app para desktop como terminal compartilhado.** Ele guarda a sessão de uma pessoa. Para uso comum, use um dispositivo ativado por código.
- **No Linux,** o app para desktop precisa de um serviço de cofre de senhas (como GNOME Keyring ou KWallet) para lembrar o seu acesso. Sem ele, você consegue entrar, mas precisa entrar de novo a cada abertura.
- **Precisa da administração da plataforma ou deste guia?** Use o app web.

## Erros comuns

| Mensagem/código | O que significa | Como resolver |
|---|---|---|
| "Dê um nome ao dispositivo." | O campo **Nome do dispositivo** ficou vazio | Escreva um nome |
| "Use no máximo 80 caracteres." | O nome passou de 80 caracteres | Encurte o nome |
| "Escolha pelo menos um papel." | Nenhum papel foi marcado | Marque ao menos um papel |
| `ESCALATION_FORBIDDEN` ("Você não pode conceder permissões que não possui.") | Um papel escolhido dá permissões que você não tem | Escolha outros papéis ou peça a permissão a um administrador |
| "O código expirou" | Passaram os 10 minutos sem o código ser usado | Clique em **Gerar novo código** |
| `UNAUTHORIZED` ao digitar o código no dispositivo | O código está errado, expirou ou já foi usado | Confira o código ou gere um novo |
| `RATE_LIMITED` ("Muitas tentativas. Aguarde um pouco e tente novamente.") | Houve 5 tentativas erradas em 15 minutos a partir da mesma rede | Aguarde e tente de novo com um código correto |
| O dispositivo não aparece na lista | O código ainda não foi usado no equipamento | Digite o código no dispositivo; a lista só mostra dispositivos já ativados |
| O app para desktop pede a senha toda vez | O cofre de senhas do sistema não está disponível (comum no Linux sem Secret Service) | Instale ou ative um serviço de cofre de senhas |
| Não encontro a administração no app para desktop | A área `/admin` existe só no app web | Use o app web no navegador |

## Veja também

- [Papéis](/docs/roles)
- [Unidades](/docs/units)
- [Perfil](/docs/profile)
- [Chaves de API e integração](/docs/api-keys)
- [Administração da plataforma](/docs/admin)
- [Primeiros passos](/docs/getting-started)
