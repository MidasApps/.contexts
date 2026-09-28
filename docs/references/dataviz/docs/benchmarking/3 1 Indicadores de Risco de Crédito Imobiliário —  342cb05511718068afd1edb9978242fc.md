# 3.1 Indicadores de Risco de Crédito Imobiliário — Práticas de Mercado

O mercado imobiliário brasileiro emprega um ecossistema sofisticado de indicadores, modelos e regulações para mensurar e monitorar risco de crédito em carteiras de recebíveis — sistema que passou por transformação estrutural em janeiro de 2025 com a adoção do modelo de perda esperada (Resolução CMN 4.966/2021, alinhada ao IFRS 9). A inadimplência do crédito imobiliário atingiu mínima histórica de **1,0% (Over 90)** em 2024, sustentada pela alienação fiduciária e emprego aquecido, porém o cenário de Selic a 15% e o dobro de defaults em CRIs em 2024 sinalizam atenção crescente. Este relatório consolida indicadores-padrão, modelos de risco, metodologias de projeção, benchmarks de referência e o arcabouço regulatório vigente, constituindo uma base de engenharia de contexto completa para diagnóstico, simulação e compliance de carteiras imobiliárias.

---

## 1. Indicadores-padrão e suas fórmulas de cálculo

### Inadimplência por faixa de atraso

O mercado brasileiro segmenta a inadimplência em buckets padronizados — Over 30, Over 60, Over 90, Over 120 e Over 180 — alinhados à classificação de risco da Resolução CMN 2.682/99. O indicador-padrão do BACEN é o **Over 90 dias**, reportado como percentual do saldo devedor total. A métrica principal é ponderada por saldo, não por quantidade de contratos.

**Fórmula por saldo devedor:**

```
Inadimplência (>X dias) = Σ Saldo Devedor (contratos com atraso > X dias) / Σ Saldo Devedor Total × 100
```

**Fórmula por contagem:**

```
Inadimplência (>X dias) = Nº de contratos com atraso > X dias / Nº total de contratos ativos × 100
```

Uma regra especial aplica-se a **operações de longo prazo** (prazo remanescente >36 meses): os prazos de atraso para reclassificação podem ser contados em dobro (Art. 4º, §1º da Res. 2.682), o que é particularmente relevante para financiamentos imobiliários com prazos de 15 a 30 anos.

| Faixa de Atraso | Nível Mínimo de Risco (Res. 2.682) | Provisão Mínima |
| --- | --- | --- |
| 0 dias (adimplente) | AA ou A | 0% ou 0,5% |
| 15–30 dias | B | 1% |
| 31–60 dias | C | 3% |
| 61–90 dias | D | 10% |
| 91–120 dias | E | 30% |
| 121–150 dias | F | 50% |
| 151–180 dias | G | 70% |
| >180 dias | H | 100% |

### LTV (Loan-to-Value)

O LTV mede a relação entre o valor financiado e o valor do imóvel em garantia, sendo o indicador-chave de severidade de perda.

```
LTV = (Saldo Devedor + Dívidas Preexistentes sobre o Imóvel) / Valor de Avaliação do Imóvel × 100%
```

A evolução do LTV ao longo do tempo resulta de quatro forças: amortização do principal (reduz LTV), valorização do imóvel (reduz LTV), correção monetária do saldo por IPCA/IGPM/TR (pode aumentar LTV) e depreciação do imóvel em ciclos recessivos (aumenta LTV). A atualização de valores utiliza laudos de avaliação conforme ABNT NBR 14653, modelos automatizados (AVM) baseados no FIPEZAP ou IVG-R do BACEN, ou reajuste por índices regionais. Para CRIs, agências de rating podem exigir reavaliações a cada 1-3 anos.

### DSCR — Índice de Cobertura do Serviço da Dívida (ICSD)

```
DSCR = Receita Operacional Líquida (NOI) / Serviço da Dívida (Principal + Juros)
```

Para estruturas de CRI:

```
ICSD = (Caixa + Fluxo de Caixa Operacional) / Serviço da Dívida do CRI
```

O DSCR abaixo de **1,0x** indica fluxo insuficiente para cobrir a dívida. Covenants típicos de CRI exigem ICSD mínimo de **1,1x–1,2x**, e a violação pode acionar evento de avaliação ou vencimento antecipado. A Austin Rating classifica como baixo risco ICSD >1,2x.

### CPR e CDR — Taxas de pré-pagamento e default

O **CPR (Conditional Prepayment Rate)** é a taxa anualizada de pré-pagamento voluntário, e o **CDR (Conditional Default Rate)** é a taxa anualizada de default do pool.

```
SMM = Amortização Extraordinária / (Saldo Início do Mês − Amortização Programada)
CPR = 1 − (1 − SMM)^12

MDR = Baixas por Default no Mês / Saldo Performing Início do Mês
CDR = 1 − (1 − MDR)^12
```

**Perda líquida:**

```
Perda = Saldo Defaultado × (1 − Taxa de Recuperação)
Taxa de Perda Líquida = CDR × Loss Severity
```

Hipotecas brasileiras historicamente apresentam CPR menor que o mercado americano, tipicamente **5–15% ao ano** para carteiras residenciais seasoned, devido à estrutura de alienação fiduciária, custos elevados de portabilidade e utilização bienal de FGTS como principal driver de amortização extraordinária.

### PDD — Provisão para Devedores Duvidosos

**Modelo antigo (Res. 2.682/99 — perda incorrida):**

```
PDD = Σ (Saldo Devedor_i × Percentual de Provisão do Nível de Risco_i)
```

**Modelo atual (Res. 4.966/21 — perda esperada, vigente desde jan/2025):**

```
PECLD = Σ (PD_i × LGD_i × EAD_i)
```

Com três estágios: **Stage 1** (risco normal → perda esperada de 12 meses), **Stage 2** (aumento significativo de risco, tipicamente >30 dias → perda esperada lifetime) e **Stage 3** (ativo problemático, >90 dias → perda esperada lifetime com LGD elevado).

A **PDD projetada** difere da regulatória por incorporar curvas históricas de default e recuperação por safra, matrizes de migração entre buckets, e ajustes prospectivos macroeconômicos — sendo utilizada internamente para gestão, precificação, alocação de capital e cálculo de RAROC.

Para **FIDCs e securitizadoras** (regulados pela CVM, não pelo BACEN), a PDD segue tabelas de aging específicas por classe de ativo. Uma tabela-padrão para FIDC imobiliário provisiona linearmente entre 31 e 119 dias (1,11%/dia) até atingir 100% em 120 dias.

---

## 2. Modelos de risco e metodologias de rating

### Scoring de crédito e segmentação comportamental

O Brasil possui quatro birôs principais — **Serasa Experian**, **SPC Brasil**, **Boa Vista** (Equifax) e **Quod** (dos 5 maiores bancos) — todos operando escala de **0 a 1.000 pontos**. Para financiamento imobiliário, score acima de **750** é recomendado para melhores condições; acima de 600 é possível com taxas superiores. A implementação do Cadastro Positivo elevou significativamente a acurácia dos scores ao incorporar histórico positivo de pagamentos.

Bancos combinam bureau scores com modelos internos proprietários (behavioral scores), verificação de renda (comprometimento máximo de **30% da renda** no SFH), estabilidade empregatícia, avaliação do imóvel e LTV. O SCR (Sistema de Informações de Crédito) do BACEN alimenta decisões de crédito com dados de exposição de todo o sistema financeiro.

### Modelos preditivos e curvas vintage

A **regressão logística** permanece como padrão regulatório e técnica mais amplamente utilizada para scoring no Brasil — reguladores ainda não permitem modelos de machine learning para cálculo de capital regulatório. Estudos acadêmicos brasileiros (Becker et al., 2020) demonstram que métodos de ensemble como **AdaBoost** e **Random Forest** superam a regressão logística em termos de AUC (67,4%) e acurácia (63,3%), sendo valiosos para gestão interna.

**Curvas vintage (safra)** são construídas agrupando contratos por período de originação (mês/trimestre), rastreando métricas (inadimplência acumulada, default, recuperação, pré-pagamento) ao longo de meses desde a originação (MOB — Months on Book). Para carteiras imobiliárias brasileiras, a curva típica de default acumulado tem formato **S-shaped** com plateau em níveis baixos, refletindo a eficácia da alienação fiduciária. Safras de crédito em fase de obra (Plano Empresário) apresentam risco front-loaded, enquanto financiamentos indexados ao IPCA mostram risco back-loaded por pressão inflacionária crescente sobre as prestações.

### Estimativa de PD, LGD e EAD

A **PD observada** para crédito imobiliário residencial no Brasil situa-se em **~1,0–1,4%** (Over 90, 2023-2024), entre as mais baixas do crédito ao consumidor. A **LGD** tende a ser relativamente baixa devido à alienação fiduciária — o processo extrajudicial de consolidação da propriedade leva 6-18 meses, com **taxas de recuperação estimadas em 40-70%** dependendo do LTV e tipo de imóvel (podendo chegar a 80-95% em mercados aquecidos com LTVs de 70-80%). A **EAD** para financiamentos de taxa fixa com amortização é o saldo devedor corrente; para operações indexadas ao IPCA, o saldo pode crescer nominalmente.

O Brasil ainda não possui bancos utilizando a abordagem **IRB** do Basileia — todos operam sob a Abordagem Padronizada. A Resolução BCB 303/2023 codifica regras IRB com LGD básica de **75%** (exposições sem garantia) ou **45%** (exposições seniores) e correlação de ativos R = 0,15 para hipotecas residenciais.

### Metodologias de agências de rating para CRI

As três grandes agências aplicam frameworks específicos para securitização imobiliária brasileira:

**S&P** utiliza a metodologia "Global Methodology and Assumptions: Assessing Pools of Residential Loans", avaliando frequência de default base e severidade de perda no nível 'B', com múltiplos de estresse por nível de rating. Analisa LTV, concentração geográfica, perfil do devedor e qualidade do servicer, modelando waterfall sequencial com subordinação e spread excedente.

**Moody's** aplica o **MILAN Framework** (Moody's Individual Loan Analysis) com análise loan-by-loan gerando perda esperada e MILAN Credit Enhancement (nível de subordinação necessário para Aaa), incorporando composição do pool, qualidade do servicer e ajustes de originação.

**Fitch** usa o Portfolio Credit Model (PCM) baseado em cópula gaussiana para comportamento conjunto de default, combinado com seu Multi-Asset Cash Flow Model que roda até **18 sub-cenários** cruzando timing de default (front/back-loaded), nível de pré-pagamento (alto/baixo) e movimento de taxa de juros (alta/queda/estável).

**Mecanismos de credit enhancement** típicos em CRI: subordinação (tranche sênior 70-95% da estrutura), spread excedente, fundos de reserva, patrimônio de afetação, alienação fiduciária do imóvel, e cessão fiduciária de recebíveis adicionais. **Múltiplos de estresse** para investiment-grade: 2-5× a taxa base de default; para AAA: 6-8×. Haircuts de recuperação: 20-50%.

---

## 3. Projeções de fluxo de caixa e cenários de estresse

### Modelagem de fluxo de caixa de recebíveis

A projeção mensal de fluxo de caixa para pools de recebíveis imobiliários segue uma estrutura sequencial:

1. **Saldo inicial** do período
2. **Juros programados**: taxa contratual ajustada pelo indexador (TR/IPCA/INCC/CDI)
3. **Amortização programada**: conforme sistema de amortização (SAC ou Price)
4. **Pré-pagamentos**: SMM × (Saldo Inicial − Amortização Programada)
5. **Defaults**: MDR × Saldo Performing Inicial → gera montante de perda
6. **Recuperações**: defasadas 6-18 meses, aplicando taxa de recuperação sobre defaults anteriores
7. **Saldo final** = Saldo Inicial − Amortização − Pré-pagamentos − Defaults
8. **Total arrecadado** distribuído conforme waterfall de pagamentos

O **risco de base** (basis risk) é crítico quando a indexação dos ativos (TR, INCC) difere da indexação do passivo (IPCA, CDI). Contratos indexados ao TR (correção próxima a zero nos últimos anos) lastreando CRIs indexados ao IPCA criam risco de spread negativo em cenários inflacionários. Contratos indexados ao INCC durante a fase de obra acumulam saldo devedor que pode superar a capacidade de pagamento do comprador no momento do habite-se.

### Cenários de stress test praticados

| Parâmetro | Caso Base | Estresse Moderado | Estresse Severo |
| --- | --- | --- | --- |
| CDR (anual) | 2–4% | 6–10% | 12–20% |
| CPR (anual) | 5–10% | 15–20% | 25%+ |
| Taxa de Recuperação | 50–70% | 35–50% | 20–35% |
| Prazo de Recuperação | 6–12 meses | 12–18 meses | 18–24 meses |
| IPCA | 4–5% | 7–8% | 10–12% |
| Selic | 10–13% | 15–16% | 18%+ |

O BACEN conduz testes de estresse integrados (Resolução 4.557) com horizonte de 3 anos, projetando impactos simultâneos de contração do PIB (−2% a −4%), aumento do desemprego (+4pp), choque de Selic (+400bps), queda de preços de imóveis (−20%) e IPCA elevado (+3pp). A Austin Rating utiliza thresholds específicos: sobrecolateralização de fluxo >140% (baixo risco) vs. <100% (alto risco); inadimplência >60 dias <5% do pool ou coberta 3x pela subordinação júnior; inadimplência >90 dias <3% ou coberta 5x.

### Montagem de pool e critérios de elegibilidade para cessão

A securitização imobiliária brasileira exige cessão formal dos recebíveis via **CCI (Cédula de Crédito Imobiliário)** à securitizadora, com registro no Cartório de Registro de Imóveis e instituição de **regime fiduciário** (patrimônio separado).

**Critérios de elegibilidade típicos** para cessão de recebíveis incluem: não ter 4 ou mais parcelas vencidas e não pagas; nenhuma parcela com atraso acima de 120 dias; LTV ponderado <70% (benchmark low risk); comprometimento de renda <30%; apólices MIP (Morte e Invalidez Permanente) e DFI (Danos Físicos ao Imóvel) vigentes; alienação fiduciária registrada e sem pendências; e matrícula do imóvel livre de ônus.

**Diversificação do pool**: a Austin Rating classifica como baixo risco pools com >100 contratos, >5 praças geográficas, seasoning médio >24 meses, e projeto concluído com habite-se emitido. Concentração por devedor é avaliada contra a subordinação — esta deve cobrir 5x as 5 maiores concentrações individuais.

---

## 4. Benchmarks, dados históricos e relações causais entre indicadores

### Inadimplência histórica do crédito imobiliário brasileiro

A série histórica da ABECIP para inadimplência do crédito imobiliário (>3 prestações em atraso) mostra uma trajetória de melhoria estrutural, com **pico de 8,5% em 2005** caindo para **mínima histórica de 1,0% em 2024**. A série SGS 21151 do BACEN (inadimplência >90 dias para financiamento imobiliário direcionado PF) é a referência oficial.

| Ano | Inadimplência (>90d) | Contexto |
| --- | --- | --- |
| 2005 | 8,5% | Pior nível da série ABECIP |
| 2015-2017 | 3,0–4,0% | Recessão, desemprego >13% |
| 2019 | ~2,0% | Início do ciclo de queda |
| 2023 | 1,4% | Recuperação pós-COVID |
| 2024 | 1,0% | Mínima histórica |
| Jul/2025 | ~1,1% | Leve alta, acompanhar |

O dado de atrasos totais (todas as faixas) atingiu **9,37%** em julho de 2025, indicando que há um contingente relevante em atraso inicial que cura antes de atingir 90 dias. A **Caixa Econômica Federal** (42,6% do mercado SBPE) reportou inadimplência de 1,19% em 2024 e 1,42% no 1T2025.

### Faixas de referência para diagnóstico de carteira

| Indicador | Saudável | Atenção | Crítico |
| --- | --- | --- | --- |
| Over 90 (crédito imobiliário) | <1,5% | 3,0–5,0% | >5,0% |
| Atrasos totais | <7% | 9–12% | >15% |
| LTV (originação) | <70% | 70–90% | >90% |
| DSCR/ICSD | >1,3x | 1,0–1,2x | <1,0x |
| Sobrecolateralização (fluxo) | >140% | 100–120% | <100% |
| Sobrecolateralização (saldo) | >120% | 100–120% | <100% |
| Subordinação | >10% | 5–10% | <5% |
| Fundo de Reserva | ≥2 PMTs | 1–2 PMTs | <1 PMT |
| DTI | <30% | 30–35% | >35% |

### Relações causais entre indicadores

**INCC → Inadimplência em recebíveis de incorporação**: Durante a fase de obra, o saldo devedor do comprador é corrigido pelo INCC. Quando o INCC dispara (6,85% acumulado em 2025 vs. IPCA de 4,56%), o saldo cresce mais rápido que a renda, gerando choque de pagamento no habite-se e aumento de distratos. Em 2024, defaults de CRI dobraram (58 casos entre abril e dezembro), concentrados em CRIs de desenvolvimento das safras 2021-2023.

**LTV elevado → Probabilidade de default**: Maior LTV significa menor "skin in the game" do devedor. Quando LTV >90%, qualquer queda de preço do imóvel gera patrimônio líquido negativo, incentivando o strategic default. A Austin Rating trata LTV >90% como alto risco e <70% como baixo risco. A redução temporária do LTV máximo de 80% para 70% pela Caixa em novembro de 2024 foi medida de mitigação durante stress de funding.

**Desemprego → Inadimplência**: A correlação é direta e forte. Na recessão 2015-2017 (desemprego >13%), a inadimplência subiu para 3-4%. No ciclo 2024-2025 (desemprego recorde baixo), a inadimplência caiu à mínima histórica. A Caixa confirmou que "emprego no menor nível histórico e evolução da renda média são determinantes para a redução de retomadas".

**Selic → Comportamento de pré-pagamento**: Em ciclos de Selic alta (14,75-15% em 2025-2026), a poupança rende mais, reduzindo o incentivo ao pré-pagamento (custo de oportunidade favorece investir vs. amortizar). Em ciclos de queda da Selic, a portabilidade aumenta como mecanismo efetivo de pré-pagamento/refinanciamento. Estima-se que 1pp de variação na Selic → ~0,43pp de variação na taxa do crédito imobiliário em ~6 meses.

**Preços de imóveis → LTV e Loss Severity**: A valorização imobiliária sustentada (IGMI-R: +19,70% em 12 meses até fev/2025) reduz o LTV ao longo do tempo e diminui a loss severity, sendo fator-chave na baixa inadimplência histórica. Em cenário de queda de preços, o efeito se inverte: LTV deteriora, loss severity aumenta e o risco de patrimônio líquido negativo se materializa.

### Benchmarks por segmento de carteira

**SBPE (renda média/alta)**: Volume de R$186,7 bilhões em 2024 (+22,3%); inadimplência ~1,0%; taxas 11-12% + TR; LTV máximo 80% SAC / 70% Price; projeção de queda de 15-20% no volume em 2025.

**MCMV/FGTS (renda popular)**: Volume de R$126 bilhões em 2024 (+29%); taxas de 4,00% a 10,00% conforme faixa de renda; LTV até 90%; inadimplência historicamente superior ao SBPE porém manejável pelo subsídio do FGTS. Nova Faixa 4 (renda R$8.000-12.000) criada em abril de 2025.

**Recebíveis de incorporadoras (fase de obra)**: Indexados ao INCC; risco de distrato regulado pela Lei 13.786/2018 (retenção de 25% sem PA ou 50% com PA); inadimplência significativamente superior às carteiras bancárias; CRIs deste segmento concentraram os defaults de 2024.

---

## 5. Arcabouço regulatório do crédito imobiliário

### Resolução CMN 2.682/99 e sua substituição pela Resolução CMN 4.966/21

A Resolução 2.682 estabeleceu durante 25 anos o framework de classificação de risco e provisionamento do sistema financeiro brasileiro, com 9 níveis (AA a H) e provisões mínimas de 0% a 100% conforme dias de atraso. Regras críticas incluíam: o **efeito arrasto** (todas as operações de um mesmo cliente classificadas pelo pior nível), proibição de reconhecimento de receita para operações ≥60 dias em atraso, e transferência para contas de compensação após 6 meses em nível H.

A **Resolução 4.966/2021**, vigente desde **1º de janeiro de 2025**, substituiu esse modelo por um framework de **perda esperada** (Expected Credit Loss) alinhado ao IFRS 9/CPC 48. A mudança fundamental é a antecipação do reconhecimento de perdas: provisões são constituídas desde o dia 1 da operação (12 meses de perda esperada no Stage 1), aumentando para perda lifetime quando há deterioração significativa (Stage 2, >30 dias) ou evidência objetiva de perda (Stage 3, >90 dias). A fórmula central passa a ser **PECLD = PD × LGD × EAD**, incorporando obrigatoriamente cenários macroeconômicos prospectivos.

### Resolução CMN 4.676/2018 — Crédito imobiliário e SBPE

Esta resolução unificou o regramento de crédito imobiliário, estabelecendo que **65% dos depósitos de poupança** devem ser direcionados a financiamentos imobiliários (dos quais 80% em operações do SFH). Define a **cota de crédito (LTV)** como relação entre valor nominal da operação e valor de avaliação do imóvel, impõe análise rigorosa da capacidade de pagamento do mutuário, e cria o arcabouço para LCI, CRI e LIG como instrumentos de funding.

Atualizações recentes incluem a **Resolução CMN 5.255/2025** (outubro/2025), que elevou o teto do SFH de R$1,5 milhão para **R$2,25 milhões**, restaurou o LTV máximo para 80% (SAC), limitou taxas SFH a **12% a.a.** e criou os Depósitos Interfinanceiros Imobiliários (DII, vigência jan/2027). A Resolução CMN 5.119/2024 alterou profundamente as regras de lastro de LCI, restringindo operações elegíveis e causando repricing significativo no mercado.

### Resolução CVM 60/2021 — Securitização

Substituiu as Instruções CVM 414 e 600, criando framework unificado para companhias securitizadoras com duas categorias: **S1** (exclusivamente com regime fiduciário) e **S2** (também sem regime fiduciário). Exige mínimo de 3 diretores estatutários, **informe mensal** por emissão no sistema Fundos.NET, e concentração máxima de 20% em devedor único por emissão (Art. 43-A, incluído pela Res. CVM 194/2023). A classificação de risco deve ser atualizada no mínimo a cada 12 meses (a ANBIMA exige atualização trimestral).

### Patrimônio de Afetação e RET

Instituído pela **Lei 10.931/2004**, o Patrimônio de Afetação segrega terreno, construções, receitas de vendas e todos os direitos vinculados a uma incorporação específica, **blindando-os contra credores do incorporador** — inclusive em caso de falência (Art. 31-F da Lei 4.591/64). A adesão ao **RET** (Regime Especial de Tributação) permite alíquota unificada de **4% sobre a receita recebida** (IRPJ, PIS, CSLL, COFINS), reduzida a **1% para empreendimentos MCMV**. O PA é pré-requisito para a retenção de 50% nos distratos e constitui fator determinante na análise de risco de CRIs por agências de rating.

### Lei 13.786/2018 — Distratos

Regulamentou os distratos imobiliários com retenção máxima de **25% dos valores pagos** (sem PA, reembolso em 180 dias) ou **50%** (com PA, reembolso em 30 dias após habite-se), acrescida de comissão de corretagem, IPTU, condomínio e fruição de 0,5%/mês. Uma **incerteza jurídica relevante** persiste: a 3ª Turma do STJ (2025) entendeu que o CDC prevalece sobre a lei, limitando a retenção a 25% mesmo com PA, enquanto a 4ª Turma manteve os 50%. Essa divergência impacta diretamente a modelagem de risco de carteiras de recebíveis de incorporadoras.

### Marco Legal da Securitização — Lei 14.430/2022

Trouxe a primeira **definição legal de securitização** no Brasil, expandiu o regime fiduciário para qualquer tipo de certificado de recebíveis (não apenas CRI/CRA), autorizou revolvência em todas as operações e permitiu dação em pagamento dos créditos subjacentes aos investidores.

---

## 6. Síntese de engenharia de contexto — referência rápida para diagnóstico de carteira

### Mapa completo de indicadores, fórmulas e faixas

| Indicador | Fórmula | Saudável | Atenção | Crítico | Relações Causais |
| --- | --- | --- | --- | --- | --- |
| **Over 90** | Σ SD(>90d) / Σ SD Total | <1,5% | 3–5% | >5% | ↑ com desemprego, INCC, Selic alta |
| **LTV** | SD / Valor Imóvel | <70% | 70–90% | >90% | ↑ com queda de preços; ↑ → ↑ PD e LGD |
| **DSCR** | NOI / Serviço Dívida | >1,3x | 1,0–1,2x | <1,0x | ↓ com vacância, ↑ juros |
| **PDD/PECLD** | Σ(PD×LGD×EAD) | Cobertura >100% do Over 90 | 80–100% | <80% | Stage migration indica deterioração |
| **CPR** | 1−(1−SMM)^12 | 5–10% a.a. | 15–20% | >25% | ↑ com queda de Selic, FGTS |
| **CDR** | 1−(1−MDR)^12 | 2–4% a.a. | 6–10% | >12% | ↑ com desemprego, INCC, recessão |
| **Sobrecolat. Fluxo** | FC Recebíveis / Serviço CRI | >140% | 100–120% | <100% | ↓ com default, pré-pagamento |
| **Subordinação** | Tranche Júnior / Total | >10% | 5–10% | <5% | Primeira linha de absorção de perda |

### Aplicação prática integrada

**Para diagnóstico de carteira**: Iniciar pelo Over 90 e composição por bucket de atraso, verificando a curva de roll rate (transição entre faixas). Sobrepor análise de LTV atualizado para identificar concentração em faixas de risco. Cruzar com vintage — safras recentes com deterioração mais rápida sinalizam degradação de underwriting.

**Para projeções de risco**: Construir modelo de fluxo de caixa com CDR base (2-4%), CPR base (5-10%) e recuperação de 50-70% em 6-12 meses. Rodar cenários de estresse combinando CDR 2-3× base, queda de recuperação de 20-30pp, aumento de prazo de recuperação, e choque de indexadores. Comparar sobrecolateralização resultante contra thresholds de 120% (saldo) e 140% (fluxo).

**Para compliance regulatório**: Garantir classificação conforme Resolução 4.966 (3 estágios), com modelos de PD, LGD e EAD validados e incorporando cenários macroeconômicos prospectivos. Monitorar covenants de CRI (ICSD, concentração, inadimplência máxima) conforme Resolução CVM 60. Verificar elegibilidade de recebíveis para lastro de LCI conforme Resolução CMN 5.119/2024.

**Para decisão de ação**: Over 90 ultrapassando 3% exige revisão de políticas de originação e constituição de provisão adicional. LTV médio acima de 80% demanda reavaliação de garantias e potencial reforço de credit enhancement. DSCR abaixo de 1,1x aciona plano de contingência — renegociação, constituição de reservas, ou cessão de ativos problemáticos. Curvas vintage mostrando safras recentes 2× piores que históricas devem disparar alerta de originação e revisão de critérios de elegibilidade para cessão.

---

## Considerações finais e riscos emergentes

O crédito imobiliário brasileiro encontra-se em um ponto de inflexão. A inadimplência historicamente baixa e a eficácia da alienação fiduciária como mecanismo de garantia fundamentam a resiliência do setor. No entanto, três vetores de risco merecem monitoramento intensivo: a **Selic a 15%** reduzindo funding de poupança e elevando taxas a patamares restritivos (11-12%+TR), o **crescimento de CRIs high yield** com defaults dobrando em 2024, e a **transição regulatória** para o modelo de perda esperada (Res. 4.966) que exigirá maior sofisticação analítica e potencialmente elevará provisões.

A principal lacuna informacional do mercado permanece na **ausência de dados públicos padronizados** sobre CPR, CDR e taxas de recuperação por segmento — dados que são proprietários de cada instituição. A construção de bases públicas comparáveis, nos moldes dos relatórios de loan performance americanos, seria transformadora para a maturação do mercado de securitização brasileiro e para a acurácia dos modelos de risco.