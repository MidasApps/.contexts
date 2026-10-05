# Administração: clientes

Esta página cobre as áreas do grupo **Clientes** da administração da plataforma: **Organizações**, **Planos** e **Usuários**. Nelas a equipe acompanha o gasto de cada organização, define os limites dos planos, ajusta orçamentos, suspende organizações e faz o acesso de suporte. Para saber quem pode entrar na administração, veja [Administração da plataforma](/docs/admin).

Os valores em dinheiro aparecem na tela em dólares (US$). Nos exemplos em JSON, que mostram os dados como a API os envia, o dinheiro vem em micro-dólares: `50000000` equivale a US$ 50,00.

## Organizações

**Para que serve:** ver o status, o plano, o custo no mês e o orçamento de cada organização, e abrir uma delas para trocar o plano, ajustar o orçamento ou suspender o acesso.

- **URL:** `/admin/organizations` (lista) e `/admin/organizations/<id da organização>` (detalhe)
- **Permissão para ver:** `platform.organization.read`, dos papéis `platform-admin` e `platform-support`.
- **Permissão para alterar:** `platform.organization.update`, só do `platform-admin`.

![Lista de organizações na administração](/guide/admin-organizations.jpg)

*Na tela: `/admin/organizations`.*

### A lista

A tabela tem as colunas **Organização** (nome e id), **Status** (**Ativa** ou **Suspensa**), **Plano**, **Custo no mês**, **Limite mensal**, **Uso do limite** e **Ações**.

Abaixo do limite mensal aparece de onde ele vem:

- **Do plano**: vale o limite do plano atribuído.
- **Ajuste da equipe**: alguém da equipe definiu um orçamento só para esta organização.
- **Padrão da plataforma**: a organização não tem plano, então valem os limites padrão.

A coluna **Uso do limite** mostra **Sem limite**, o percentual de uso, **Atenção** (por exemplo, "Atenção: 82%") a partir de 80% do limite ou **Acima do limite** (por exemplo, "Acima do limite: 104%") a partir de 100%. Em 100% as execuções de IA da organização param.

Passo a passo para encontrar uma organização:

1. Em **Buscar organização**, digite palavras do nome ou o id.
2. Se quiser, escolha um **Status**.
3. Na linha da organização, clique em **Abrir**.

Se nada aparecer, você verá "Nenhuma organização com esses filtros". Clique em **Limpar filtros** para ver todas.

Exemplo de lista:

| Organização | Status | Plano | Custo no mês | Limite mensal | Uso do limite |
|---|---|---|---|---|---|
| Clínica Exemplo | Ativa | Padrão | US$ 41,20 | US$ 50,00 (Do plano) | Atenção: 82% |
| Escola Modelo | Ativa | Padrão da plataforma | US$ 3,10 | US$ 20,00 (Padrão da plataforma) | 16% |
| Loja Fictícia | Suspensa | Avançado | US$ 0,00 | US$ 200,00 (Ajuste da equipe) | 0% |

A primeira linha, como a API a envia:

```json
{
  "id": "Or1aB2cD3eF4gH5iJ6kL",
  "name": "Clínica Exemplo",
  "status": "active",
  "planId": "Pl1aB2cD3eF4gH5iJ6kL",
  "budget": {
    "caps": { "monthlyMicroUsd": 50000000, "monthlyTokens": 20000000 },
    "source": "plan",
    "override": null
  },
  "costMtdMicroUsd": 41200000
}
```

### O detalhe da organização

A seção **Resumo** mostra **Status**, **Plano**, **Custo no mês**, **Limite mensal**, **Limite de tokens no mês**, **Uso do limite** e **Membros** (pessoas com acesso).

Se o seu papel só permite consultar, você verá: "Seu papel na equipe só permite consultar. Plano, orçamento e status são alterados por um administrador da plataforma."

Com `platform.organization.update`, aparecem mais três seções.

**Trocar o plano**

1. Em **Plano**, escolha o **Plano da organização**. A opção **Padrão da plataforma (sem plano)** remove o plano.
2. Clique em **Salvar plano**. A troca vale na hora e fica na auditoria.

O orçamento segue o plano, a menos que exista um ajuste da equipe.

**Ajustar o orçamento**

1. Em **Ajuste de orçamento**, preencha **Gasto mensal com modelos** (em dólares) e **Tokens por mês**.
2. Clique em **Salvar ajuste**. Aparece, por exemplo, "Orçamento de Clínica Exemplo ajustado."
3. Para desfazer, clique em **Voltar ao plano** e confirme em **Remover ajuste**. Os limites voltam a ser os do plano. Se o plano for menor que o gasto do mês, as execuções param.

O ajuste salvo, como a API o recebe:

```json
{ "override": { "monthlyMicroUsd": 100000000, "monthlyTokens": 40000000 } }
```

**Suspender ou reativar**

1. Em **Status**, clique em **Suspender organização**.
2. Leia o aviso: todos os membros perdem o acesso até a reativação. Nenhum dado é apagado.
3. Confirme em **Suspender**.
4. Para devolver o acesso, clique em **Reativar organização** e confirme em **Reativar**. Os membros voltam a ter acesso na hora.

Por fim, **Ver esta organização em** traz atalhos para outras áreas já filtradas por esta organização: Agentes e prompts, Conectores, Workflows, Traces, Flags e Custos. Só aparecem as áreas que o seu papel pode abrir.

Exemplo: a Clínica Exemplo chegou a 82% do limite em meados do mês e pediu mais margem. Você abre a organização, salva um ajuste de US$ 100,00 e 40.000.000 tokens, e a origem do limite passa a **Ajuste da equipe**.

### Cuidados

- "Informe um valor em dólares, por exemplo 100,00." O gasto mensal não está em um formato válido.
- "Informe um número inteiro de tokens, por exemplo 20.000.000."
- Suspender afeta todos os membros da organização imediatamente. Confira o nome no título da confirmação antes de clicar em **Suspender**.
- Remover o ajuste com o gasto do mês acima do limite do plano faz as execuções pararem. Os membros então recebem "O orçamento de IA da organização acabou. Fale com um administrador."

## Planos

**Para que serve:** definir os limites de gasto, tokens e conectores que cada plano concede às organizações.

- **URL:** `/admin/plans`
- **Permissão:** `platform.plan.manage`, só do `platform-admin`.

A tabela tem as colunas **Plano**, **Gasto mensal**, **Tokens por mês**, **Conectores**, **Funcionalidades**, **Atualizado em** e **Ações**.

![Página Planos](/guide/admin-plans.jpg)

*Na tela: `/admin/plans`.*

### Criar um plano

1. Clique em **Novo plano**.
2. Preencha os campos:
   - **Nome**.
   - **Gasto mensal com modelos**: em dólares. As execuções param ao atingir o valor.
   - **Tokens por mês**: vale quando o modelo não tem preço cadastrado.
   - **Máximo de conectores**.
   - **Máximo de agentes personalizados**, **Máximo de habilidades personalizadas** e **Tamanho máximo das instruções (caracteres)**: deixe em branco para usar o padrão da plataforma.
   - **Funcionalidades**: chaves separadas por vírgula, por exemplo `web-tools, chat.voice`.
3. Clique em **Criar plano**. Aparece, por exemplo, "Plano Padrão criado."

Para atribuir o plano, abra a organização em **Organizações** e use **Salvar plano**.

### Editar um plano

1. Na linha do plano, clique em **Editar**.
2. Altere os campos e clique em **Salvar plano**.

Salvar substitui os limites do plano e atualiza o orçamento de todas as organizações que o usam. Não há como excluir um plano nesta área.

Exemplo de plano, como a API o recebe:

```json
{
  "name": "Padrão",
  "limits": {
    "monthlyMicroUsd": 50000000,
    "monthlyTokens": 20000000,
    "maxConnectors": 5,
    "features": ["web-tools"]
  }
}
```

| Plano | Gasto mensal | Tokens por mês | Conectores | Funcionalidades |
|---|---|---|---|---|
| Padrão | US$ 50,00 | 20.000.000 | 5 | web-tools |
| Avançado | US$ 200,00 | 80.000.000 | 15 | web-tools, chat.voice |

### Cuidados

- Sem nenhum plano cadastrado, você verá "Nenhum plano cadastrado". Nesse caso, as organizações usam os limites padrão da plataforma.
- Editar um plano muda o orçamento de todas as organizações que o usam, menos as que têm um ajuste da equipe.

## Usuários

**Para que serve:** encontrar um usuário e fazer acesso de suporte como ele, em uma organização, em modo somente leitura e com auditoria.

- **URL:** `/admin/users`
- **Permissões:** `platform.user.read` (buscar e ver sessões) e `platform.user.impersonate` (iniciar e encerrar sessões). Os papéis `platform-admin` e `platform-support` têm as duas.

O aviso **Acesso auditado** lembra que cada sessão e cada página aberta como o usuário ficam registradas na auditoria da plataforma e da organização.

![Página Usuários](/guide/admin-users.jpg)

*Na tela: `/admin/users`.*

### Buscar um usuário

1. Em **Nome, e-mail ou id**, digite o início do nome ou do e-mail, ou o id completo da conta.
2. Em **Buscar por**, deixe **Automático** ou escolha **Nome**, **E-mail** ou **Id do usuário**.
3. Clique em **Buscar**.

A busca compara o início do texto, sem diferenciar maiúsculas ou acentos. No modo **Automático**, um texto com @ é lido como e-mail, e um id completo traz só aquele usuário.

Exemplo de resultado para a busca "ana":

| Usuário | E-mail | Situação |
|---|---|---|
| Ana Souza | ana@exemplo.com | Ativo |
| Ana Lima | ana.lima@exemplo.com | Desativado |

A primeira linha, como a API a envia:

```json
{
  "id": "uid-ana-0001",
  "email": "ana@exemplo.com",
  "displayName": "Ana Souza",
  "status": "active",
  "createdAt": "2026-09-29T14:30:00.000Z"
}
```

Se nada aparecer, você verá "Nenhum usuário encontrado". A busca só encontra nomes e e-mails que começam com o texto digitado.

### Iniciar o acesso de suporte

1. Na linha do usuário, clique em **Selecionar**. Para escolher outro, use **Trocar**.
2. Em **Iniciar acesso como usuário**, escolha a **Organização**, preencha o **Motivo** (10 a 500 caracteres) e a **Duração em minutos** (1 a 60).
3. Clique em **Iniciar sessão**.
4. Em **Sessão aberta nesta aba**, clique em **Abrir o app como este usuário**.

O passo a passo completo, como sair e o que fica registrado estão em [Administração da plataforma](/docs/admin).

### Sessões da equipe

Em **Sessões de acesso de suporte**, escolha em **Mostrar** entre **Abertas agora** e **Todas, mais recentes primeiro**. Cada linha mostra **Equipe**, **Usuário**, **Organização**, **Motivo**, **Início**, **Fim** e a **Situação** (**Aberta**, **Encerrada** ou **Expirada**). Use **Encerrar** para fechar uma sessão aberta.

### Cuidados

- "Este usuário não existe ou não tem acesso a essa organização." Escolha uma organização da qual o usuário seja membro.
- "Você não pode iniciar esta sessão. Não é possível acessar como você mesmo, e a ação exige o papel de suporte."
- Enquanto a aba estiver no modo suporte, a administração não abre nela. Saia do modo suporte primeiro.

## Veja também

- [Administração da plataforma](/docs/admin)
- [Administração: IA](/docs/admin-ai)
- [Administração: operações](/docs/admin-operations)
- [Organizações](/docs/organizations)
- [Uso e limites](/docs/usage)
- [Membros](/docs/members)
