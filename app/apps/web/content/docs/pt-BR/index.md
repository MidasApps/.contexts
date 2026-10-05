# Documentação do app

Bem-vindo. Esta documentação explica como usar cada parte do app: da primeira entrada até a administração da plataforma. Cada página segue a mesma estrutura: o que é, quem pode usar, onde encontrar, passo a passo, um exemplo com dados fictícios, dicas e erros comuns.

> Os exemplos usam negócios genéricos, como uma clínica veterinária, uma rede de lojas ou uma escola de idiomas, e dados inventados. Eles servem para mostrar o uso de cada recurso; os nomes, valores e pessoas não são reais.

## O que o app faz

O app reúne, num só lugar, a sua equipe, os seus dados e assistentes de inteligência artificial (IA) que trabalham dentro das regras da sua organização. Com ele você pode:

- **conversar com um assistente de IA** que responde com base nos documentos da sua organização e pode executar ações, sempre dentro das suas permissões;
- **organizar o trabalho** em organizações, projetos e unidades, com membros, convites e papéis;
- **automatizar tarefas** com fluxos de trabalho e agendamentos, pedindo aprovação humana quando uma ação é sensível;
- **acompanhar uso e custos** da IA, com orçamento, rastros de cada resposta e avaliações de qualidade;
- **integrar outros sistemas** por chaves de API, conectores e o app desktop.

## Como as coisas se organizam

| Conceito | O que é | Exemplo |
|---|---|---|
| Organização | O espaço da sua empresa no app. Tem membros, papéis, configurações e orçamento próprios. | "Clínica Vet Exemplo" |
| Projeto | Uma área de trabalho dentro da organização. O assistente e os módulos funcionam dentro de um projeto. | "Atendimento", "Financeiro" |
| Unidade | Uma divisão do projeto, como uma filial ou um setor, que pode ter fuso horário próprio. | "Filial Centro", "Filial Norte" |
| Membro | Uma pessoa com acesso à organização. | Ana, recepcionista |
| Papel | Um conjunto de permissões dado a membros. | Proprietário, Administrador, Membro |
| Agente | Um assistente de IA com instruções e ferramentas próprias. | "Assistente de agendamento" |

Uma mesma pessoa pode participar de várias organizações, com papéis diferentes em cada uma.

## Por onde começar

| Se você quer… | Leia |
|---|---|
| Entrar pela primeira vez e se orientar na tela | [Primeiros passos](/docs/getting-started) |
| Criar projetos e ajustar a organização | [Organizações e projetos](/docs/organizations) |
| Trazer a sua equipe | [Membros e convites](/docs/members) e [Papéis e permissões](/docs/roles) |
| Usar o assistente no dia a dia | [Assistente (chat)](/docs/chat) |
| Ensinar o assistente com os seus documentos | [Base de conhecimento](/docs/knowledge) |
| Criar um assistente especializado | [Agentes e habilidades](/docs/agents) |
| Automatizar uma rotina | [Fluxos e agendamentos](/docs/workflows) e [Aprovações](/docs/approvals) |
| Controlar quanto a IA custa | [Uso e orçamento](/docs/usage) |
| Entender por que o assistente respondeu algo | [Rastros](/docs/traces) e [Avaliações](/docs/evals) |
| Integrar outro sistema | [Chaves de API e integração](/docs/api-keys) e [Conectores](/docs/connectors) |
| Usar o app no computador da loja ou da recepção | [Dispositivos e app desktop](/docs/devices) |
| Ajustar a sua conta, idioma e segurança | [Seu perfil](/docs/profile) |
| Operar a plataforma (equipe interna) | [Administração da plataforma](/docs/admin) |

## Exemplo: um dia na Clínica Vet Exemplo

Este roteiro mostra como as partes do app se encaixam. Cada passo tem a página que o explica.

1. **Configuração inicial.** A proprietária, Marta, cria a organização "Clínica Vet Exemplo" e o projeto "Atendimento", com as unidades "Filial Centro" e "Filial Norte". Veja [Organizações e projetos](/docs/organizations) e [Unidades](/docs/units).
2. **Equipe.** Marta convida Ana (recepção) com o papel Membro e Bruno (gerente) com o papel Administrador. Veja [Membros e convites](/docs/members).
3. **Conhecimento.** Bruno envia à base de conhecimento a tabela de vacinas e o manual de atendimento. Veja [Base de conhecimento](/docs/knowledge).
4. **Uso diário.** Ana pergunta ao assistente:

   > **Você:** Quais vacinas um filhote de cachorro precisa tomar até os 4 meses?
   >
   > **Assistente:** Pela tabela de vacinas da clínica, o filhote toma a V10 em três doses, a partir de 45 dias, e a antirrábica aos 4 meses. (Fonte 1: Tabela de vacinas)

   A resposta indica de qual documento veio a informação. Veja [Assistente (chat)](/docs/chat).
5. **Automação com controle.** Bruno cria um agendamento semanal que prepara o resumo de retornos. Uma ação sensível do fluxo para e espera aprovação. Veja [Fluxos e agendamentos](/docs/workflows) e [Aprovações](/docs/approvals).
6. **Custos.** No fim do mês, Marta confere em **Uso e orçamento** quanto a IA consumiu e ajusta o limite. Veja [Uso e orçamento](/docs/usage).

## Endereços das páginas

No navegador, todo endereço começa pelo idioma, como `/pt-BR/o/{organização}/settings/members`. Nesta documentação, os endereços aparecem sem esse prefixo. Os trechos entre chaves, como `{organização}`, são substituídos pelo identificador real que aparece na barra de endereço.

## Idioma desta documentação

A documentação está escrita em português. Se o app estiver em inglês ou espanhol, as páginas abrem em português com um aviso no topo. Os nomes de botões e menus citados aqui são os da interface em português.

## Veja também

- [Primeiros passos](/docs/getting-started)
- [Glossário](/docs/glossary)
