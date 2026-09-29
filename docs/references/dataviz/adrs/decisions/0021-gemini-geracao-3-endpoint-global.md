---
id: 0021
title: Gemini geração 3 no endpoint global — migração dos quatro tiers antes da aposentadoria do 2.5
status: Accepted
date: 2026-08-12
deciders: [giulliano.soares]
consulted: [time-ai]
informed: [time-eng]
tags: [ai, vertex, modelos, latencia, residencia-de-dados, arquitetura]
related: [0019, 0020]
---

# ADR-0021 — Gemini geração 3 no endpoint `global`

## Status

Accepted — 2026-08-12.

## Contexto

**Gemini 2.5 Pro/Flash/Flash-Lite se aposentam em 16/10/2026.** Os quatro tiers
do `model-registry` dependiam dos três — não migrar tem data para quebrar.

Uma tentativa em 11/08/2026 foi revertida: o tier `reasoning` (usado por 5 dos 8
sub-agentes) não tinha substituto — `gemini-3.1-pro` e `gemini-3-flash` não
tinham acesso liberado nem no `global` — e a configuração torta que sobrou piorou
a latência da pergunta analítica de 22,4s para 65,3s.

Medição de 12/08/2026 contra o Vertex real (projeto `liquid-micro-apps`),
chamando cada modelo, não apenas listando:

| modelo | us-central1 | global |
|---|---|---|
| família 2.5 (flash-lite/flash/pro) | ✓ | ✓ |
| 3.5-flash-lite, 3.1-flash-lite | ✗ | ✓ |
| 3.6-flash, 3.5-flash, 3-flash-preview | ✗ | ✓ |
| **3.1-pro-preview** | ✗ | **✓** |
| 3-pro-preview | ✗ | ✗ |

Duas mudanças em relação a 11/08: `gemini-3.1-pro-preview` passou a responder —
o tier `reasoning` ganhou substituto pela primeira vez — e `gemini-3-flash`
virou `gemini-3-flash-preview`, que funciona.

**Nenhum modelo da geração 3 responde em `us-central1`.** Testados um a um, todos
falham com `Publisher model … was not found`. Usar geração 3 obriga o endpoint
`global`.

Verificado que a troca de região **não** obriga reindexação: `gemini-embedding-001`
responde nas duas regiões com a mesma dimensão (3072).

## Decisão

1. **`GOOGLE_VERTEX_LOCATION=global`.** Todo o tráfego de IA passa pelo endpoint
   global. É decisão de residência de dados, tomada explicitamente pelo dono do
   produto — não consequência silenciosa de uma troca de modelo.

2. **Os quatro tiers migram:** `router` → `gemini-3.5-flash-lite`,
   `fast`/`flash` → `gemini-3.6-flash`, `reasoning` → `gemini-3.1-pro-preview`.

3. **O tier `reasoning` roda em modelo `preview`**, aceito conscientemente: é o
   único pro da geração 3 disponível, e a alternativa é ficar num modelo com data
   de aposentadoria marcada. Revisar quando sair um pro estável.

4. **O supervisor sai de `router` para `flash`.** A escolha vivia enterrada num
   `getModel('router')`, de quando ele só roteava; hoje orquestra 11 ferramentas
   de autoria (ADR-0020). Medido no fluxo completo, n=3, conversa nova:

   | tier | modelo | thinking | sucesso | mediana | blocos criados |
   |---|---|---|---|---|---|
   | router | 3.5-flash-lite | — | 3/3 | 4.555ms | 4 / **8** / **8** |
   | fast | 3.6-flash | default | 3/3 | 10.746ms | 4 / 4 / 4 |
   | fast | 3.6-flash | budget 2048 | 3/3 | 5.740ms | 4 / 4 / 4 |
   | **flash** | 3.6-flash | **budget 0** | 3/3 | **3.990ms** | 4 / 4 / 4 |

   O flash-lite duplica blocos em 2 de 3 rodadas — chama `add_kpi_block` duas
   vezes por indicador. O 3.6-flash sem deliberar fica **mais rápido que ele**
   (3.990ms × 4.555ms) e correto: o supervisor escolhe ferramenta e delega, quem
   delibera são os sub-agentes. Daí `flash` e não `fast` — é exatamente a razão
   de o tier `flash` existir separado, mesmo modelo com thinking próprio.

5. **"Sem thinking" passa a ser `thinkingBudget: 0`, não `undefined`.** Os tiers
   `router` e `flash` declaravam no comentário que priorizavam latência e
   mandavam `undefined` — que não envia `thinkingConfig` nenhuma e deixa valer o
   default do modelo, que na geração 3 é pensar. Passava despercebido porque o
   2.5-flash-lite já não pensava por padrão.

6. **O thinking viaja dentro do modelo, não no ponto de chamada.**
   `providerOptions` vive em `AgentExecutionOptions` — no `stream()`, não no
   construtor do `Agent`. Por isso `getProviderOptions` era consumido **apenas**
   pelo judge de evals e todo agente rodava no default do modelo. Passá-lo na
   rota cobriria só o supervisor: os 8 sub-agentes são invocados pelo próprio
   supervisor (chave `agents:`), dentro do runtime do Mastra, fora do alcance de
   qualquer opção da rota. `getModel(tier)` passa a devolver o modelo embrulhado
   em `defaultSettingsMiddleware` com o orçamento do tier — qualquer consumidor
   herda, e não há como esquecer. Verificado por `reasoningTokens`: `router` e
   `flash` em 0, `fast` em 367, `reasoning` em 441.

## Consequências

**Positivas.** O app sai do prazo de 16/10. O `router` fica mais rápido
(3.5-flash-lite mediu 1.099ms contra 1.286ms do 2.5-flash-lite). O fluxo de
autoria ficou **2,7× mais rápido** (10.746ms → 3.990ms) só por o thinking config
passar a chegar ao agente. A escolha de modelo do supervisor vira decisão nomeada
e medida, não herança.

**Negativas.** Residência de dados deixa de ser regional. O tier de raciocínio
depende de um modelo `preview`, que pode mudar sem aviso e não tem SLA.

**Efeito colateral bem-vindo.** Os tiers `fast` e `flash` são o mesmo modelo e
passam a diferir de verdade: medidos na mesma pergunta, 3.648ms (367 tokens de
raciocínio) contra 1.398ms (zero). A separação existia no código desde antes e
não fazia nada.

## Alternativas consideradas

- **Ficar em 2.5 até mais perto do prazo.** Rejeitada: a janela de correção
  encolhe, e a migração já provou ter efeitos não-óbvios (duplicação de blocos,
  latência) que exigem medição.
- **Migrar só os tiers rápidos e manter `reasoning` em 2.5-pro.** Rejeitada pelo
  dono do produto: deixaria metade do runtime com data de aposentadoria e
  obrigaria uma segunda migração.
- **Manter `us-central1`.** Não é alternativa: nenhum modelo da geração 3
  responde lá.
