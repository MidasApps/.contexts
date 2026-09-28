# 4.2 Índices de Correção Monetária (INCC, IPCA, IGP-M, TR, CUB)

O mercado imobiliário brasileiro opera com **cinco índices principais de correção monetária** — INCC, IPCA, IGP-M, TR e CUB — cada um aplicado a uma etapa específica do ciclo imobiliário, da construção à securitização. A escolha do indexador determina o perfil de risco de cada operação: entre 2015 e 2025, o IGP-M acumulou ~113%, o INCC ~103%, o IPCA ~82% e a TR apenas ~9%, evidenciando que a seleção do índice pode representar diferenças de centenas de milhares de reais no custo total de um financiamento de 30 anos. O descasamento entre índices de ativos e passivos é hoje o principal risco estrutural da securitização imobiliária, especialmente com a Selic a **14,75% a.a.** e o spread real CDI-IPCA em ~10,5 pontos percentuais. Este relatório detalha a composição, aplicação e comportamento de cada índice, com séries históricas, correlações e análise de risco para o ciclo 2025-2026.

---

## 1. INCC: o termômetro da construção que governa as parcelas durante a obra

O **Índice Nacional de Custo da Construção (INCC)**, calculado mensalmente pela FGV IBRE desde 1944, mede a evolução dos custos de construções habitacionais residenciais em sete capitais brasileiras (São Paulo, Rio de Janeiro, Belo Horizonte, Salvador, Recife, Porto Alegre e Brasília). Compõe **10% do IGP** em todas as suas versões.

**Composição metodológica (pós-revisão de julho/2023):** Materiais e equipamentos respondem por **~52%** do índice (cimento, vergalhões de aço, blocos de concreto, itens de acabamento e instalação), serviços por **~6%** (aluguel de equipamentos, projetos, água e luz) e mão de obra por **~42%** (pedreiros com ~8,5% do peso total, eletricistas, bombeiros hidráulicos, carpinteiros, pintores, engenheiros e mestres de obra). A revisão de 2023 passou a captar preços de serviços terceirizados, segmentou por padrão construtivo (econômico, médio e alto) e ampliou subitens pesquisados.

As três variantes diferem apenas no período de coleta: o **INCC-DI** (código SGS **192**) coleta do dia 1º ao último dia do mês, sendo o **padrão adotado na maioria dos contratos de compra e venda**; o **INCC-M** (código SGS **7456**) coleta do dia 21 ao dia 20, compondo o IGP-M; e o **INCC-10** coleta do dia 11 ao dia 10, compondo o IGP-10. Um dissídio coletivo pode aparecer no INCC-M de um mês e no INCC-DI do mês seguinte, gerando diferenças pontuais significativas.

**Série histórica do INCC-M (acumulado anual, 2015-2025):**

| Ano | INCC-M (%) | Contexto |
| --- | --- | --- |
| 2015 | 7,22 | Crise econômica, custos elevados |
| 2016 | 6,34 | Recessão profunda |
| 2017 | 4,03 | Menor taxa do período |
| 2018 | **3,97** | **Vale absoluto da década** |
| 2019 | 4,13 | Recuperação lenta |
| 2020 | 8,68 | COVID: alta de insumos no 2º semestre |
| 2021 | **14,03** | **Pico absoluto** — desabastecimento + câmbio |
| 2022 | 9,41 | Elevado, pico em junho (2,81%) |
| 2023 | 3,34 | Forte desaceleração |
| 2024 | 6,33 | Reaceleração por mão de obra |
| 2025 | 6,09 | Moderação, mão de obra protagonista |

**Sazonalidade marcante.** Junho é consistentemente o mês de maior variação do INCC (média de **1,25%** no mês contra 0,30-0,50% nos demais), reflexo dos dissídios coletivos da construção civil com data-base entre maio e julho. Em junho de 2022, uma única correção mensal de **2,81%** representou quase 30% da inflação do ano inteiro. Compradores de imóvel na planta que antecipam parcelas antes de maio reduzem a base de incidência desse pico sazonal.

**Aplicação no ciclo imobiliário.** Durante toda a fase de construção (pré-chaves), o saldo devedor do comprador é corrigido mensalmente pelo INCC. A fórmula é direta: Saldo Atualizado = Saldo Anterior × (1 + INCC do mês). Em um caso documentado, um apartamento adquirido por R$ 483 mil em maio/2021 em Goiânia teve o valor corrigido para **R$ 616 mil** na entrega (novembro/2024), acumulando ~27,5% de INCC em três anos de obra. Após a entrega das chaves, o indexador migra para IPCA, IGP-M ou TR conforme o contrato de financiamento.

---

## 2. IPCA: a inflação oficial que domina os contratos pós-chaves e CRIs

O **Índice de Preços ao Consumidor Amplo (IPCA)**, calculado mensalmente pelo IBGE (código SGS **433**), é o índice oficial de inflação do Brasil. Pesquisa ~430 mil preços em 30 mil estabelecimentos de 16 regiões metropolitanas, cobrindo famílias com rendimentos de **1 a 40 salários mínimos** (~90% das famílias urbanas).

A estrutura de pesos (POF 2017-2018, vigente desde janeiro/2020) distribui-se em nove grupos. Para o mercado imobiliário, o grupo **Habitação (~15,2% do IPCA)** é o mais relevante, englobando aluguel residencial (~3,6% do peso total), energia elétrica, taxa de água e esgoto, condomínio e materiais de reparo. Em 2025, o grupo Habitação acelerou para **6,79%** (contra 3,06% em 2024), sendo o grupo de maior impacto no acumulado do ano.

**Série histórica do IPCA (acumulado anual, 2015-2025):**

| Ano | IPCA (%) | Contexto |
| --- | --- | --- |
| 2015 | **10,67** | **Pico** — crise fiscal, preços administrados |
| 2016 | 6,29 | Desaceleração gradual |
| 2017 | **2,95** | **Vale** — menor desde 1998 |
| 2018 | 3,75 | Abaixo da meta |
| 2019 | 4,31 | Leve aceleração |
| 2020 | 4,52 | Pandemia, pressão em alimentos |
| 2021 | **10,06** | **Pico** — crise hídrica, commodities |
| 2022 | 5,79 | Desonerações fiscais moderaram |
| 2023 | 4,62 | Desaceleração |
| 2024 | 4,83 | Leve aceleração |
| 2025 | 4,26 | Dentro da meta (4,50% teto) |

**Uso dominante no mercado de CRIs.** Aproximadamente **75% dos CRIs emitidos** são indexados ao IPCA + spread prefixado, tipicamente entre **IPCA + 8% e 10% a.a.** para créditos de boa qualidade e IPCA + 12-15% para high yield. O mercado de CRI atingiu recorde de **R$ 58,9 bilhões** em emissões em 2024 (+23,4% sobre 2023), recuando para R$ 49 bilhões em 2025 por restrições regulatórias.

**Financiamento IPCA+ da Caixa.** Lançado em agosto de 2019, oferecia taxa de **2,95% a 4,95% a.a. + IPCA**, com parcela inicial 30-50% menor que a modalidade TR. Porém, o risco é substancial: em março de 2026, a correção mensal sobre um saldo de R$ 300 mil pelo IPCA (0,88%) foi de **R$ 2.640**, contra apenas R$ 210 pela TR. Simulações mostram que em 30 anos, um financiamento IPCA+ pode custar **~R$ 132 mil a mais** que um financiamento TR equivalente. A Caixa deixou de oferecer ativamente esta modalidade após a explosão inflacionária de 2021.

---

## 3. IGP-M: a "inflação do aluguel" em declínio e sua volatilidade estrutural

O **Índice Geral de Preços do Mercado (IGP-M)**, calculado pela FGV IBRE (código SGS **189**), é composto por três subíndices com pesos fixos: **IPA-M (60%)** medindo preços no atacado, **IPC-M (30%)** medindo preços ao consumidor e **INCC-M (10%)** medindo custos da construção. O peso dominante do IPA — que monitora commodities cotadas em dólar como minério de ferro, soja e petróleo — torna o IGP-M **estruturalmente sensível ao câmbio**, podendo divergir dramaticamente da inflação percebida pelo consumidor.

**Série histórica do IGP-M (acumulado anual, 2015-2025):**

| Ano | IGP-M (%) | Diferença vs IPCA (p.p.) |
| --- | --- | --- |
| 2015 | 10,54 | -0,13 |
| 2016 | 7,19 | +0,90 |
| 2017 | **-0,53** | -3,48 (deflação) |
| 2018 | 7,55 | +3,80 |
| 2019 | 7,32 | +3,01 |
| 2020 | **23,14** | **+18,62** (pico extremo) |
| 2021 | **17,78** | +7,72 |
| 2022 | 5,46 | -0,33 |
| 2023 | **-3,18** | -7,80 (deflação) |
| 2024 | 6,54 | +1,71 |
| 2025 | **-1,04** | -5,30 (deflação) |

O descolamento de 2020-2021 — quando o IGP-M chegou a acumular **37% em 12 meses** (maio/2021) enquanto o IPCA ficava em ~4,5% — provocou uma crise nos contratos de aluguel e acelerou a migração para o IPCA como indexador locatício. O QuintoAndar adotou o IPCA como padrão em novembro de 2020, e até 2021 mais de **60% de seus novos contratos** já utilizavam esse índice. A FGV lançou o IVAR (Índice de Variação de Aluguéis Residenciais) em janeiro de 2022 como alternativa específica. Em abril de 2026, com IGP-M acumulando **-1,83% em 12 meses** contra IPCA de +4,14%, os próprios proprietários agora buscam sair do IGP-M — uma inversão completa da dinâmica de 2020.

---

## 4. TR e CUB: o indexador do financiamento e o padrão das incorporações

### Taxa Referencial (TR)

A **TR** (código SGS **226**) é calculada pelo Banco Central a partir das taxas de LTNs no mercado secundário. A fórmula aplica um fator multiplicativo de **0,93** sobre a média ponderada das taxas de LTN para obter a TBF, depois aplica um redutor R = a + b × TBF (onde a = 1,005) para chegar à TR. Quando o resultado é negativo, a TR é fixada em **zero** por convenção.

Esse mecanismo explica por que a TR ficou zerada por **50 meses consecutivos** (setembro/2017 a novembro/2021), período em que a Selic caiu de 7% para o mínimo histórico de 2%. Com a Selic a 14,75% em abril de 2026, a TR mensal está em ~0,17%, acumulando **2,03% em 12 meses** — o maior patamar desde 2016. A TR é o indexador padrão do SFH (imóveis até R$ 2,25 milhões), com taxas na Caixa de **TR + 10,99% a 12,00% a.a.** para financiamentos SBPE.

| Período | TR acumulada anual | Selic (fim do período) |
| --- | --- | --- |
| 2015 | ~1,80% | 14,25% |
| 2016 | ~2,01% | 13,75% |
| 2017-2021 | 0,00-0,05% | 2,00-9,25% |
| 2022 | 1,63% | 13,75% |
| 2023 | 1,76% | 11,75% |
| 2024 | 0,81% | 12,25% |
| 2025 | **1,97%** | 15,00% |

### Custo Unitário Básico (CUB)

O **CUB** é calculado mensalmente pelos SINDUSCONs estaduais com base na ABNT NBR 12.721:2006, medindo o custo por metro quadrado de construção a partir de projetos-padrão. Diferente do INCC (que mede variação percentual), o CUB expressa um **valor absoluto em R$/m²**, sendo obrigatório no memorial de incorporação (Lei 4.591/64).

As variantes combinam tipo de edificação com padrão de acabamento:

| Tipo | Descrição | Padrões disponíveis |
| --- | --- | --- |
| **R-1** | Casa unifamiliar | Baixo, Normal, Alto |
| **R-8** | Edifício residencial 8 pav. | Baixo, Normal, Alto |
| **R-16** | Edifício residencial 16 pav. | Normal, Alto |
| **PP-4** | Prédio popular 4 pav. | Baixo, Normal |
| **CSL-8/16** | Comercial salas e lojas | Normal, Alto |
| **CAL-8** | Comercial andares livres | Normal, Alto |
| **GI** | Galpão industrial | Padrão único |

O CUB R8-N de São Paulo (referência de mercado) em março de 2026 está em **R$ 2.133,91/m²** (sem desoneração), com variação de 4,17% em 12 meses. Incorporadoras frequentemente fixam preços em múltiplos de CUB (ex.: "unidade = 180 CUBs R8-N"), permitindo reajuste automático. O CUB não inclui terreno, fundações especiais, elevadores nem projetos de engenharia. Após a conclusão da obra, tribunais reiteradamente proíbem sua aplicação como indexador.

---

## 5. Correlações, descasamento de índices e risco de securitização

**INCC vs IPCA.** O INCC superou o IPCA em 8 dos 11 anos entre 2015 e 2025. A divergência mais forte ocorreu em 2020-2022, com o INCC ficando **3,6 a 4,2 p.p. acima** do IPCA, impulsionado pela explosão de custos de materiais (aço, PVC, cobre) e dissídios coletivos elevados. Em março de 2026, o INCC-DI acumula 5,86% contra 4,14% do IPCA — cenário favorável para quem tem recebíveis INCC e passivo IPCA.

**IGP-M vs IPCA.** A volatilidade é extrema. O IGP-M oscilou de +23,14% (2020) a -3,18% (2023), enquanto o IPCA variou na faixa mais estreita de 2,95% a 10,67%. Em uma década, o IGP-M acumulou ~113% contra ~82% do IPCA, mas com trajetória imprevisível, incluindo **três anos de deflação** (2017, 2023, 2025).

**TR vs Selic.** A correlação é direta mas não linear: abaixo de ~8,5% de Selic, a TR tende a zero. Acima desse limiar, a TR cresce gradualmente, mas jamais acompanha a magnitude da Selic. Em 2025, com Selic a 15%, a TR acumulou apenas 1,97% — uma fração da taxa básica.

**Risco de descasamento na securitização.** O risco central surge quando o indexador do ativo (recebível) diverge do indexador do passivo (CRI/funding). Os cenários mais comuns são:

- **Recebível INCC (durante obra) → CRI indexado a IPCA ou CDI:** Se o INCC sobe menos que o IPCA, a incorporadora precisa cobrir a diferença. Atualmente, o cenário é favorável (INCC 5,86% > IPCA 4,14%), mas em 2015 e 2023 houve inversão.
- **Recebível IPCA (pós-chaves) → CRI indexado a CDI:** Com CDI a ~14,65% e IPCA a 4,14%, o spread real de **~10,5 p.p.** pressiona estruturas descasadas. CRIs IPCA+ com spread de 8-10% ainda cobrem (rendimento efetivo ~12-14%), mas a margem de segurança encurtou.

Mitigantes típicos incluem subordinação (tranches junior absorvendo perdas), **contas reserva de 3 PMTs**, cláusulas de recomposição e spread de excesso. Fundos imobiliários de CRI diversificam entre IPCA+ e CDI+ — o MXRF11 (Maxi Renda) mantém ~42% CDI e 56% IPCA; o HGCR11 (Patria) opera com 90% IPCA+ (taxa média IPCA + 9,1%).

**Impacto na precificação de cessão de carteira.** Recebíveis INCC (fase de obras) sofrem **20-40% mais deságio** que recebíveis IPCA por três razões: prazo curto (2-3 anos), alta volatilidade do índice e risco de obra. Recebíveis IPCA+ são preferidos pelo mercado (~75% das emissões de CRI), precificados pela curva **NTN-B + spread de crédito** (NTN-B 2030 ≈ IPCA + 6,15%, logo CRI a IPCA + 7-10% conforme rating). A taxa de inadimplência no estoque de CRIs atingiu **4,75% em 2025**, concentrada em papéis acima de IPCA + 12%.

---

## 6. Projeções 2025-2026 e expectativas do mercado

O Boletim Focus de 13 de abril de 2026 revela deterioração nas expectativas inflacionárias pela **quinta semana consecutiva**:

| Indicador | 2025 (realizado) | 2026 (projeção Focus) | 2027 |
| --- | --- | --- | --- |
| IPCA | 4,26% | **4,71%** (acima do teto de 4,50%) | 3,91% |
| Selic | 15,00% | **12,50%** | 10,50% |
| IGP-M | -1,04% | **3,86%** | 4,00% |
| PIB | 2,26% | 1,85% | 1,80% |
| Câmbio (R$/US$) | 5,43 | 5,37 | 5,40 |

A **inflação implícita nas NTN-B** para os próximos 12 meses está em ~6,1%, significativamente acima do Focus (4,71%), refletindo prêmio de risco fiscal. O INCC-DI acumula 5,86% em 12 meses (março/2026) com tendência de desaceleração — a projeção implícita para 2026 situa-se entre **5,0-6,0%**, com mão de obra continuando como principal vetor de pressão (~40% das empresas relatam escassez de trabalhadores qualificados segundo a Sondagem FGV). O Copom realizou o primeiro corte de Selic em quase dois anos em março de 2026 (de 15% para 14,75%), sinalizando cautela diante da inflação persistente.

---

## 7. Tabela de referência rápida e fontes de dados

| Índice | Emissor | Periodicidade | Uso principal no ciclo | Código SGS | API/Fonte |
| --- | --- | --- | --- | --- | --- |
| **INCC-DI** | FGV IBRE | Mensal (1º-30) | Correção de parcelas durante obra | **192** | `api.bcb.gov.br/dados/serie/bcdata.sgs.192` |
| **INCC-M** | FGV IBRE | Mensal (21-20) | Componente do IGP-M | **7456** | `api.bcb.gov.br/dados/serie/bcdata.sgs.7456` |
| **IPCA** | IBGE | Mensal (1º-30) | Pós-chaves, CRIs, financiamento IPCA+ | **433** | `api.bcb.gov.br/dados/serie/bcdata.sgs.433` |
| **IGP-M** | FGV IBRE | Mensal (21-20) | Reajuste de aluguéis (em declínio) | **189** | `api.bcb.gov.br/dados/serie/bcdata.sgs.189` |
| **TR** | Banco Central | Diária | Correção saldo devedor SFH/SBPE | **226** | `api.bcb.gov.br/dados/serie/bcdata.sgs.226` |
| **CUB** | SINDUSCONs | Mensal (até dia 5) | Memorial incorporação, tabelas venda | — | `cub.org.br` / `sindusconsp.com.br` |
| **Selic** | Banco Central | Diária | Referência para TR e CDI | **432** | `api.bcb.gov.br/dados/serie/bcdata.sgs.432` |
| **CDI** | B3/CETIP | Diária | Benchmark funding/CRIs | **4392** | `api.bcb.gov.br/dados/serie/bcdata.sgs.4392` |

**Acesso programático às séries do BCB:**

```
https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados?formato=json&dataInicial=01/01/2020&dataFinal=31/12/2025
```

Formatos disponíveis: JSON, CSV, XML. Bibliotecas: `python-bcb` (Python), `GetBCBData` (R). Para IPCA desagregado: IBGE SIDRA Tabela 7060 (`apisidra.ibge.gov.br`). Para CRIs: ANBIMA Data (`data.anbima.com.br`) com taxas indicativas diárias. Expectativas Focus: `olinda.bcb.gov.br/olinda/servico/Expectativas`.

**Limiares de alerta para gestão de risco:**

- **INCC mensal > 1,5%:** Alerta de pico sazonal (dissídio) — pode representar 25-30% da inflação anual em um único mês
- **IGP-M acumulado 12M divergindo > 10 p.p. do IPCA:** Gatilho para renegociação contratual (ocorreu em 2020-2021)
- **TR acumulada > 2% a.a.:** Impacto material no saldo devedor de financiamentos longos (reativa desde 2022)
- **Spread real CDI-IPCA > 8 p.p.:** Pressão severa sobre estruturas de CRI com descasamento de indexadores (situação atual: ~10,5 p.p.)
- **INCC acumulado em obra > 25%:** Risco de comprometimento da capacidade de pagamento do comprador na entrega

---

## Conclusão: a convergência para IPCA e os riscos do ciclo atual

O mercado imobiliário brasileiro vive um momento de **consolidação do IPCA como indexador dominante** — presente em 75% dos CRIs, crescente nos contratos de aluguel e disponível como opção de financiamento bancário. O IGP-M, estruturalmente volátil pela dependência do câmbio via IPA, perde relevância a cada ciclo. A TR, embora previsível, voltou a corrigir saldos devedores com a Selic elevada, reintroduzindo custo real que esteve ausente por quatro anos.

O risco mais agudo para 2026 é o **descasamento de índices em ambiente de juros altos**: com CDI a ~14,65% e IPCA a 4,14%, estruturas de securitização mal dimensionadas podem enfrentar insuficiência de fluxo. A inflação implícita nas NTN-B (6,1%) supera o Focus (4,71%), sugerindo que o mercado precifica um cenário mais adverso do que o consenso dos economistas. Para o comprador de imóvel na planta, o INCC acumulando 5-6% ao ano representa acréscimo relevante ao preço final, com concentração perigosa no trimestre maio-julho. A gestão ativa de indexadores — tanto na originação de crédito quanto na estruturação de CRIs — é hoje tão crítica quanto a análise de crédito dos devedores.