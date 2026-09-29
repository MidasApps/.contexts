# 7.2 Indicadores do Banco Central

O Banco Central do Brasil disponibiliza **mais de 40 séries temporais** diretamente relacionadas ao crédito imobiliário via SGS, além de uma API OData específica para o Mercado Imobiliário com mais de 4.000 séries complementares. O ecossistema de dados é robusto, público e gratuito, permitindo construir análises sofisticadas de oferta/demanda de crédito, ciclos imobiliários e gestão de funding. Este guia consolida todos os códigos SGS relevantes, a documentação da API, os indicadores macroeconômicos correlatos, frameworks analíticos e orientações para uso em agentes de IA — com dados atualizados de 2024–2026.

---

## 1. Séries SGS de crédito imobiliário: o mapa completo dos códigos

No SGS, o crédito imobiliário é classificado como **crédito com recursos direcionados**, dividido em duas modalidades centrais: **"taxas reguladas"** (equivalente ao **SFH** — Sistema Financeiro da Habitação) e **"taxas de mercado"** (equivalente ao **SFI** — Sistema Financeiro Imobiliário). Todas as séries abaixo são **mensais**, iniciadas em março/2011 (baseadas no Documento 3050/SCR), e seus valores são expressos em **R$ milhões** (saldos e concessões), **% a.a.** (taxas), **meses** (prazos) ou **%** (inadimplência).

### Concessões de crédito imobiliário

| Código SGS | Descrição | Segmento | Unidade |
| --- | --- | --- | --- |
| **20704** | Concessões — Financiamento imobiliário total | PF | R$ milhões |
| **20703** | Concessões — Financiamento imobiliário taxas reguladas (SFH) | PF | R$ milhões |
| **20702** | Concessões — Financiamento imobiliário taxas de mercado (SFI) | PF | R$ milhões |
| **20692** | Concessões — Financiamento imobiliário total | PJ | R$ milhões |
| **20691** ¹ | Concessões — Financiamento imobiliário taxas reguladas (SFH) | PJ | R$ milhões |
| **20690** | Concessões — Financiamento imobiliário taxas de mercado (SFI) | PJ | R$ milhões |

### Saldo da carteira de crédito imobiliário

| Código SGS | Descrição | Segmento | Unidade |
| --- | --- | --- | --- |
| **20612** | Saldo — Financiamento imobiliário total | PF | R$ milhões |
| **20611** | Saldo — Financiamento imobiliário taxas reguladas (SFH) | PF | R$ milhões |
| **20610** | Saldo — Financiamento imobiliário taxas de mercado (SFI) | PF | R$ milhões |
| **20600** ¹ | Saldo — Financiamento imobiliário total | PJ | R$ milhões |
| **20599** ¹ | Saldo — Financiamento imobiliário taxas reguladas (SFH) | PJ | R$ milhões |
| **20598** ¹ | Saldo — Financiamento imobiliário taxas de mercado (SFI) | PJ | R$ milhões |

### Taxas de juros médias

| Código SGS | Descrição | Segmento | Unidade |
| --- | --- | --- | --- |
| **20774** | Taxa média — Financiamento imobiliário total | PF | % a.a. |
| **20773** | Taxa média — Financiamento imobiliário taxas reguladas (SFH) | PF | % a.a. |
| **20772** | Taxa média — Financiamento imobiliário taxas de mercado (SFI) | PF | % a.a. |
| **25499** | Taxa média mensal — Financiamento imobiliário total | PF | % a.m. |
| **25498** | Taxa média mensal — Financiamento imobiliário taxas reguladas | PF | % a.m. |
| **25497** | Taxa média mensal — Financiamento imobiliário taxas de mercado | PF | % a.m. |
| **20763** ¹ | Taxa média — Financiamento imobiliário total | PJ | % a.a. |
| **20762** ¹ | Taxa média — Financiamento imobiliário taxas reguladas (SFH) | PJ | % a.a. |
| **20761** | Taxa média — Financiamento imobiliário taxas de mercado (SFI) | PJ | % a.a. |

### Prazo médio das operações

| Código SGS | Descrição | Tipo | Unidade |
| --- | --- | --- | --- |
| **20914** | Prazo médio das concessões — Fin. imobiliário total | PF | Meses |
| **20913** ¹ | Prazo médio das concessões — Fin. imobiliário taxas reguladas | PF | Meses |
| **20912** ¹ | Prazo médio das concessões — Fin. imobiliário taxas de mercado | PF | Meses |
| **20993** ¹ | Prazo médio da carteira — Fin. imobiliário total | PF | Meses |
| **20991** | Prazo médio da carteira — Fin. imobiliário taxas de mercado | PF | Meses |
| **20981** | Prazo médio da carteira — Fin. imobiliário total | PJ | Meses |

### Inadimplência (atraso superior a 90 dias)

| Código SGS | Descrição | Segmento | Unidade |
| --- | --- | --- | --- |
| **21151** | Inadimplência — Financiamento imobiliário total | PF | % |
| **21150** ¹ | Inadimplência — Financiamento imobiliário taxas reguladas (SFH) | PF | % |
| **21149** | Inadimplência — Financiamento imobiliário taxas de mercado (SFI) | PF | % |
| **21139** ¹ | Inadimplência — Financiamento imobiliário total | PJ | % |
| **21138** ¹ | Inadimplência — Financiamento imobiliário taxas reguladas (SFH) | PJ | % |
| **21137** ¹ | Inadimplência — Financiamento imobiliário taxas de mercado (SFI) | PJ | % |

### Índice de preços de imóveis e séries especiais

| Código SGS | Descrição | Periodicidade | Unidade |
| --- | --- | --- | --- |
| **21340** | IVG-R — Índice de Valores de Garantia de Imóveis Residenciais | Mensal | Índice (base=100 em mar/2001) |

> ¹ Códigos inferidos pelo padrão numérico consistente do BACEN (PJ fica tipicamente 12 posições abaixo de PF; dentro de cada grupo, taxas de mercado, reguladas e total são consecutivos). Devem ser confirmados no SGS.
> 

**Séries não disponíveis no SGS padrão:** Dados por fonte de funding (SBPE, FGTS separadamente), programa MCMV e LCI (estoque/emissões) **não possuem séries SGS individuais**. Estão disponíveis via a API OData do Mercado Imobiliário e nos relatórios da ABECIP e Nota para Imprensa do BACEN.

---

## 2. APIs do BACEN: três interfaces para acessar tudo

O BACEN oferece três mecanismos principais de acesso programático aos dados: a API REST do SGS, a API OData (para Focus, Mercado Imobiliário e outros) e o legado SOAP/WSDL.

### API REST do SGS (BCData)

**URL base:**

```
https://api.bcb.gov.br/dados/serie/bcdata.sgs.{CÓDIGO}/dados
```

**Parâmetros de consulta:**

| Parâmetro | Formato | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `formato` | `json`, `xml`, `csv` | Não (padrão: json) | Formato da resposta |
| `dataInicial` | `dd/MM/aaaa` | Não | Filtro de data início |
| `dataFinal` | `dd/MM/aaaa` | Não | Filtro de data fim |

**Endpoint para últimos N valores:**

```
https://api.bcb.gov.br/dados/serie/bcdata.sgs.{CÓDIGO}/dados/ultimos/{N}?formato=json
```

**Exemplos práticos de chamadas:**

```
# Saldo total de crédito imobiliário PF — últimos 5 valores
https://api.bcb.gov.br/dados/serie/bcdata.sgs.20612/dados/ultimos/5?formato=json

# Taxa média de juros fin. imobiliário PF total — 2024 a 2025
https://api.bcb.gov.br/dados/serie/bcdata.sgs.20774/dados?formato=json&dataInicial=01/01/2024&dataFinal=31/12/2025

# Inadimplência PF fin. imobiliário total — todos os dados em CSV
https://api.bcb.gov.br/dados/serie/bcdata.sgs.21151/dados?formato=csv

# IVG-R — dados desde 2010
https://api.bcb.gov.br/dados/serie/bcdata.sgs.21340/dados?formato=json&dataInicial=01/01/2010&dataFinal=31/12/2025
```

**Formato de resposta JSON:**

```json
[
  {"data": "01/01/2025", "valor": "912345.67"},
  {"data": "01/02/2025", "valor": "918234.56"}
]
```

**Limites e boas práticas:** A API é pública, sem autenticação. O intervalo entre `dataInicial` e `dataFinal` **não deve exceder 10 anos**. O endpoint `/ultimos/N` aceita **N ≤ 20**. Não há rate limit documentado oficialmente, mas a recomendação é limitar a ~1 requisição/segundo. Para séries diárias de alta frequência, filtros de data tornaram-se obrigatórios desde março/2025. Recomenda-se **cache local** de dados históricos para evitar chamadas repetitivas.

### API OData — Focus (Expectativas de Mercado)

**URL base:**

```
https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/
```

**Documentação Swagger:**

```
https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/swagger-ui3#/
```

Os principais endpoints incluem `ExpectativasMercadoAnuais`, `ExpectativaMercadoMensais`, `ExpectativasMercadoTrimestrais`, `ExpectativasMercadoInflacao12Meses` e `ExpectativasMercadoSelic`. A API suporta parâmetros OData padrão (`$filter`, `$orderby`, `$top`, `$skip`, `$select`, `$format`).

**Exemplos de consultas ao Focus:**

```
# Expectativas anuais de IPCA (últimas 10)
https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais?$top=10&$filter=Indicador%20eq%20'IPCA'&$orderby=Data%20desc&$format=json

# Expectativas de Selic
https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais?$top=10&$filter=Indicador%20eq%20'Selic'&$orderby=Data%20desc&$format=json

# Expectativas de PIB Total
https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais?$top=10&$filter=Indicador%20eq%20'PIB%20Total'&$orderby=Data%20desc&$format=json
```

### API OData — Mercado Imobiliário

Contém **mais de 4.000 séries** com dados detalhados de funding (SBPE, FGTS), LCI, CRI e operações por origem de recursos — informações que não estão no SGS padrão:

```
https://olinda.bcb.gov.br/olinda/servico/MercadoImobiliario/versao/v1/odata/mercadoimobiliario?$format=json&$select=Data,Info,Valor
```

Essa API é a fonte primária para dados de **saldo da poupança SBPE**, **captação líquida**, **estoque de LCI/LIG** e **direcionamento de recursos**, complementando as séries do SGS com granularidade por tipo de funding.

---

## 3. Indicadores macroeconômicos correlatos: a caixa de ferramentas do analista imobiliário

### Tabela consolidada de códigos SGS

| Indicador | Código SGS | Periodicidade | Unidade | Valor recente (ref. 1T/2026) |
| --- | --- | --- | --- | --- |
| **Selic — Meta Copom** | **432** | Por reunião | % a.a. | **14,75%** |
| Selic — Efetiva diária (over) | **11** | Diária | % a.d. | ~0,0553 |
| Selic — Acumulada no mês | **4390** | Mensal | % a.m. | ~1,16 |
| Selic — Anualizada base 252 | **4189** | Diária | % a.a. | ~14,65 |
| **IPCA — Variação mensal** | **433** | Mensal | % | ~0,70 |
| **IPCA — Acumulado 12 meses** | **13522** | Mensal | % | **~4,14%** |
| **TR — Taxa Referencial** | **226** | Mensal | % a.m. | ~0,10–0,15 |
| CDI — Diário | **12** | Diária | % a.d. | ~0,0549 |
| CDI — Acumulado no mês | **4391** | Mensal | % a.m. | ~1,14 |
| CDI — Anualizado base 252 | **4392** | Diária | % a.a. | ~14,65 |
| **IGP-M** | **189** | Mensal | % | Variável |
| IGP-DI | **190** | Mensal | % | Variável |
| **INCC-DI** | **192** | Mensal | % | Variável |
| **INCC-M** | **7456** | Mensal | % | Variável |
| INPC | **188** | Mensal | % | Variável |
| IPCA-15 | **7478** | Mensal | % | Variável |
| Poupança — Rendimento (pós-2012) | **195** | Diária | % período | Variável |
| Poupança — Rendimento nominal bruto | **196** | Mensal | % a.m. | ~0,58 |

**Observações críticas sobre INCC e IGP-M:** Embora calculados pela **FGV/IBRE**, ambos estão disponíveis no SGS do BACEN. O INCC-DI (código **192**) é o índice original, enquanto o INCC-M (código **7456**) é a versão "Mercado" com coleta em período diferente.

**Poupança SBPE e LCI — dados não disponíveis como séries SGS individuais.** O saldo e a captação líquida da poupança SBPE, bem como o estoque e emissões de LCI, são divulgados pelo BACEN através da Nota para Imprensa de Estatísticas Monetárias, do portal de Mercado Imobiliário (`bcb.gov.br/estatisticas/mercadoimobiliario`) e da API OData do Mercado Imobiliário.

---

## 4. Panorama do mercado imobiliário 2024–2026: de recordes a ajustes

O ano de **2024 foi recorde absoluto** para o crédito imobiliário brasileiro: **R$ 312,4 bilhões** em financiamentos totais (+24,7% vs. 2023), com **1.173.000 unidades** financiadas. O SBPE respondeu por R$ 186,7 bilhões (+22,3%) e o FGTS por R$ 125,7 bilhões (+29%). A inadimplência atingiu **mínima histórica de 1,0%** (vs. 1,4% em 2023).

Em **2025**, a desaceleração foi pronunciada: o SBPE recuou para **R$ 156,3 bilhões (−13,4%)**, reflexo direto do ciclo de alta da Selic, que atingiu **15,00% a.a.** entre junho e dezembro de 2025. As taxas de financiamento praticadas pelos bancos oscilaram entre **11,19% (Caixa) e 13,76% (Inter)** + TR. O saldo da poupança SBPE estagnou em **~R$ 766 bilhões**, com captação líquida negativa de −R$ 85,6 bilhões no total da poupança em 2025.

A **LCI emergiu como a grande protagonista do funding**: seu estoque saltou de R$ 373 bilhões (jan/2024) para **R$ 508,8 bilhões** ao final de 2025 (+29%), elevando sua participação no funding total de 14% para **19%**. Enquanto a poupança recuou para 29% do mix, a LCI, CRI e FIIs compensaram a lacuna.

A Selic foi cortada para **14,75% em março/2026**, sinalizando início do ciclo de flexibilização. A ABECIP projeta crescimento de **16% nos financiamentos em 2026**, com SBPE estimado em R$ 180 bilhões e FGTS em R$ 145 bilhões. A expectativa Focus aponta **Selic em ~12,25–12,50%** ao final de 2026, o que deverá destravar demanda represada.

### Mudanças regulatórias estruturais

A **Resolução CMN 5.255 (outubro/2025)** redesenhou o modelo de crédito imobiliário, substituindo o direcionamento obrigatório de 65% do saldo de poupança por um modelo mais flexível e liberando **R$ 36,9 bilhões em compulsórios**. O teto do SFH foi elevado de R$ 1,5 milhão para **R$ 2,25 milhões**. A Caixa restabeleceu LTV de 80% (SAC) e 70% (Price), após ter restringido para 70%/50% em novembro/2024.

No funding, a CMN 5.119 (fevereiro/2024) restringiu lastros elegíveis para LCI e ampliou o prazo mínimo para 12 meses, depois reduzido para 9 meses (agosto/2024) e 6 meses (CMN 5.215, maio/2025). A **tributação de 7,5% de IR sobre LCI** (MP 1.303/2025) representou mudança significativa para um instrumento antes isento. O MCMV ganhou a **Faixa 4** (renda até R$ 13.000, imóveis até R$ 600 mil) e o FGTS Futuro foi regulamentado para a Faixa 1.

---

## 5. Frameworks analíticos: como transformar séries em inteligência

### Oferta versus demanda de crédito

A análise de oferta-demanda confronta o **funding disponível** (lado da oferta) com as **concessões realizadas** (lado da demanda). O índice de gap proposto:

```
Gap = (Funding_Disponível - Concessões_Acum12m) / Funding_Disponível × 100
```

Onde `Funding_Disponível = (Saldo_Poupança_SBPE × 0,65) + Saldo_LCI + Saldo_CRI_habitacional − Compulsório`. Os dados de poupança e LCI vêm da API OData do Mercado Imobiliário, enquanto as concessões usam o SGS 20704. **Sinal de aperto:** quando concessões mensais SBPE ultrapassam 1,5% do saldo de poupança, ou quando a captação líquida de poupança é negativa por mais de 3 meses consecutivos. A participação da poupança no funding caiu de **39% (2022) para 29% (2025)**, evidenciando uma transformação estrutural que torna este indicador cada vez mais relevante.

### Elasticidade e pass-through da Selic

O **Estudo Especial nº 11/2018 do BACEN** documenta que a Selic afeta taxas de crédito via custo de captação, que compõe **39,2% do ICC** (Indicador de Custo do Crédito). A estimativa empírica para crédito imobiliário é que **1 p.p. de variação na Selic produz ~0,43 p.p. de variação na taxa de financiamento imobiliário**, com defasagem de **6–12 meses**. Esse pass-through é menor que em outras modalidades porque a poupança (principal fonte de funding) tem remuneração parcialmente desconectada da Selic (0,5% a.m. + TR quando Selic > 8,5%).

O modelo econométrico recomendado para estimar elasticidade-preço da demanda:

```
log(Concessões_t) = α + β₁·log(Taxa_Imob_{t-k}) + β₂·log(Renda_t) + β₃·log(IVG-R_t) + ε_t
```

Séries necessárias: SGS **20704** (concessões), **20774** (taxa), **432** (Selic), **433** (IPCA como deflator), **21340** (IVG-R). Testar lags de 3, 6, 9 e 12 meses via AIC/BIC. A ABRAINC estima que cada 1% de elevação na Selic **exclui ~166 mil famílias** do acesso ao crédito imobiliário.

### Ciclos de crédito imobiliário e como identificá-los

Os ciclos imobiliários brasileiros apresentam padrão bem definido vinculado à política monetária:

| Período | Fase | Driver principal |
| --- | --- | --- |
| 2008–2014 | **Expansão forte** | MCMV (2009), Selic baixa, funding abundante |
| 2015–2017 | **Contração** | Crise econômica, Selic alta (14,25%), queda poupança |
| 2018–2021 | **Expansão** | Selic mínima histórica (2%), boom poupança (+R$ 166 bi em 2020) |
| 2022–2023 | **Desaceleração** | Selic 13,75%, saques poupança (−R$ 103 bi em 2022) |
| 2024 | **Pico** | R$ 312 bi (recorde), mas funding em pressão |
| 2025 | **Retração SBPE** | Selic 15%, SBPE −13,4%, recursos livres +246% |

Para identificação de ciclos, o **filtro band-pass de Christiano-Fitzgerald** com janela de **18–96 meses** isola a componente cíclica das séries de concessões (SGS 20704). O Working Paper 384 do BACEN alerta que o filtro HP clássico com λ=400k pode gerar ciclos espúrios em séries curtas, recomendando **modelos estruturais bayesianos (STM)** como alternativa. O **credit-to-GDP gap** (razão crédito imobiliário/PIB vs. tendência HP) acima de **2 p.p.** sinaliza sobreaquecimento. Os indicadores antecedentes mais eficazes são: concessões novas (20704, lidera em 3–6 meses), inadimplência (21151), captação líquida da poupança e IVG-R (21340).

### Correlação poupança SBPE versus concessões

O descasamento entre funding de poupança e concessões é estrutural e crescente. Em 2020, a poupança registrou captação líquida de +R$ 166 bilhões e concessões SBPE de ~R$ 124 bilhões (folga); em 2024, a captação foi negativa (−R$ 17 bilhões SBPE) enquanto as concessões atingiram R$ 186,7 bilhões (aperto severo). A análise de **causalidade de Granger** entre saldo de poupança e concessões, testando 12 lags, revela que poupança Granger-causa concessões com significância no lag de 3–6 meses. A **cointegração de Engle-Granger** entre log(poupança) e log(concessões) confirma relação de longo prazo, mas com desvio crescente desde 2022 — evidência da diversificação estrutural do funding.

---

## 6. Engenharia de contexto: dados como insumo para inteligência artificial

### Tabela consolidada de referência rápida

| Série | SGS | Period. | Unidade | Valor ref. | Referência histórica |
| --- | --- | --- | --- | --- | --- |
| Selic Meta | 432 | Reunião | % a.a. | 14,75 | Mín: 2,00 (2020); Máx: 14,75 (2025) |
| IPCA 12m | 13522 | Mensal | % | ~4,14 | Meta: 3,0% ± 1,5 p.p. |
| TR | 226 | Mensal | % a.m. | ~0,12 | Zero de 2017 a 2021 |
| CDI anualizado | 4392 | Diária | % a.a. | ~14,65 | Acompanha Selic |
| IGP-M | 189 | Mensal | % | Variável | FGV/IBRE |
| INCC-M | 7456 | Mensal | % | Variável | FGV/IBRE |
| Concessões imob. PF | 20704 | Mensal | R$ mi | ~13.000 | Pico: dez/2024 (R$ 17,6 bi) |
| Saldo imob. PF | 20612 | Mensal | R$ mi | >900.000 | Crescimento ~8-9% a.a. |
| Taxa juros imob. PF | 20774 | Mensal | % a.a. | ~11,4 | Mín: ~6,9% (2020) |
| Inadimplência imob. PF | 21151 | Mensal | % | ~1,0 | Mín. histórica (2024) |
| Prazo médio concessões | 20914 | Mensal | Meses | ~340 | Teto SFH: 420 meses |
| IVG-R | 21340 | Mensal | Índice | >580 | Base 100 = mar/2001 |

### Interpretação por audiência

**Para audiência estratégica (CEO/CFO):** A **Selic (432)** e o **IPCA 12m (13522)** são os dois indicadores-âncora. A Selic a 14,75% com projeção de queda para ~12,5% ao final de 2026 sinaliza **janela de oportunidade** para aquisições de carteira e lançamentos imobiliários no 2S/2026. A inadimplência mínima histórica de **1,0%** (21151) indica qualidade de carteira excepcionalmente saudável, reduzindo provisões e liberando capital. O gap entre funding de poupança em declínio e demanda resiliente cria oportunidade para quem diversificar fontes (LCI, CRI, FIIs).

**Para audiência tática (gestores de crédito):** O spread entre **taxa SFH (20773)** e **taxa SFI (20772)** indica margem de precificação. A razão concessões/saldo poupança sinaliza aperto ou folga de funding para definir targets de originação. O **prazo médio (20914)** acima de 340 meses e o IVG-R em alta contínua validam a garantia real. Monitorar o diferencial entre SFH e SFI permite calibrar a alocação entre produtos regulados (menor margem, maior volume) e livres (maior margem, menor volume).

**Para audiência operacional (analistas):** As séries de concessões (20702, 20703, 20704) decompostas por SFH/SFI permitem rastrear migração entre modalidades. O cruzamento da taxa média (20774) com a Selic efetiva (4390) produz o spread de intermediação. A inadimplência (21149 vs. 21151) segmentada por SFI e SFH revela risco diferenciado por produto. Séries de prazo (20912, 20913, 20914) identificam alongamento ou encurtamento de risco.

### Arquitetura para agentes de IA

O template de contexto estruturado recomendado para alimentar LLMs em plataformas de analytics:

```markdown
## Contexto Macro-Imobiliário [{DATA}]

### Política Monetária
- Selic: {SGS_432}% | Projeção 12m (Focus): {focus_selic}%
- CDI: {SGS_4392}% | TR: {SGS_226}%

### Crédito Imobiliário
- Concessões PF (último mês): R$ {SGS_20704} mi
- Taxa média PF: {SGS_20774}% a.a. (SFH: {SGS_20773}% | SFI: {SGS_20772}%)
- Inadimplência: {SGS_21151}%
- Saldo carteira: R$ {SGS_20612} mi

### Funding
- Poupança SBPE: R$ {odata_poupanca} bi ({var_12m}%)
- LCI estoque: R$ {odata_lci} bi
- Participação poupança: {pct_poupanca}%

### Preços
- IVG-R: {SGS_21340} (var. 12m: {var_ivgr}%)
- IPCA 12m: {SGS_13522}% | INCC-M: {SGS_7456}%

### Ciclo: {fase_ciclo} | Credit Gap: {gap} p.p.
```

Os **casos de uso por segmento** são distintos. **Securitizadoras** priorizam spread de captação, inadimplência e curva de juros para precificar CRIs — séries 20772, 21151, 432 e DI futuro. **Incorporadoras** focam em concessões, IVG-R e projeções Focus para timing de lançamentos — séries 20704, 21340, expectativas de Selic. **Bancos** monitoram o gap funding-carteira e ALM (gestão de ativos e passivos) — saldo poupança vs. carteira (20611/20612), compulsório e captação líquida. **Fundos imobiliários** acompanham spread NTN-B vs. cap rate implícito e ciclo de crédito — séries 432, 433, 21340 e inadimplência.

A biblioteca Python `python-bcb` (de Wilson Freitas) simplifica a ingestão: `sgs.get({'selic': 432, 'ipca': 433, 'imob_conc': 20704})` retorna um DataFrame com todas as séries alinhadas por data. Para a API OData, a mesma biblioteca suporta `bcb.MercadoImobiliario` via `get_endpoint()` e `query()`.

---

## Conclusão: um ecossistema de dados maduro com uma lacuna estratégica

O BACEN oferece um dos ecossistemas de dados de crédito imobiliário mais completos entre bancos centrais de economias emergentes, com **acesso público, gratuito e programático** via três APIs complementares. A combinação das séries SGS (concessões, saldos, taxas, prazos, inadimplência) com os indicadores macro (Selic, IPCA, TR, CDI) e os dados OData do Mercado Imobiliário (funding por origem, poupança, LCI, CRI) permite construir análises sofisticadas de ciclos, elasticidade e gestão de funding.

A principal lacuna permanece na **granularidade por programa e por fonte de funding nas séries SGS**: dados de MCMV, SBPE e FGTS desagregados exigem recorrer à API OData ou a fontes complementares (ABECIP, Caixa, Ministério das Cidades). A transformação estrutural do funding — com poupança perdendo 10 pontos percentuais de participação em três anos e LCI crescendo de 9% para 19% — torna os dados de mix de funding tão importantes quanto os indicadores tradicionais de crédito. Para agentes de IA, a **atualização automatizada mensal** das ~15 séries SGS core combinada com dados Focus semanais e OData trimestral cria um contexto dinâmico capaz de fundamentar decisões de originação, precificação e alocação com rigor quantitativo em tempo quase real.