# Primeiros passos

Este guia mostra como entrar no app pela primeira vez, aceitar um convite, proteger a conta com verificação em duas etapas e se orientar na tela principal. No fim, há um roteiro de 10 minutos para você sair usando.

## O que é

O app organiza o trabalho em **organizações**, que contêm **projetos**, que por sua vez podem ser divididos em **unidades**. Você entra com e-mail e senha, escolhe onde trabalhar e usa os recursos que os seus papéis liberam: o assistente de IA, as configurações da organização, o seu perfil e assim por diante.

Uma conta, sozinha, não dá acesso a nada. O acesso vem de duas formas:

- de um **convite** para uma organização, feito por quem a administra;
- da **criação de uma organização**, quando o app permite isso para a sua conta (você vira o proprietário dela).

## Quem pode usar

- **Entrar, redefinir senha e configurar o perfil:** qualquer pessoa com conta.
- **Criar conta pela página "Criar conta":** só quando o app oferece cadastro aberto. Quando não oferece, a página mostra **Contas novas só por convite** e a conta é criada a partir do link de convite.
- **Criar uma organização:** só quando o servidor libera isso para a sua conta. Se não liberar, a página de organizações pede que você solicite um convite.
- **Usar o que existe dentro de uma organização:** depende dos papéis que você recebeu. Veja [Papéis e permissões](/docs/roles).

## Onde encontrar

No navegador, todos os endereços começam pelo idioma, por exemplo `/pt-BR/sign-in`. Nas demais páginas desta documentação, os endereços aparecem sem esse prefixo, como `/o/{organização}/settings/members`.

| Página | Endereço |
|---|---|
| Entrar | `/sign-in` |
| Criar conta | `/sign-up` |
| Redefinir senha | `/reset-password` |
| Convite | `/invite` (o link completo traz um código depois de `#token=`) |
| Início | `/` (abre o último lugar que você usou) |
| Organizações | `/organizations` |
| Organização | `/o/{organização}` |
| Projeto | `/o/{organização}/p/{projeto}` |
| Perfil | `/profile/account` |

![Página Entrar com os campos E-mail e Senha](/guide/sign-in.jpg)

*A página **Entrar**: digite o e-mail e a senha da sua conta.*

![Etapa de verificação em duas etapas com o botão Enviar código por SMS](/guide/getting-started-mfa.jpg)

*Na verificação em duas etapas, clique em **Enviar código por SMS** e digite o código recebido.*

![Menu da conta aberto no rodapé da barra lateral](/guide/getting-started-user-menu.jpg)

*O menu da conta, no rodapé da barra lateral: perfil, tema, idioma, documentação e saída.*

## Passo a passo

### Entrar

1. Abra a página **Entrar**.
2. Preencha **E-mail** e **Senha**. Se quiser conferir a senha digitada, use **Mostrar senha**.
3. Clique em **Entrar**.
4. Se a sua conta tem verificação em duas etapas, a tela muda para **Verificação em duas etapas** (veja abaixo).
5. Depois de entrar, o app abre o último lugar que você usou (organização, projeto e unidade). Na primeira vez, abre a página **Organizações**.

Se você chegou à página de entrada por um link interno do app, depois de entrar você volta para aquele endereço.

### Criar conta (quando o cadastro está aberto)

1. Na página **Entrar**, clique em **Criar conta** (o link aparece abaixo de **Ainda não tem conta?**).
2. Preencha **Seu nome** (aparece para os outros membros), **E-mail** e **Senha** (pelo menos 8 caracteres).
3. Clique em **Criar conta**.
4. Em seguida, crie uma organização ou aceite um convite.

Se a página mostrar **Contas novas só por convite**, peça um convite a quem administra a sua organização e use o link recebido. Clique em **Ir para Entrar** se você já tem conta.

### Aceitar um convite

O convite é vinculado a um e-mail e chega até você **como um link**, que a pessoa que convidou copia no app e envia pelo canal que preferir (e-mail, mensagem etc.). O app não envia esse e-mail sozinho.

1. Abra o link completo do convite.
2. Se você não estiver conectado, a página mostra **Entre para ver o convite**:
   - já tem conta: entre com a conta do e-mail que recebeu o convite;
   - ainda não tem conta: clique em **Criar conta**, preencha **Seu nome**, **E-mail** e **Senha** e clique em **Criar conta**. Use o mesmo e-mail que recebeu o convite.
3. Confira a prévia: quem convidou, para qual organização, o **E-mail convidado** (parcialmente oculto) e **Válido até**.
4. Clique em **Aceitar convite**. Você passa a participar da organização e é levado até ela.
5. Se preferir decidir depois, clique em **Agora não**.

O link vale por 7 dias e só pode ser usado uma vez. Se você entrou com a conta errada, use **Entrar com outra conta** e entre com a conta do e-mail convidado.

### Passar pela verificação em duas etapas

Se você cadastrou um segundo fator no perfil, ele é pedido a cada entrada.

1. Em **Como você quer confirmar?**, escolha o fator (aparece só se você tiver mais de um): **App autenticador** ou **SMS**.
2. Para SMS, clique em **Enviar código por SMS**. Se o código não chegar, use **Reenviar código**.
3. Em **Código de verificação**, digite os 6 dígitos do app autenticador ou do SMS.
4. Clique em **Verificar**.

Para cadastrar ou remover fatores, veja [Seu perfil](/docs/profile).

### Redefinir a senha

1. Na página **Entrar**, clique em **Esqueci minha senha**.
2. Em **E-mail**, informe o e-mail da sua conta e clique em **Enviar link**.
3. A tela mostra **Confira seu e-mail**. A mensagem é sempre a mesma, exista ou não uma conta com aquele endereço.
4. Abra o link do e-mail. A nova senha é definida na página que esse link abre, fora do app.
5. Volte ao app e entre com a nova senha.

O link vale por pouco tempo. Confira também a caixa de spam. Se você estava aceitando um convite, abra o link do convite de novo depois de redefinir a senha.

### Escolher organização e projeto

1. Na página **Organizações**, clique na organização desejada. A última usada aparece primeiro, com a etiqueta **Última usada**.
2. Na página da organização, clique no projeto. Você também pode usar o seletor de projeto na barra lateral.
3. Dentro do projeto, use o seletor de unidade na barra lateral para focar uma unidade, ou deixe em **Projeto inteiro**.

## A estrutura da tela

**Barra lateral (à esquerda)**

- No topo, o seletor de organização. Ele lista as suas organizações e tem a opção **Ver todas ou criar organização**.
- Logo abaixo, o seletor de projeto (com **Novo projeto** e **Todos os projetos**) e, dentro de um projeto, o seletor de unidade.
- O grupo **Organização** traz **Projetos** e **Configurações**.
- O grupo **Projeto** traz **Visão geral**, **Assistente** e os módulos que você pode abrir.
- No rodapé, o menu da conta, com seu nome e e-mail.

Use **Mostrar ou ocultar a barra lateral** para recolhê-la.

**Menu da conta (rodapé da barra lateral)**

- As seções do perfil: **Conta**, **Preferências**, **Segurança**, **Sessões** e **Notificações**.
- **Aprovações**, com o número de pedidos aguardando a sua decisão (só para quem pode ver aprovações).
- **Tema**: **Do sistema**, **Claro** ou **Escuro**.
- **Idioma e região**: abre as preferências do perfil.
- **Sair**.

**Barra superior**

- A trilha de navegação (onde você está).
- A paleta de comandos: clique no botão ou pressione **Ctrl+K** (**⌘K** no Mac). Busque páginas e ações como **Criar projeto**, **Alternar tema claro/escuro**, **Mudar idioma**, **Abrir perfil** e **Sair**, e pressione Enter.
- O botão **Assistente**, que abre o painel do assistente à direita.

**Painel do assistente (à direita)**

O painel só funciona dentro de um projeto. Fora dele, aparece **Abra um projeto para conversar com o assistente.** Se você fechar o painel e reabrir enquanto continua no mesmo projeto, a conversa continua de onde parou. Ao recarregar a página, o painel recomeça, mas a conversa fica guardada no histórico da página do assistente. Veja [Assistente (chat)](/docs/chat).

## Idioma e tema

- **Nas páginas de entrada** (Entrar, Criar conta, Convite, Redefinir senha), use o seletor **Idioma** no rodapé.
- **Dentro do app**, abra o menu da conta e clique em **Idioma e região**, ou vá em **Perfil → Preferências**. Os idiomas disponíveis são português (Brasil), inglês (EUA) e espanhol (América Latina).
- **Tema:** menu da conta → **Tema**. A escolha vale na hora e fica salva no seu perfil.

## Exemplo

Exemplo: Marina é coordenadora em uma escola de idiomas e foi convidada pela diretora, Ana, para a organização "Escola Horizonte".

| Etapa | O que Marina vê | O que ela faz |
|---|---|---|
| Recebe o link por mensagem | `https://app.exemplo.com/pt-BR/invite#token=...` | Abre o link |
| Página do convite | **Entre para ver o convite** | Clica em **Criar conta** |
| Formulário | **Seu nome**, **E-mail**, **Senha** | Preenche com marina@exemplo.com |
| Prévia | "Ana Souza convidou você para participar de Escola Horizonte." | Clica em **Aceitar convite** |
| Organização | Lista de projetos | Abre o projeto "Unidade Centro" |

> **Marina:** Entrei, mas não vejo o menu Membros nas configurações.
>
> **Ana:** Você entrou como Leitor. Vou trocar seu papel para Membro em Configurações → Membros.

## Roteiro de 10 minutos

Exemplo: você é o responsável por começar a usar o app em uma clínica veterinária.

1. **Minuto 1 — Entrar.** Se o cadastro estiver aberto, crie a conta em **Criar conta**. Caso contrário, peça um convite e crie a conta pelo link.
2. **Minuto 2 — Proteger a conta.** Vá em **Perfil → Segurança** e clique em **Adicionar app autenticador** ou **Adicionar telefone** (se o ambiente oferecer).
3. **Minuto 3 — Preferências.** Em **Perfil → Preferências**, confira **Idioma**, **Fuso horário** e **Moeda**, e escolha o tema.
4. **Minuto 4 — Organização.** Se a página **Organizações** mostrar o cartão **Nova organização**, preencha **Nome da organização** ("Clínica Bom Pelo") e os padrões regionais e clique em **Criar organização**. Se não mostrar, aguarde o convite de quem administra.
5. **Minuto 5 — Projeto.** Na organização, clique em **Novo projeto**, dê o nome "Atendimento" e clique em **Criar projeto**.
6. **Minuto 6 — Unidades.** Em **Configurações → Unidades**, crie "Filial Norte" e "Filial Sul".
7. **Minuto 7 — Equipe.** Em **Configurações → Membros**, clique em **Convidar**, informe o e-mail de uma colega, escolha **Onde vale** e o papel, e clique em **Enviar convite**. Copie o **Link do convite** e envie para ela.
8. **Minuto 8 — Assistente.** Abra o projeto "Atendimento" e clique em **Assistente** na barra superior. Faça uma pergunta.
9. **Minuto 9 — Atalhos.** Pressione **Ctrl+K** e digite "perfil" para testar a paleta de comandos.
10. **Minuto 10 — Sessões.** Em **Perfil → Sessões**, confira onde sua conta está conectada.

## Dicas e boas práticas

- Esta documentação abre sem login: use o link **Documentação** no rodapé da página **Entrar** ou, já dentro do app, o menu da conta.
- Ative a verificação em duas etapas logo no primeiro acesso.
- Use sempre a mesma conta (o mesmo e-mail) para aceitar convites de organizações diferentes. Uma conta pode participar de várias organizações.
- Se o app mostrar **Você está sem conexão. Algumas ações ficam indisponíveis até a conexão voltar.**, aguarde a conexão voltar antes de salvar alterações.
- Guarde a **Referência** mostrada em mensagens de erro. Ela ajuda o suporte a encontrar o problema.

## Erros comuns

| Mensagem/situação | O que significa | Como resolver |
|---|---|---|
| E-mail ou senha incorretos. Confira os dados e tente novamente. | Os dados de acesso não conferem. | Confira o e-mail e a senha ou use **Esqueci minha senha**. |
| Código inválido ou expirado. Confira e tente de novo. | O código de 6 dígitos está errado ou venceu. | Digite um código novo do app autenticador ou peça outro SMS. |
| Muitas tentativas. Aguarde alguns minutos e tente novamente. | Houve tentativas demais em pouco tempo. | Espere alguns minutos antes de tentar de novo. |
| Já existe uma conta com este e-mail. Entre com ela ou redefina a senha. | O e-mail já tem conta. | Entre com essa conta ou redefina a senha. |
| A criação de contas está desativada neste app. Peça ajuda a quem o administra. | Quem opera o app desligou a criação de contas. | Fale com quem administra o app. |
| Esta senha é fraca demais. Escolha uma senha mais longa. | A senha não atende ao mínimo de segurança. | Use uma senha mais longa. |
| Link de convite incompleto | O endereço aberto não tem o código do convite. | Abra o link completo; se continuar, peça um novo convite. |
| Este convite foi enviado para outro e-mail. Entre com a conta convidada. | Você está conectado com outra conta. | Use **Entrar com outra conta**. |
| Este convite expirou. Peça um novo convite. | Passaram os 7 dias de validade. | Peça um novo convite. |
| Este convite já foi usado. | O link já foi aceito. | Se precisar de acesso, peça um novo convite. |
| Sua sessão expirou. Entre novamente para continuar. | A sessão terminou. | Entre de novo. |
| Contas novas só por convite | O cadastro aberto está desligado. | Peça um convite. |

## Veja também

- [Organizações e projetos](/docs/organizations)
- [Membros e convites](/docs/members)
- [Seu perfil](/docs/profile)
- [Assistente (chat)](/docs/chat)
- [Glossário](/docs/glossary)
