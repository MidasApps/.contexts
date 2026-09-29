# 7.1 Dados Abertos MCMV — Indicadores

O programa MCMV possui **12 fontes primárias de dados abertos** distribuídas entre o Ministério das Cidades, Caixa, BCB, órgãos de controle e institutos setoriais — mas a qualidade, granularidade e acessibilidade variam drasticamente entre elas. A principal base estruturada (CSV com dicionário de dados) está no portal do Ministério das Cidades, cobrindo **58.300+ empreendimentos OGU desde 2007** e operações FGTS até dezembro de 2025. Contudo, lacunas críticas persistem: não há dados abertos de prazo médio de obra, inadimplência por faixa, progresso físico de canteiros, nem painel interativo em tempo real — limitações que prejudicam diretamente a construção de curvas vintage de entrega e análises de eficiência regional. Para agentes de IA atendendo securitizadoras, incorporadoras e fundos imobiliários, o cenário atual exige combinar pelo menos **6 fontes distintas** em formatos heterogêneos (CSV, PDF, API, Power BI) para montar uma visão analítica minimamente completa do programa que já contratou **2,2 milhões de unidades desde 2023** e movimenta **R$ 180 bilhões/ano**.

---

## As três bases estruturadas do Ministério das Cidades

O ponto de acesso central está em **https://www.gov.br/cidades/pt-br/acesso-a-informacao/acoes-e-programas/habitacao/programa-minha-casa-minha-vida/bases-de-dados-do-programa-minha-casa-minha-vida**, página atualizada em 11/02/2026 com publicação mínima trimestral conforme o Plano de Dados Abertos. Todas as bases compartilham um dicionário de dados unificado em PDF (datado de 09/10/2025).

**1. MCMV Subsidiado OGU — Empreendimentos** é o dataset mais rico e granular. Formato CSV (delimitado por ponto-e-vírgula), com **21 campos** verificados: `data_referencia`, `cod_ibge`, `txt_nome_municipio`, `txt_sigla_uf`, `txt_regiao`, `dt_assinatura`, `cod_operacao`, `txt_nome_empreendimento`, `txt_nome_agente_financeiro`, `txt_modalidade` (FAR, Entidades, Oferta Pública, Rural), `txt_situacao_empreendimento` (Concluído, Em obras, Distratado), `qtd_uh` (unidades planejadas), `qtd_uh_entregues`, `qtd_uh_vigentes`, `qtd_uh_distratadas`, `val_contratado_total`, `val_desembolsado`, `txt_cnpj_construtora_entidade`, `txt_nome_construtora_entidade`, `txt_endereco` e `txt_cep`. A referência mais recente é março de 2025, cobrindo o período **2007–presente** com ~58.300 empreendimentos. URL de download: `https://www.gov.br/cidades/pt-br/.../arquivos/dados_abertos_ogu_202503.csv`.

**2. MCMV Financiado FGTS — Sintético** agrega operações por município, ano de contratação e programa/fundo. Formato CSV, referência dezembro de 2025. URL: `https://www.gov.br/cidades/pt-br/.../arquivos/dados_abertos_FGTS_SINTETICO_202512.csv`. Granularidade municipal e anual, com indicação de faixa de renda.

**3. MCMV Financiado FGTS/FS — Analítico** contém microdados no nível do contrato individual (pessoa física), incluindo faixa de renda, município, valores de financiamento e dados do Fundo Social. Formato RAR (CSV comprimido, arquivo grande). Referência dezembro de 2025. URL: `https://www.cidades.gov.br/images/stories/ArquivosSNH/ArquivosZIP/dados_abertos_FGTS_ANALITICO_202512.rar`. Há guia auxiliar em PDF explicando como abrir os dados.

Além destes, existem bases complementares: **Execução Orçamentário-Financeira SNH 2024** (CSV, dados do SIAFI/Tesouro Gerencial), **Emendas Parlamentares na SNH 2024** (CSV) e **Regularidade dos Entes no SNHIS** (XLS, referência 09/02/2026, cobrindo todos os 5.570 municípios). O portal CKAN do ministério (dadosabertos.cidades.gov.br) espelha parte dos dados, mas retorna erros 403 e mantém snapshots mais antigos que a página principal.

---

## Fontes financeiras: Caixa, FGTS, ABECIP e Banco Central

A **Caixa Econômica Federal** opera >99% das operações MCMV mas **não publica dados abertos estruturados específicos do programa**. As informações vêm embutidas em relatórios de RI (ri.caixa.gov.br) e no Relatório Integrado — ambos em PDF. Dados-chave extraíveis: carteira de crédito habitacional de **R$ 875,5 bilhões** (jun/2025), market share de **66,8%** no crédito imobiliário total, **803.400 unidades financiadas em 2024** (+15,7% a/a), inadimplência geral de **2,66%** e recorde de **R$ 223 bilhões contratados em 2024**.

Os **Relatórios de Gestão do FGTS** (https://www.fgts.gov.br/Paginas/subpaginas/relatorio-gestao.aspx) cobrem **1999–2024** em PDF anual. O relatório de 2024 mostra patrimônio de R$ 770,4 bilhões, carteira de crédito de R$ 552,2 bilhões e desembolso de R$ 117,6 bilhões para habitação/saneamento/infraestrutura. O orçamento FGTS para habitação em 2026 foi aprovado em **R$ 144,5 bilhões** — recorde histórico. O portal fgts.gov.br também oferece páginas sobre investimentos em habitação, obras paralisadas e atas do Conselho Curador.

A **ABECIP** (abecip.org.br/imprensa/informativos-mensais) publica boletins mensais "Data ABECIP" em PDF com dados SBPE: volume de financiamento, unidades financiadas, captação líquida da poupança, ranking de instituições. Série histórica desde 1995, atualização mensal. **Limitação crucial: ABECIP cobre apenas financiamento via poupança (SBPE), que é mercado médio/alto padrão — exclui operações FGTS/MCMV.** A inadimplência SBPE atingiu **1,0%** em 2024, mínima histórica.

O **Banco Central** oferece a fonte mais sofisticada tecnicamente. O dataset "Informações do Mercado Imobiliário" (https://dadosabertos.bcb.gov.br/dataset/informacoes-do-mercado-imobiliario) disponibiliza **4.000+ séries mensais** via OData API (`https://olinda.bcb.gov.br/olinda/servico/MercadoImobiliario/versao/v1/odata/`), com CSV/JSON, cobrindo: fontes de recursos (SBPE/FGTS), direcionamento da poupança, valores contábeis das carteiras imobiliárias, operações de crédito do SCR **por UF**, detalhes de imóveis financiados e o **IVG-R** (índice de preços baseado em valores de garantia). A separação entre "taxas reguladas" (proxy para MCMV/FGTS) e "taxas de mercado" (SBPE livre) permite análise indireta do segmento MCMV. Atualização mensal com lag de ~60 dias. Séries no SGS (https://www3.bcb.gov.br/sgspub/) incluem: saldo de crédito direcionado habitacional PF (série 20612), concessões (20702), taxa média de juros habitacional (20774).

---

## Órgãos de controle: TCU e CGU revelam fragilidades sistêmicas

O **TCU** produziu ao menos **6 auditorias relevantes** sobre o MCMV. O Acórdão 2.608/2018-Plenário (avaliação consolidada) diagnosticou que o programa monitora apenas produtos (unidades construídas), não resultados (redução efetiva do déficit), e possui "baixa maturidade" em M&E. O Acórdão 1.110/2024-Plenário (TC 019.691/2023-8) avaliou o novo MCMV e alertou para risco de repetição de problemas anteriores, especialmente falta de transparência nas fases de seleção de propostas, execução de obras e monitoramento pós-ocupação. A auditoria financeira do TCU encontrou **discrepâncias bilionárias** entre valores reportados pelo Ministério como transferidos à Caixa (R$ 11,3 bi) e valores que a Caixa reportou receber (R$ 2,7 bi) — divergência que compromete a confiabilidade de dados financeiros cruzados entre fontes. A API de dados abertos do TCU (https://dados-abertos.apps.tcu.gov.br/api/acordao/recupera-acordaos) permite consulta programática de todos os acórdãos por palavra-chave.

O **Portal da Transparência** (CGU) permite consultar gastos do programa MCMV por ano fiscal em https://portaldatransparencia.gov.br/programas-de-governo/1M-minha-casa-minha-vida (parâmetro `?ano=XXXX`). Dados extraídos do SIAFI cobrem todo o ciclo orçamentário (dotação → empenho → liquidação → pagamento), com granularidade até município, atualização semanal, e download em CSV (limite de 20.000 registros). A API REST está em https://portaldatransparencia.gov.br/api-de-dados. Convênios habitacionais podem ser filtrados em https://portaldatransparencia.gov.br/convenios/consulta. A avaliação mais detalhada da CGU (2017) inspecionou 1.472 unidades em 77 empreendimentos e encontrou **56,4% com defeitos construtivos** — infiltrações, trincas e vazamentos.

O **Transferegov.br** (antigo SICONV) registra propostas e execução de termos de compromisso do MCMV Sub-50 e FNHIS, com dados municipais de planos de trabalho e liberações financeiras.

---

## Fontes complementares para contextualização analítica

**IBGE — Déficit habitacional e custos de construção.** A PNAD Contínua (trimestral, por UF/RM) fornece dados-base que a Fundação João Pinheiro usa para calcular o déficit oficial: **5.773.983 domicílios em 2024** (7,4%, mínima histórica), com **74,5%** concentrado em famílias com renda ≤2 salários mínimos (público Faixa 1) e componente principal de ônus excessivo com aluguel (**62,14%** do déficit). O Censo 2022 atingiu granularidade de setor censitário, identificando **11,4 milhões de domicílios vagos** contra ~6 milhões de déficit — dado essencial para questionar a ênfase do MCMV em construção nova vs. reabilitação. O **SINAPI** (IBGE/Caixa) é referência obrigatória para orçamentos de obras públicas: custo por m² por UF, mensal, série desde 1969. Em janeiro de 2026: **R$ 1.920,74/m²** (R$ 1.081 materiais + R$ 839 mão de obra). Tabelas SIDRA relevantes: 3261 (rendimento domiciliar), 579 (domicílios por tipo), 2864 (condição de ocupação).

**FGV — INCC.** O Índice Nacional de Custo da Construção é o indexador contratual padrão de incorporações na fase de obras. Série desde **1944**, publicação mensal. INCC-M acumulado 12 meses em março de 2026: **5,83%**. O INCC-DI coleta preços em 7 capitais; o INCC-M em 18 capitais. Dados disponíveis via portais agregadores (brasilindicadores.com.br, sindusconpr.com.br em Excel) e FGV IBRE. Comparar trajetória do INCC com tetos de valor do MCMV revela pressão de viabilidade sobre construtoras.

**CBIC — Indicadores Imobiliários Nacionais** (parceria com Brain Inteligência, trimestral desde 2016, 221 cidades). Segmentam explicitamente **MCMV vs. MAP** (médio/alto padrão) em lançamentos, vendas, oferta final, VSO e preços. No Q1 2025: MCMV representou **53% dos lançamentos** e **47% das vendas** nacionais. Dados em http://www.cbicdados.com.br/.

**ABRAINC-FIPE** (mensal, desde 2014, ~20 incorporadoras listadas). Indicadores de lançamentos, vendas, entregas, distratos e VSO, segmentados por **MCMV vs. MAP**. Em 2024: vendas MCMV +25,2% em lançamentos, +13,1% em vendas. Taxa de distrato MAP: 10,5%. Dados em https://www.fipe.org.br/pt-br/indices/abrainc/ e https://www.abrainc.org.br/indicadores-publicacoes/indicadores/.

---

## Estado atual do programa: faixas, metas e novas modalidades

O MCMV foi relançado pela **Lei 14.620 (julho 2023)**, substituindo o Casa Verde e Amarela. As faixas de renda foram atualizadas múltiplas vezes, com a revisão mais recente aprovada pelo Conselho Curador do FGTS em **24/03/2026**: Faixa 1 até R$ 3.200/mês, Faixa 2 até R$ 5.000, Faixa 3 até R$ 9.600, e a nova **Faixa 4 até R$ 13.000** (criada em abril de 2025 para a "classe média", juros de 10% a.a., imóveis até R$ 600 mil). Subsídios Faixa 1 podem chegar a 95% do valor do imóvel; para beneficiários BPC/Bolsa Família, a moradia é integralmente gratuita.

A meta original de **2 milhões de unidades** (2023-2026) foi atingida um ano antes do prazo, no final de 2025. O governo elevou a meta para **3 milhões até o fim de 2026**. O orçamento saltou de R$ 111,1 bilhões (2023) para **R$ 180 bilhões (2025)**. Novas modalidades incluem MCMV Reconstrução/Compra Assistida (enchentes RS, 9.000+ famílias), PPP de Locação Social (Recife: 1.128 unidades), MCMV Rural (30 mil novas unidades), 3% de reserva FAR para população em situação de rua, e o programa complementar Reforma Casa Brasil.

---

## Avaliação de qualidade e lacunas críticas nos dados

A tabela abaixo sintetiza as fontes, formatos e limitações:

| Fonte | URL principal | Formato | Granularidade | Atualização | Período | Qualidade |
| --- | --- | --- | --- | --- | --- | --- |
| Min. Cidades — OGU | gov.br/cidades/.../bases-de-dados | CSV | Municipal/empreendimento | Trimestral | 2007–2025 | ★★★★★ |
| Min. Cidades — FGTS Sintético | idem | CSV | Municipal/ano/faixa | Trimestral | Histórico–2025 | ★★★★☆ |
| Min. Cidades — FGTS Analítico | idem | RAR/CSV | Contrato individual | Trimestral | Histórico–2025 | ★★★★☆ |
| BCB — Mercado Imobiliário | dadosabertos.bcb.gov.br | API/CSV/JSON | UF/mensal | Mensal (60d lag) | 2002+ | ★★★★★ |
| FGTS — Relatórios Gestão | fgts.gov.br | PDF | Nacional/anual | Anual | 1999–2024 | ★★★★★ |
| Portal da Transparência | portaldatransparencia.gov.br | CSV/API | Municipal/diário | Semanal | 2012+ | ★★★★★ |
| ABRAINC-FIPE | fipe.org.br/indices/abrainc | PDF/Excel | Nacional/MCMV vs MAP | Mensal (3m lag) | 2014+ | ★★★★☆ |
| CBIC Indicadores | cbicdados.com.br | PDF/Excel | 221 cidades/MCMV vs MAP | Trimestral | 2016+ | ★★★★☆ |
| SINAPI (IBGE/Caixa) | sidra.ibge.gov.br | API/CSV | UF/mensal | Mensal | 1969+ | ★★★★★ |
| FGV INCC | portalibre.fgv.br | PDF/Excel | 7-18 capitais/mensal | Mensal | 1944+ | ★★★★★ |
| FJP — Déficit Habitacional | fjp.mg.gov.br / cbicdados.com.br | Excel/PDF | UF/RM/faixa renda | Irregular (anual recente) | 2016–2024 | ★★★★★ |
| Caixa RI | ri.caixa.gov.br | PDF | Nacional/trimestral | Trimestral | 2011+ | ★★★★☆ |

**Gaps identificados — dados que deveriam existir mas não existem em formato aberto:**

- **Prazo médio de obra por empreendimento**: Data de assinatura existe no CSV OGU, mas data efetiva de conclusão/entrega por empreendimento não é publicada sistematicamente — impossibilitando construção de curvas vintage precisas.
- **Progresso físico de obras**: Nenhum dashboard público acompanha % de conclusão de canteiros individuais.
- **Inadimplência por faixa MCMV**: BCB publica inadimplência agregada de crédito habitacional; Caixa reporta inadimplência geral (2,66%); mas não há série aberta segmentada por faixa do MCMV.
- **Perfil de beneficiários**: Dados anonimizados sobre quem recebe as unidades (distribuição de renda, demografia, cruzamento com CadÚnico) não são públicos.
- **Qualidade pós-ocupação**: As auditorias CGU/TCU são pontuais (amostras); não existe monitoramento sistemático e contínuo publicado.
- **FGTS-financiado no nível de empreendimento**: O dataset analítico tem granularidade de contrato individual, mas o sintético agrega por município/ano — falta a visão intermediária por empreendimento que o OGU oferece.
- **API para dados do Ministério das Cidades**: Não há endpoint programático funcional; o portal CKAN (dadosabertos.cidades.gov.br) retorna erros 403; acesso é exclusivamente por download de CSV.

**Inconsistências entre fontes**: O TCU documentou discrepâncias bilionárias entre valores reportados pelo Ministério como transferidos à Caixa e valores reconhecidos pela Caixa. Comunicados do governo usam escopos diferentes ("contratados", "financiados via FGTS", "entregues"), gerando números aparentemente conflitantes: 1,26M contratados 2023-2024 (SECOM, jan/2025) vs. 1,63M financiados FGTS 2023-dez/2025 vs. 2,2M contratados total (início 2026). A distinção crucial entre "contratado" (compromisso firmado) e "entregue" (unidade habitada) é frequentemente obscurecida — das 1,4M unidades "entregues" desde 2023, a grande maioria são operações FGTS de mercado (família financia imóvel já construído), enquanto entregas OGU de construção nova somam ~67 mil.

**Defasagem temporal**: Dados OGU do Ministério têm lag de **3–9 meses**; FGTS sintético ~3 meses; déficit habitacional FJP **1–2 anos**; indicadores econômicos (INCC, SINAPI, BCB) **1–2 meses**.

---

## Análises deriváveis do cruzamento de bases

O cruzamento dessas fontes permite análises de alto valor para o mercado imobiliário e de capitais:

**Séries históricas completas** podem ser construídas desde 2009 cruzando dados OGU (contratação/entrega por município) + BCB SGS (crédito habitacional mensal) + INCC/SINAPI (custos) + Selic + CAGED (emprego na construção). A série OGU é a espinha dorsal, mas cobre apenas ~15% do volume total de contratação (parcela subsidiada); para os 85% financiados via FGTS, dependemos de dados agregados do relatório FGTS + dados sintéticos do Ministério.

**Curvas vintage de entrega** são parcialmente viáveis usando o CSV OGU: agrupando empreendimentos por ano de assinatura (`dt_assinatura`) e calculando a proporção com status "Concluído" vs. "Em obras" vs. "Distratado" ao longo do tempo. A limitação é a ausência de data de conclusão exata — apenas o status corrente é publicado. A análise do Fiquem Sabendo identificou **5.400 empreendimentos ainda inconclusos** em setembro de 2024, predominantemente contratados antes de 2019.

**Análise de eficiência regional** pode cruzar: unidades MCMV contratadas por UF/município (Min. Cidades) ÷ déficit habitacional local (FJP) × custo médio por unidade (`val_contratado_total`/`qtd_uh` do OGU) × emprego gerado (CAGED). Dados regionais revelam assimetrias: Norte teve 56 mil contratações 2023-2024 contra déficit de 773 mil (7% de cobertura), enquanto Sudeste contratou 549 mil contra 2,6M de déficit (21%).

**Viabilidade de incorporadoras no MCMV** pode ser modelada comparando trajetórias do INCC (custo) vs. tetos de valor por faixa (publicados em portarias ministeriais) vs. velocidade de vendas CBIC/ABRAINC vs. custo de funding (Selic, taxas BCB). A compressão de margens é mensurável: INCC acumulou 6,1% em 2025 enquanto ajustes de teto ocorrem com defasagem.

**Risco de crédito imobiliário** pode ser acompanhado via BCB (inadimplência por UF, série 20612), ABECIP (inadimplência SBPE 1,0%), Caixa RI (inadimplência geral 2,66%) e FGTS (execução vs. orçamento). O BCB Mercado Imobiliário separa taxas reguladas (proxy MCMV) vs. mercado — permitindo análise diferenciada de risco entre segmentos.

---

## Conclusão: um ecossistema rico mas fragmentado

O Brasil dispõe de um volume substancial de dados abertos sobre o MCMV — mais do que a maioria dos programas habitacionais de países em desenvolvimento. As bases CSV do Ministério das Cidades (OGU + FGTS) formam o núcleo operacional, com granularidade municipal e cobertura desde 2007. O Banco Central oferece a camada financeira mais sofisticada, com 4.000+ séries via API. Indicadores setoriais (CBIC, ABRAINC-FIPE) completam a visão de mercado com segmentação explícita MCMV vs. MAP.

Porém, três limitações estruturais comprometem a engenharia de contexto para agentes de IA. Primeira: **não existe API funcional** para os dados primários do MCMV; o acesso é por download manual de CSV/RAR, inadequado para sistemas automatizados. Segunda: **a fronteira entre "contratado" e "entregue"** é deliberadamente nebulosa nas comunicações oficiais, exigindo que qualquer análise séria reconcilie definições entre fontes. Terceira: **os 85% de volume FGTS-financiado** têm granularidade pública muito inferior aos 15% subsidiados OGU — justamente o segmento mais relevante para securitizadoras e fundos, que operam nas Faixas 2-4.

Para operacionalizar esse mapeamento, a recomendação é construir um pipeline ETL que (1) faça scraping trimestral dos CSVs do Ministério das Cidades, (2) consuma a API OData do BCB Mercado Imobiliário em frequência mensal, (3) extraia dados estruturados dos PDFs do FGTS e Caixa RI via LLM, (4) integre séries SINAPI/INCC/Selic via API BCB SGS, e (5) incorpore indicadores CBIC/ABRAINC quando publicados trimestralmente. Este pipeline produziria o dataset mais completo disponível publicamente sobre o ecossistema MCMV — preenchendo uma lacuna que nem o próprio governo mantém de forma integrada.