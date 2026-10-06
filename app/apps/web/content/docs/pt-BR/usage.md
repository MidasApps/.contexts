# Uso e orçamento

Os agentes de IA consomem modelos de linguagem, e cada chamada a um modelo gasta tokens e tem um custo. Esta página mostra como acompanhar o uso e o custo da sua organização mês a mês, como funcionam os limites mensais (orçamento) e o que acontece quando um limite é atingido.

## O que é

A página **Uso e orçamento** reúne, para um mês:

- **Totais do mês**: custo, tokens, chamadas a modelos e chamadas sem preço;
- **Orçamento**: quanto do limite mensal de gasto e de tokens já foi usado;
- **Uso por modelo**, **Custo por dia**, **Uso por agente** e **Uso por usuário**;
- **Limite próprio da organização**, para quem pode ajustá-lo.

Alguns conceitos:

- **Token**: pedaço de texto que o modelo lê (tokens de entrada) ou escreve (tokens de saída). Quanto mais longa a conversa e a resposta, mais tokens.
- **Chamada a modelo**: cada vez que um agente, fluxo ou processo da plataforma usa um modelo.
- **Custo**: calculado pelo preço de cada modelo. Os valores aparecem em **dólares americanos (USD)**, arredondados para o centavo.
- **Chamadas sem preço**: chamadas a modelos sem preço cadastrado. Elas não entram no custo, mas os tokens delas contam para o limite de tokens.

O uso inclui todos os agentes e fluxos da organização. Os meses e os dias são contados em UTC.

## Quem pode usar

- Para ver a página, você precisa da permissão Ver o uso (`core.usage.read`).
- Para definir o **Limite próprio da organização**, você precisa poder ver e alterar as configurações de agentes (`core.agent-settings.read` e `core.agent-settings.update`). Sem essas permissões, a seção não aparece.
- Para ver o nome das pessoas em **Uso por usuário**, você também precisa poder ver os membros. Sem isso, aparece o identificador da pessoa.

## Onde encontrar

- Menu: **Configurações → Operação → Uso e orçamento**.
- Endereço: `/o/{organização}/settings/usage`.

![Página Uso e orçamento](/guide/usage-overview.jpg)

*Na tela: **Configurações → Uso e orçamento**.*

## Passo a passo

### Ver o uso de um mês

1. Abra **Configurações → Operação → Uso e orçamento**.
2. Em **Mês**, escolha o mês. A lista traz o mês atual, marcado como "(mês atual)", e os 11 meses anteriores.
3. Leia os **Totais do mês**:
   - **Custo**: chamadas sem preço conhecido não entram no custo;
   - **Tokens**: soma dos tokens de entrada e de saída;
   - **Chamadas a modelos**: inclui todos os agentes e fluxos;
   - **Chamadas sem preço**: contam só para o limite de tokens.
4. Confira o quadro **Orçamento** (veja abaixo).
5. Desça até as tabelas de detalhe para ver onde o uso se concentra.

### Ler o orçamento

O quadro **Orçamento** mostra os limites mensais em vigor hoje, com uma barra para cada um:

- **Gasto no mês**: quanto já foi gasto, comparado ao limite de gasto;
- **Tokens no mês**: quantos tokens já foram usados, comparados ao limite de tokens.

Cada barra tem um estado:

| Estado | O que significa |
|---|---|
| Dentro do limite | O uso está abaixo de 80% do limite. |
| Perto do limite | O uso passou de 80% de um limite mensal. |
| Limite atingido | O uso chegou ao limite. Novas execuções são recusadas. |

Quando um limite está perto ou foi atingido, aparece um aviso no topo do quadro, por exemplo **O uso está perto do limite** ou **O limite mensal foi atingido**.

### Ver o detalhe do uso

- **Uso por modelo**: colunas **Modelo**, **Provedor**, **Chamadas**, **Tokens de entrada**, **Tokens de saída** e **Custo**.
- **Custo por dia**: o custo conhecido de cada dia do mês que teve chamadas (dias em UTC). Dias sem chamadas não aparecem.
- **Uso por agente**: colunas **Agente**, **Chamadas**, **Tokens** e **Custo**, do maior custo para o menor. Inclui agentes, fluxos e processos que chamaram modelos.
- **Uso por usuário**: colunas **Usuário**, **Chamadas**, **Tokens** e **Custo**. O uso de tarefas automáticas aparece como **Processos da plataforma**.

### Definir um limite próprio

A organização pode definir um limite mensal **menor** que o do plano. Não é possível ultrapassar o limite do plano.

1. Na seção **Limite próprio da organização**, veja a situação atual:
   - "Sem limite próprio: valem os limites do plano."
   - ou "Limite próprio em vigor: {gasto} e {tokens} tokens por mês."
2. Em **Limite de gasto mensal**, digite o valor em dólares americanos. O valor inicial do campo é o limite em vigor hoje.
3. Em **Limite mensal de tokens**, digite um número inteiro de tokens por mês.
4. Clique em **Salvar limite**. A mensagem "Limite próprio salvo." confirma.

Para voltar aos limites do plano:

1. Clique em **Remover limite próprio**.
2. Na janela **Remover o limite próprio da organização?**, confirme em **Remover limite**.
3. A mensagem "Limite próprio removido. Voltam a valer os limites do plano." confirma.

### O que acontece quando o orçamento acaba

O limite é verificado antes de cada execução de agente. Quando o gasto **ou** os tokens do mês chegam ao limite:

- novas execuções de agentes são recusadas até o próximo mês ou até o limite ser ampliado no plano da organização;
- no chat, a resposta aparece como **Resposta bloqueada**, com a mensagem "O orçamento de IA da organização acabou. Fale com um administrador.";
- a voz no chat também é recusada pelo mesmo motivo.

Basta **um** dos dois limites ser atingido para bloquear. Uma organização pode ficar sem orçamento por tokens mesmo com gasto baixo, por exemplo quando usa muitos modelos sem preço cadastrado.

Se o plano não define limites, valem os limites padrão da plataforma: **USD 50,00** de gasto e **20.000.000** de tokens por mês.

## Exemplo

Exemplo: uma escola de idiomas usa o assistente para preparar exercícios e responder dúvidas de alunos. Em setembro, a coordenação abre **Uso e orçamento** e escolhe o mês.

Totais do mês:

| Custo | Tokens | Chamadas a modelos | Chamadas sem preço |
|---|---|---|---|
| US$ 41,30 | 17.250.000 (14.900.000 de entrada e 2.350.000 de saída) | 9.812 | 0 |

Orçamento (limites padrão de USD 50 e 20 milhões de tokens):

| Limite | Uso | Estado |
|---|---|---|
| Gasto no mês | US$ 41,30 de US$ 50,00 (83%) | Perto do limite |
| Tokens no mês | 17.250.000 de 20.000.000 (86%) | Perto do limite |

Uso por agente:

| Agente | Chamadas | Tokens | Custo |
|---|---|---|---|
| assistant | 9.540 | 16.980.000 | US$ 40,90 |
| knowledge-ingest | 272 | 270.000 | US$ 0,40 |

Uso por usuário:

| Usuário | Chamadas | Tokens | Custo |
|---|---|---|---|
| Marina Costa | 5.120 | 9.400.000 | US$ 22,10 |
| Rafael Alves | 4.420 | 7.580.000 | US$ 18,80 |
| Processos da plataforma | 272 | 270.000 | US$ 0,40 |

Os mesmos dados no formato da API. O custo vem em micro-dólares (`costMicroUsd`): 1 dólar equivale a 1.000.000 de micro-dólares, então `41300000` é US$ 41,30.

```json
{
  "tenantId": "Jd8sK2lPq0WnR5tYu3bV",
  "month": "2026-09",
  "totals": {
    "calls": 9812,
    "inputTokens": 14900000,
    "outputTokens": 2350000,
    "costMicroUsd": 41300000,
    "unpricedCalls": 0
  },
  "budget": {
    "monthlyMicroUsd": 50000000,
    "monthlyTokens": 20000000,
    "alertThresholdPercent": 80
  },
  "byModel": [
    {
      "provider": "google",
      "model": "gemini-3.5-flash",
      "totals": {
        "calls": 9812,
        "inputTokens": 14900000,
        "outputTokens": 2350000,
        "costMicroUsd": 41300000,
        "unpricedCalls": 0
      }
    }
  ],
  "byDay": [
    {
      "day": "2026-09-30",
      "totals": {
        "calls": 402,
        "inputTokens": 610000,
        "outputTokens": 98000,
        "costMicroUsd": 1700000,
        "unpricedCalls": 0
      }
    }
  ],
  "byAgent": [
    {
      "agentId": "assistant",
      "totals": {
        "calls": 9540,
        "inputTokens": 14700000,
        "outputTokens": 2280000,
        "costMicroUsd": 40900000,
        "unpricedCalls": 0
      }
    }
  ],
  "byUser": [
    {
      "userId": null,
      "totals": {
        "calls": 272,
        "inputTokens": 200000,
        "outputTokens": 70000,
        "costMicroUsd": 400000,
        "unpricedCalls": 0
      }
    }
  ]
}
```

Como o uso passou de 80%, a coordenação decide criar um limite próprio menor para outubro, de US$ 40,00 e 15.000.000 de tokens, e avisa os professores para revisar os pedidos mais longos.

## Dicas e boas práticas

- Acompanhe a página no começo e no meio do mês. O aviso de 80% dá tempo de agir antes do bloqueio.
- Use **Uso por agente** e **Uso por usuário** para descobrir de onde vem a maior parte do custo.
- Fique atento às **Chamadas sem preço**: elas não aparecem no custo, mas consomem o limite de tokens.
- Um limite próprio ajuda a controlar gastos, mas também pode bloquear o assistente antes do fim do mês. Combine o valor com quem usa a plataforma.
- Para ver o consumo de uma única resposta, abra o rastro dela em [Rastros (traces)](/docs/traces).
- Para ampliar o limite do plano, fale com quem administra o plano da organização. Pela tela, a organização só consegue diminuir o limite.

## Erros comuns

| Mensagem/situação | O que significa | Como resolver |
|---|---|---|
| "O orçamento de IA da organização acabou. Fale com um administrador." | O gasto ou os tokens do mês chegaram ao limite. | Aguarde o próximo mês, remova o limite próprio (se houver) ou peça a ampliação do limite do plano. |
| "O limite informado é maior que o do plano. Informe valores iguais ou menores que os limites em vigor." | O limite próprio passou do limite do plano. | Digite valores iguais ou menores que os limites em vigor. |
| "Informe o limite de gasto." | O campo de gasto está vazio ou inválido. | Digite um valor em dólares, por exemplo 40,00. |
| "Informe um número inteiro de tokens." | O campo de tokens está vazio ou tem casas decimais. | Digite um número inteiro. |
| "Nenhum uso neste mês" | Nenhum agente respondeu no mês escolhido. | Escolha outro mês ou aguarde o primeiro uso. |
| "Você não tem permissão para fazer isso." | Falta a permissão para ver o uso ou alterar o limite. | Peça a quem administra a organização para ajustar o seu papel. |

## Veja também

- [Rastros (traces)](/docs/traces)
- [Agentes](/docs/agents)
- [Chat](/docs/chat)
- [Fluxos e agendamentos](/docs/workflows)
- [Organizações](/docs/organizations)
- [Glossário](/docs/glossary)
