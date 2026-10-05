# Base de conhecimento

A base de conhecimento reúne os documentos que os agentes consultam e citam ao responder no [Assistente](/docs/chat). Você adiciona arquivos ou páginas públicas da web, a plataforma lê e indexa o conteúdo em segundo plano, e as respostas passam a trazer citações numeradas que levam ao documento usado.

## O que é

Cada documento da base fica em uma **coleção**. Uma coleção corresponde à **organização inteira** ou a **um dos projetos** dela:

- Documentos da organização valem em todos os projetos.
- Documentos de um projeto valem só nele.
- Não é possível criar coleções com nome próprio.

Além dos documentos da organização, a lista pode mostrar **Conteúdo da plataforma** (o catálogo de dados) e conteúdo de **módulos** instalados. Esses itens são mantidos pela plataforma e não podem ser excluídos pela organização.

Quando um documento entra na base, a plataforma:

1. confere o arquivo (tipo e conteúdo reais, não só a extensão);
2. extrai o texto;
3. divide o texto em trechos;
4. guarda esses trechos de forma que possam ser buscados pelo sentido, e não só por palavras exatas.

Na conversa, quando a pergunta é sobre o conteúdo da organização, o agente busca os trechos mais parecidos com a pergunta: por padrão 5, no máximo 8. Trechos com pouca semelhança são descartados. A resposta cita cada trecho usado com um número, e a lista de fontes mostra o título do documento. Se a resposta não tiver nenhuma fonte, ela recebe a marca **Sem certeza**.

A busca só alcança o que a pessoa que conversa pode pesquisar: a organização dela, o projeto em que a conversa acontece e, para quem tem acesso, o catálogo de dados. Documentos de outras organizações nunca aparecem.

## Quem pode usar

| O que você quer fazer | Permissão | Quem tem por padrão |
|---|---|---|
| Ver a página e consultar a base (inclusive pelo chat) | `core.knowledge.read` | Proprietário, Administrador e Membro |
| Adicionar documentos (arquivo ou página da web) | `core.knowledge.write` | Proprietário e Administrador |
| Enviar arquivos (necessário para a aba **Arquivo**) | `core.file.upload` | Proprietário, Administrador e Membro |
| Excluir documentos | `core.knowledge.delete` | Proprietário e Administrador |
| Acompanhar o andamento das indexações na página | `core.workflow-run.read` | Proprietário, Administrador e Membro |

Quem pode adicionar documentos mas não pode enviar arquivos vê o aviso "Você não tem permissão para enviar arquivos; só é possível adicionar páginas da web." Quem só pode ler vê a lista, e a página vazia diz "Quem administra a organização pode adicionar documentos." Veja [Papéis e permissões](/docs/roles).

## Onde encontrar

**Configurações** → grupo **IA** → **Base de conhecimento**. Endereço: `/o/{organização}/settings/knowledge`.

A coleção escolhida no seletor **Coleção** fica no endereço (por exemplo, `?collection=tenant` para a organização inteira), então você pode compartilhar o link já filtrado.

Também dá para mandar um arquivo para a base pelo chat: no Assistente, clique em **Anexar** → **Adicionar à base de conhecimento**. Nesse caminho, o arquivo sempre entra na coleção **Organização inteira** (veja [Assistente (chat)](/docs/chat)).

![Página Base de conhecimento](/guide/knowledge-list.jpg)

*Na tela: **Configurações → Base de conhecimento**.*

## Passo a passo

![Diálogo Adicionar documento com as abas Arquivo e Página da web](/guide/knowledge-dialog.jpg)

*O diálogo **Adicionar documento**: envie um **Arquivo** ou informe uma **Página da web**.*

### Ver os documentos

1. Abra **Base de conhecimento**.
2. No seletor **Coleção**, escolha **Todos os documentos**, **Organização inteira** ou **Projeto {nome}**.
3. A tabela mostra **Documento**, **Origem** (**Arquivo enviado**, **Página da web**, **Catálogo da plataforma** ou **Módulo**), **Coleção**, **Indexação** (**Indexando**, **Pronto** ou **Falhou**), **Adicionado em** e **Ações**.

### Adicionar um arquivo

1. No seletor **Coleção**, escolha onde o documento deve ficar. Com **Todos os documentos** selecionado, o documento vai para a **Organização inteira**.
2. Clique em **Adicionar documento**. A janela confirma a coleção de destino: "O documento entra na coleção "{coleção}" e é indexado em segundo plano."
3. Em **Origem do documento**, deixe a aba **Arquivo** e escolha o arquivo.
4. Clique em **Adicionar**. A janela mostra as etapas: "preparando o envio", "enviando o arquivo", "conferindo o arquivo" e "iniciando a indexação".
5. Quando a indexação começa, aparece "Indexação de {nome} iniciada." e um aviso em **Indexações em andamento**: "Indexando {nome}. O documento aparece na lista quando o conteúdo for lido."
6. Quando terminar, o documento aparece na lista com **Pronto** e já pode ser citado nas conversas.

A primeira conferência do arquivo pode levar alguns minutos. Se demorar, a janela avisa "Ainda processando o arquivo. A primeira conferência pode levar alguns minutos; você pode esperar com esta janela aberta."

Formatos e limites:

| Formato | Extensão | Tamanho máximo | Observação |
|---|---|---|---|
| Texto simples | `.txt` | 25 MB | Lido como texto UTF-8 |
| Markdown | `.md` | 25 MB | Lido como texto UTF-8, respeitando títulos e seções |
| CSV | `.csv` | 25 MB | Lido como texto UTF-8 |
| JSON | `.json` | 25 MB | Lido como texto UTF-8 |
| PDF | `.pdf` | 25 MB | Aceito no envio, mas só é indexado quando a plataforma tem um leitor de PDF configurado. Sem ele, a indexação falha. |

Arquivos de texto precisam estar em UTF-8. Um arquivo com extensão trocada (por exemplo, uma imagem renomeada para `.txt`) é recusado na conferência.

### Adicionar uma página da web

1. Clique em **Adicionar documento** e escolha a aba **Página da web**.
2. Em **Endereço da página**, cole um endereço completo começando com `https://`. Só páginas públicas são aceitas.
3. Clique em **Adicionar**.

A leitura de páginas usa um serviço de leitura da web configurado pela plataforma. Se ele não estiver configurado no seu ambiente, a indexação da página falha. Endereços internos, de rede privada ou com número IP são recusados por segurança.

### Acompanhar e repetir uma indexação

- Enquanto um documento é indexado, o aviso fica em **Indexações em andamento**. Use **Dispensar** para escondê-lo.
- Se a leitura falhar, aparece "Não foi possível indexar {nome}", com uma **Referência** (o código da execução) e o botão **Tentar de novo**.
- Se a indexação terminar sem gerar documento, aparece "{nome} não gerou um documento". O conteúdo pode estar vazio ou não ter sido lido.

### Excluir um documento

1. Na linha do documento, clique em **Excluir**.
2. Confirme em **Excluir documento**. O documento e o conteúdo indexado são removidos, e os agentes deixam de citá-lo. A ação não pode ser desfeita.

## Exemplo

> Cenário ilustrativo, com dados fictícios.

### Uma clínica veterinária organiza os protocolos

A clínica tem um projeto por unidade ("Unidade Centro" e "Unidade Norte"). Os protocolos valem para todas, e as escalas de plantão são de cada unidade.

| Documento | Origem | Coleção | Indexação |
|---|---|---|---|
| Protocolo de vacinação | Arquivo enviado | Organização inteira | Pronto |
| Tabela de procedimentos | Arquivo enviado | Organização inteira | Pronto |
| Escala de plantão — outubro | Arquivo enviado | Projeto Unidade Centro | Pronto |
| Orientações pós-cirúrgicas | Página da web | Organização inteira | Indexando |
| Manual antigo (digitalizado) | Arquivo enviado | Organização inteira | Falhou |

Numa conversa no projeto "Unidade Centro":

> **Você:** Quem está de plantão no sábado e qual o intervalo entre as doses da vacina múltipla?
>
> **Assistente:** No sábado, o plantão é da equipe B [1]. Pelo protocolo da clínica, as doses da vacina múltipla são aplicadas a cada 3 ou 4 semanas até completar o esquema [2].
>
> *2 fontes* — Fonte 1: Escala de plantão — outubro · Fonte 2: Protocolo de vacinação

A mesma pergunta feita no projeto "Unidade Norte" não encontra a escala da Unidade Centro, porque documentos de um projeto valem só nele.

### Como um trecho citado aparece nos dados

Cada citação aponta para um trecho de um documento. No formato do contrato da plataforma, um resultado de busca tem esta forma:

```json
{
  "citationId": "kb:01928f6e-7b2a-7c3d-9e4f-5a6b7c8d9e0f#3",
  "documentId": "01928f6e-7b2a-7c3d-9e4f-5a6b7c8d9e0f",
  "title": "Protocolo de vacinação",
  "sourceUrl": null,
  "snippet": "As doses de reforço são aplicadas a cada 3 ou 4 semanas.",
  "score": 0.82
}
```

O `score` vai de 0 a 1 e mede a semelhança entre o trecho e a pergunta. Resultados abaixo de 0,3 são descartados.

E o documento correspondente, como listado pela API:

```json
{
  "id": "01928f6e-7b2a-7c3d-9e4f-5a6b7c8d9e0f",
  "tenantId": "Jd8sK2lPq0WnR5tYu3bV",
  "namespace": "tenant",
  "source": "upload",
  "sourceRef": "Fz9sK2lPq0WnR5tYu3bV",
  "title": "Protocolo de vacinação",
  "sourceUrl": null,
  "mimeType": "text/markdown",
  "contentHash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "status": "ready",
  "createdBy": "uA1b2C3d4E5f6G7h8I9j",
  "createdAt": "2026-09-29T14:30:00.000Z",
  "updatedAt": "2026-09-29T14:31:00.000Z"
}
```

`namespace` vale `tenant` para a organização inteira e `project:{projeto}` para a coleção de um projeto.

### Outros usos

| Organização (exemplo) | O que colocar na base | Coleção |
|---|---|---|
| Rede de lojas | Política de trocas, manual do caixa | Organização inteira |
| Rede de lojas | Horários e contatos de cada loja | Projeto de cada loja |
| Escritório de contabilidade | Calendário de obrigações, roteiros internos em Markdown | Organização inteira |
| Escola de idiomas | Regulamento, manual do professor | Organização inteira |

## Dicas e boas práticas

- **Prefira Markdown ou texto simples.** São os formatos lidos com mais fidelidade. Títulos (`#`, `##`) ajudam a dividir o conteúdo em trechos que fazem sentido.
- **Converta PDFs para texto** quando o seu ambiente não tiver leitor de PDF configurado. Um PDF com status **Falhou** costuma ser esse o motivo.
- **Escolha a coleção certa antes de clicar em Adicionar documento.** Conteúdo que vale para todos vai na **Organização inteira**. O que é de um projeto vai na coleção dele.
- **Dê bons títulos aos arquivos.** O título aparece nas citações, então "Política de trocas 2026" é melhor que "doc_final_v3".
- **Um assunto por documento** facilita a busca e deixa as citações mais precisas.
- **Atualize em vez de acumular.** Ao substituir um documento, exclua a versão antiga para que os agentes não citem regras desatualizadas.
- **Não coloque senhas, tokens nem dados pessoais desnecessários** na base. Tudo o que estiver nela pode ser citado para quem tem acesso à coleção.
- **Agentes da organização precisam do alcance certo.** Um agente criado em [Agentes e habilidades](/docs/agents) começa com **Não pesquisa** e só cita documentos depois que você muda essa opção.
- **Teste com uma pergunta** no Assistente depois que o documento ficar **Pronto**.

## Erros comuns

| Mensagem/situação | O que significa | Como resolver |
|---|---|---|
| "Este tipo de arquivo não é aceito." / "Este tipo de arquivo não é aceito na base de conhecimento." | O formato não está entre `.pdf`, `.txt`, `.md`, `.csv` e `.json`. | Converta o arquivo para um formato aceito. |
| "O arquivo passa de 25 MB." / "O arquivo é maior que o tamanho permitido." | O arquivo é maior que o limite. | Divida o conteúdo em arquivos menores. |
| "O arquivo está vazio." | O arquivo não tem conteúdo. | Confira o arquivo e envie de novo. |
| "O conteúdo do arquivo não corresponde ao tipo informado." | A extensão não bate com o conteúdo real, ou o texto não está em UTF-8. | Salve o arquivo no formato certo, com codificação UTF-8. |
| "A conferência do arquivo está demorando mais que o esperado. Tente novamente em alguns minutos." | A verificação do arquivo não terminou a tempo. | Espere alguns minutos e tente de novo. |
| "Não foi possível enviar o arquivo. Verifique a conexão e tente novamente." | O envio foi interrompido. | Verifique a internet e tente de novo. |
| "Informe um endereço completo que comece com https://." | O endereço da página está incompleto ou usa `http`. | Use o endereço completo com `https://`. |
| "Não foi possível indexar {nome}" | A leitura falhou antes de o documento entrar na lista: PDF sem leitor configurado, página inacessível ou serviço de leitura da web indisponível. | Clique em **Tentar de novo**. Se persistir, converta o PDF para texto ou confira o endereço. Informe a **Referência** ao suporte. |
| "{nome} não gerou um documento" | A indexação terminou, mas o conteúdo estava vazio ou não foi lido. | Confira o arquivo ou envie outro. |
| Documento com **Falhou** na coluna **Indexação** | O conteúdo não pôde ser processado. | Exclua o documento e adicione de novo em outro formato. |
| A resposta vem com **Sem certeza** | O agente não encontrou trecho relevante na base. | Verifique se o documento está **Pronto**, na coleção certa, e se a pergunta usa termos do documento. |
| "Você não tem permissão para fazer isso." | Falta `core.knowledge.write` ou `core.knowledge.delete`. | Peça a quem administra a organização. |

## Veja também

- [Assistente (chat)](/docs/chat)
- [Agentes e habilidades](/docs/agents)
- [Conectores](/docs/connectors)
- [Fluxos e agendamentos](/docs/workflows)
- [Papéis e permissões](/docs/roles)
- [Glossário](/docs/glossary)
