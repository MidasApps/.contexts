# Rastros (traces)

Um rastro é o registro detalhado de tudo o que aconteceu numa execução de agente ou de fluxo: cada etapa, cada chamada a modelo e cada ferramenta usada, com tempo e tokens. Esta página mostra como encontrar um rastro, como ler a árvore de etapas e como usar os rastros para investigar uma resposta ruim.

## O que é

Sempre que um agente responde ou um fluxo roda na sua organização, a plataforma grava um **rastro**. Cada rastro é formado por **spans**: cada span é uma operação, como a execução do agente, uma chamada ao modelo, uma ferramenta ou uma etapa de fluxo. Os spans formam uma árvore, com cada operação dentro da operação que a chamou.

Para cada rastro e cada span você vê:

- o nome da operação e o tipo (por exemplo `agent_run`, `model_generation`, `tool_call`, `workflow_step`);
- o status: **OK** ou **Erro**. O rastro inteiro fica com **Erro** quando qualquer span falhou;
- o modelo usado, nos spans de chamada a modelo;
- a duração. Enquanto a operação ainda roda, aparece **Em execução**;
- os tokens de entrada e de saída;
- o custo;
- a **Entrada e saída** da operação, já com dados sensíveis removidos.

Você só vê rastros da sua própria organização. Um rastro de outra organização aparece como não encontrado.

**Sobre o custo:** hoje, o custo por rastro e por span aparece como **—** (preço desconhecido). O custo exato do mês fica em [Uso e orçamento](/docs/usage), que soma o custo de cada chamada a modelo.

## Quem pode usar

Para ver a página e os rastros, você precisa da permissão Ver traces dos agentes (`core.trace.read`).

A equipe da plataforma tem uma área própria de rastros, com acesso a logs. Na área da organização não há página de logs.

## Onde encontrar

- Menu: **Configurações → Operação → Rastros**.
- Endereço da lista: `/o/{organização}/settings/traces`.
- Página de um rastro: `/o/{organização}/settings/traces/{id do rastro}`. O id do rastro tem 32 caracteres hexadecimais (números de 0 a 9 e letras de a a f).

![Lista de rastros](/guide/traces-list.jpg)

*Na tela: **Configurações → Rastros**.*

## Passo a passo

### Encontrar um rastro

1. Abra **Configurações → Operação → Rastros**.
2. A tabela mostra as colunas **Rastro**, **Agente ou fluxo**, **Status**, **Início**, **Duração**, **Tokens (entrada / saída)** e **Custo**.
3. Use os filtros:
   - **Status**: **Todos os status**, **OK** ou **Erro**. O filtro vale na hora.
   - **Agente**: escolha um agente da lista ou **Qualquer agente**. Se a lista de agentes não carregar, digite o identificador do agente (por exemplo `assistant`) e clique em **Filtrar**.
4. Se nada aparecer, clique em **Limpar filtros**.
5. Clique no nome do rastro para abri-lo.

### Ler um rastro

1. No topo, veja o nome do rastro e o status.
2. O **Resumo do rastro** mostra **Agente ou fluxo**, **Início**, **Duração**, **Tokens (entrada / saída)**, **Custo** e **Id do rastro**.
3. Abaixo, a árvore de spans mostra quantos spans o rastro tem, por exemplo "7 spans".
4. Use a seta ao lado de um span para recolher ou expandir os spans que estão dentro dele.
5. Clique em **Entrada e saída** para ver o que a operação recebeu e devolveu. Esse bloco começa fechado.
6. Para voltar, clique em **Voltar aos rastros**.

### Investigar uma resposta ruim

Exemplo de roteiro quando alguém reclama de uma resposta errada ou lenta do assistente:

1. **Encontre o rastro.** Filtre pelo agente (por exemplo `assistant`) e procure pelo **Início** próximo do horário da conversa. Se a resposta falhou, filtre por **Erro**.
2. **Veja o status geral.** Um rastro com **Erro** tem pelo menos um span que falhou. Expanda a árvore até achar o span com **Erro**.
3. **Confira as ferramentas.** Spans do tipo `tool_call` mostram se o agente buscou na base de conhecimento ou chamou um conector. Abra **Entrada e saída** para ver o que foi pedido e o que voltou. Se a ferramenta não trouxe nada útil, o problema pode estar no conteúdo da [base de conhecimento](/docs/knowledge) ou no [conector](/docs/connectors).
4. **Confira o modelo.** Spans do tipo `model_generation` mostram o modelo usado e quantos tokens ele leu e escreveu. Muitos tokens de entrada indicam um contexto muito longo.
5. **Olhe a duração.** A duração de cada span mostra onde o tempo foi gasto. Uma ferramenta lenta costuma explicar uma resposta demorada.
6. **Registre o caso.** Anote o **Id do rastro**. Se quiser medir se o problema foi resolvido depois, transforme o caso num item de avaliação em [Avaliações (evals)](/docs/evals).

## Exemplo

Exemplo: numa clínica veterinária, uma recepcionista pergunta ao assistente qual é o horário de vacinação aos sábados. A resposta vem errada. A gerente abre **Rastros**, filtra pelo agente `assistant` e encontra o rastro da conversa.

A lista de rastros:

| Rastro | Agente ou fluxo | Status | Início | Duração | Tokens (entrada / saída) | Custo |
|---|---|---|---|---|---|---|
| agent run: assistant | Agente assistant | OK | 05/10/2026 09:00 | 2,4 s | 1.800 / 350 | — |
| agent run: assistant | Agente assistant | Erro | 05/10/2026 08:41 | 6,1 s | 2.950 / 0 | — |
| workflow run: knowledge-ingest | Fluxo knowledge-ingest | OK | 05/10/2026 08:10 | 12,8 s | 0 / 0 | — |

A árvore de spans do primeiro rastro:

| Span | Tipo | Status | Modelo | Duração | Tokens (entrada / saída) |
|---|---|---|---|---|---|
| agent run: assistant | `agent_run` | OK | — | 2,4 s | 1.800 / 350 |
| — tool: knowledge.searchKnowledge | `tool_call` | OK | — | 0,6 s | 0 / 0 |
| — model: generate | `model_generation` | OK | gemini-3.5-flash | 1,7 s | 1.800 / 350 |

Ao abrir **Entrada e saída** do span `knowledge.searchKnowledge`, a gerente vê que a busca trouxe a tabela de horários antiga. O problema não era o modelo: era um documento desatualizado na base de conhecimento.

O mesmo rastro, no formato que a API devolve:

```json
{
  "summary": {
    "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
    "tenantId": "Jd8sK2lPq0WnR5tYu3bV",
    "name": "agent run: assistant",
    "agentId": "assistant",
    "workflowId": null,
    "status": "ok",
    "spanCount": 3,
    "startedAt": "2026-10-05T12:00:00.000Z",
    "durationMs": 2400,
    "inputTokens": 1800,
    "outputTokens": 350,
    "costMicroUsd": null
  },
  "spans": [
    {
      "spanId": "00f067aa0ba902b7",
      "parentSpanId": null,
      "name": "agent run: assistant",
      "type": "agent_run",
      "status": "ok",
      "model": null,
      "input": null,
      "output": null,
      "startedAt": "2026-10-05T12:00:00.000Z",
      "durationMs": 2400,
      "inputTokens": 0,
      "outputTokens": 0,
      "costMicroUsd": null
    },
    {
      "spanId": "a1b2c3d4e5f60718",
      "parentSpanId": "00f067aa0ba902b7",
      "name": "tool: knowledge.searchKnowledge",
      "type": "tool_call",
      "status": "ok",
      "model": null,
      "input": { "query": "horário de vacinação sábado" },
      "output": { "results": 2 },
      "startedAt": "2026-10-05T12:00:00.100Z",
      "durationMs": 600,
      "inputTokens": 0,
      "outputTokens": 0,
      "costMicroUsd": null
    },
    {
      "spanId": "b2c3d4e5f6071829",
      "parentSpanId": "00f067aa0ba902b7",
      "name": "model: generate",
      "type": "model_generation",
      "status": "ok",
      "model": "gemini-3.5-flash",
      "input": null,
      "output": null,
      "startedAt": "2026-10-05T12:00:00.700Z",
      "durationMs": 1700,
      "inputTokens": 1800,
      "outputTokens": 350,
      "costMicroUsd": null
    }
  ]
}
```

Os tokens do resumo são a soma dos tokens de todos os spans. Os nomes dos spans e o conteúdo de **Entrada e saída** variam conforme o agente e as ferramentas; os valores acima são ilustrativos.

## Dicas e boas práticas

- Comece pelo filtro **Erro** quando alguém relatar uma falha. É o jeito mais rápido de achar o rastro certo.
- Abra **Entrada e saída** só quando precisar. O conteúdo pode ter dados de clientes, mesmo com os dados sensíveis (como senhas e chaves) removidos.
- Ao falar com o suporte, envie o **Id do rastro**. Ele identifica a execução sem expor o conteúdo da conversa.
- Para custo, use [Uso e orçamento](/docs/usage). Na tela de rastros, a coluna **Custo** mostra **—** por enquanto.
- Um rastro com **Em execução** na duração ainda não terminou. Recarregue a página depois de alguns segundos.

## Erros comuns

| Mensagem/situação | O que significa | Como resolver |
|---|---|---|
| "Rastro não encontrado" | O rastro não existe, o endereço tem um id inválido ou o rastro pertence a outra organização. | Confira o id (32 caracteres de 0-9 e a-f) e a organização aberta. Clique em **Voltar aos rastros**. |
| "Nenhum rastro com esses filtros" | Nenhum rastro combina com o agente e o status escolhidos. | Clique em **Limpar filtros**. |
| "Nenhum rastro ainda" | Nenhum agente ou fluxo da organização rodou ainda. | Use o chat ou inicie um fluxo e volte depois. |
| "Use letras minúsculas, números e hífens, começando por uma letra." | O identificador do agente digitado no filtro é inválido. | Digite o id do agente, por exemplo `assistant`. |
| "Nenhum span registrado" | O rastro não tem spans para mostrar. | Abra outro rastro da mesma execução, se houver. |
| Custo aparece como **—** | O custo por rastro ainda não é calculado nesta tela. | Consulte o custo em **Uso e orçamento**. |
| "Você não tem permissão para fazer isso." | Falta a permissão `core.trace.read`. | Peça a quem administra a organização para ajustar o seu papel. |

## Veja também

- [Uso e orçamento](/docs/usage)
- [Avaliações (evals)](/docs/evals)
- [Agentes](/docs/agents)
- [Base de conhecimento](/docs/knowledge)
- [Fluxos e agendamentos](/docs/workflows)
- [Glossário](/docs/glossary)
