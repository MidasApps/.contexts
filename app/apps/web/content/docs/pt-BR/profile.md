# Seu perfil

O perfil reúne o que é seu, e não da organização: o nome que os outros veem, idioma, fuso horário, moeda e tema, a segurança da conta, as sessões abertas e os avisos por e-mail. As mesmas configurações valem em todas as organizações de que você participa.

## O que é

O perfil tem cinco seções:

| Seção | Para que serve |
|---|---|
| **Conta** | Seus dados de acesso e como os outros membros veem você. |
| **Preferências** | Idioma, fuso horário, moeda e tema da interface. |
| **Segurança** | Verificação em duas etapas e senha. |
| **Sessões** | Onde sua conta está conectada agora. |
| **Notificações** | O que você quer receber por e-mail. |

## Quem pode usar

Qualquer pessoa conectada pode ver e alterar o próprio perfil. Não há permissão de organização envolvida.

Exceção: quando alguém da equipe de suporte acessa o app como você (modo suporte), o perfil aparece com o aviso **Modo suporte: este perfil é somente leitura. Você vê o que o usuário vê, mas não pode alterar nada aqui.** Nesse modo, nada pode ser alterado.

## Onde encontrar

Abra o menu da conta, no rodapé da barra lateral (seu nome e e-mail), e escolha a seção. Também é possível usar a paleta de comandos (**Ctrl+K** ou **⌘K**) → **Abrir perfil**.

| Seção | Endereço |
|---|---|
| Conta | `/profile/account` |
| Preferências | `/profile/preferences` |
| Segurança | `/profile/security` |
| Sessões | `/profile/sessions` |
| Notificações | `/profile/notifications` |

O item **Idioma e região** do menu da conta leva direto para **Preferências**.

![Página Conta do perfil](/guide/profile-account.jpg)

*Na tela: **Perfil → Conta**.*

![Página Preferências do perfil](/guide/profile-preferences.jpg)

*Na tela: **Perfil → Preferências**.*

![Página Segurança do perfil](/guide/profile-security.jpg)

*Na tela: **Perfil → Segurança**.*

![Página Sessões do perfil](/guide/profile-sessions.jpg)

*Na tela: **Perfil → Sessões**.*

## Passo a passo

### Conta: alterar o nome de exibição

1. Vá em **Perfil → Conta**.
2. O cartão **Acesso** mostra o seu e-mail e se a **Verificação em duas etapas** está ativa ou desativada. O e-mail vem da sua conta de acesso e não pode ser alterado aqui.
3. No cartão **Perfil**, altere **Nome de exibição**. Esse nome aparece para os membros das suas organizações.
4. Clique em **Salvar**.

Se o nome ficar vazio, o app mostra o seu e-mail no lugar.

### Preferências: idioma, fuso horário e moeda

1. Vá em **Perfil → Preferências**.
2. No cartão **Idioma e região**, escolha **Idioma**, **Fuso horário** e **Moeda**. Os campos de fuso e moeda têm busca.
3. Clique em **Salvar**. Os três campos são salvos juntos. Se você trocou o idioma, a página muda na hora.

As datas aparecem no fuso horário escolhido; valores novos usam a moeda escolhida. Se você não escolher, valem os padrões da organização.

### Preferências: tema

1. Ainda em **Perfil → Preferências**, no cartão **Aparência**, escolha o **Tema**: **Automático (sistema)**, **Claro** ou **Escuro**.
2. O tema é aplicado na hora e salvo no seu perfil, sem botão de salvar.

Atalho: no menu da conta, use **Tema** e escolha **Do sistema**, **Claro** ou **Escuro**.

### Segurança: ativar a verificação em duas etapas com app autenticador

1. Vá em **Perfil → Segurança**.
2. No cartão **Verificação em duas etapas**, clique em **Adicionar app autenticador**.
3. Escaneie o QR code com um app autenticador no celular. Se o app estiver no mesmo dispositivo, use **Abrir no app autenticador**; sem câmera, digite a **Chave de configuração** (mostrada só durante o cadastro; não compartilhe).
4. Em **Código de verificação**, digite o código de 6 dígitos que o app mostrar. O código muda a cada 30 segundos.
5. Se quiser, preencha **Nome do fator** para reconhecê-lo depois.
6. Clique em **Confirmar**. Aparece **Verificação em duas etapas atualizada.**

### Segurança: ativar a verificação por SMS

1. Em **Perfil → Segurança**, clique em **Adicionar telefone**.
2. Em **Número de telefone**, use o formato internacional, com + e código do país. Exemplo: +55 11 91234-5678.
3. Clique em **Enviar código**. Para corrigir o número, use **Trocar número**.
4. Digite o código recebido por SMS em **Código de verificação**.
5. Se quiser, preencha **Nome do fator** e clique em **Confirmar**.

Os tipos de fator oferecidos dependem do ambiente. Se a seção mostrar **A verificação em duas etapas não está disponível neste ambiente.**, não é possível cadastrar fatores ali.

### Segurança: remover um fator

1. Em **Fatores cadastrados**, clique em **Remover** ao lado do fator.
2. Confirme em **Remover**. Se for o único fator, a entrada volta a pedir só a senha.

### Segurança: trocar a senha

1. No cartão **Senha**, preencha **Senha atual**, **Nova senha** (pelo menos 8 caracteres) e **Confirme a nova senha**.
2. Clique em **Trocar senha**.
3. Se você tem verificação em duas etapas, aparece **Confirme que é você**: digite o código do seu segundo fator.
4. Aparece **Senha alterada.**

Se esqueceu a senha atual, saia e use **Esqueci minha senha** na página de entrada. Veja [Primeiros passos](/docs/getting-started).

### Sessões: revisar e encerrar acessos

1. Vá em **Perfil → Sessões**.
2. A tabela **Sessões ativas** mostra **Dispositivo** (navegador ou **App para desktop**), **Última atividade**, **Início** e **Expira em**. A sua sessão atual tem o selo **Este dispositivo**; sessões que passaram pela verificação em duas etapas têm o selo **Com 2 etapas**.
3. Para encerrar uma sessão que você não reconhece, clique em **Revogar** e confirme em **Revogar sessão**. O dispositivo é desconectado na próxima atividade.
4. Para encerrar a sessão atual, clique em **Sair deste dispositivo**.
5. Para encerrar todas, inclusive a atual, clique em **Sair de todos os dispositivos** e confirme em **Sair de todos**. Você volta para a tela de entrada.

Por padrão, uma sessão no navegador dura 5 dias a partir da entrada. Já a sessão no app para desktop dura 30 dias e esse prazo é renovado enquanto você usa o app. Quem opera o app pode mudar esses prazos.

### Notificações: escolher os avisos por e-mail

1. Vá em **Perfil → Notificações**.
2. Ligue ou desligue **Novidades do produto** (novos recursos e melhorias, no máximo uma vez por semana). A escolha é salva na hora.
3. **Alertas de segurança** ficam sempre ativos: avisam sobre novas entradas e mudanças na sua conta.

Os avisos vão para o e-mail da sua conta.

## Exemplo

Exemplo: Rafael trabalha em um escritório de contabilidade em Manaus, mas a organização usa o fuso de São Paulo como padrão.

| Seção | Campo | Antes | Depois |
|---|---|---|---|
| Conta | Nome de exibição | (vazio, aparecia rafael@exemplo.com) | Rafael Costa |
| Preferências | Idioma | Português (Brasil) | Português (Brasil) |
| Preferências | Fuso horário | padrão da organização (São Paulo) | Manaus |
| Preferências | Tema | Automático (sistema) | Escuro |
| Segurança | Fatores cadastrados | nenhum | App autenticador "Celular pessoal" |
| Notificações | Novidades do produto | ligado | desligado |

Depois de uma viagem, ele revisa as sessões:

| Dispositivo | Última atividade | Situação |
|---|---|---|
| Navegador — Este dispositivo — Com 2 etapas | agora | mantida |
| App para desktop — Com 2 etapas | ontem | mantida |
| Navegador | há 4 dias, no computador do hotel | **Revogar** |

> **Rafael:** Esqueci de sair no computador do hotel. Preciso trocar a senha?
>
> **Colega:** Primeiro revogue aquela sessão em Perfil → Sessões. Se desconfiar de acesso indevido, troque a senha e use "Sair de todos os dispositivos".

## Dicas e boas práticas

- Ative a verificação em duas etapas. Com app autenticador, você não depende de sinal de celular.
- Cadastre dois fatores (por exemplo, app autenticador e telefone), para não ficar sem acesso se perder um deles.
- Escolha um fuso horário no perfil se você trabalha em um fuso diferente do padrão da organização.
- Revise as sessões de vez em quando e revogue as que você não reconhece.
- Se perdeu um dispositivo, use **Sair de todos os dispositivos** e depois troque a senha.

## Erros comuns

| Mensagem/situação | O que significa | Como resolver |
|---|---|---|
| Senha atual incorreta. | A senha atual digitada está errada. | Digite de novo ou redefina a senha pela página de entrada. |
| As senhas não conferem. | A confirmação é diferente da nova senha. | Digite a mesma senha nos dois campos. |
| A nova senha precisa ser diferente da atual. | Você repetiu a senha atual. | Escolha outra senha. |
| Esta senha é fraca demais. Use mais caracteres e misture letras, números e símbolos. | A nova senha não atende ao mínimo. | Use uma senha mais longa e variada. |
| Código incorreto ou expirado. Tente de novo. | O código de verificação não confere ou venceu. | Use um código novo. |
| Digite o número no formato internacional, começando com +. | O telefone está fora do formato. | Use +55 e o DDD, por exemplo +55 11 91234-5678. |
| Por segurança, entre novamente para continuar. | A ação exige uma entrada recente. | Saia, entre de novo e repita a ação. |
| O tema foi aplicado aqui, mas não foi salvo no seu perfil. | O tema mudou só neste dispositivo. | Clique em **Tentar novamente**. |
| Não foi possível salvar a preferência. | A notificação não foi salva. | Tente de novo; se continuar, informe a referência ao suporte. |
| Você saiu neste dispositivo, mas não conseguimos encerrar a sessão no servidor. | A saída local funcionou, mas a sessão no servidor continua. | Se usa outros dispositivos, use **Sair de todos os dispositivos** em **Perfil → Sessões**. |

## Veja também

- [Primeiros passos](/docs/getting-started)
- [Dispositivos](/docs/devices)
- [Organizações e projetos](/docs/organizations)
- [Glossário](/docs/glossary)
