---
title: Custo
category: rules
version: 1.0
last_updated: 2026-08-04
status: active
related: [rules/performance, contracts/semantic-layer, stacks/ai/harness-engineering]
---

# Custo — tetos de BigQuery e de LLM

> **Por que este documento existe.** `harness-engineering.md:111` delegava
> orçamentos de custo a "@rules/governance", e `governance.md` não tinha seção
> de custo. Na prática havia quatro tetos, em quatro arquivos que não se
> conversavam, com quatro números diferentes — e a tool de SQL de uso geral,
> exposta a todos os agentes, não tinha teto nenhum. Os achados R1 e R2 da
> revisão de 2026-08-04 são consequência direta desta lacuna.

## Dois mecanismos que não se substituem

| | Gate de **cobrança** | Gate de **aprovação** |
|---|---|---|
| O quê | `maximumBytesBilled` na query | dry-run + confirmação do usuário |
| Quando age | o BigQuery **recusa o job antes de faturar** | antes de submeter, pergunta |
| Falha como | `bytesBilledLimitExceeded` | usuário decide |
| Onde | `maxBytesBilled()` em `shared/lib/bigquery/cost-guard.ts` | `approvalBytesThreshold()`, no mesmo arquivo |

Eles **coexistem de propósito**. Um limita o prejuízo máximo; o outro dá
visibilidade antes do gasto. Consolidar os dois num só remove uma das duas
propriedades — não faça.

E o limiar de aprovação fica **sempre abaixo do teto**. Com os dois em 5 GiB,
todo job grande o bastante para pedir aprovação era recusado pelo teto depois
de aprovado. Subir o teto do job aprovado foi descartado: o teto é o prejuízo
máximo, e uma aprovação não pode fazê-lo desaparecer. Por isso o default do
limiar é **derivado do teto** (metade dele), a env só vale abaixo do teto, e
estimativa acima do teto é recusada sem pedir aprovação (não haveria o que
aprovar).

## Regras

- **Todo caminho que executa SQL passa `maximumBytesBilled`.** Sem exceção, e
  especialmente onde o SQL foi gerado por modelo: o filtro de palavra-chave
  impede escrita, não impede varrer a tabela inteira. Isto vale tanto para a
  tool exposta ao agente quanto para a execução de métrica — a recipe pode ter
  nascido de LLM e sido persistida. O teto fica à vista na própria chamada
  (`maximumBytesBilled: String(maxBytesBilled())`), não escondido num `...opts`:
  `shared/lib/bigquery/__tests__/query-byte-cap.test.ts` confere, estaticamente,
  toda chamada `.query(`/`createQueryJob(`/`createQueryStream(`/`createJob(` de
  `src/` e `app/` (dry-run é a única exceção — não é faturado). Teto só num ramo
  de spread condicional, `undefined` ou em comentário não conta. O erro de teto
  chega ao modelo pela mensagem acionável de `formatToolError`. Os scripts
  operacionais em `scripts/` ficam fora da checagem.

- **Teto vem de fonte única.** `maxBytesBilled()`. Não copie o número: este
  repositório já pagou duas vezes por helper duplicado (o `getToken()` em três
  arquivos que produziu o 401 do export de PDF, e as oito cópias de
  `verifyAuth`).

- **Configuração inválida nunca vira "sem teto".** Env ausente, zero, negativa
  ou não-numérica cai no default. O modo de falha de um teto é ficar *mais*
  restritivo, jamais desaparecer. Isso tem teste.

- **Número novo precisa de precedente ou de justificativa escrita.** O default
  de 5 GiB veio do limiar de aprovação que o canvas praticava (aposentado na
  ADR-0020). Inventar um
  número novo em cada arquivo foi exatamente como se chegou aos quatro tetos
  desconexos.

- **Erro de teto é acionável para quem o lê.** Quando quem recebe a mensagem é
  um modelo, ela diz o que mudar ("estreite o escopo, filtre por
  `data_base_report` e projeto"), não repete o erro cru do BigQuery. Erro
  ininteligível gera repetição, e repetição gera custo.

- **Operação cara tem freio de frequência e de concorrência.** Ver
  `shared/lib/rate-limit.ts`. Taxa e concorrência resolvem problemas
  diferentes: taxa contém abuso ao longo do tempo; concorrência contém o que
  derruba o processo agora (dois Chrome disputando memória).

- **Limite por instância declara que é por instância.** O contador em memória
  não sobrevive a escala horizontal: com N instâncias o limite efetivo é N×.
  É escolha válida de MVP — desde que escrita, para ninguém a confundir com
  proteção contra abuso distribuído.

- **Contexto de LLM tem teto de tamanho, não só de turnos.** Contar mensagens
  não limita custo: uma mensagem pode ser enorme. O orçamento é em caracteres
  (`compact-messages.ts`), e o corte mais agressivo entre tamanho e contagem é
  o que vale.

## Tetos vigentes

| Teto | Valor | Onde |
|---|---|---|
| Bytes faturáveis por query | 5 GiB (`BQ_MAX_BYTES_BILLED`) | `bigquery/cost-guard.ts` |
| Aprovação BQML | metade do teto (2,5 GiB; `BQML_APPROVAL_BYTES_THRESHOLD`, só abaixo do teto) **ou** custo dos bytes do dry-run > US$ 5 (`BQML_APPROVAL_COST_USD`; com o teto padrão o treino custa no máximo ~US$ 1,3, então o gate em US$ só age com `BQ_MAX_BYTES_BILLED` mais alto) | `bigquery/cost-guard.ts` → `tools/bqml/create-or-use-model.ts` |
| Orçamento de eval | US$ 30/dia, bloqueio em 1,2× | `evals/runner/cost-budget.ts` |
| Contexto por turno | 120 000 caracteres (≈30k tokens) | `ai-agents/lib/compact-messages.ts` |
| Taxa: chat / PDF | 20 / 5 por minuto por usuário | `shared/lib/rate-limit.ts` (chamado em `api/chat` e `api/export-pdf`) |
| Concorrência: export de PDF | 2 simultâneos | `shared/lib/rate-limit.ts` |

Mudou um número? Mude aqui também. Uma tabela desatualizada é pior que tabela
nenhuma, porque as pessoas confiam nela.

## Checklist

- [ ] Caminho novo que executa SQL passa `maximumBytesBilled` via `maxBytesBilled()`.
- [ ] Nenhum número de teto foi copiado — veio do helper.
- [ ] Env inválida cai no default (com teste).
- [ ] Operação cara nova tem freio de taxa e, se consome recurso do processo, de concorrência.
- [ ] A tabela acima foi atualizada.

## Dívida conhecida

Não há observabilidade de custo de LLM: nenhum token, custo ou latência é
medido nas duas rotas de IA (achado R6). Os tetos acima limitam o gasto; nada
ainda o **mede**. Enquanto isso não existir, gasto anormal só aparece na fatura.
