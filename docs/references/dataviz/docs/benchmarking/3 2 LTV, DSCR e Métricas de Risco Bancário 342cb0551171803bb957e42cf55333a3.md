# 3.2 LTV, DSCR e Métricas de Risco Bancário

O mercado imobiliário brasileiro opera sob um dos arcabouços regulatórios mais conservadores do mundo em termos de métricas de risco de crédito, combinando **LTV máximo de 80-90%**, **comprometimento de renda limitado a 30%** e a alienação fiduciária como garantia dominante. Esse tripé explica a inadimplência historicamente baixa do segmento — apenas **1,0% em 2024** (mínima histórica da série ABECIP) — e fundamenta a estruturação de CRIs com camadas de proteção como subordinação, sobrecolateralização e excess spread. Este relatório detalha cada métrica, suas fórmulas, faixas de referência, base regulatória e aplicação prática, tanto na originação bancária quanto na securitização via CRI/CRA.

---

## 1. LTV: a âncora da originação imobiliária

O **Loan-to-Value (LTV)**, denominado "cota de crédito" pela regulação brasileira (definição formalizada pela Resolução CMN 5.197/2024), mede a relação entre o valor nominal da operação de crédito e o valor de avaliação do imóvel dado em garantia. É a métrica primária de risco na concessão e no monitoramento do crédito imobiliário.

**Fórmulas:**

| Variação | Fórmula |
| --- | --- |
| LTV na originação | (Valor nominal da operação + despesas acessórias) ÷ Valor de avaliação do imóvel × 100% |
| LTV corrente (CLTV) | Saldo devedor atual ÷ Valor de avaliação atual do imóvel × 100% |
| LTV com ônus existentes | (Valor solicitado + interveniente quitante + dívidas existentes) ÷ Valor de avaliação × 100% |

**Marco regulatório — Resolução CMN 4.676/2018 (Art. 6º):**

A regulação-base estabelece os tetos de LTV para operações com recursos do SBPE. Para aquisição residencial em geral, o limite é de **80%**; quando utilizado o Sistema de Amortização Constante (SAC) ou SACRE, admite-se até **90%**. Para empréstimo com garantia de imóvel (home equity), o teto regulatório é de **60%**. A Resolução 5.197/2024 (vigente a partir de julho/2025) formalizou a definição de "cota de crédito" e implementou regras de compartilhamento de garantia sob o Marco Legal das Garantias (Lei 14.711/2023). A Resolução 5.255/2025 elevou o teto de valor do imóvel no SFH para **R$ 2,25 milhões** (antes R$ 1,5 milhão).

**LTV praticado pelos principais bancos (SBPE, início de 2026):**

| Banco | LTV SAC | LTV Price | Taxa (a.a. + TR) | Observações |
| --- | --- | --- | --- | --- |
| **Caixa** (67% do mercado) | 80% | 70% | 10,26-10,99% | Restaurou limites em out/2025 após restrição temporária |
| **Itaú Unibanco** | 80% | ~70% | 11,60% | — |
| **Bradesco** | 80% | ~70% | 11,70-11,87% | — |
| **Santander** | 80% | ~70% | 11,69-11,79% | — |
| **Banco do Brasil** | 80% | ~70% | 12,00% | Condições especiais para servidores públicos |

A **Caixa** implementou uma restrição temporária entre outubro/2024 e outubro/2025, reduzindo o LTV SAC para 70% e Price para 50% em operações SBPE, motivada por pressões de liquidez na poupança. Os limites foram restaurados com a vigência da Resolução 5.255/2025.

**LTV por programa e segmento:**

No **MCMV/FGTS**, os limites variam por faixa de renda. A Faixa 1 (renda até R$ 3.200/mês) pode atingir **95% de LTV** em imóveis novos, refletindo os subsídios expressivos (até R$ 55 mil). As Faixas 2 e 3 operam tipicamente com LTV de **80%** para novos, com restrições regionais para usados: no Sul/Sudeste, a Faixa 3 está limitada a **50%** para imóveis usados; no Norte/Nordeste/Centro-Oeste, a **70%** (IN MCID 17/2024). A nova Faixa 4 (Classe Média, renda até R$ 13.000) permite 80% para novos e 60% para usados no Sul/Sudeste.

No **Plano Empresário** (financiamento à construção), o LTV é calculado diferentemente: financia-se tipicamente **80-85%** do custo de obra, resultando em um LTV de **55-70%** sobre o VGV (Valor Geral de Vendas). Exige-se patrimônio de afetação (obrigatório desde jan/2023, Res. 4.909/2021) e pré-vendas mínimas de 30% dos lotes/unidades.

**Diferenciação por indexador:** Os limites regulatórios de LTV não variam formalmente por indexador (TR, IPCA, poupança). A restrição da Caixa em 2024 aplicou-se uniformemente a todos os indexadores. Contudo, operações indexadas ao IPCA carregam risco inflacionário maior, e bancos podem adotar políticas internas mais conservadoras.

**Monitoramento ao longo do tempo:** Na prática, bancos brasileiros **não realizam mark-to-market rotineiro** de garantias residenciais — diferentemente dos EUA, onde índices de preços regionais atualizam o CLTV. A reavaliação ocorre em eventos específicos: reestruturação, solicitação de crédito adicional, auditoria regulatória ou uso de garantia compartilhada (Res. 5.197/2024 exige verificação do SCR). No Plano Empresário, há monitoramento físico-financeiro mensal (medição) que valida a evolução do valor do colateral.

**Faixas de referência (prática de mercado):**

| LTV | Classificação | Contexto |
| --- | --- | --- |
| ≤ 50% | 🟢 Baixo risco | Zona de home equity; melhores taxas |
| 50-70% | 🟢/🟡 Confortável | Boa margem de garantia |
| 70-80% | 🟡 Moderado | Padrão de mercado SBPE |
| 80-90% | 🟠 Elevado | Apenas SAC/SACRE; máximo regulatório SBPE |
| > 90% | 🔴 Alto risco | Apenas MCMV Faixa 1; vedado em SBPE |

---

## 2. DTI: o limite de 30% como pilar de proteção

O **comprometimento de renda** (Debt-to-Income, DTI) mede o percentual da renda bruta mensal comprometido com o pagamento do encargo habitacional. A Lei 8.692/1993 (Art. 2º) estabelece o teto de **30% da renda bruta mensal** para contratos no SFH — incluindo amortização, juros e seguros obrigatórios (MIP e DFI). Para operações no SFI, não há teto legal, mas o mercado adotou 30% como padrão.

**Fórmula:**

```
Comprometimento de Renda (%) = Encargo Mensal Total (P + J + Seguros) ÷ Renda Bruta Mensal × 100%
```

O cálculo utiliza **renda bruta** (antes de IR e INSS). Isso significa que um comprometimento de 30% da renda bruta pode representar **37-40% da renda líquida** efetiva — detalhe crítico para avaliação de risco real.

**Composição de renda:** A Caixa permite composição com qualquer pessoa (sem exigência de parentesco). Banco do Brasil aceita até 3 proponentes com vínculo de parentesco. Bradesco limita a cônjuges, companheiros e pais/filhos. Aceita-se renda formal (CLT), pro-labore, aposentadoria, aluguéis e, com restrições, renda informal (50-70% do declarado).

**Diferenças por programa e sistema de amortização:**

No **SAC**, a prestação é máxima no início (30%) e decresce — o comprometimento cai naturalmente. No **Price**, as parcelas nominais são fixas, mas com correção por TR/IPCA podem subir significativamente. Por isso, alguns bancos limitam o DTI inicial do Price a **25%**. O **SACRE** permite que o comprometimento suba até ~37% por volta do ano 10, antes de declinar. Para o **MCMV Faixa 3**, o FGTS estabelece limite de **25%** com sistema Price/420 meses.

A interação entre DTI e nível de renda é inversamente proporcional em termos de impacto: 30% para quem ganha R$ 3.000 deixa R$ 2.100 para todas as demais despesas; para quem ganha R$ 30.000, sobram R$ 21.000 — margem incomparável.

**Faixas de referência:**

| DTI | Classificação | Implicação |
| --- | --- | --- |
| ≤ 15% | 🟢 Conservador | Margem excelente |
| 15-20% | 🟢 Ideal | Recomendado por planejadores financeiros |
| 20-25% | 🟡 Moderado | Aceitável; padrão para rendas mais altas |
| 25-30% | 🟠 No limite | Teto legal SFH; atenção para rendas baixas |
| > 30% | 🔴 Vedado (SFH) | Não permitido por lei no SFH |

---

## 3. DSCR e ICR: cobertura do serviço da dívida na ótica corporativa e de securitização

### DSCR (Índice de Cobertura do Serviço da Dívida — ICSD)

O DSCR mede a capacidade de geração de caixa para cobrir o serviço total da dívida (principal + juros + encargos). No Brasil, é denominado **ICSD** e constitui a métrica de risco predominante em CRI corporativos e financiamento ao Plano Empresário.

**Fórmulas por contexto:**

| Contexto | Fórmula |
| --- | --- |
| Corporativo/Projeto | ICSD = (EBITDA − IR/CSLL − ΔCapital de Giro) ÷ (Amortização + Juros + CM) |
| Simplificada | ICSD = EBITDA ÷ Serviço da Dívida |
| CRI Pulverizado (Razão de Garantia) | RG = VP(Fluxo de Recebíveis) ÷ Saldo Devedor do CRI |
| Pessoa Física (implícito) | DTI ≤ 30% equivale a DSCR ≥ 3,33x |

Em CRIs pulverizados, o conceito de DSCR se manifesta como **Razão de Garantia (RG)**, medida em duas dimensões: a RG Fluxo (recebíveis mensais ÷ obrigações mensais do CRI) e a RG Saldo (VP do saldo de recebíveis ÷ saldo devedor do CRI). A Austin Rating (metodologia de junho/2024) classifica como baixo risco **RG Fluxo > 140%** e **RG Saldo > 120%**; como alto risco, ambos abaixo de 100%.

Em CRIs corporativos (risco único, built-to-suit, sale & leaseback), aplica-se o ICSD tradicional como covenant, testado semestral ou anualmente. A XP Investimentos indica que "espera-se que o ICSD não fique abaixo de **1,2x**", embora o limite contratual varie. Operações de debenture indexadas a CRI podem exigir ICSD ≥ 1,1x (com caixa) como piso.

**Faixas de referência:**

| DSCR | Classificação | Contexto |
| --- | --- | --- |
| ≥ 1,5x | 🟢 Excelente | Margem confortável para cenários de estresse |
| 1,25-1,5x | 🟢 Bom | Padrão de mercado para CRI corporativo |
| 1,1-1,2x | 🟡 Monitoramento | Apertado; pode acionar covenants |
| < 1,1x | 🔴 Crítico | Risco de aceleração |
| < 1,0x | 🔴 Default | Fluxo insuficiente para serviço da dívida |

### ICR (Índice de Cobertura de Juros — ICJ)

O ICR mede quantas vezes o lucro operacional cobre as despesas com juros, **sem considerar amortização de principal**. É menos conservador que o DSCR.

**Fórmula:** ICR = EBIT (ou EBITDA) ÷ Despesas com Juros

Na prática brasileira, o **ICSD é dominante** em operações de CRI e financiamento imobiliário, enquanto o ICR aparece mais como indicador complementar de saúde corporativa e em covenants de **debêntures imobiliárias** que servem como lastro para CRI. Faixas típicas: 🟢 ≥ 2,0x; 🟡 1,3-2,0x; 🔴 < 1,3x.

**Diferença entre DSCR do financiador e do investidor:**

| Dimensão | Banco (Financiador) | Investidor de CRI |
| --- | --- | --- |
| Numerador | EBITDA/NOI do tomador | Fluxo de caixa da carteira de recebíveis |
| Denominador | Serviço do empréstimo (P+J) | Serviço do CRI (amortização + cupom) |
| Métrica-chave | ICSD tradicional | Razão de Garantia (sobrecolateralização) |
| Piso de baixo risco | ≥ 1,2-1,25x | RG ≥ 120-140% |
| Monitoramento | Comitê de crédito do banco | Agente fiduciário + securitizadora |
| Consequência de violação | Reestruturação ou aceleração | Amortização compulsória, assembleia, vencimento antecipado |

---

## 4. Excess spread, sobrecolateralização e cobertura em CRI

### Excess Spread

O excess spread é a **primeira linha de defesa** contra perdas em operações de securitização. Representa a diferença entre a taxa de juros recebida sobre a carteira de recebíveis e a taxa paga aos investidores do CRI, deduzidas as despesas de servicing.

**Fórmula:**

```
Excess Spread = Taxa de Juros dos Recebíveis − Cupom do CRI − Taxas de Servicing/Administração
```

A Austin Rating identifica dois tipos: o **Spread Excedente 1** (juros do contrato vs. juros do CRI) e o **Spread Excedente 2** (taxa de cessão vs. taxa do contrato). A metodologia classifica como baixo risco um spread excedente superior a **2% a.a.** entre taxa dos contratos e taxa do CRI. Na prática de mercado, CRIs residenciais pulverizados operam tipicamente com excess spread de **1,5% a 4,0% a.a.**, dependendo da qualidade da originação e do pricing do CRI.

O excess spread funciona como colchão mensal que absorve inadimplências antes de impactar investidores, repõe fundos de reserva e constrói sobrecolateralização ao longo do tempo. É o primeiro mecanismo consumido em cenários de estresse — apenas após seu esgotamento as camadas de subordinação e reserva são acionadas.

**Faixas de referência:**

| Excess Spread | Classificação |
| --- | --- |
| > 200 bps (2% a.a.) | 🟢 Robusto |
| 100-200 bps | 🟡 Adequado |
| < 100 bps | 🔴 Vulnerável a estresse |

### Over-Collateralization (Sobrecolateralização)

A sobrecolateralização significa que o **valor face dos recebíveis excede o saldo devedor dos CRIs emitidos**, criando um colchão para absorção de perdas. Segundo o guia ANBIMA: a sobrecolateralização "busca gerar um colchão de liquidez suficiente para arcar com os compromissos junto aos detentores do título, vinculando apenas uma parte do fluxo de recebíveis à emissão do CRI."

**Métricas de Razão de Garantia:**

```
RG Fluxo Mensal = Créditos Imobiliários Recebidos no Mês ÷ Obrigações Garantidas do Mês
RG Saldo Devedor = VP(Saldo Devedor dos Créditos) ÷ Saldo Devedor Total do CRI
OC Ratio = Principal do Colateral ÷ Principal dos CRIs emitidos
```

**Faixas praticadas no mercado brasileiro:**

| Métrica | Baixo Risco (Austin) | Alto Risco | Prática de Mercado |
| --- | --- | --- | --- |
| RG Fluxo Mensal | > 140% | < 100% | 110-150% |
| RG Saldo Devedor | > 120% | < 100% | 115-200%+ |
| LTV médio ponderado | < 70% | > 90% | 50-80% |

Exemplos reais ilustram a amplitude: CRI Manhattan opera com RG de **235%**; CRI Olimpo IV exige VP/SD > **200%** e índice de cobertura de fluxo mensal > **115%**; Fortesec CRI estabelece RG mínima de **120%** tanto para fluxo quanto para saldo; FYTO11 (FII) exige razão mínima de garantia de **130%**.

A sobrecolateralização é **dinâmica**: muda com amortizações, pré-pagamentos, inadimplências, recuperações e, em estruturas revolving (permitidas desde CVM 194/2023), com a inclusão de novos créditos elegíveis.

### Interest Coverage em CRI

No contexto de securitização, a cobertura de juros se expressa como **Razão PMT** — a relação entre fluxos recebidos e obrigações de pagamento do CRI em cada período:

```
Razão PMT = Créditos Recebidos na Conta do Patrimônio Separado ÷ PMT do CRI
```

Diferentemente do ICR corporativo, não existe "EBIT" no SPV: a cobertura mede a **adequação do fluxo de caixa do colateral** versus as obrigações dos títulos. Inclui principal e juros (não apenas juros).

---

## 5. Estrutura de covenants e gatilhos em CRI

Os Termos de Securitização de CRI estruturam uma hierarquia de eventos com gatilhos progressivos, partindo de monitoramento intensificado até a aceleração total.

**Principais métricas utilizadas como covenants:**

- **Razão de Garantia (OC):** Covenant estrutural mais comum, especialmente em CRIs pulverizados. Exemplo real (Grupo Travessia/Jd. das Angélicas): RG mínima de **140%** do saldo da série sênior, verificada em cada data de verificação.
- **DSCR/ICSD:** Predominante em CRIs corporativos (≥ 1,2-1,3x, testado semestral ou anualmente).
- **LTV:** Métrica de originação e monitoramento contínuo; Austin Rating classifica LTV < 70% como baixo risco.
- **Gatilhos de inadimplência:** Percentual máximo da carteira em atraso > 60 ou 90 dias (tipicamente 3-5%).
- **Fundo de reserva:** Mínimo de 2 PMTs (parcelas mensais) para classificação de baixo risco.
- **Subordinação júnior:** > 10% ou cobertura > 5x as 5 maiores concentrações individuais.

**Hierarquia de eventos:**

A progressão típica opera em quatro estágios. O **Evento de Avaliação** é acionado quando a RG cai abaixo do covenant ou a inadimplência excede o limite, resultando em notificação pelo agente fiduciário e monitoramento intensificado. Se não sanado, ocorre a **Amortização Extraordinária Compulsória** — o cedente deve recomprar recebíveis (Recompra Compulsória Parcial), e os recursos são direcionados para amortização antecipada dos CRIs seniores. O **Vencimento Antecipado Não Automático** requer deliberação em assembleia de titulares. Já o **Vencimento Antecipado Automático** ocorre sem assembleia em situações graves: falência, recuperação judicial, insolvência do cedente ou falsidade em declarações.

**Cascata de pagamentos (waterfall) típica:**

1. Custos operacionais (securitizadora, agente fiduciário, servicer)
2. Juros e amortização da série sênior
3. Recomposição do fundo de reserva (mínimo 2 PMTs)
4. Juros e amortização da série mezanino
5. Juros e amortização da série subordinada
6. Excess spread — liberado ao cedente OU retido se testes de OC não forem atendidos

A absorção de perdas flui de baixo para cima: subordinada absorve primeiro, depois mezanino, por último sênior.

**Monitoramento pelos servicers:** O agente fiduciário monitora mensalmente a execução da cascata de pagamentos, a inadimplência da carteira, o saldo da conta reserva e o cumprimento dos gatilhos. Relatórios semestrais incluem comprovação de aplicação de recursos e cronograma físico-financeiro (para CRIs de construção). A Austin Rating destaca que a independência do servicer é critério de qualidade: mudança completa de domicílio bancário dos recebíveis, segregação de equipe de gestão e contratação de servicer especializado.

---

## 6. Inadimplência e evidências empíricas: LTV alto + DSCR baixo

A combinação de LTV alto e DSCR baixo é reconhecida pelo mercado como o **pior cenário de risco combinado**. Quando o LTV já está elevado e o DSCR é baixo, "o sinal de alerta dobra" — nas palavras da plataforma INCO. Em contrapartida, um DSCR robusto compensa parcialmente um LTV mais alto, pois demonstra que o fluxo de caixa cobre o serviço da dívida com folga.

**Dados de inadimplência do mercado brasileiro:**

| Período | Inadimplência (> 3 prestações) | Fonte |
| --- | --- | --- |
| 2005 | 8,5% | ABECIP (pior da série) |
| 2016 | ~2,0% | ABECIP (crise econômica) |
| 2023 | 1,4% | ABECIP |
| 2024 | **1,0%** | ABECIP (mínima histórica) |
| Jul/2025 | 1,14% (> 90 dias) | BACEN |

Contratos com cláusula de **alienação fiduciária** apresentam inadimplência de apenas **1,3%**, contra **1,9%** de contratos sem essa garantia. Mais revelador: as perdas efetivas em contratos novos (pós-reformas) são de **0,6%**, contra **22% nos contratos legados** — evidência dramática do impacto combinado de LTV conservador, DTI de 30% e execução extrajudicial rápida.

**Análise de safra (vintage):** Empréstimos originados em períodos de boom com underwriting relaxado (safras 2010-2014) apresentam performance pior. Safras pós-alienação fiduciária superam dramaticamente as anteriores. O ambiente atual de Selic a **15%** tende a estressar as safras 2024-2025 por compressão da capacidade de pagamento. Segmentos de maior risco em CRI incluem multipropriedade e condohotéis — casos notórios de inadimplência envolvendo WAM Holding (R$ 600M) e Gramado Parks (R$ 303M) em CRIs via Fortesec.

O LTV médio ponderado da carteira brasileira na originação é de aproximadamente **71,2%** (dado BACEN/InfoMoney), bem abaixo dos máximos regulatórios. Bancos consideram **LTV ≤ 65%** como patamar prudente. Essa diferença cultural — brasileiros tendem a dar entradas maiores — é fator estrutural da baixa inadimplência.

---

## 7. Avaliação pelas agências de rating

As agências utilizam matrizes multifatoriais para classificar o risco de CRIs. A **Austin Rating** (metodologia de junho/2024, a mais detalhada publicamente disponível no Brasil) avalia cinco pilares ponderados:

- **P1 — Carteira de Créditos** (10-95% do peso): LTV médio ponderado, DTI, pulverização (> 100 devedores = baixo risco), pontualidade (< 5% de atrasos > 60 dias)
- **P2 — Projeto** (5-50%): % VGV vendido, custo de obra ≤ 30% do VGV, capital próprio ≥ 30%
- **P3 — Controles** (5-50%): RG Fluxo e Saldo > 120%, qualidade do servicer
- **P4 — Garantias** (5-50%): Fundo de reserva ≥ 2 PMTs, subordinação > 10%, fundo de obras > 120% do saldo
- **P5 — Risco Originador** (5-50%): Saúde financeira e histórico do cedente

A **Fitch Ratings** assume LTV médio de aproximadamente **44%** na originação para CRIs com rating AAA — implicando sobrecolateralização significativa. Utiliza cenários de estresse para taxas de default, velocidade de pré-pagamento e severidade de perda. A **S&P** exige cerca de **40% de credit enhancement total** para rating AAA (combinando subordinação + OC). As metodologias completas da Fitch, S&P e Moody's para RMBS brasileiro não são integralmente públicas, mas operações efetivamente classificadas apontam para DSCR ≥ 1,3-1,5x em grau de investimento e 1,0-1,2x em grau especulativo.

---

## 8. Arcabouço regulatório consolidado

O crédito imobiliário brasileiro é regido por uma rede de normas que interagem entre si. As mais relevantes para métricas de risco:

| Norma | Tema Principal | Provisão sobre Métricas |
| --- | --- | --- |
| **Lei 8.692/1993** | Comprometimento de renda | DTI máximo 30% da renda bruta (SFH) |
| **Lei 9.514/1997** | SFI / Alienação fiduciária | Base legal da garantia dominante no mercado |
| **Lei 14.711/2023** | Marco Legal das Garantias | Garantia compartilhada; extensão de alienação fiduciária |
| **Res. CMN 4.676/2018** | Regulação-master SBPE/SFH/SFI | LTV 80% geral; 90% SAC/SACRE; 60% home equity |
| **Res. CMN 5.197/2024** | Atualização (vigência jul/2025) | Definição de "cota de crédito"; regras de garantia compartilhada |
| **Res. CMN 5.255/2025** | Atualização (vigência out/2025) | Teto SFH → R$ 2,25M; 60% LTV para garantia compartilhada |
| **Res. CMN 4.966/2021** | IFRS 9 (vigência jan/2025) | Modelo de perda esperada (ECL) para provisionamento |
| **Res. CVM 60/2021** | Securitização CRI/CRA | Regime fiduciário; patrimônio separado; concentração ≤ 20% |
| **CVM 194/2023** | Revolvência em CRI | Permite aquisição de novos créditos com recursos do portfólio |

A implementação do **IFRS 9** via Resolução 4.966 (substituindo a Res. 2.682/1999) é particularmente relevante: migrou o provisionamento do modelo de perda incorrida para **perda esperada (ECL)** em três estágios. Operações garantidas por alienação fiduciária recebem tratamento mais favorável. O Brasil mantém **pisos prudenciais mínimos** que podem exceder o cálculo puro do IFRS 9, resultando em provisões geralmente mais conservadoras que os padrões internacionais.

---

## 9. Comparação internacional e benchmarks consolidados

O Brasil se posiciona como um dos mercados mais conservadores em métricas de risco imobiliário entre as grandes economias:

| Métrica | Brasil | EUA | UE/Portugal | Basel III |
| --- | --- | --- | --- | --- |
| LTV máximo (residência primária) | 80-90% | Sem teto regulatório (97% com PMI) | 80-90% | RW por faixa de LTV |
| DTI máximo | **30%** (SFH) | 43% (QM); 50% (GSE) | 50% (DSTI recomendado) | Sem padrão global |
| Garantia dominante | Alienação fiduciária (extrajudicial, ~6 meses) | Mortgage (judicial, 12-36 meses) | Hipoteca (judicial) | — |
| Ponderação de risco (capital) | 35% se LTV ≤ 80% com alienação fiduciária | 20-105% por faixa LTV | 35% a LTV ≤ 80% | 20-70% |

O LTV médio efetivamente praticado no Brasil (~65-70%) está **15-25 pontos percentuais abaixo** do que era comum nos EUA pré-2008 e continua inferior à média europeia. O teto de DTI de 30% é o mais restritivo entre as grandes economias (EUA permite 43-50%, UE recomenda 50%). A execução extrajudicial via alienação fiduciária em 3-6 meses (STF confirmou constitucionalidade em 2024) contrasta com 12-36 meses no processo judicial americano/europeu.

---

## 10. Engenharia de contexto: fichas estruturadas para agentes de IA

Para injeção em agentes conversacionais, cada métrica pode ser sintetizada em formato padronizado:

**LTV (Loan-to-Value / Cota de Crédito)**

- **Definição:** Razão entre valor nominal da operação e valor de avaliação do imóvel
- **Fórmula:** LTV = Valor da Operação ÷ Valor de Avaliação × 100%
- **Faixas:** 🟢 ≤ 70% | 🟡 70-80% | 🔴 > 80%
- **Fonte:** Res. CMN 4.676/2018, Art. 6º (atualizada por CMN 5.197/2024 e 5.255/2025)
- **Aplicação:** Originação bancária; estruturação de CRI; ponderação de risco regulatório

**DTI (Comprometimento de Renda)**

- **Definição:** Percentual da renda bruta mensal comprometido com encargo habitacional
- **Fórmula:** DTI = Prestação Mensal (P+J+Seguros) ÷ Renda Bruta Mensal × 100%
- **Faixas:** 🟢 ≤ 25% | 🟡 25-30% | 🔴 > 30%
- **Fonte:** Lei 8.692/1993, Art. 2º; políticas internas dos bancos
- **Aplicação:** Aprovação de crédito; avaliação de capacidade de pagamento

**DSCR (ICSD — Índice de Cobertura do Serviço da Dívida)**

- **Definição:** Razão entre fluxo de caixa operacional e serviço total da dívida
- **Fórmula:** ICSD = EBITDA ÷ (Amortização + Juros); ou RG = VP(Recebíveis) ÷ Saldo CRI
- **Faixas:** 🟢 ≥ 1,3x (corporate) / RG ≥ 140% (CRI) | 🟡 1,1-1,3x / RG 100-120% | 🔴 < 1,1x / RG < 100%
- **Fonte:** Sem regulação específica CMN; critérios de rating; políticas bancárias
- **Aplicação:** Covenant em CRI; aprovação de Plano Empresário; análise corporativa

**ICR (ICJ — Índice de Cobertura de Juros)**

- **Definição:** Razão entre lucro operacional e despesas com juros
- **Fórmula:** ICR = EBIT (ou EBITDA) ÷ Despesas com Juros
- **Faixas:** 🟢 ≥ 2,0x | 🟡 1,3-2,0x | 🔴 < 1,3x
- **Fonte:** Critérios de rating; políticas bancárias; Basel/GERIC
- **Aplicação:** Análise corporativa de originadores; covenants em debêntures imobiliárias

**Excess Spread**

- **Definição:** Diferença entre rendimento da carteira de recebíveis e custo dos CRIs emitidos, líquida de servicing
- **Fórmula:** ES = Taxa Média Ponderada dos Recebíveis − Cupom Médio Ponderado do CRI − Taxa de Servicing
- **Faixas:** 🟢 > 200 bps | 🟡 100-200 bps | 🔴 < 100 bps
- **Fonte:** Determinado pelo mercado; requisitos de disclosure CVM 60
- **Aplicação:** Credit enhancement em CRI; absorção de perdas; recomposição de reservas

**Over-Collateralization (Sobrecolateralização)**

- **Definição:** Excesso do valor do colateral sobre o saldo dos títulos emitidos
- **Fórmula:** OC% = (Valor do Lastro − Valor dos Títulos) ÷ Valor dos Títulos × 100%; RG Saldo = VP(Recebíveis) ÷ Saldo CRI
- **Faixas:** 🟢 RG > 120% (OC > 20%) | 🟡 RG 100-120% (OC 0-20%) | 🔴 RG < 100% (OC negativo)
- **Fonte:** CVM 60 (requisitos estruturais); ANBIMA; Austin Rating
- **Aplicação:** Estruturação e monitoramento de CRI; principal covenant estrutural; critério de rating

---

## Conclusão: um sistema conservador sob pressão de taxa

O arcabouço brasileiro de métricas de risco imobiliário produziu resultados notáveis: inadimplência de **1,0%** em 2024, perdas efetivas de **0,6%** em contratos novos, e ausência de crise sistêmica mesmo durante a recessão de 2015-2016. Esse resultado decorre de três pilares que se reforçam mutuamente — LTV conservador (80% máximo regulatório, ~65-70% praticado), DTI restritivo (30% da renda bruta) e execução extrajudicial eficiente via alienação fiduciária.

Na securitização, a sofisticação crescente dos CRIs incorpora múltiplas camadas de proteção — excess spread como primeira defesa, sobrecolateralização com Razão de Garantia de **120-140%**, subordinação de **10-30%**, e fundos de reserva de pelo menos 2 PMTs. A hierarquia de eventos (avaliação → amortização compulsória → vencimento antecipado) cria incentivos para que cedentes mantenham a qualidade das carteiras.

Dois fatores merecem atenção prospectiva. O primeiro é o **ambiente de Selic a 15%**, que pressiona as safras 2024-2025 ao elevar o custo efetivo do crédito para 11-12% a.a. + TR, comprimindo a capacidade de pagamento dos tomadores e potencialmente elevando a inadimplência dos atuais pisos históricos. O segundo é a **expansão do SFI e das garantias compartilhadas** sob o Marco Legal das Garantias (Lei 14.711/2023), que introduz complexidade adicional no monitoramento de LTV quando múltiplas operações compartilham o mesmo imóvel como colateral — exigindo que a soma dos valores nominais de todas as operações respeite o teto de LTV da operação predominante, conforme os novos §§ do Art. 6º da Resolução 4.676. A qualidade do monitoramento contínuo dessas métricas interdependentes — especialmente a interação LTV × DTI × DSCR × OC em portfólios securitizados — será determinante para a resiliência do sistema nos próximos ciclos econômicos.