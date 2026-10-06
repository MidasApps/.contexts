# Chaves de API e integração

Chaves de API permitem que um sistema externo (um ERP, uma planilha automatizada, um script) acesse a API do app sem que uma pessoa precise entrar com e-mail e senha. Esta página explica como criar e revogar chaves e como usá-las para chamar a API `/v1`.

## O que é

Uma chave de API é uma credencial para integrações. Ela tem quatro características importantes:

- **Age em seu nome.** Toda chave pertence à pessoa que a criou. A chave nunca pode fazer mais do que essa pessoa pode fazer agora: o que vale é a interseção entre as permissões escolhidas na chave e as permissões atuais da dona da chave.
- **Vale só em um lugar.** Você escolhe **Onde vale**: a organização inteira, um projeto ou uma unidade. A chave só funciona no nível escolhido e abaixo dele.
- **Tem permissões limitadas.** Você marca apenas as permissões de que a integração precisa. Só aparecem disponíveis as permissões que você mesmo tem no nível escolhido.
- **Tem validade obrigatória.** Toda chave expira, no máximo em 365 dias.

A chave completa aparece **uma única vez**, logo depois de criada. O app guarda apenas um resumo dela, por isso não há como mostrá-la de novo. Se perder a chave, revogue-a e crie outra.

Uma chave tem este formato:

```text
core_K7QX2M4PZ6AB_q1W2e3R4t5Y6u7I8o9P0a1S2d3F4g5H6j7K8l9Z0x1C
```

- `core` é o prefixo da instalação. O padrão é `core`, mas a sua instalação pode usar outro.
- `K7QX2M4PZ6AB` é a parte pública, com 12 caracteres. Ela aparece na lista de chaves, logo abaixo do nome, para você reconhecer qual chave é qual.
- O restante é o segredo. Ele nunca aparece na lista.

Se a pessoa dona da chave for removida da organização, as chaves dela são revogadas automaticamente. Na lista, a situação aparece como **Revogada (dono removido)**.

## Quem pode usar

Por padrão, os papéis **Proprietário** e **Administrador** têm as três permissões desta seção:

| Permissão | Código | O que libera |
|---|---|---|
| Ver chaves de API | `core.api-key.read` | Abrir a página e ver a lista de chaves |
| Criar chaves de API | `core.api-key.create` | Usar o botão **Nova chave** |
| Revogar chaves de API | `core.api-key.revoke` | Usar o botão **Revogar** em uma chave ativa |

Quem não tem permissão para ver a seção encontra um aviso de acesso negado no lugar da lista. Quem vê a lista mas não pode criar chaves recebe a mensagem "Peça a um administrador para criar chaves."

Para entender papéis e permissões, veja [Papéis](/docs/roles).

## Onde encontrar

No app (web ou desktop), abra **Configurações → Chaves de API**. A seção fica no grupo **Acesso** do menu de configurações.

O endereço segue o padrão:

```text
/o/<id-da-organização>/settings/api-keys
```

A lista mostra estas colunas:

| Coluna | O que mostra |
|---|---|
| **Chave** | O nome da chave e, abaixo dele, a parte pública |
| **Onde vale** | A organização, o projeto ou a unidade em que a chave funciona |
| **Permissões** | Quantas permissões a chave tem, por exemplo "3 permissões" |
| **Último uso** | Quando a chave foi usada pela última vez, ou "Nunca usada" |
| **Expira em** | A data de validade |
| **Situação** | **Ativa**, **Expirada**, **Revogada** ou **Revogada (dono removido)** |

O **Último uso** é atualizado no máximo uma vez por minuto, então pode mostrar um horário um pouco anterior ao da última chamada.

![Página Chaves de API](/guide/api-keys-list.jpg)

*Na tela: **Configurações → Chaves de API**.*

## Passo a passo

![Diálogo Nova chave de API com nome, onde vale, validade e permissões](/guide/api-keys-dialog.jpg)

*O diálogo **Nova chave de API**: **Nome**, **Onde vale**, **Validade** e **Permissões**.*

### Criar uma chave

1. Abra **Configurações → Chaves de API**.
2. Clique em **Nova chave**. O botão fica desativado enquanto você estiver sem conexão.
3. Em **Nome**, escreva algo que ajude a reconhecer a chave depois, por exemplo "Exportação de relatórios". Use no máximo 80 caracteres.
4. Em **Onde vale**, escolha a organização, um projeto ou uma unidade. Se mudar esse campo, as permissões já marcadas são desmarcadas, porque o que você pode conceder depende do nível.
5. Em **Validade**, escolha **30 dias**, **90 dias**, **180 dias** ou **365 dias**. O padrão é 90 dias. Logo abaixo aparece a data exata em que a chave vai expirar.
6. Em **Permissões**, marque só o que a integração precisa. É obrigatório marcar pelo menos uma.
7. Clique em **Criar chave**.
8. Na tela seguinte, aparece o aviso "Esta é a única vez que a chave aparece". Use **Copiar** e guarde a chave em um cofre de segredos.
9. Marque **Copiei e guardei a chave em lugar seguro**. O botão **Concluir** só fica disponível depois disso.
10. Clique em **Concluir**. Ao fechar a janela, a chave completa deixa de existir na tela.

### Revogar uma chave

1. Abra **Configurações → Chaves de API**.
2. Na linha da chave, clique em **Revogar**. O botão só aparece em chaves com situação **Ativa**.
3. Confirme em **Revogar chave**.

A revogação vale na hora: as integrações que usam essa chave param de funcionar imediatamente. Não é possível reativar uma chave revogada. Se precisar, crie outra.

### Usar a chave na API

1. Envie a chave no cabeçalho `Authorization` de cada requisição, no formato `Authorization: Bearer <sua-chave>`. A API não lê chaves enviadas na URL.
2. Use o mesmo endereço do app web, seguido de `/v1`, por exemplo `https://app.exemplo.com.br/v1/...`. Troque `app.exemplo.com.br` pelo endereço da sua instalação.
3. Envie e receba dados em JSON.

## Exemplo

Exemplo: uma rede de lojas quer que o ERP da matriz crie um projeto no app sempre que abre uma nova filial e consulte a lista de projetos todas as noites. O administrador cria a chave "ERP da matriz", válida na organização, por 90 dias, com as permissões de ver e criar projetos e de ver as notas do módulo de exemplo.

Nos comandos abaixo, a chave fica em uma variável de ambiente, para não aparecer no histórico do terminal. A chave, os IDs e o endereço são fictícios.

```bash
export CHAVE_API="core_K7QX2M4PZ6AB_q1W2e3R4t5Y6u7I8o9P0a1S2d3F4g5H6j7K8l9Z0x1C"
export BASE="https://app.exemplo.com.br/v1"
export ORG="Jd8sK2lPq0WnR5tYu3bV"
```

### 1. Listar os projetos (com paginação)

```bash
curl -s "$BASE/organizations/$ORG/projects?limit=20" \
  -H "Authorization: Bearer $CHAVE_API"
```

Resposta `200`:

```json
{
  "data": [
    {
      "id": "Pq4rS6tU8vW0xY2zA1bC",
      "tenantId": "Jd8sK2lPq0WnR5tYu3bV",
      "name": "Filial Centro",
      "description": "Operação da loja do centro.",
      "status": "active",
      "settings": { "timeZone": "America/Sao_Paulo" },
      "createdAt": "2026-09-29T14:30:00.000Z",
      "updatedAt": "2026-09-29T15:00:00.000Z"
    }
  ],
  "meta": {
    "page": { "cursor": "c2VndW5kYS1wYWdpbmE", "hasMore": true, "limit": 20 }
  }
}
```

Listas usam paginação por cursor:

- `limit` define quantos itens vêm por página, de 1 a 100. O padrão é 20.
- Se `meta.page.hasMore` for `true`, peça a próxima página repetindo a chamada com `cursor` igual ao valor de `meta.page.cursor`.
- Quando não há mais páginas, `cursor` vem `null` e `hasMore` vem `false`.

```bash
curl -s "$BASE/organizations/$ORG/projects?limit=20&cursor=c2VndW5kYS1wYWdpbmE" \
  -H "Authorization: Bearer $CHAVE_API"
```

### 2. Criar um projeto com Idempotency-Key

Para criar algo sem correr o risco de duplicar quando a rede falha, envie o cabeçalho `Idempotency-Key` com um ULID: um identificador de 26 caracteres gerado pela sua integração, diferente para cada operação nova.

```bash
curl -s -X POST "$BASE/organizations/$ORG/projects" \
  -H "Authorization: Bearer $CHAVE_API" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 01JB2Q7Y5C8N4V6T3R9W0XKZ1M" \
  -d '{
    "name": "Filial Norte",
    "description": "Nova loja aberta em outubro.",
    "settings": { "timeZone": "America/Manaus" }
  }'
```

Resposta `201`:

```json
{
  "data": {
    "id": "Fn3kT8wQ2zR6yU1pL4mA",
    "tenantId": "Jd8sK2lPq0WnR5tYu3bV",
    "name": "Filial Norte",
    "description": "Nova loja aberta em outubro.",
    "status": "active",
    "settings": { "timeZone": "America/Manaus" },
    "createdAt": "2026-10-05T12:00:00.000Z",
    "updatedAt": "2026-10-05T12:00:00.000Z"
  }
}
```

Como a `Idempotency-Key` funciona:

- Se você repetir a mesma requisição com a mesma chave em até 24 horas, recebe a mesma resposta da primeira vez, sem criar um segundo projeto.
- Se reutilizar a mesma chave com dados diferentes, recebe `409 IDEMPOTENCY_KEY_REUSED`. Gere outra chave.
- Se a primeira requisição ainda estiver em andamento, recebe `409 IDEMPOTENCY_REQUEST_IN_PROGRESS` com `Retry-After: 1`. Espere um segundo e repita.

### 3. Ler as notas do módulo de exemplo

Módulos instalados também podem publicar rotas na API. O módulo de exemplo tem uma rota que lista as notas da organização. Para isso, a chave precisa da permissão `example.note.read`.

```bash
curl -s "$BASE/organizations/$ORG/notes?limit=10" \
  -H "Authorization: Bearer $CHAVE_API"
```

Resposta `200`:

```json
{
  "data": [
    {
      "id": "Xk2mQ9vLr3TnB7pWc1aZ",
      "tenantId": "Jd8sK2lPq0WnR5tYu3bV",
      "authorId": "uA1b2C3d4E5f6G7h8I9j",
      "title": "Conferir estoque",
      "body": "Conferir a contagem da filial na segunda-feira.",
      "createdAt": "2026-09-29T14:30:00.000Z",
      "updatedAt": "2026-09-29T14:30:00.000Z"
    }
  ],
  "meta": {
    "page": { "cursor": null, "hasMore": false, "limit": 10 }
  }
}
```

### Como os erros chegam

Toda falha da API vem no mesmo formato. Use o `code` para decidir o que fazer. A `message` é um texto curto em inglês, e o `requestId` serve para a equipe técnica achar a requisição nos registros.

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "One or more fields are invalid.",
    "details": [{ "field": "name", "issue": "TOO_SMALL" }],
    "requestId": "01JB2QA4M7F3H8S2D6K9P0RTVW"
  }
}
```

Toda resposta também traz o cabeçalho `X-Request-Id` com o mesmo identificador.

### O que a chave não acessa

A chave de API funciona apenas nas rotas abertas a integrações, como projetos, unidades, conectores, base de conhecimento, fluxos e as rotas de módulos. Algumas rotas aceitam somente pessoas conectadas. Nelas, uma chave recebe `403 FORBIDDEN`. Entre essas rotas estão:

- o chat e as conversas (`/v1/chat` e `/v1/conversations`): **não é possível enviar mensagens ao assistente usando uma chave de API**;
- a gestão das próprias chaves: criar, listar e revogar chaves só é possível pela tela **Configurações → Chaves de API**.

### Onde está a especificação completa

A descrição completa de todas as rotas, campos e erros fica no arquivo OpenAPI `docs/openapi/v1.yaml`, no repositório de código do app. Ele é gerado a partir dos mesmos contratos que a API usa para validar as requisições. Se você não tem acesso ao repositório, peça o arquivo à equipe técnica responsável pela instalação.

## Dicas e boas práticas

- **Uma chave por integração.** Assim você revoga só a integração afetada, sem derrubar as outras.
- **Dê o mínimo de permissões.** Uma integração que só lê dados não precisa de permissões de escrita.
- **Limite o lugar.** Se a integração só trabalha em um projeto, escolha esse projeto em **Onde vale**, e não a organização inteira.
- **Guarde a chave em um cofre de segredos.** Nunca coloque a chave em código-fonte, planilhas compartilhadas, e-mails ou mensagens de chat.
- **Planeje a troca antes do vencimento.** Crie a nova chave, atualize a integração e só depois revogue a antiga. Acompanhe a coluna **Expira em**.
- **Confira o Último uso.** Uma chave que aparece como "Nunca usada" há muito tempo provavelmente pode ser revogada.
- **Suspeita de vazamento?** Revogue a chave na hora e crie outra. O prefixo fixo (`core_` ou o da sua instalação) facilita encontrar chaves vazadas em registros e repositórios.
- **Lembre que a chave depende de quem a criou.** Se a pessoa perder uma permissão, a chave também perde. Se a pessoa sair da organização, a chave é revogada. Para integrações de longo prazo, combine com a equipe quem será a pessoa dona das chaves.
- **Repita com segurança.** Em operações que criam algo, envie sempre uma `Idempotency-Key` e reutilize a mesma ao repetir a mesma operação.

## Erros comuns

| Mensagem/código | O que significa | Como resolver |
|---|---|---|
| "Dê um nome à chave." | O campo **Nome** ficou vazio | Escreva um nome |
| "Use no máximo 80 caracteres." | O nome passou de 80 caracteres | Encurte o nome |
| "Escolha pelo menos uma permissão." | Nenhuma permissão foi marcada | Marque ao menos uma permissão |
| `ESCALATION_FORBIDDEN` ("Você não pode conceder permissões que não possui.") | Você tentou dar à chave uma permissão que você não tem no nível escolhido | Escolha só permissões que você tem, ou peça a permissão a um administrador |
| `401 UNAUTHORIZED` | A chave está ausente, foi digitada errada, expirou ou foi revogada | Confira o cabeçalho `Authorization: Bearer`, a situação e a validade da chave na lista |
| `403 FORBIDDEN` | A chave não tem a permissão necessária, a rota está fora de **Onde vale**, a dona da chave perdeu a permissão ou a rota não aceita chaves (como o chat) | Revise as permissões e o nível da chave, ou use a rota pela interface do app |
| `404 NOT_FOUND` | O recurso não existe ou a chave não pode vê-lo | Confira os IDs e o nível em que a chave vale |
| `400 VALIDATION_FAILED` | Algum campo do corpo, da URL ou do cabeçalho é inválido; `details` lista cada problema | Corrija os campos indicados em `details` |
| `400 VALIDATION_FAILED` com `"field": "Idempotency-Key", "issue": "INVALID_FORMAT"` | A `Idempotency-Key` não é um ULID | Gere um ULID válido de 26 caracteres |
| `409 IDEMPOTENCY_KEY_REUSED` | A mesma `Idempotency-Key` foi enviada com dados diferentes | Gere uma nova chave para a nova operação |
| `409 IDEMPOTENCY_REQUEST_IN_PROGRESS` | A primeira requisição com essa chave ainda não terminou | Aguarde o tempo de `Retry-After` e repita |
| `429 RATE_LIMITED` | Muitas tentativas de autenticação falharam a partir do mesmo endereço de rede (o limite é de 20 por minuto) | Corrija a chave, espere o tempo indicado em `Retry-After` e tente de novo |
| `500 INTERNAL_ERROR` | Falha inesperada no servidor | Tente de novo mais tarde; se persistir, envie o `requestId` à equipe técnica |

## Veja também

- [Papéis](/docs/roles)
- [Organizações](/docs/organizations)
- [Unidades](/docs/units)
- [Módulos](/docs/modules)
- [Dispositivos e app desktop](/docs/devices)
- [Glossário](/docs/glossary)
