# Conectores

Conectores ligam os agentes da organização a sistemas externos: uma API descrita em OpenAPI, um servidor MCP, um banco Postgres (somente leitura) ou um navegador automatizado. Com um conector, o [Assistente](/docs/chat) pode consultar ou acionar esses sistemas durante a conversa, sempre dentro das ferramentas que você liberar e com aprovação antes de qualquer alteração.

## O que é

Um conector descreve **onde** fica o sistema externo, **como** se autenticar nele e **quais ferramentas** os agentes podem usar. Existem quatro tipos:

| Tipo | Para que serve | O que vira ferramenta |
|---|---|---|
| **API OpenAPI** | Os agentes chamam as operações de uma API HTTP descrita em OpenAPI 3.0 ou 3.1. | Cada `operationId` liberado |
| **Servidor MCP** | Os agentes usam as ferramentas de um servidor MCP remoto. | Cada ferramenta MCP liberada |
| **Postgres (somente leitura)** | Os agentes consultam, só para leitura, as tabelas e visões permitidas de um banco Postgres da organização. | Consultas de leitura nas tabelas permitidas |
| **Navegador** | Os agentes navegam em páginas por meio de um servidor Playwright MCP. | Cada ferramenta do navegador liberada |

O **segredo** do conector (token, chave de API ou a DSN do Postgres) é guardado num cofre de segredos. Ele é definido numa ação separada, nunca aparece de novo na tela e nunca é devolvido pela API. A lista mostra só se o segredo está **Definido** ou **Não definido**.

### Quais agentes usam cada conector

| Agente | Ferramentas de conector que recebe |
|---|---|
| **Assistente** | Só as de leitura: operações `GET` e `HEAD` de APIs OpenAPI e as ferramentas MCP marcadas em **Ferramentas que rodam sem aprovação**. |
| **Agente de ações** | Todas as ferramentas de APIs OpenAPI e servidores MCP liberadas, com aprovação para o que altera dados. |
| **Agente de dados** | As consultas dos conectores Postgres. |
| **Agente de pesquisa na web** | As ferramentas dos conectores **Navegador**, só quando a regra **Navegador automatizado** está ligada em [Agentes](/docs/agents). |
| **Agentes da organização** | As ferramentas de leitura dos conectores, só quando a opção **Ferramentas de leitura dos conectores** está marcada no agente. |

### Quando a ferramenta pede aprovação

| Tipo | Roda sem aprovação | Pede aprovação |
|---|---|---|
| **API OpenAPI** | Operações `GET` e `HEAD` | Todas as outras (`POST`, `PUT`, `PATCH`, `DELETE`...) |
| **Servidor MCP** | Ferramentas marcadas em **Ferramentas que rodam sem aprovação** | Todas as outras ferramentas liberadas |
| **Postgres (somente leitura)** | Consultas (só leitura) | — |
| **Navegador** | — | Todas as ferramentas, sempre |

A aprovação aparece na própria conversa, no cartão **Aprovação necessária** (veja [Assistente (chat)](/docs/chat)).

### A plataforma como servidor MCP

Além de usar servidores MCP externos, a própria plataforma pode ser acessada por clientes MCP externos. Eles podem usar ferramentas de leitura (listar e descrever o catálogo de dados, buscar na base de conhecimento, consultar dados) e perguntar ao Assistente. Esse acesso exige a permissão `core.mcp.use` (por padrão, Proprietário e Administrador) e uma [chave de API](/docs/api-keys) ou um login de usuário. Ele não oferece ferramentas que alteram dados e aceita até 60 chamadas por minuto.

## Quem pode usar

| O que você quer fazer | Permissão | Quem tem por padrão |
|---|---|---|
| Ver a página **Conectores** | `core.connector.read` | Proprietário e Administrador |
| Criar, editar, definir o segredo, ativar, desativar e excluir | `core.connector.write` | Proprietário e Administrador |
| Consultar dados por um conector Postgres na conversa | `core.catalog.query` | Proprietário, Administrador e Membro |

Na conversa, quem usa as ferramentas do conector é qualquer pessoa que fala com um agente que as recebe. Mesmo assim, toda ferramenta que altera dados pede a aprovação de quem conversa. Quem só tem leitura vê a lista e, se ela estiver vazia, a mensagem "Nenhum conector foi criado. Você não tem permissão para criar conectores." Veja [Papéis e permissões](/docs/roles).

## Onde encontrar

**Configurações** → grupo **IA** → **Conectores**. Endereço: `/o/{organização}/settings/connectors`.

A página **Agentes** também tem o atalho **Abrir conectores**.

A tabela mostra **Conector**, **Estado** (**Ativo**, **Desativado** ou **Com erro**), **Segredo**, **Ferramentas** (por exemplo, "3 ferramentas · 1 sem aprovação"), **Atualizado em** e **Ações**.

Antes de começar, saiba que a página **não** tem teste de conexão nem lista as ferramentas do sistema externo. Você digita os nomes das ferramentas como aparecem no sistema e confere o funcionamento numa conversa com o agente.

![Página Conectores](/guide/connectors-list.jpg)

*Na tela: **Configurações → Conectores**.*

## Passo a passo

![Editor de novo conector](/guide/connectors-editor.jpg)

*O editor aberto por **Novo conector**.*

### Criar um conector

1. Clique em **Novo conector**.
2. Em **Nome**, use até 100 caracteres. O nome também é o prefixo das ferramentas geradas (por exemplo, `api.{nome}.{operação}` para OpenAPI e `mcp_{nome}_{ferramenta}` para MCP), então prefira algo curto como `pedidos-api`.
3. Em **Tipo**, escolha **API OpenAPI**, **Servidor MCP**, **Postgres (somente leitura)** ou **Navegador**. O tipo não pode ser mudado depois.
4. Preencha os campos do tipo escolhido (veja a tabela abaixo).
5. Em **Ferramentas permitidas**, escreva um nome por linha, exatamente como o sistema externo expõe (o `operationId` da API ou o nome da ferramenta MCP). O que não estiver na lista fica oculto para os agentes.
6. Em **Ferramentas que rodam sem aprovação**, marque as ferramentas de leitura. As demais pedem confirmação antes de rodar.
7. Clique em **Criar conector**.
8. Se o tipo usa segredo, a janela **Definir o segredo de {nome}** abre em seguida. Cole o valor e clique em **Salvar segredo**.

Campos por tipo:

| Campo | API OpenAPI | Servidor MCP | Postgres | Navegador |
|---|---|---|---|---|
| **URL do documento OpenAPI** | Sim: endereço `https` do documento OpenAPI 3.0 ou 3.1 (em JSON) | — | — | — |
| **URL do servidor** | — | Sim: endereço `https` do servidor | — | Sim: endereço `https` do servidor Playwright MCP |
| **Hosts permitidos** | Sim | Sim | — | Sim |
| **Tabelas e visões permitidas** | — | — | Sim | — |
| **Autenticação** | **Sem autenticação**, **Token Bearer** ou **Chave de API em cabeçalho** | **Sem autenticação**, **Token Bearer** ou **OAuth** | — (a DSN é o segredo) | — |
| **Cabeçalho da chave de API** | Só com **Chave de API em cabeçalho** (por exemplo, `X-Api-Key`) | — | — | — |
| Segredo | **Token ou chave de API** | **Token de acesso** | **DSN de conexão** | — |

Regras dos campos:

- **Hosts permitidos:** de 1 a 20, um por linha, em minúsculas, sem `https://`, sem porta e sem endereço IP (por exemplo, `api.exemplo.com`). Só esses hosts são alcançados, inclusive em redirecionamentos. A URL do servidor ou do documento OpenAPI precisa estar num desses hosts.
- **Tabelas e visões permitidas:** de 1 a 200, uma por linha, no formato `esquema.tabela`, em minúsculas (por exemplo, `public.pedidos`). Só elas podem ser lidas.
- **Ferramentas permitidas:** cada nome começa com letra e tem só letras, números, ponto, hífen e sublinhado. Os nomes não são conferidos com o sistema externo: uma ferramenta com nome errado simplesmente não fica disponível para os agentes.

Para a opção **OAuth** de servidores MCP, a página não conduz um login OAuth. O que você salvar como segredo é enviado ao servidor como token de acesso.

### Definir ou trocar o segredo

1. Na linha do conector, clique em **Definir segredo** (ou **Substituir segredo**, se já houver um).
2. Cole o valor. O campo começa vazio e é apagado ao salvar.
3. Clique em **Salvar segredo** (ou **Substituir segredo**).

Depois de salvo, o segredo não pode ser lido nem exibido de novo. Para trocar um token vencido, use **Substituir segredo**.

### Editar, desativar ou excluir

- **Editar:** muda tudo, menos o tipo. Clique em **Salvar alterações**.
- **Desativar:** os agentes deixam de usar as ferramentas do conector até ele ser ativado de novo. A configuração e o segredo são mantidos. **Ativar** reverte.
- **Excluir:** apaga o conector e o segredo guardado. Os agentes perdem as ferramentas dele. A ação não pode ser desfeita.

Os agentes recarregam os conectores da organização periodicamente. Uma mudança pode levar alguns minutos para aparecer nas conversas.

### Conferir se o conector funciona

1. Abra o Assistente num projeto.
2. Peça algo que use uma ferramenta de leitura do conector.
3. Confira o cartão "Ferramenta: ..." na conversa, com a **Entrada** e o **Resultado**.
4. Se o conector não carregar, ele aparece **Com erro** na lista, com o motivo e a hora da última tentativa ("(última tentativa em ...)").

## Exemplo

> Cenários ilustrativos, com sistemas e endereços fictícios.

### Exemplo 1: uma rede de lojas consulta pedidos por API

A rede tem uma API interna de pedidos publicada em `https://api.lojas-exemplo.com`, com documento OpenAPI.

| Campo | Valor |
|---|---|
| **Nome** | `pedidos-api` |
| **Tipo** | API OpenAPI |
| **URL do documento OpenAPI** | `https://api.lojas-exemplo.com/openapi.json` |
| **Hosts permitidos** | `api.lojas-exemplo.com` |
| **Autenticação** | Token Bearer |
| **Ferramentas permitidas** | `listarPedidos`, `obterPedido`, `cancelarPedido` |
| **Ferramentas que rodam sem aprovação** | `listarPedidos`, `obterPedido` |

O conector como a API da plataforma o devolve (o segredo nunca aparece, só a referência a ele):

```json
{
  "id": "Cn4sK2lPq0WnR5tYu3bV",
  "tenantId": "Jd8sK2lPq0WnR5tYu3bV",
  "name": "pedidos-api",
  "type": "openapi",
  "status": "active",
  "secretRef": "connector-Jd8sK2lPq0WnR5tYu3bV-Cn4sK2lPq0WnR5tYu3bV",
  "toolPolicy": {
    "allow": ["listarPedidos", "obterPedido", "cancelarPedido"],
    "readOnly": ["listarPedidos", "obterPedido"]
  },
  "config": {
    "specUrl": "https://api.lojas-exemplo.com/openapi.json",
    "allowedHosts": ["api.lojas-exemplo.com"],
    "auth": "bearer",
    "apiKeyHeader": null
  },
  "createdBy": "uA1b2C3d4E5f6G7h8I9j",
  "createdAt": "2026-09-29T14:30:00.000Z",
  "updatedAt": "2026-09-29T14:30:00.000Z"
}
```

Na conversa:

> **Você:** Qual a situação do pedido 48213?
>
> **Assistente:** O pedido 48213 está "em separação" desde hoje às 9h, na loja Centro.
>
> *(cartão "Ferramenta: …obterPedido", Concluído)*
>
> **Você:** Cancele esse pedido, o cliente desistiu.
>
> **Assistente:** Vou cancelar o pedido 48213. Confirme a ação abaixo.
>
> *(cartão **Aprovação necessária**, com **Aprovar** e **Recusar**)*

A consulta (`GET`) rodou direto. O cancelamento (`POST`) só roda depois que você clica em **Aprovar**.

### Exemplo 2: um escritório de contabilidade consulta um banco Postgres

O escritório tem um banco próprio com uma visão resumida de lançamentos.

| Campo | Valor |
|---|---|
| **Nome** | `financeiro` |
| **Tipo** | Postgres (somente leitura) |
| **Tabelas e visões permitidas** | `public.lancamentos_resumo`, `public.clientes` |
| **Ferramentas permitidas** | `query` |
| **Ferramentas que rodam sem aprovação** | `query` |
| Segredo (**DSN de conexão**) | `postgres://leitura:...@db.contabil-exemplo.com:5432/financeiro` |

> **Você:** Quantos lançamentos a Padaria Exemplo teve em setembro?
>
> **Assistente:** A Padaria Exemplo teve 132 lançamentos em setembro.

As consultas rodam numa transação só de leitura, com tempo limite de 5 segundos e número de linhas limitado. Use um usuário de banco que só tenha permissão de leitura e um host público (endereços de rede privada são recusados).

### Exemplo 3: uma escola de idiomas usa um servidor MCP de agenda

| Campo | Valor |
|---|---|
| **Nome** | `agenda` |
| **Tipo** | Servidor MCP |
| **URL do servidor** | `https://mcp.escola-exemplo.com/mcp` |
| **Hosts permitidos** | `mcp.escola-exemplo.com` |
| **Autenticação** | Token Bearer |
| **Ferramentas permitidas** | `buscar_horarios`, `reservar_sala` |
| **Ferramentas que rodam sem aprovação** | `buscar_horarios` |

> **Você:** Tem sala livre na quinta às 19h?
>
> **Assistente:** Sim, as salas 2 e 5 estão livres na quinta às 19h. Quer que eu reserve uma delas?

Se a pessoa pedir a reserva, `reservar_sala` passa pela aprovação, porque não está marcada para rodar sem aprovação.

## Dicas e boas práticas

- **Libere o mínimo.** Coloque em **Ferramentas permitidas** só o que os agentes precisam. O resto fica invisível para eles.
- **Marque como "sem aprovação" só o que é leitura de verdade.** Ferramentas que gravam, enviam ou apagam devem sempre pedir aprovação.
- **Use credenciais dedicadas e com pouco acesso.** Um token só de leitura, ou um usuário de banco só com `SELECT` nas tabelas liberadas.
- **Troque segredos com Substituir segredo** quando um token vencer ou vazar. Revogue o antigo no sistema de origem.
- **Confira os nomes das ferramentas** no sistema externo antes de salvar. Um erro de digitação não gera aviso: a ferramenta só não aparece.
- **Teste logo depois de criar** com uma pergunta simples no Assistente.
- **Desative em vez de excluir** quando a pausa for temporária. Assim, a configuração e o segredo ficam guardados.
- **Navegador é sensível.** Toda ação do navegador pede aprovação, e ele só funciona com **Navegador automatizado** ligado em [Agentes](/docs/agents) e com a liberação da plataforma.

## Erros comuns

| Mensagem/situação | O que significa | Como resolver |
|---|---|---|
| "Falta o segredo: defina-o para os agentes usarem este conector." | O conector usa autenticação, mas nenhum segredo foi salvo. | Clique em **Definir segredo**. |
| "O documento OpenAPI não pôde ser baixado." | O endereço do documento não respondeu. | Confira a **URL do documento OpenAPI** e se ela é pública. |
| "O documento OpenAPI é inválido." | O documento não é um OpenAPI 3.0 ou 3.1 válido em JSON, ou referencia arquivos externos. | Valide o documento e publique uma versão completa em JSON. |
| "O documento OpenAPI passa do tamanho máximo (2 MB)." | O documento é grande demais. | Publique um documento só com as operações necessárias. |
| "O servidor do documento não está entre os hosts permitidos." | O endereço da API indicado no documento não está em **Hosts permitidos**. | Adicione o host da API em **Hosts permitidos**. |
| "O servidor recusou a conexão; confira a URL e o segredo." | O servidor MCP ou a API não aceitou a conexão. | Confira a **URL do servidor** e use **Substituir segredo** com um token válido. |
| "Não foi possível carregar o conector." | Outro problema impediu o carregamento. | Revise a configuração. Se persistir, fale com o suporte. |
| "Informe de 1 a 20 hosts válidos, em minúsculas, sem esquema, porta ou endereço IP." | Algum host está fora do formato. | Escreva só o nome, como `api.exemplo.com`. |
| "Informe de 1 a 200 relações no formato esquema.tabela, em minúsculas." | Alguma tabela está fora do formato. | Use `esquema.tabela`, como `public.pedidos`. |
| "Só ferramentas permitidas podem rodar sem aprovação." | Uma ferramenta marcada como "sem aprovação" não está em **Ferramentas permitidas**. | Adicione a ferramenta à lista de permitidas ou desmarque-a. |
| "Informe uma URL https válida." | O endereço não usa `https` ou está incompleto. | Use um endereço completo com `https://`. |
| O agente não usa a ferramenta | O nome em **Ferramentas permitidas** está diferente do sistema, o conector está desativado, ou o agente não recebe aquele tipo de ferramenta. | Confira o nome exato, o **Estado** e a tabela "Quais agentes usam cada conector". |

## Veja também

- [Agentes e habilidades](/docs/agents)
- [Assistente (chat)](/docs/chat)
- [Aprovações](/docs/approvals)
- [Chaves de API](/docs/api-keys)
- [Base de conhecimento](/docs/knowledge)
- [Papéis e permissões](/docs/roles)
