# 3.3 PDD BACEN vs. PDD Projetada

**A provisão para devedores duvidosos (PDD) no crédito imobiliário brasileiro passou por sua maior transformação em 25 anos com a entrada em vigor da Resolução CMN 4.966/2021 em janeiro de 2025**, substituindo o modelo de perdas incorridas da Resolução 2.682/99 pelo modelo de perdas esperadas alinhado ao IFRS 9. Esse novo arcabouço eleva significativamente o provisionamento — estudos estimam aumento de ~70% para a Caixa Econômica Federal, maior financiadora habitacional do país — mas a alienação fiduciária, presente em **98,2% dos financiamentos bancários**, atua como mitigador poderoso ao reduzir a LGD para a faixa de **10–25%**. A inadimplência do crédito imobiliário brasileiro atingiu mínimas históricas em 2024 (~1,0% over 90), embora sinais de leve deterioração comecem a surgir em 2025 com a Selic em 14,25%. Este relatório cobre o marco regulatório, a transição IFRS 9, modelos de PDD projetada, benchmarks de mercado e ferramentas para engenharia de contexto em agentes de IA.

---

## 1. Resolução 2.682/99: o modelo que vigorou por 25 anos

A Resolução CMN 2.682/99 — **revogada em 1º de janeiro de 2025** pela Resolução 4.966/2021 — definiu por mais de duas décadas as regras de classificação de risco e provisão mínima para operações de crédito no Sistema Financeiro Nacional. Seu modelo de **perdas incorridas** (backward-looking) baseava-se em dois pilares: dias de atraso como critério objetivo de migração entre níveis, e análise subjetiva da capacidade de pagamento do devedor.

### Tabela de classificação AA a H

A estrutura de nove níveis com provisão crescente constituía o coração do modelo:

| Nível | Provisão mínima | Atraso padrão | Atraso para prazo > 36 meses* |
| --- | --- | --- | --- |
| **AA** | **0,0%** | Adimplente | Adimplente |
| **A** | **0,5%** | Até 14 dias | Até 14 dias |
| **B** | **1,0%** | 15–30 dias | 30–60 dias |
| **C** | **3,0%** | 31–60 dias | 61–120 dias |
| **D** | **10,0%** | 61–90 dias | 121–180 dias |
| **E** | **30,0%** | 91–120 dias | 181–240 dias |
| **F** | **50,0%** | 121–150 dias | 241–300 dias |
| **G** | **70,0%** | 151–180 dias | 301–360 dias |
| **H** | **100,0%** | > 180 dias | > 360 dias |
- *A contagem em dobro (Art. 4º, §1º) era o principal benefício para o crédito imobiliário, cujos prazos típicos de 10–35 anos se enquadravam automaticamente nesta regra.*

A classificação deveria ser revisada **mensalmente** por atraso, **semestralmente** para clientes com exposição superior a 5% do patrimônio líquido ajustado da instituição, e **anualmente** nos demais casos. Operações com responsabilidade total inferior a R$ 50.000 podiam ser classificadas apenas pelo critério de atraso, com piso no nível A. Após **6 meses no nível H**, a operação deveria ser transferida para conta de compensação (write-off contábil), permanecendo registrada por no mínimo 5 anos.

### Por que o crédito imobiliário recebia tratamento favorável

A Resolução 2.682/99 não trazia seção específica para o crédito imobiliário, mas três dispositivos criavam um tratamento implicitamente favorável. Primeiro, a **contagem em dobro** dos prazos de atraso para operações com prazo superior a 36 meses fazia com que um financiamento imobiliário só atingisse nível H (provisão de 100%) após mais de 360 dias de atraso, contra 180 dias para operações de curto prazo. Segundo, o Art. 2º determinava que a classificação considerasse as "características das garantias, particularmente quanto à suficiência e liquidez", o que beneficiava operações com **alienação fiduciária** — garantia que transfere a propriedade resolúvel ao credor e permite execução extrajudicial célere via Lei 9.514/97. Terceiro, o Art. 3º permitia classificação diversa para operações de um mesmo grupo econômico quando justificada pelas garantias, possibilitando que o financiamento imobiliário mantivesse rating superior ao de outras operações do mesmo devedor.

O stop accrual (cessação do reconhecimento de receitas) ocorria após **60 dias de atraso** (Art. 9º), e operações renegociadas deveriam manter no mínimo o mesmo nível de risco anterior. A Resolução 2.697/2000 complementou o arcabouço com cronograma de implementação por porte do devedor e exigência de notas explicativas segregando créditos de curso normal e vencidos.

---

## 2. A virada para perdas esperadas: Resolução 4.966/2021 e IFRS 9

A Resolução CMN 4.966, promulgada em 25 de novembro de 2021, **entrou em vigor em 1º de janeiro de 2025 sem adiamento**, alinhando o Brasil ao padrão internacional IFRS 9 (CPC 48). A norma alcança todas as instituições autorizadas a funcionar pelo Banco Central e representa uma mudança paradigmática: da provisão constituída apenas quando há evidência de perda (backward-looking) para um modelo de **perdas esperadas desde a originação** (forward-looking), incorporando cenários macroeconômicos como desemprego, Selic, PIB e inflação.

### Os três estágios e suas implicações para o crédito imobiliário

| Estágio | Condição | Tipo de provisão | Reconhecimento de receita |
| --- | --- | --- | --- |
| **1** — Performing | Sem aumento significativo de risco desde a originação | ECL de **12 meses** | Juros sobre valor bruto |
| **2** — Underperforming | Aumento significativo do risco de crédito (inclui atraso > 30 dias como presunção relativa) | ECL **lifetime** | Juros sobre valor bruto |
| **3** — Non-performing | Ativo problemático: atraso > 90 dias ou indicativo de irrecuperabilidade | ECL **lifetime** | Juros sobre valor líquido (**stop accrual**) |

A fórmula central passa a ser **ECL = PD × LGD × EAD**, aplicada com horizonte de 12 meses no Estágio 1 e para toda a vida do contrato nos Estágios 2 e 3. Para o crédito imobiliário, a migração do Estágio 1 para o Estágio 2 é o evento de maior impacto: um financiamento de 30 anos que migra para lifetime ECL gera provisão dramaticamente superior àquela de um crédito pessoal de 24 meses.

A equivalência aproximada com o modelo anterior é: Estágio 1 ≈ níveis AA/A, Estágio 2 ≈ níveis B a D, e Estágio 3 ≈ níveis E a H — mas a correspondência não é direta, pois o novo modelo inverte a lógica: primeiro classifica-se em estágios e depois calcula-se a perda esperada, em vez de escalonar provisão fixa por atraso. A **contagem em dobro** de prazos foi **eliminada**, e a regra de arrasto (contágio) exige que, para contrapartes não-varejo, se uma operação for classificada como ativo problemático, todas as demais operações daquela contraparte migrem para o Estágio 3.

### O impacto quantitativo é significativo mas mitigável

Estudo acadêmico aplicado à carteira da Caixa Econômica Federal estimou **aumento de ~70% na provisão para perdas de crédito**. A KPMG confirmou "sensível aumento de provisões" nas demonstrações financeiras de dezembro de 2024 dos principais bancos. Entretanto, para carteiras imobiliárias especificamente, a alienação fiduciária age como contrapeso crucial: a Resolução BCB 352/23 definiu cinco carteiras (C1 a C5) para a metodologia simplificada, e a **Carteira C1** — que inclui operações com alienação fiduciária de imóveis — recebe os **menores percentuais mínimos de provisão**. Na metodologia completa (obrigatória para bancos S1–S3), a LGD deve ser modelada considerando o valor justo do colateral, custos de execução, tempo de recuperação e desconto pela taxa efetiva de juros.

O BACEN estabeleceu cronograma de transição do capital regulatório de 2025 a 2028, e permitiu que o aumento inicial de provisão fosse lançado diretamente em lucros/prejuízos acumulados (sem transitar pelo resultado). As normas complementares incluem a Resolução BCB 309/23 (definições de taxa efetiva, clusterização de carteiras), a IN BCB 464/24 (critérios de apuração de ECL), e a Lei 14.467/2022 (tratamento tributário das provisões).

---

## 3. Modelos de PDD projetada: da fórmula à precificação

### PD, LGD e EAD no contexto imobiliário brasileiro

A **Probability of Default (PD)** para crédito imobiliário é estimada por modelos de scoring (regressão logística com variáveis como renda, LTV, prazo, histórico), análise de safras (vintage analysis), matrizes de migração entre faixas de atraso, e — conforme exigido pela Resolução 4.966 — modelos macroeconômicos forward-looking. A PD anual típica para crédito imobiliário PF com alienação fiduciária situa-se entre **1,0% e 2,5%**, substancialmente inferior aos 5–8% do crédito pessoal sem garantia.

A **Loss Given Default (LGD)** é o componente onde a alienação fiduciária faz maior diferença. Com execução extrajudicial via Lei 9.514/97 (aprimorada pela Lei 14.711/2023 — Marco Legal das Garantias), o tempo médio de recuperação é de **6 a 8 meses**, contra 2 a 5 anos na hipoteca convencional. A LGD típica para crédito imobiliário com alienação fiduciária situa-se em **10–25%**, enquanto com hipoteca pode alcançar **30–50%+**. O Working Paper 193/2009 do BACEN identificou distribuição bimodal na LGD: operações tendem a ter recuperação próxima de 100% ou perda quase total, com variáveis como presença de garantia real, renegociação e nível de atividade econômica determinando o resultado.

A **Exposure at Default (EAD)** para financiamentos PF amortizáveis equivale ao saldo devedor contratual na data do default. Para **Plano Empresário** (financiamento à produção), o EAD pode crescer ao longo da obra conforme novas parcelas são liberadas proporcionalmente ao avanço físico, introduzindo complexidade adicional ao cálculo.

### PDD regulatória versus PDD gerencial: o que a divergência revela

A **PDD regulatória** é constituída conforme os pisos mínimos do regulador — até 2024 pela tabela AA–H, a partir de 2025 pelo modelo de três estágios com pisos prudenciais. A **PDD gerencial/projetada** reflete a melhor estimativa interna da instituição baseada em modelos proprietários de PD × LGD × EAD.

Quando a PDD projetada **supera** a regulatória em mais de 20–30%, há sinal de **sub-provisionamento regulatório**: a carteira carrega risco superior ao capturado pelo modelo padrão, frequentemente por concentração excessiva, deterioração do mercado imobiliário local, LTV elevado ou completion risk em incorporações. A instituição deveria constituir provisão complementar. Quando a PDD projetada é **inferior** à regulatória, há sobre-provisionamento: a carteira possui garantias robustas (LTV baixo, imóveis valorizados), alta probabilidade de cura e LGD real muito inferior à implícita nos pisos regulatórios. Para gestão de risco, a PDD gerencial é a **verdadeira medida** e deve nortear concessão, precificação (RAROC) e alocação de capital econômico.

### Precificação de cessão e CRI

Na cessão de carteiras, o deságio reflete diretamente a PDD projetada:

**Preço de cessão = Σ [CF_t × (1 − PD_t × LGD_t)] / (1 + taxa_cessão)^t**

O spread de cessão embute custo de funding (CDI + 0,5–3%), PDD projetada (1–5% para performing, 30–70% para NPL), margem operacional (1–3%), custos de servicing (0,5–2%) e prêmio de iliquidez (0,5–2%). Carteiras performing tipicamente são cedidas com deságio de **3–10%** sobre o valor nominal; carteiras non-performing sofrem deságio de **50–95%**.

Para CRIs, a subordinação funciona como proteção das cotas seniores contra perdas: tipicamente **5–15%** em cota subordinada (first-loss, geralmente retida pelo cedente), **10–20%** em mezanino e **65–80%** em cota sênior. A PDD projetada determina o nível necessário de subordinação: se a perda esperada base é 3% e o cenário estressado indica 8%, a subordinação deve ser no mínimo 8–10%.

---

## 4. Benchmarks e dados de mercado: onde estamos

### Inadimplência em mínimas históricas, mas com sinais de reversão

A inadimplência over 90 dias da carteira de crédito imobiliário atingiu **~1,0%** em 2024 — piso desde 2006, segundo a ABECIP — e alcançou **0,8%** em agosto/2025 para a carteira SBPE. A Caixa reportou **1,3%** no 3T/2025 para sua carteira imobiliária (R$ ~850 bilhões), contra **6,25%** na carteira PF geral e **12,5%** na PJ.

| Ano | Over 90 (ABECIP/SBPE) | Contexto |
| --- | --- | --- |
| 2005 | **8,5%** | Pior da série histórica |
| 2015–2016 | 3,0–3,5% | Recessão severa (PIB −3,5%) |
| 2019 | ~2,0% | Início de queda acentuada |
| 2023 | 1,4% | Selic elevada (13,75%) |
| 2024 | **1,0%** | Mínimo histórico |
| Ago/2025 | **0,8%** | Menor em 18 anos |

No entanto, o percentual de contratos com **algum atraso** (incluindo < 90 dias) estava em **9,37%** em julho/2025, e a taxa de crescimento da inadimplência inverteu: +0,6% no primeiro semestre de 2025, após queda de −1,0% no mesmo período de 2024. A Selic em 14,25% e juros de financiamento entre 10,26% e 12% a.a. começam a pressionar o comprometimento de renda.

### PDD estimada por segmento

| Segmento | PDD/Carteira | PD anual | LGD | Inadimplência base |
| --- | --- | --- | --- | --- |
| SFH PF (SBPE) | 0,5–1,5% | 1,0–2,5% | 10–25% | ~1,0% |
| SFI PF | 0,5–1,5% | 1,0–2,5% | 10–25% | ~1,0% |
| MCMV Faixas 2–3 | 1,0–2,5% | 2,0–5,0% | 15–35% | Ligeiramente superior |
| MCMV Faixa 1 | 2,0–5,0% | 3,0–8,0% | 20–40% | Historicamente elevada |
| Plano Empresário | 2,0–5,0% | 2,0–6,0% | 20–40% | Perfil PJ |
| Home Equity | 1,0–2,0% | 2,0–4,0% | 15–30% | Base pequena, LTV ≤ 60% |
| CRI pulverizado | 2,0–5,0% | 2,0–5,0% | 15–30% | Diversificação mitiga |

O segmento MCMV Faixa 1 apresenta risco historicamente superior por atender público de renda muito baixa (até R$ 2.850/mês), enquanto SFH/SFI PF beneficiam-se de perfil de renda média/alta, alienação fiduciária, correção pela TR (~2% a.a., abaixo da inflação e reajuste salarial) e LTV conservador. O Plano Empresário carrega o **completion risk** — risco de a obra não ser concluída — que pode elevar a LGD em 10–30 pontos percentuais quando o imóvel está em estágio intermediário de construção.

### Estrutura e escala do mercado

O crédito imobiliário representa **~10% do PIB** e **~19,6% do crédito total do SFN**. As concessões totalizaram **R$ 312,4 bilhões** em 2024 (+24,7% a/a), com a Caixa detendo 42,6% do market share SBPE (R$ 79,6 bi), seguida por Itaú (22,9%), Bradesco (20,4%), Santander (5,8%) e Banco do Brasil (4,5%). O funding é composto por poupança SBPE (32%), FGTS (28%), LCI (15%), CRI (9%), LIG (5%) e FIIs/outros (11%), totalizando R$ 2,41 trilhões.

Os CRIs atingiram R$ 226 bilhões em 2024 (+23% a/a), mas a taxa de default no estoque chegou a **4,75%** dos papéis em 2024, com 58 eventos de default entre abril e dezembro — o dobro do ano anterior, impulsionado por juros altos que dificultaram refinanciamento de emissores.

---

## 5. Engenharia de contexto para agentes de IA

### Fórmulas de referência

| Fórmula | Expressão | Aplicação |
| --- | --- | --- |
| **Perda Esperada** | ECL = PD × LGD × EAD | Cálculo de provisão por operação |
| **LTV** | Saldo Devedor / Valor do Imóvel × 100% | Indicador de cobertura da garantia |
| **DSCR** | Renda Disponível / Prestação (PF) ou NOI / Serviço da Dívida (comercial) | Capacidade de pagamento |
| **Cobertura** | Provisão Total / Carteira Inadimplente (> 90d) | Adequação do provisionamento |
| **Deságio** | 1 − (Preço de Cessão / Valor de Face) | Precificação de carteira |
| **CPR** | 1 − (1 − SMM)^12 | Taxa anualizada de pré-pagamento |
| **WAL** | Σ(t × Principal_t) / Σ Principal_t | Vida média ponderada |
| **Preço CRI** | Σ [CF_t / (1 + taxa)^t] | Valuation de título |
| **Preço cessão** | Σ [CF_t × (1 − PD_t × LGD_t)] / (1 + r)^t | Valuation com perdas |

### Parâmetros de mercado (abril 2026)

| Parâmetro | Valor/Faixa |
| --- | --- |
| Inadimplência > 90d imobiliário | ~1,1–1,3% |
| LGD com alienação fiduciária | 10–25% |
| LGD com hipoteca | 30–50%+ |
| LTV máx SFH (SAC / Price) | 80% / 70% |
| LTV máx Home Equity | 60% |
| Comprometimento máx. de renda | 30% |
| CPR voluntário típico | 8–15% a.a. |
| Custo de servicing performing | 0,5–1,5% a.a. |
| Spread CRI high grade (IPCA) | IPCA + 7–10% |
| Spread CRI mid-grade (IPCA) | IPCA + 10–14% |
| Selic | 14,25% |
| Taxa de financiamento | 10,26–12% + TR |

### Red flags para diagnóstico automatizado de carteira

Um agente de IA analisando carteira de crédito imobiliário deve monitorar os seguintes alertas críticos:

- **LTV médio da carteira > 70%** (crítico acima de 80%): indica colateral insuficiente para absorver desvalorização; LTV crescente ao longo do tempo sugere queda de preços dos imóveis
- **Rolagem acelerada entre faixas de atraso** (migração rápida de 0–30d para 61–90d): quando a taxa de cura — percentual de operações que voltam a ficar em dia — cai abaixo de padrões históricos, a deterioração pode ser irreversível
- **Divergência PDD regulatória vs. gerencial > 20%**: sinaliza sub ou sobre-provisionamento; requer investigação imediata dos modelos de PD e LGD utilizados
- **Concentração > 30% em região ou > 5% em devedor único**: vulnerabilidade a choque localizado; safras originadas em períodos de boom imobiliário com critérios frouxos são particularmente problemáticas
- **Operações reestruturadas > 10% da carteira**: pode mascarar inadimplência real; sob a Resolução 4.966, reestruturação classifica automaticamente o ativo como problemático (Estágio 3)

### Cenários de stress testing

| Cenário | Multiplicador PD | Multiplicador LGD | Queda preço imóvel | Impacto ECL esperado |
| --- | --- | --- | --- | --- |
| **Base** | 1,0× | 1,0× | 0% | Referência |
| **Moderado** | 1,5× | 1,2× | −10% | +50–80% |
| **Severo** | 2,0× | 1,5× | −20% | +100–200% |
| **Catastrófico** | 3,0× | 2,0× | −30% | +300–500% |

As variáveis macroeconômicas a incorporar nos cenários forward-looking incluem: Selic (+300/+500 bps), desemprego (+3/+5 pp), PIB (−2%/−5%), IPCA (+3 pp comprimindo renda disponível), e restrição generalizada de crédito.

### Aplicação prática em precificação de CRI

A análise de um CRI do ponto de vista de PDD segue cinco etapas. Primeiro, identificar o tipo de lastro (pulverizado residencial versus corporativo). Segundo, avaliar a carteira subjacente: PD histórica e projetada do pool, LGD por tipo de garantia e EAD com perfil de amortização. Terceiro, calcular ECL = PD × LGD × EAD para cenário base e estressados. Quarto, comparar a ECL com o nível de subordinação — a subordinação deve cobrir perdas no cenário severo. Quinto, avaliar mecanismos adicionais: conta reserva, overcollateral, covenants (gatilho de inadimplência típico de 15%), amortização sequencial.

Estrutura típica de subordinação em CRI: cota sênior (65–80% da emissão, IPCA + 7–10%), cota mezanino (10–20%, CDI + 3–5%), cota subordinada (5–15%, first-loss retida pelo cedente). Referências reais: CRI CashMe com subordinação mínima de 25% para sênior e spread excedente de 12,4% a.a.; CRI Solfacil com gatilho de atraso de 15%.

---

## Conclusão: três insights que definem o momento atual

O mercado de crédito imobiliário brasileiro encontra-se em uma **confluência rara de baixa inadimplência e alta exigência regulatória**. A Resolução 4.966/2021, já em vigor há mais de um ano, forçou uma sofisticação inédita nos modelos de risco — exigindo dados granulares, projeções macroeconômicas e recálculo contínuo de ECL — mas os primeiros resultados sugerem que o sistema absorveu o choque sem risco sistêmico, em parte graças ao cronograma de transição de capital até 2028.

O ponto-chave para análise de carteiras é que **a alienação fiduciária é o divisor de águas**: ela reduz a LGD de 30–50%+ para 10–25%, coloca operações imobiliárias na Carteira C1 (menores pisos prudenciais), e permite execução extrajudicial em 6–8 meses. Qualquer modelagem de PDD que não calibre adequadamente o efeito da alienação fiduciária sobre a LGD produzirá resultados distorcidos.

Por fim, a **divergência entre PDD regulatória e gerencial** emerge como o indicador mais revelador da qualidade real de uma carteira. Com o modelo de perdas esperadas agora obrigatório, a sofisticação dos modelos internos de PD, LGD e EAD determina não apenas a adequação das provisões, mas a precificação competitiva de cessões, CRIs e spreads — e, em última instância, a viabilidade econômica da originação de crédito imobiliário.