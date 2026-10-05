# Avaliações (evals)

Avaliações medem a qualidade das respostas dos agentes de forma repetível. Em vez de testar o assistente "no olho", você monta um conjunto de perguntas com as respostas esperadas, roda o agente nesse conjunto e compara os resultados ao longo do tempo. Esta página explica os conceitos, como montar conjuntos de dados, como iniciar experimentos e como ler as notas.

## O que é

- **Conjunto de dados** (dataset): uma lista de itens para testar um agente. Cada item tem uma **Entrada** (a mensagem que o agente recebe) e, opcionalmente, uma **Resposta esperada** (a resposta que os avaliadores comparam com a do agente). Cada mudança no conjunto cria uma nova **Versão**.
- **Experimento**: uma rodada em que um agente responde a cada item de um conjunto de dados. O experimento usa o orçamento de IA da organização, como qualquer outra execução.
- **Avaliador** (scorer): uma regra que dá uma **nota** de 0% a 100% para as respostas. A tela mostra a média de cada avaliador.
- **Mínimo** (baseline): a nota mínima esperada de um avaliador.
- **Veredito**: **Aprovado** quando todos os avaliadores ficam no mínimo ou acima dele; **Reprovado** quando algum fica abaixo; **Pendente** quando o experimento não tem veredito.

### Os avaliadores da plataforma

| Avaliador | O que verifica | Disponível em |
|---|---|---|
| `tool-routing` | Se o agente chamou as ferramentas ou subagentes esperados e nenhum dos proibidos. | Modo simulado e modo real. |
| `citations-grounded` | Se cada citação da base de conhecimento na resposta vem de um trecho que a execução encontrou. | Modo simulado e modo real. |
| `tenant-leak` | Se apareceram dados de outra organização na resposta ou nos resultados das ferramentas. | Modo simulado e modo real. |
| `format-compliance` | Se a resposta existe, tem tamanho razoável, não vaza restos das instruções e usa marcadores de citação bem formados. | Modo simulado e modo real. |
| `faithfulness-judge` | Um modelo "juiz" mede a parte das afirmações da resposta que é sustentada pelas fontes encontradas e pela resposta esperada. | Só no modo de IA real. |

Os quatro primeiros avaliadores são **determinísticos**: seguem regras fixas e dão sempre a mesma nota para a mesma resposta. O `faithfulness-judge` usa um modelo de IA como juiz e só existe quando a plataforma roda com **modelos reais**. Em ambientes de teste, que usam **modo de IA simulado** (respostas falsas, sem chamar provedores), esse avaliador não aparece e as notas dos outros são previsíveis.

### O que a tela mostra hoje

- Experimentos registrados com notas e mínimos, como as avaliações de uma nova versão das instruções de um agente, mostram a nota de cada avaliador, o mínimo e o veredito **Aprovado** ou **Reprovado**.
- Experimentos iniciados por esta tela registram a rodada do agente no conjunto de dados, mas podem aparecer com **Sem notas** e veredito **Pendente**.

## Quem pode usar

| Ação | Permissão necessária |
|---|---|
| Ver experimentos, conjuntos de dados e itens | Ver avaliações (`core.eval.read`) |
| Iniciar experimento, criar, renomear e excluir conjuntos, adicionar e excluir itens | Iniciar avaliações (`core.eval.write`) |

Para avaliar um agente, ele precisa estar habilitado para a organização. O assistente principal sempre pode ser avaliado. Veja [Agentes](/docs/agents).

## Onde encontrar

- Menu: **Configurações → Operação → Avaliações**.
- Endereço: `/o/{organização}/settings/evals`.
- Aba de conjuntos de dados: `/o/{organização}/settings/evals?tab=datasets`.
- Itens de um conjunto: `/o/{organização}/settings/evals?tab=datasets&dataset={conjunto}`.

![Página Avaliações](/guide/evals-list.jpg)

*Na tela: **Configurações → Avaliações**.*

## Passo a passo

### Criar um conjunto de dados

1. Abra **Configurações → Operação → Avaliações**.
2. Clique na aba **Conjuntos de dados**.
3. Clique em **Novo conjunto de dados**.
4. Digite o **Nome** e clique em **Criar**.
5. A mensagem "Conjunto {nome} criado." aparece e a lista de itens do conjunto abre.

Um conjunto novo começa vazio e é avaliado com o assistente.

### Adicionar itens

1. Na lista de itens do conjunto, clique em **Adicionar item**.
2. Em **Entrada**, escreva a mensagem que o agente recebe.
3. Em **Resposta esperada (opcional)**, escreva a resposta que os avaliadores devem comparar.
4. Clique em **Adicionar**. A mensagem "Item adicionado." confirma.

Cada texto aceita até 4.000 caracteres. Experimentos novos usam a versão atual do conjunto.

Para excluir um item, clique em **Excluir** na linha dele e confirme em **Excluir item**. Experimentos já feitos mantêm os resultados.

### Renomear ou excluir um conjunto

1. Na aba de conjuntos de dados, na linha do conjunto, clique em **Renomear**, digite o novo **Nome** e clique em **Salvar nome**. Os experimentos já feitos continuam ligados ao conjunto.
2. Para excluir, clique em **Excluir** na linha e confirme em **Excluir conjunto**. O conjunto e todos os itens dele são apagados.

Só é possível excluir um conjunto em que nenhum experimento rodou; caso contrário aparece "Já rodaram avaliações com este conjunto." Isso preserva o sentido dos resultados antigos. O conjunto **feedback** não tem esses botões: ele recebe as respostas avaliadas no chat e é recriado automaticamente.

### Criar itens a partir do chat

Quando alguém clica em **Resposta ruim** no chat e marca **Usar esta resposta nas avaliações da organização**, a conversa vira um item do conjunto **feedback** da organização. Veja [Assistente (chat)](/docs/chat). Esse conjunto é criado no primeiro uso. Assim você reúne casos reais de respostas ruins para testar depois.

### Iniciar um experimento

1. Clique em **Iniciar experimento**, no topo da página.
2. Escolha o **Conjunto de dados**.
3. Escolha o **Agente**. Só o assistente e os agentes habilitados para a organização aparecem.
4. Clique em **Iniciar**.
5. A mensagem "Experimento {id} iniciado." aparece. O experimento entra **Na fila**, passa para **Em andamento** e termina como **Concluído** ou **Falhou**.

### Ler os experimentos

A aba **Experimentos** mostra as colunas **Experimento**, **Conjunto de dados**, **Status**, **Veredito**, **Itens**, **Notas por avaliador**, **Início** e **Fim**.

Em **Notas por avaliador**, cada linha mostra o avaliador, a média e, quando existe, o mínimo. Por exemplo: "tool-routing: 94% (mínimo 90%)".

### Comparar dois experimentos

1. Na aba **Experimentos**, clique em **Comparar** em um experimento. Ele passa a mostrar **Na comparação**.
2. Clique em **Comparar** em um segundo experimento, de qualquer página.
3. A **Comparação de experimentos** mostra as notas por avaliador lado a lado.
4. Para recomeçar, clique em **Limpar comparação**.

## Exemplo

Exemplo: uma rede de lojas usa o assistente para responder dúvidas da equipe sobre trocas e devoluções. A coordenadora de atendimento cria o conjunto `trocas-e-devolucoes` com itens como estes:

| Entrada | Resposta esperada |
|---|---|
| Qual o prazo para trocar um produto com defeito? | Segundo a política interna, o prazo é de 30 dias a partir da compra. |
| O cliente pode trocar sem a nota fiscal? | Não. A troca exige a nota fiscal ou o comprovante da compra. |
| Como registro uma devolução no sistema? | Sem resposta esperada |

Os textos acima são ilustrativos: use as regras reais da sua empresa.

Depois de atualizar as instruções do assistente, a equipe roda as avaliações e compara dois experimentos:

| Experimento | Conjunto de dados | Status | Veredito | Itens | Notas por avaliador |
|---|---|---|---|---|---|
| exp_01J8Z3K4M5 | trocas-e-devolucoes | Concluído | Aprovado | 18 | tool-routing: 94% (mínimo 90%) |
| exp_01J8Y2H3G4 | trocas-e-devolucoes | Concluído | Reprovado | 18 | tool-routing: 83% (mínimo 90%) |
| exp_01J8Z9Q8R7 | trocas-e-devolucoes | Em andamento | Pendente | 18 | Sem notas |

O primeiro experimento, no formato que a API devolve:

```json
{
  "experimentId": "exp_01J8Z3K4M5",
  "datasetId": "trocas-e-devolucoes",
  "agentId": "assistant",
  "promptVersionId": null,
  "status": "completed",
  "itemCount": 18,
  "scores": [
    { "scorer": "tool-routing", "mean": 0.94, "baseline": 0.9 }
  ],
  "verdict": "passed",
  "startedAt": "2026-10-05T12:00:00.000Z",
  "finishedAt": "2026-10-05T12:03:00.000Z"
}
```

As notas vão de 0 a 1 na API (`0.94`) e aparecem em porcentagem na tela (94%). O veredito é **Aprovado** porque a única nota ficou acima do mínimo. No experimento reprovado, `tool-routing` ficou em 83%, abaixo do mínimo de 90%: o agente deixou de usar a ferramenta certa em parte das perguntas.

Um item adicionado ao conjunto, como a API recebe:

```json
{
  "input": "O cliente pode trocar sem a nota fiscal?",
  "expectedOutput": "Não. A troca exige a nota fiscal ou o comprovante da compra."
}
```

## Dicas e boas práticas

- Comece com 10 a 30 itens que representem as perguntas mais comuns e as mais delicadas.
- Escreva a **Resposta esperada** sempre que houver uma resposta certa. Sem ela, os avaliadores têm menos com o que comparar.
- Use o conjunto **feedback** para transformar respostas ruins reais em casos de teste.
- Rode o mesmo conjunto antes e depois de mudar as instruções de um agente, e use **Comparar** para ver o efeito.
- Não trate a nota como "certo ou errado". Uma queda pequena pode ser variação do modelo; uma queda grande merece investigação nos [Rastros (traces)](/docs/traces).
- Lembre que cada experimento consome o orçamento de IA da organização. Veja [Uso e orçamento](/docs/usage).

## Erros comuns

| Mensagem/situação | O que significa | Como resolver |
|---|---|---|
| "Esta organização ainda não tem conjuntos de dados, então não há o que avaliar." | Não há conjunto para escolher. | Crie um conjunto e adicione itens. |
| "Este agente não está habilitado para a organização. Habilite-o em Agentes ou escolha outro." | O agente escolhido não está habilitado. | Habilite o agente em **Agentes** ou escolha o assistente. |
| "Este conjunto de dados não existe mais nesta organização. Escolha outro." | O conjunto foi removido ou é de outra organização. | Escolha outro conjunto. |
| "Esta organização já tem um conjunto com esse nome." | O nome do conjunto já está em uso. | Escolha outro nome. |
| "Informe a entrada." | O campo **Entrada** do item está vazio. | Escreva a mensagem que o agente recebe. |
| "Execute uma avaliação aprovada antes de ativar esta versão." | Uma nova versão das instruções do agente precisa de um experimento **Aprovado** antes de ser ativada. | Rode a avaliação da versão e corrija o que ficou abaixo do mínimo. |
| "Este agente ainda não tem um conjunto de avaliação." | Não existe conjunto para avaliar este agente. | Crie um conjunto de dados para ele. |
| "O orçamento de IA da organização acabou. Fale com um administrador." | O limite mensal foi atingido; o experimento não consegue rodar. | Veja [Uso e orçamento](/docs/usage). |
| "Sem notas" na coluna de notas | O experimento ainda está rodando ou não registrou notas. | Aguarde o fim. Se continuar sem notas, compare pelas respostas dos rastros. |
| "Você não tem permissão para fazer isso." | Falta `core.eval.read` ou `core.eval.write`. | Peça a quem administra a organização para ajustar o seu papel. |

## Veja também

- [Agentes](/docs/agents)
- [Rastros (traces)](/docs/traces)
- [Chat](/docs/chat)
- [Uso e orçamento](/docs/usage)
- [Base de conhecimento](/docs/knowledge)
- [Glossário](/docs/glossary)
