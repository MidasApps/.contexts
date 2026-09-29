# Anexos de metodologia — conteúdo preservado

> **Este documento existe para que nada se perdesse.** Em 2026-08-06 as três
> telas de anexo (`/attachments/rating`, `/attachments/pdd`,
> `/attachments/eligibility`) saíram do produto. Eram páginas React com o texto
> escrito no código: não consultavam dado nenhum, não tinham como variar por
> cliente e não podiam ser editadas por quem entende do assunto — só por quem
> edita `.tsx` e faz deploy.
>
> Num produto cuja tese é relatório dinâmico montado na admin, conteúdo fixo em
> código é a exceção que contradiz a regra. O texto abaixo é o conteúdo integral
> das três telas, transcrito sem alteração.

## Como colocar isto de volta no ar (sem voltar ao código)

O renderizador de blocos já tem bloco de texto (`kind: 'text'`, em
`src/pages/explore/ui/blocks/TextBlock.tsx`). Então o caminho é o mesmo de
qualquer outra página do produto:

1. criar um relatório na admin para o grupo desejado;
2. adicionar blocos de texto e colar o conteúdo abaixo;
3. liberar a rota `/g` ao grupo — que já é liberada hoje.

O resultado é editável por quem entende de crédito, versionado no Firestore com
trilha de autoria, e varia por cliente. Nenhuma das três coisas era verdade nas
telas removidas.

---

## 1. Metodologia do Rating Liquid

*Como a classificação de risco proprietária da Liquid (A a H) é calculada a
partir do comportamento de pagamento.*

### Fatores avaliados

Para determinar o rating, avaliamos vários fatores do histórico de pagamentos
dos contratos, como:

- Quantos dias o cliente demora para pagar uma parcela;
- Qual foi o maior atraso que o cliente já teve entre as parcelas;
- Como o cliente costuma pagar as parcelas em atraso dentro de diferentes
  intervalos de tempo (por exemplo, 5-30 dias, 30-60 dias, etc.);
- A porcentagem de parcelas que o cliente pagou em dia versus aquelas que o
  cliente atrasou;
- A média e a variação dos seus atrasos nos pagamentos;

dentre outras.

### Escala de rating

Em seguida, utilizamos a equação de regressão logística que desenvolvemos. Essa
equação combina todas as variáveis usando pesos específicos, que foram
determinados durante a fase de treinamento do modelo. Como resultado temos um
valor de score, específico para o setor imobiliário.

Transformamos o score numérico em uma letra de A a H. Cada faixa de score
corresponde a uma dessas letras, com cada letra representando um nível de risco
de default. Por exemplo:

| Rating | Score | Risco de default |
|---|---|---|
| A | 900 - 1000 | Baixo Risco |
| B | 800 - 899 | Baixo a Moderado Risco |
| C | 700 - 799 | Moderado Risco |
| D | 600 - 699 | Moderado a Alto Risco |
| E | 500 - 599 | Alto Risco |
| F | 400 - 499 | Muito Alto Risco |
| G | 300 - 399 | Quase Certo de Default |
| H | 0 - 299 | Default / Perda Certa |

---

## 2. Metodologia da PDD

*Conceitos e escala de provisão: PDD Liquid, PDD Mínima Bacen e percentuais por
rating (Resolução 2682).*

### Conceito de PDD

O indicador contábil Provisão para Devedores Duvidosos é a estimativa de perda
que pode ocorrer devido ao não recebimento, parcial ou total, de um fluxo de
caixa esperado de um ativo de crédito.

A PDD Liquid é o valor de provisão quando consideramos a probabilidade de
inadimplência associada ao rating do modelo Liquid. A PDD adicional (Delta PDD)
é a diferença entre a PDD Liquid e a PDD Mínima Bacen. Nesta análise, não foi
considerada a possível recuperação de valores no caso de inadimplência (LGD -
Loss Given Default).

### Escala de provisão (Resolução 2682)

A PDD Mínima Bacen é calculada de acordo com a Resolução 2682, na qual o rating
é dado de acordo com os dias de atraso da operação. A0 para os contratos sem
atraso, A1 para atrasos até 14 dias e assim por diante.

Cada rating Bacen está associado a um percentual de provisão:

| Rating | Dias de atraso | Percentual de provisão |
|---|---|---|
| A0 | N/A | 0,00% |
| A1 | Até 14 dias | 0,50% |
| B | 15 a 30 dias | 1,00% |
| C | 31 a 60 dias | 3,00% |
| D | 61 a 90 dias | 10,00% |
| E | 91 a 120 dias | 30,00% |
| F | 121 a 150 dias | 50,00% |
| G | 151 a 180 dias | 70,00% |
| H | > 180 dias | 100,00% |

---

## 3. Critérios de elegibilidade

*Definição das categorias de elegibilidade para securitização: critérios de
atraso, LTV, prazo e índice de correção.*

| Elegibilidade | Atraso | LTV | Prazo decorrido | Prazo remanescente | Índice |
|---|---|---|---|---|---|
| Elegível | Sem atraso | Menor que 90% | ≥ 6 meses | ≥ 6 meses | Possui Índice de Correção Monetária |
| Elegibilidade Possível | Com atraso | Menor que 90% | ≥ 6 meses | ≥ 6 meses | Possui Índice de Correção Monetária |
| Elegibilidade Futura | Sem atraso | ≥ 90% | Menor que 6 meses | ≥ 6 meses | Possui Índice de Correção Monetária |
| Elegibilidade Futura Possível | Com atraso | ≥ 90% | Menor que 6 meses | ≥ 6 meses | Possui Índice de Correção Monetária |
| Carteira Inelegível (No Index) | Sem atraso | Menor que 90% | ≥ 6 meses | ≥ 6 meses | Sem Índice de Correção Monetária |
| Carteira Inelegível | Com qualquer tipo de atraso | Qualquer LTV | Qualquer Prazo Decorrido | Qualquer Prazo Remanescente | Sem Índice de Correção Monetária |
