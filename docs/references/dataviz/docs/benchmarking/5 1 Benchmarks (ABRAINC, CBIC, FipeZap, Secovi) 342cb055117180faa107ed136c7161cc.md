# 5.1 Benchmarks (ABRAINC, CBIC, FipeZap, Secovi)

O mercado imobiliário brasileiro dispõe de **sete fontes institucionais complementares** que, juntas, cobrem preços, velocidade de vendas, custos de construção, crédito e funding — mas nenhuma isoladamente oferece um retrato completo. Para análise de carteiras de crédito imobiliário (LTV, inadimplência, PDD, curvas vintage), o cruzamento dessas fontes é indispensável: a ABRAINC e a CBIC medem a dinâmica de oferta e absorção de imóveis novos; o FipeZap e o IVG-R do Banco Central captam tendências de preços; o BACEN fornece séries de crédito e inadimplência; a ANBIMA precifica o mercado de capitais imobiliário; e o IBGE ancora tudo em indicadores macroeconômicos de custo, inflação e demografia. Este relatório detalha cada fonte, seus indicadores, metodologias, limitações e, ao final, propõe uma arquitetura de engenharia de contexto para agentes de IA voltados a analytics de carteiras.

---

## 1. ABRAINC/Fipe: o termômetro das grandes incorporadoras

A ABRAINC (Associação Brasileira de Incorporadoras Imobiliárias) publica, em parceria com a Fipe, um conjunto de **indicadores mensais do mercado primário** com série histórica desde janeiro de 2014. Os dados são fornecidos voluntariamente por **~20 incorporadoras associadas** — em sua maioria de capital aberto (Cyrela, MRV, Cury, Tenda, Even, entre outras) — e validados estatisticamente pela Fipe com cruzamento de informações públicas.

**Indicadores publicados:** unidades lançadas, VGV lançado, unidades vendidas (vendas brutas, sem desconto de distratos), valor das vendas, oferta (estoque), VSO/IVV (fórmula: VSO = Vₜ ÷ [Oₜ₋₁ + Lₜ]), entregas (habite-se), taxa de inadimplência (parcelas >90 dias no saldo credor empresa-cliente) e distratos. A segmentação distingue **MAP (Médio e Alto Padrão)** de **MCMV (Minha Casa, Minha Vida)**. Além do indicador mensal, a ABRAINC publica trimestralmente o **Panorama do Mercado Imobiliário** e indicadores de affordability (price-to-income e tamanho de imóvel acessível para 27 UFs e 16 capitais).

**Dados recentes (2024):** vendas cresceram **11,8%** vs. 2023 — maior patamar da série —, com MCMV avançando 13,1% em vendas e 25,2% em lançamentos. A relação distrato/venda no MAP caiu para ~11,4%, contra ~40% à época da Lei dos Distratos (2018). No acumulado jan-out/2024, foram vendidas 155.769 unidades (+21,5% interanual).

**Limitações conhecidas:** amostra restrita a ~20 grandes incorporadoras gera viés em favor de empresas de grande porte e atuação nacional; vendas são brutas (não descontam distratos); não publica índice de preços; cobertura geográfica do indicador público é nacional agregado, sem detalhamento regional; não capta mercado secundário (usados) nem pequenas construtoras do segmento popular.

**Acesso:** indicadores em https://www.abrainc.org.br/dados-de-mercado/indicadores-publicacoes/indicadores | série histórica em Excel na Fipe: https://www.fipe.org.br/pt-br/indices/abrainc/ | metodologia: https://downloads.fipe.org.br/indices/abrainc/metodologia-abrainc.pdf

---

## 2. CBIC/Brain: a cobertura geográfica mais ampla do mercado primário

A CBIC (Câmara Brasileira da Indústria da Construção), por meio de sua Comissão da Indústria Imobiliária (CII) em parceria com a **Brain Inteligência Estratégica** e o SENAI Nacional, produz os **Indicadores Imobiliários Nacionais** desde 2016. A pesquisa cobre **221 cidades em 2024**, incluindo todas as 27 capitais e principais regiões metropolitanas, com representatividade estimada em **~2/3 do mercado imobiliário brasileiro**. Os dados provêm de pesquisas padronizadas realizadas por Sinduscons e ADEMIs locais.

**Indicadores publicados (trimestrais):** lançamentos (unidades e VGL), vendas (unidades e VGV), oferta final (estoque e tempo estimado de escoamento), indicador de preço médio, segmentação MCMV vs. demais padrões, distratos e intenção de compra. A CBIC não publica um IVV isolado na pesquisa nacional — os IVVs regionais são calculados pelos Sinduscons/ADEMIs locais — mas calcula indiretamente a velocidade de vendas pela relação vendas/oferta.

**Dados recentes (2024):** lançamentos alcançaram **383.483 unidades (+18,6%)** e vendas **400.547 unidades (+20,9%)** — ambos recordes da série. O preço médio valorizou 6,93% no ano. A oferta final no 4T24 foi de 291.928 unidades, com tempo de escoamento de ~9 meses. MCMV respondeu por ~50% dos lançamentos e ~44% das vendas.

Além dos indicadores imobiliários, a CBIC acompanha e divulga dados de **custos de construção** por meio de dois sistemas:

**CUB (Custo Unitário Básico):** calculado mensalmente pelos Sinduscons estaduais conforme a norma ABNT NBR 12.721:2006, a partir de projetos-padrão (R1, R8, R16, PP4, CAL, CSL, GI) em três padrões (baixo, normal, alto). Uso obrigatório em registros de incorporação imobiliária (Lei 4.591/64). **Não inclui** terreno, fundações especiais, elevadores, projetos, administração e publicidade — representa um custo parcial. Portal: http://www.cub.org.br/

**SINAPI (Sistema Nacional de Pesquisa de Custos e Índices):** produzido pelo IBGE (coleta de preços) e Caixa Econômica Federal (engenharia), com publicação mensal para todas as 27 UFs. Referência obrigatória para obras públicas (Decreto 7.983/2013). Custo nacional do m² em março/2026: **R$ 1.932,27** (R$ 1.089,78 materiais + R$ 842,49 mão de obra), com variação acumulada de 6,73% em 12 meses.

**Limitações CBIC:** foco exclusivo em imóveis residenciais verticais (apartamentos) — não cobre casas, lotes e horizontais; periodicidade trimestral com defasagem de ~2 meses; dependência de fontes locais com qualidade variável; não é censo completo do mercado.

**Acesso:** indicadores em http://www.cbicdados.com.br/menu/mercado-imobiliario/indicadores-imobiliarios-nacionais | CUB: http://www.cub.org.br/ | SINAPI/IBGE: https://www.ibge.gov.br/estatisticas/economicas/precos-e-custos/9270-sistema-nacional-de-pesquisa-de-custos-e-indices-da-construcao-civil.html

---

## 3. FipeZap: o índice de preços com a ressalva do anunciado vs. transacionado

O Índice FipeZap, publicado pela Fipe em parceria com o Grupo OLX, é o primeiro e mais difundido índice de preços de imóveis com abrangência nacional. Baseado em **mais de 500 mil anúncios válidos por mês** extraídos dos portais ZAP Imóveis, VivaReal e OLX, cobre exclusivamente **apartamentos prontos** (não inclui casas, terrenos nem imóveis na planta).

**Indicadores publicados:** Índice FipeZap de Venda Residencial (56 cidades, 22 capitais), Índice de Locação Residencial (36 cidades), Índice Comercial — venda e locação (10 cidades), preço médio por m² por cidade e tipologia, rental yield anualizado e Pesquisa Raio-X (trimestral, qualitativa). A metodologia emprega um **Índice de Laspeyres com média móvel de três meses**, baseado na **mediana** dos preços por m² em células definidas por área de ponderação do IBGE × número de dormitórios, com pesos derivados do Censo Demográfico.

**Dados recentes:** em dezembro/2024, o preço médio nacional foi de **R$ 9.366/m²** (+7,73% no ano, maior alta desde 2013). Em dezembro/2025, atingiu **R$ 9.611/m²** (+6,52%). Destaques por capital (dez/2025): Vitória R$ 14.108/m², Florianópolis R$ 12.773, São Paulo R$ 11.900, Rio de Janeiro R$ 10.830, Belo Horizonte R$ 10.642. O maior valor absoluto é Balneário Camboriú com R$ 14.906/m². Na locação, a alta acumulada em 2024 foi de **13,50%** e em 2025 de **9,44%**.

**A limitação central: preço anunciado ≠ transacionado.** O próprio documento metodológico da Fipe reconhece essa fragilidade. A Pesquisa Raio-X FipeZap (2T/2025) revela que **63% a 67% das transações envolvem desconto sobre o preço anunciado**, com **desconto médio de ~10%**. Portanto, o FipeZap tende a **superestimar** o preço real de mercado. Além disso, concentra-se em imóveis de médio e alto padrão anunciados em portais online — imóveis populares (MCMV) e de periferia são sub-representados.

Para estimativas de preços transacionados, recomenda-se cruzar com o **IVG-R** (Banco Central, série SGS 21340 — baseado em laudos de avaliação de imóveis financiados, 13 RMs, série desde 2001), o **IGMI-R** (FGV/Abecip — índice hedônico com 40+ variáveis) e **registros cartoriais** (ARISP/ARIRJ, disponíveis na Base dos Dados desde 2012).

**Acesso:** https://www.fipe.org.br/pt-br/indices/fipezap/ | informes: https://downloads.fipe.org.br/indices/fipezap/ | metodologia: https://downloads.fipe.org.br/indices/fipezap/metodologia/indice-fipezap-metodologia-2019.pdf

---

## 4. Secovi-SP e regionais: VSO e o mercado paulistano em detalhe

O Secovi-SP (Sindicato da Habitação de São Paulo) produz a **PMI (Pesquisa do Mercado Imobiliário)**, principal pesquisa do mercado primário da cidade de São Paulo, com dados mensais coletados diretamente junto a incorporadoras associadas. Diferentemente do FipeZap, a PMI capta **preços transacionados** (contratos de compra e venda), embora seu foco seja em volumes e não em índices de preço padronizados.

**Indicadores publicados:** unidades lançadas, unidades vendidas, VGV (deflacionado pelo INCC-DI), VGO (valor global da oferta), oferta final, e o indicador-chave **VSO (Vendas Sobre Oferta)** — mensal e acumulado 12 meses. A segmentação detalha por número de dormitórios, faixa de área útil, faixa de preço, zona da cidade e programa (MCMV vs. demais).

**VSO — fórmula e interpretação:** VSO mensal = (unidades vendidas no mês ÷ unidades ofertadas no mês) × 100, onde ofertadas = estoque início do período + lançamentos. VSO 12 meses = (vendidas em 12 meses ÷ [oferta inicial + lançamentos em 12 meses]) × 100. Faixas de referência em São Paulo: VSO mensal de **8-18%** (14,4% em março/2025); VSO 12 meses de **50-65%** (~62,7% em 2024, 61,8% em março/2025). **VSO 12m acima de 60%** indica mercado aquecido; **abaixo de 50%** sinaliza acúmulo de estoque.

**Balanço 2024 — cidade de São Paulo (recordes históricos):** vendas de **103,3 mil unidades** (+36%), lançamentos de **104,4 mil unidades** (+43%), VGV de R$ 54 bilhões (+15%). MCMV representou 56% das vendas. Em 2025, lançamentos saltaram para **139,7 mil unidades** (+34%), mas o estoque engordou.

**Secovis regionais:** o Secovi-RJ utiliza registros tributários (ITBI) da prefeitura e publica dados por bairro (50+ bairros); o CMI/Secovi-MG cobre BH e Nova Lima em parceria com a Brain; ADEMIs regionais (RJ, ES) também produzem pesquisas com VSO. O Secovi-SP expandiu a cobertura com estudos trimestrais para 16 regionais do interior paulista (Campinas, Ribeirão Preto, São José dos Campos, Baixada Santista, entre outras).

**Limitações:** cobertura mensal restrita à cidade de São Paulo; amostra dependente de associadas (possível sub-representação de empresas menores); não capta mercado de usados; defasagem de 30-45 dias; não publica preço/m² padronizado para comparação direta com o FipeZap; mudança da faixa MCMV em julho/2023 (de R$ 264 mil para R$ 350 mil) afeta comparabilidade histórica.

**Acesso:** https://secovi.com.br/pesquisa-mensal-do-mercado-imobiliario/ | pesquisas: https://secovi.com.br/pesquisas-e-indices/ | Secovi-RJ: https://www.secovirio.com.br/pesquisa-indicadores/

---

## 5. ANBIMA: precificação do mercado de capitais imobiliário

A ANBIMA cobre o lado financeiro do mercado imobiliário — **securitização, fundos e curvas de juros** — com dados diários de preços/taxas e boletins mensais.

**CRI (Certificados de Recebíveis Imobiliários):** emissões recordes de **~R$ 57,4 bilhões em 2024**, estoque de **R$ 240 bilhões** em meados de 2025. A ANBIMA publica diariamente taxas indicativas (PU, spread sobre benchmark) de CRIs no mercado secundário. **FIIs:** o IFIX (índice de fundos imobiliários) acumulou alta de **21,15% em 2025**; captação líquida de R$ 39,9 bilhões em 2024 (+32% vs. 2023). **LCI:** monitorada pela ANBIMA e BACEN como instrumento de funding imobiliário — após mudanças do CMN em fevereiro/2024, houve ajustes em prazos de carência e regras de lastro.

**Curvas de juros (ETTJ):** a ANBIMA publica diariamente as estruturas a termo de juros — **Prefixada** (baseada em LTN e NTN-F), **IPCA+** (baseada em NTN-B), Cupom de TR, IGP-M e Cambial — calculadas pelo modelo de **Svensson (1994)** com otimização via algoritmo genético. O **IDkA (Índice de Duração Constante)** oferece benchmarks de renda fixa em vértices de 3 meses a 30 anos, tanto prefixados quanto IPCA+.

**Limitações:** taxas indicativas de CRI/CRA podem ter baixa representatividade em títulos pouco líquidos; ETTJ para prazos muito longos depende da liquidez de NTN-B; dados de emissão cobrem apenas ofertas públicas registradas.

**Acesso:** ANBIMA Data: https://data.anbima.com.br/ | CRI/CRA: https://data.anbima.com.br/certificado-de-recebiveis | curvas de juros: https://www.anbima.com.br/pt_br/informar/curvas-de-juros-fechamento.htm | boletins: https://data.anbima.com.br/publicacoes/boletim-de-mercado-de-capitais

---

## 6. BACEN: séries de crédito, inadimplência e o coração regulatório

O Banco Central do Brasil é a fonte primária para dados de crédito imobiliário, acessíveis via **SGS (Sistema Gerenciador de Séries Temporais)** com API REST pública. As séries fundamentais para análise de carteiras incluem:

- **Saldo da carteira PF — financiamento imobiliário total** (série SGS 20612): R$ 1.267 bilhões em set/2025 (+11,7% interanual), sendo 90% com taxas reguladas
- **Concessões PF** (séries 20700/20702): total de R$ 312 bilhões em 2024 (recorde; +25% vs. 2023), sendo R$ 186,7 bi SBPE e R$ 126 bi FGTS
- **Inadimplência PF — imobiliário total** (série 21151, atraso >90 dias): **1,0% em 2024** — mínima histórica da série Abecip desde 2006, vs. 4,1% de inadimplência geral do SFN
- **Taxa média de juros PF — imobiliário** (séries 20774, 25497-25499): SBPE a partir de 8,99% a.a.; custo efetivo máximo SFH de 12% a.a.
- **TR (Taxa Referencial)** (séries 226/7811/7812): acumulada de 0,81% em 2024 e ~1,97% em 2025, após ficar zerada de 2017 a ~2021
- **IVG-R** (série 21340): índice de preços baseado em avaliações bancárias — único índice "oficial" próximo de preços transacionados, usado pelo BIS

O **Relatório de Estabilidade Financeira (REF)**, publicado semestralmente, apresenta análises de LTV, curvas vintage, testes de estresse e qualidade das concessões — é fonte privilegiada para contextualizar carteiras. O **SCR (Sistema de Informações de Crédito)** alimenta todas essas estatísticas e permite segmentação por fonte de recurso (SBPE/FGTS), tipo de taxa, tipo de imóvel e sistema (SFH/SFI), embora dados granulares sejam de acesso restrito a instituições autorizadas.

**API de acesso programático:** `https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados?formato=json&dataInicial={dd/MM/aaaa}&dataFinal={dd/MM/aaaa}`. O pacote Python `python-bcb` e o pacote R `realestatebr` oferecem wrappers prontos.

**Limitações:** dados públicos são agregados (sem segmentação regional no SGS); defasagem de ~2 meses; séries não distinguem diretamente SBPE vs. FGTS (distinção disponível nos dados Abecip e no painel de mercado imobiliário do BACEN).

**Acesso:** SGS: https://www4.bcb.gov.br/pec/series/port/aviso.asp | dados abertos: https://dadosabertos.bcb.gov.br/ | REF: https://www.bcb.gov.br/publicacoes/ref | painel imobiliário (metodologia): https://www.bcb.gov.br/content/estatisticas/mercadoimobiliario_docs/Metodologia.pdf

---

## 7. IBGE: a âncora macroeconômica do setor

O IBGE fornece os alicerces estatísticos que contextualizam todo o mercado imobiliário, desde inflação habitacional até demografia e PIB setorial.

**IPCA — Grupo Habitação:** peso de ~15-16% no índice total (ponderação POF 2017-2018). Inclui aluguel residencial, condomínio, energia elétrica, água/esgoto, gás e materiais de construção. Em 2024, acumulou +3,06%; em 2025, acelerou para **+6,79%** (maior impacto no IPCA total: 1,02 p.p.), puxado pela energia elétrica (+12,31%). Cobertura: 16 áreas urbanas, publicação mensal.

**SINAPI:** já detalhado na seção da CBIC, é a referência obrigatória para obras públicas. O custo nacional do m² atingiu **R$ 1.932,27 em março/2026** (+6,73% em 12 meses).

**INCC (Índice Nacional de Custo da Construção):** calculado pela **FGV IBRE** (não pelo IBGE), em 7 capitais, com três versões mensais (INCC-DI, INCC-M, INCC-10). Compõe 10% do IGP-M e é amplamente usado como indexador de contratos de compra de imóveis na planta. INCC-M acumulado 12 meses em março/2026: **+5,81%**. Componentes: materiais/equipamentos e mão de obra (sensível a dissídios coletivos).

**PIB da Construção Civil:** calculado nas Contas Nacionais Trimestrais, cresceu **+4,3% em 2024** (R$ 359,5 bilhões), mas desacelerou para **+0,5% em 2025** sob pressão da Selic elevada (14,75%).

**PNAD Contínua e Déficit Habitacional:** a PNAD é a base para o cálculo do déficit habitacional pela Fundação João Pinheiro — **5,77 milhões de domicílios em 2024** (7,4% do total), com 62% decorrente de ônus excessivo com aluguel. O setor empregava **~7,84 milhões de trabalhadores** em 2024.

**Censo 2022 — dados habitacionais:** revelou que **20,9% da população mora em domicílios alugados** (vs. 16,4% em 2010 e 12,3% em 2000), 12,5% em apartamentos (vs. 8,5% em 2010) e que existem **11,4 milhões de domicílios vagos** — mais que o dobro do déficit habitacional. Limitação relevante: o Censo 2022 **retirou o quesito "valor do aluguel"** do questionário, dificultando a apuração do déficit.

**Acesso:** IPCA: https://sidra.ibge.gov.br/pesquisa/ipca/tabelas | SINAPI: https://sidra.ibge.gov.br/pesquisa/sinapi | PIB: https://www.ibge.gov.br/estatisticas/economicas/contas-nacionais/9300-contas-nacionais-trimestrais.html | Censo: https://censo2022.ibge.gov.br/panorama/

---

## IVV, VSO e preço por m²: os indicadores transversais desmistificados

Três indicadores aparecem em múltiplas fontes e geram confusão frequente — aqui estão suas definições precisas e diferenças:

**IVV (Índice de Velocidade de Vendas):** IVV = (unidades vendidas ÷ unidades ofertadas) × 100. Publicado por Sinduscons/ADEMIs regionais (Sinduscon-DF, FIEPE-Recife) e CBIC/Brain. Tende a focar em lançamentos recentes. Faixas de referência mensal: **abaixo de 5%** = mercado fraco; **5-10%** = saudável; **acima de 10%** = aquecido.

**VSO (Vendas Sobre Oferta):** VSO = (vendidas ÷ [estoque + lançamentos]) × 100. Principal indicador do Secovi-SP, avalia todo o estoque disponível (inclusive prontos e em construção). Na prática brasileira, **IVV e VSO medem essencialmente a mesma coisa** — a diferença reside na amostra, no escopo (IVV foca em lançamentos; VSO abrange todo estoque) e na entidade que publica.

**Preço por m² — anunciado vs. transacionado:** o FipeZap mede preços de **oferta** (anunciados), com superestimação média de ~10% sobre o preço transacionado. O IVG-R do BACEN (série 21340) usa valores de **avaliação bancária** — proxy mais próximo do transacionado, porém apenas nacional e com volatilidade. O IGMI-R (FGV/Abecip) é o índice hedônico mais preciso tecnicamente, mas tem série curta (desde 2014). Registros cartoriais (ARISP/ARIRJ, disponíveis na Base dos Dados) captam preços **efetivamente declarados em escritura**, com possível viés de subdeclaração fiscal.

---

## Engenharia de contexto para agentes de IA em analytics imobiliário

### Lista consolidada de fontes

| Fonte | O que publica | Periodicidade | URL oficial |
| --- | --- | --- | --- |
| ABRAINC/Fipe | Vendas, lançamentos, distratos, entregas, VSO, inadimplência (MAP/MCMV) | Mensal | https://www.fipe.org.br/pt-br/indices/abrainc/ |
| CBIC/Brain | Lançamentos, vendas, oferta, preços (221 cidades) | Trimestral | http://www.cbicdados.com.br/ |
| CUB/Sinduscons | Custo unitário básico de construção por UF | Mensal | http://www.cub.org.br/ |
| SINAPI (IBGE/Caixa) | Custo do m² de construção, índices e preços de insumos (27 UFs) | Mensal | https://sidra.ibge.gov.br/pesquisa/sinapi |
| FipeZap | Preços de venda e locação por m² (56 cidades) | Mensal | https://www.fipe.org.br/pt-br/indices/fipezap/ |
| Secovi-SP (PMI) | VSO, lançamentos, vendas, oferta (cidade de São Paulo) | Mensal | https://secovi.com.br/pesquisa-mensal-do-mercado-imobiliario/ |
| ANBIMA | CRI, FII (IFIX), LCI, curvas de juros (ETTJ), IDkA | Diária/Mensal | https://data.anbima.com.br/ |
| BACEN (SGS) | Crédito imobiliário (saldo, concessões, inadimplência, taxas, TR, IVG-R) | Mensal/Diária | https://dadosabertos.bcb.gov.br/ |
| IBGE (IPCA) | Inflação — Grupo Habitação | Mensal | https://sidra.ibge.gov.br/pesquisa/ipca/tabelas |
| FGV (INCC) | Custo da construção habitacional (7 capitais) | Mensal | https://portalibre.fgv.br/ |
| IBGE (PIB) | PIB da Construção Civil | Trimestral | https://www.ibge.gov.br/estatisticas/economicas/contas-nacionais/ |
| FJP/PNAD | Déficit habitacional | Anual | https://fjp.mg.gov.br/deficit-habitacional-no-brasil/ |

### Benchmarks de referência para indicadores-chave (dados 2024-2025)

| Indicador | Benchmark | Fonte |
| --- | --- | --- |
| Inadimplência crédito imobiliário PF (>90d) | **1,0%** (2024, mínima histórica) | BACEN/Abecip |
| VSO 12 meses — São Paulo | **58-63%** | Secovi-SP |
| IVV mensal — mercado saudável | **5-10%** | Sinduscons/ADEMIs |
| Preço médio m² nacional (venda, anunciado) | **R$ 9.366-9.611** | FipeZap |
| Desconto médio sobre preço anunciado | **~10%** | Pesquisa Raio-X FipeZap |
| Saldo crédito imobiliário PF | **R$ 1.267 bilhões** (set/2025) | BACEN |
| Taxa média juros crédito imob. SFH | **8,99-12,00% a.a.** | BACEN/Caixa |
| Estoque em meses para escoamento | **~9 meses** (2024) | CBIC |
| Distratos/vendas MAP | **~11,4%** | ABRAINC |
| INCC 12 meses | **~5,81%** (mar/2026) | FGV |
| SINAPI custo m² | **R$ 1.932/m²** (mar/2026) | IBGE/Caixa |
| Déficit habitacional | **5,77 milhões** (2024) | FJP |

### Como injetar esses dados como contexto em agentes de IA

A eficácia de um agente de IA para analytics de carteiras imobiliárias depende da qualidade e atualidade do contexto injetado. A arquitetura recomendada segue quatro camadas:

**1. Ingestão automatizada.** Usar a API REST do BACEN SGS (`api.bcb.gov.br/dados/serie/bcdata.sgs.{serie}/dados?formato=json`) para séries de crédito, inadimplência, TR e IVG-R. Para FipeZap e ABRAINC/Fipe, baixar planilhas Excel mensais programaticamente. Para CBIC, processar PDFs trimestrais. Pacotes recomendados: `python-bcb` (Python) e `realestatebr` (R). A Base dos Dados (`basedosdados.org`) disponibiliza registros cartoriais de SP/RJ consultáveis via SQL/Python.

**2. Feature store com versionamento temporal.** Armazenar cada indicador com data de referência, data de coleta e indicador de staleness (defasagem >60 dias deve gerar alerta). Frequências de atualização: diária para Selic/TR/ETTJ; mensal para FipeZap, ABRAINC, inadimplência, IVG-R; trimestral para CBIC, PIB, VSO interior.

**3. Estrutura de contexto em três camadas.** Para o prompt do agente, injetar JSON estruturado com: (a) **macro** — Selic, IPCA, desemprego, PIB construção; (b) **mercado imobiliário** — FipeZap variação 12m, VSO, estoque em meses, IVG-R, lançamentos/vendas ABRAINC; (c) **carteira específica** — LTV médio, inadimplência, PDD, curvas vintage da carteira sob análise. Sempre incluir comparative framing: "VSO 11,4% — acima da média de 8% dos últimos 5 anos".

**4. Aplicação específica por indicador de carteira.** Para **LTV**: cruzar com IVG-R e FipeZap para avaliar se os valores de garantia da carteira acompanham o mercado — preços em queda elevam o LTV efetivo e aumentam a LGD. Para **inadimplência**: benchmarkar contra a série 21151 do SGS (1,0% em 2024) e segmentar por safra de originação vs. condições de mercado à época (Selic, VSO, preços). Para **PDD**: sob a Resolução CMN 4.966/21 (vigente desde jan/2025, modelo de perda esperada alinhado ao IFRS 9), incorporar cenários macroeconômicos forward-looking com dados de mercado — IVV/VSO em queda e preços estagnados elevam LGD e exigem maior provisionamento. Para **curvas vintage**: correlacionar safras de originação com IVV, Selic e preço/m² vigentes à época — safras originadas em mercado aquecido (2020-2022, Selic baixa) merecem monitoramento prioritário no ciclo de alta.

### Um dado final que importa

A riqueza de fontes brasileiras é notável, mas **nenhuma delas é suficiente sozinha**. A ABRAINC vê o mercado pelas lentes de 20 grandes incorporadoras; a CBIC cobre 2/3 do mercado mas só apartamentos novos; o FipeZap mede preços de oferta, não de transação; o Secovi-SP fotografa apenas São Paulo; o BACEN agrega tudo nacionalmente sem granularidade regional pública. O verdadeiro benchmark de mercado emerge do **cruzamento inteligente** dessas fontes — e é exatamente essa síntese que um agente de IA bem contextualizado pode entregar em escala, transformando sete bases fragmentadas em uma visão integrada de risco e oportunidade.