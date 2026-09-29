# Planejamento de Revisao de Textos - Liquid DataViz

**Data**: 2026-03-16
**Autor**: Revisao tecnica especializada em credito imobiliario securitizado
**Objetivo**: Garantir que todos os textos da plataforma sejam claros, precisos e consistentes para profissionais do mercado (gestores de carteira, analistas de credito, securitizadores, investidores de CRI/CRA)

---

## Sumario Executivo

Foram revisados:
- 1 arquivo de glossario (33 termos)
- 1 arquivo de constantes de navegacao (10 itens de menu + 3 anexos)
- 10 paginas principais + 3 paginas de anexos
- Aproximadamente 180 textos entre titulos, subtitulos, labels de KPI, headers de tabelas, nomes de abas e tooltips

**Resultado geral**: A aplicacao apresenta boa qualidade tecnica nos textos. A terminologia e predominantemente correta para o mercado brasileiro de credito imobiliario. Os ajustes recomendados concentram-se em:
1. Inconsistencias de nomenclatura entre menu lateral e paginas
2. Imprecisoes pontuais em definicoes do glossario
3. Oportunidades de maior clareza em subtitulos e descricoes
4. Termos em ingles que poderiam ter equivalente em portugues
5. Erros factuais em tabela de elegibilidade (anexo)

---

## 1. NAVEGACAO LATERAL (constants.ts)

### 1.1 NAV_ITEMS

| Item | Texto Atual | Avaliacao | Texto Sugerido | Justificativa |
|------|-------------|-----------|----------------|---------------|
| Dashboard | `Visao Geral` | OK | -- | Claro e adequado |
| Contratos | `Contratos` | OK | -- | Direto |
| Pagamentos | `Pagamentos` | OK | -- | Adequado |
| Fluxo de Caixa | `Fluxo de Caixa` | OK | -- | Termo padrao |
| PDD | `PDD` | OK | -- | Sigla reconhecida no mercado |
| Pricing | `Pricing` | **AJUSTAR** | `Precificacao` | O termo "Pricing" e amplamente usado no mercado, mas a pagina ja usa "Pricing da Carteira" no titulo. Manter consistencia: se o titulo da pagina e em portugues, o menu tambem deve ser. Alternativa: manter "Pricing" no menu (termo jargao aceito) e alinhar com o titulo da pagina. **Decisao do time**: ambas as opcoes sao aceitaveis. |
| Simulacao | `Simulacao` | **AJUSTAR** | `Simulacao de LTV` ou `Stress Test LTV` | O nome generico "Simulacao" nao comunica o que a pagina faz. A pagina trata especificamente de stress test de LTV para repasse bancario. |
| Inadimplencia | `Inadimplencia` (href: `/elegibilidade`) | **AJUSTAR** | Ver discussao abaixo | **Inconsistencia critica**: O label do menu e "Inadimplencia" mas a URL e `/elegibilidade`. A pagina se chama "Analise de Inadimplencia". O conteudo abrange inadimplencia, LTV, safra, matriz de cobranca E restricoes. Sugestao: renomear para `Inadimplencia e Elegibilidade` ou `Analise de Carteira`, ja que cobre multiplas dimensoes. |
| Repasse | `Repasse` | **AJUSTAR** | `Estrategia de Repasse` | O titulo da pagina e "Estrategia de Repasse" e o AppBar mostra "Grupos Estrategia de Repasse". Manter consistencia. |
| Detalhamento | `Detalhamento` | OK | -- | Adequado, o titulo completo aparece na pagina |

**Grupos de navegacao**:

| Grupo | Texto Atual | Avaliacao |
|-------|-------------|-----------|
| CARTEIRA | `CARTEIRA` | OK |
| RISCO | `RISCO` | OK |
| OPERACIONAL | `OPERACIONAL` | OK |

### 1.2 ANEXO_ITEMS

| Item | Texto Atual | Avaliacao |
|------|-------------|-----------|
| Rating Liquid | `Rating Liquid` | OK |
| PDD | `PDD` | OK |
| Elegibilidade | `Elegibilidade` | OK |

---

## 2. GLOSSARIO (glossary.ts)

### Termos que precisam de ajuste

| Termo | Texto Atual | Texto Sugerido | Justificativa |
|-------|-------------|----------------|---------------|
| `ltv` | "Loan-to-Value: razao entre o saldo devedor e o valor do imovel. Quanto maior, maior o risco." | "Loan-to-Value (LTV): razao entre o saldo devedor atualizado a valor presente e o valor do imovel. Valores acima de 90% indicam risco elevado para securitizacao." | Adicionar sigla entre parenteses para clareza. Especificar "a valor presente" (conforme a metodologia usa VP). Incluir o limiar de 90% que e referencia no mercado. |
| `delta_pdd` | "Diferenca entre a PDD minima Bacen e a PDD calculada pelo modelo Liquid." | "Diferenca entre a PDD Liquid e a PDD Minima Bacen. Indica o risco adicional capturado pelo modelo proprietario alem da exigencia regulatoria." | **Erro conceitual**: O delta PDD conforme definido no sistema e `PDD Liquid - PDD Bacen`, nao o contrario. Alem disso, a explicacao nao diz ao usuario *para que serve* o indicador. |
| `over_90` | "Percentual de contratos com atraso superior a 90 dias." | "Percentual de contratos com parcelas vencidas ha mais de 90 dias. Indicador critico de inadimplencia cronica na carteira." | Mais preciso ("parcelas vencidas") e adiciona relevancia analitica. |
| `pro_soluto` | "Operacao em que o cessionario assume o risco de inadimplencia do devedor." | "Operacao pro-soluto: modalidade em que o cedente (incorporador) retém o risco de inadimplencia do comprador, sem garantia de recompra pelo banco. Comum em carteiras MCMV pre-repasse." | **Erro conceitual**: Na operacao pro-soluto imobiliaria, quem assume o risco e o *cedente/incorporador*, nao o cessionario. O cessionario e quem adquire o credito (banco/securitizador). Alem disso, contextualizar para MCMV. |
| `saldo_nominal` | "Valor total contratado, antes de ajustes e correcao monetaria." | "Valor nominal total dos contratos, correspondente ao saldo original antes da correcao monetaria e amortizacoes." | Mais preciso tecnicamente. |
| `inadimplencia` | "Razao entre o valor em atraso e o saldo devedor total da carteira." | "Taxa de inadimplencia: razao entre o valor em atraso (parcelas vencidas e nao pagas) e o saldo devedor total da carteira. Expressa em percentual." | Especificar que "valor em atraso" sao parcelas vencidas e nao pagas. |
| `valor_atraso` | "Soma dos valores vencidos e nao pagos de todos os contratos." | "Soma de todas as parcelas vencidas e nao pagas (principal + juros) de todos os contratos da carteira." | Explicitar que inclui principal e juros. |
| `correcao_monetaria` | "Indice de atualizacao do valor dos contratos (ex: IPCA, IGP-M, TR)." | "Indice de correcao monetaria aplicado a atualizacao do saldo devedor dos contratos (ex.: TR, IPCA, IGP-M, Taxa Fixa)." | Ordem dos indices por frequencia no mercado imobiliario (TR e o mais comum em SBPE). Incluir "Taxa Fixa" como opcao. |
| `covenant` | "Clausula contratual que estabelece indicadores minimos a serem mantidos." | "Clausula contratual (covenant) que define indicadores financeiros e operacionais minimos a serem mantidos pelo tomador, com gatilhos de vencimento antecipado em caso de descumprimento." | Expandir para incluir a consequencia do descumprimento (vencimento antecipado), que e o ponto relevante para o gestor. |
| `fluxo_esperado` | "Projecao de recebiveis futuros ajustada pelo risco de inadimplencia." | "Projecao dos recebiveis futuros ajustada pela probabilidade de inadimplencia (PD) do modelo Liquid. Representa o fluxo de caixa esperado apos desconto de perdas estimadas." | Mais preciso: especifica que o ajuste vem da PD do modelo. |
| `fluxo_contratado` | "Valor total contratado a receber no periodo, sem ajuste de risco." | "Soma das parcelas contratadas a vencer no periodo, sem desconto por risco de inadimplencia. Representa o cenario base sem perdas." | Mais preciso e contrasta com o fluxo esperado. |
| `pricing` | "Valor de mercado estimado da carteira, considerando risco e desagio." | "Valor de mercado estimado da carteira (mark-to-model), calculado a partir do fluxo esperado descontado pela taxa de desagio por rating Liquid." | Explicitar a metodologia (fluxo descontado) e a relacao com o rating. |
| `restricao` | "Apontamento cadastral (ex: protesto, acao judicial) vinculado ao devedor ou imovel." | "Apontamento restritivo de credito (PEFIN, REFIN, Protestos) vinculado ao CPF/CNPJ do devedor. Impacta a elegibilidade para repasse bancario e a classificacao nos grupos de estrategia." | Especificar os tipos (PEFIN, REFIN, Protestos) que sao os usados no sistema. Remover "acao judicial" que nao e monitorada. Explicar o impacto. |
| `matriz_cobranca` | "Classificacao de contratos por perfil de cobranca e categoria de risco." | "Classificacao cruzada de contratos por perfil de cobranca (`perfil_cobranca`) e categoria de inadimplencia, utilizada para segmentar estrategias de recuperacao de credito." | Mais preciso sobre o que se cruza e para que serve. |
| `indice_repasse` | "Percentual de contratos aptos ao repasse bancario dentro do grupo." | **REMOVER ou REVISAR** | Conforme audit anterior (project_final_audit_2026_03_16.md), este indicador foi removido do sistema. Se o glossario ainda o referencia, deve ser removido ou marcado como descontinuado. |
| `pagamento_antecipado` | "Valor pago pelo devedor antes da data de vencimento da parcela." | "Valor recebido referente a parcelas pagas antes da data de vencimento. Inclui amortizacoes extraordinarias e liquidacoes antecipadas." | Ampliar para cobrir amortizacoes extraordinarias, que sao relevantes para projecao de fluxo. |
| `recuperacao` | "Valor recebido referente a parcelas que estavam em atraso em periodos anteriores." | "Valor recebido no periodo corrente referente a parcelas que estavam inadimplentes em periodos anteriores. Indicador de eficacia da cobranca." | Adicionar contexto analitico. |
| `safra` | "Periodo (mes/ano) em que o contrato foi originado." | "Safra de originacao: mes/ano em que o contrato foi celebrado. Utilizada para analise de cohort e identificacao de padroes de inadimplencia por vintage." | Incluir o conceito de cohort/vintage que e padrao no mercado de credito. |

### Termos OK (sem ajuste necessario)

- `pdd` - OK
- `pdd_minimo_bacen` - OK
- `pdd_liquid` - OK
- `rating_liquid` - OK
- `desagio` - OK
- `saldo_devedor` - OK
- `elegibilidade` - OK
- `faixa_atraso` - OK
- `prazo_remanescente` - OK
- `prazo_decorrido` - OK
- `stress_test` - OK
- `total_contratos` - OK
- `vencimento_referencia` - OK

### Termos ausentes no glossario (recomendacao de adicao)

| Termo Sugerido | Descricao Sugerida |
|----------------|-------------------|
| `grupos_repasse` | "Segmentacao de contratos (G1 a G8) por combinacao de: presenca de restricoes cadastrais, LTV bancario acima/abaixo de 80% e suficiencia de renda. Utilizada para priorizar estrategias de repasse." |
| `renda_suficiente` | "Indicador que compara a renda familiar declarada com o comprometimento de renda exigido pelo banco para aprovacao do financiamento." |
| `delta_renda` | "Diferenca entre a renda familiar e a renda minima necessaria para aprovacao bancaria. Classificada em baixo, medio e alto." |
| `ltv_banco` | "Loan-to-Value calculado conforme criterios bancarios para repasse, utilizando o saldo devedor atualizado dividido pelo valor do imovel." |
| `ltv_banco_stress` | "LTV bancario simulado com desvalorizacao de 10% no valor do imovel. Teste de estresse para avaliar sensibilidade da carteira." |
| `prosoluto_total` | "Valor total de creditos em regime pro-soluto na carteira, sem garantia bancaria de recompra." |
| `perfil_cobranca` | "Classificacao do contrato por perfil de cobranca, cruzando faixa de comprometimento de renda, presenca de restricoes e relacao entre valor da parcela e capacidade de pagamento." |
| `faixa_mcmv` | "Faixa do programa Minha Casa Minha Vida em que o contrato se enquadra, determinada pela renda familiar." |

---

## 3. PAGINA: VISAO GERAL (DashboardPage.tsx)

### 3.1 Titulo e Subtitulo da Pagina

| Elemento | Texto Atual | Avaliacao |
|----------|-------------|-----------|
| h1 | "Visao Geral" | OK |
| Subtitulo | "Resumo consolidado da carteira securitizada com indicadores-chave e tendencias" | OK - Preciso e informativo |

### 3.2 KPI Cards

| KPI | Label Atual | Avaliacao | Sugestao |
|-----|-------------|-----------|----------|
| total_contratos | "Total de Contratos" | OK | -- |
| saldo_nominal | "Saldo Nominal" | OK | -- |
| saldo_devedor | "Saldo Devedor" | OK | -- |
| valor_atraso | "Valor em Atraso" | OK | -- |
| inadimplencia_pct | "Inadimplencia" | OK | -- |
| over_90 | "Atraso > 90 dias" | OK | -- |

### 3.3 Graficos

| Grafico | Titulo Atual | Subtitulo Atual | Avaliacao |
|---------|-------------|-----------------|-----------|
| Evolucao Saldo | "Evolucao do Saldo Devedor" | "Variacao mes a mes do saldo devedor total da carteira" | OK |
| Faixa Atraso | "Contratos por Faixa de Atraso" | "Quantidade de contratos agrupados por dias de atraso" | OK |

### 3.4 Tabela

| Tabela | Titulo Atual | Subtitulo Atual | Avaliacao |
|--------|-------------|-----------------|-----------|
| Faixa Atraso | "Indicadores por Faixa de Atraso" | "Saldo, inadimplencia e valor em atraso para cada faixa de dias" | OK |

### 3.5 Headers da Tabela Faixa Atraso

| Header Atual | Avaliacao | Sugestao |
|-------------|-----------|----------|
| "Faixa Atraso" | **AJUSTAR** | "Faixa de Atraso" - Adicionar preposicao |
| "Contratos" | OK | -- |
| "% Contratos" | OK | -- |
| "Valor Atraso" | **AJUSTAR** | "Valor em Atraso" - Adicionar preposicao para consistencia com o KPI card |
| "Inadimplencia %" | OK | -- |
| "Saldo Nominal" | OK | -- |
| "Saldo Devedor" | OK | -- |

### 3.6 Tooltip Grafico Faixa Atraso

| Texto Atual | Avaliacao |
|-------------|-----------|
| "Contratos:" | OK |
| "Valor Atraso:" | **AJUSTAR** -> "Valor em Atraso:" |
| "Saldo Devedor:" | OK |

### 3.7 Legenda de Comparacao

| Texto Atual | Avaliacao | Sugestao |
|-------------|-----------|----------|
| "Linha tracejada = periodo anterior" | **AJUSTAR** | "Linha tracejada = periodo anterior" - Falta acento em "periodo". Deve ser "periodo". |
| "Periodo anterior" (no tooltip da evolucao) | **AJUSTAR** | "Periodo anterior" - Mesmo problema de acento. Verificar se o codigo ja tem o acento (nao tem: "periodo anterior" e "Anterior:"). |

---

## 4. PAGINA: CONTRATOS (ContratosPage.tsx)

### 4.1 Titulo e Subtitulo

| Elemento | Texto Atual | Avaliacao | Sugestao |
|----------|-------------|-----------|----------|
| h2 | "Contratos" | OK | -- |
| Subtitulo | "Visao consolidada por empreendimento com metricas de risco e distribuicao de rating" | OK | -- |

### 4.2 Abas

| Aba | Texto Atual | Avaliacao | Sugestao |
|-----|-------------|-----------|----------|
| resumo | "Resumo por Empreendimento" | OK | -- |
| unidades | "Unidades Comercializadas" | OK | -- |
| visao-macro | "Visao Macro de Rating" | **AJUSTAR** | "Distribuicao de Rating" - O termo "Visao Macro" e vago. O conteudo mostra distribuicao de rating por empreendimento e evolucao temporal, nao uma "visao macro" generica. |

### 4.3 Tabela Resumo por Empreendimento

| Header Atual | Avaliacao | Sugestao |
|-------------|-----------|----------|
| "Projeto" | OK | -- |
| "Total Contratos" | **AJUSTAR** | "Total de Contratos" - Consistencia com o dashboard |
| "Contratos com Atraso" | OK | -- |
| "Valor Atraso" | **AJUSTAR** | "Valor em Atraso" - Consistencia |
| "Saldo Devedor" | OK | -- |
| "Inadimplencia %" | OK | -- |
| "Valor Over 90" | **AJUSTAR** | "Valor > 90 dias" ou "Valor Atraso > 90d" - Termo em ingles desnecessario, inconsistente com o restante da interface em portugues |
| "Contratos com Restricao" | OK | -- |
| "Valor Imovel" | **AJUSTAR** | "Valor do Imovel" - Adicionar preposicao |
| "LTV" | OK | -- |
| "Pricing" | OK | Termo aceito no jargao do mercado |
| "Prazo Remanescente" | OK | -- |

### 4.4 Graficos

| Grafico | Titulo/Subtitulo | Avaliacao |
|---------|-----------------|-----------|
| Unidades Comercializadas | "Evolucao mensal de contratos e valor dos imoveis" | OK |
| Rating x Empreendimento | "Distribuicao percentual de rating Liquid por empreendimento" | OK |
| Evolucao do Rating | "Distribuicao de rating ao longo dos meses" | OK |
| Evolucao do Saldo Devedor | "Saldo devedor por rating ao longo do tempo" | OK |
| Saldo em Atraso ao Longo do Tempo | "Evolucao do saldo em atraso e taxa de inadimplencia" | **AJUSTAR titulo** -> "Evolucao do Saldo em Atraso" - O "ao Longo do Tempo" e redundante (todo grafico temporal e "ao longo do tempo") |
| Evolucao do Valor em Atraso | "Valor em atraso por rating ao longo dos meses" | OK |

### 4.5 Legenda de Escala de Rating

| Texto Atual | Avaliacao |
|-------------|-----------|
| "Escala de risco: A (baixo) -> H (alto)" | OK |

---

## 5. PAGINA: PAGAMENTOS (PagamentosPage.tsx)

### 5.1 Titulo e Subtitulo

| Elemento | Texto Atual | Avaliacao |
|----------|-------------|-----------|
| h2 | "Evolucao dos Pagamentos" | OK |
| Subtitulo | "Historico e composicao dos recebimentos mensais: antecipados, na referencia e recuperados" | OK - Excelente resumo |

### 5.2 Headers de Tabela

| Header Atual | Avaliacao | Sugestao |
|-------------|-----------|----------|
| "Data Base Report" | **AJUSTAR** | "Data-Base" ou "Mes de Referencia" - "Data Base Report" mistura portugues com ingles e e redundante. No contexto de securitizacao, "data-base" e o termo padrao para a data de corte do relatorio. |
| "Pagamento antecipado" | **AJUSTAR** | "Pagamento Antecipado" - Capitalizar para consistencia |
| "Pagamento antecipado %" | **AJUSTAR** | "Pagamento Antecipado %" |
| "Vencimento na referencia" | **AJUSTAR** | "Vencimento na Referencia" - Capitalizar |
| "Vencimento na referencia %" | **AJUSTAR** | "Vencimento na Referencia %" |
| "Recuperacao mes anterior" | **AJUSTAR** | "Recuperacao Mes Anterior" - Capitalizar |
| "Recuperacao mes anterior %" | **AJUSTAR** | "Recuperacao Mes Anterior %" |
| "Recuperacao anterior" | **AJUSTAR** | "Recuperacao Periodos Anteriores" - "Recuperacao anterior" e ambiguo: anterior a que? Esclarecer que se refere a periodos anteriores ao mes imediatamente anterior. |
| "Recuperacao anterior %" | **AJUSTAR** | "Recuperacao Periodos Anteriores %" |
| "Valor Pago" | OK | -- |

### 5.3 Legenda do Grafico Stacked

| Texto Atual | Avaliacao | Sugestao |
|-------------|-----------|----------|
| "Pagamento antecipado" | Mesmas correcoes de capitalizacao acima | "Pagamento Antecipado" |
| "Recuperacao anterior" | | "Recuperacao Per. Anteriores" |
| "Recuperacao mes anterior" | | "Recuperacao Mes Anterior" |
| "Vencimento na referencia" | | "Vencimento na Referencia" |

---

## 6. PAGINA: FLUXO DE CAIXA (FluxoDeCaixaPage.tsx)

### 6.1 Titulo e Subtitulo

| Elemento | Texto Atual | Avaliacao |
|----------|-------------|-----------|
| h2 | "Fluxo de Caixa Ajustado ao Risco" | OK - Excelente, termo tecnico preciso |
| Subtitulo | "Projecao de recebiveis futuros comparando fluxo contratado e fluxo esperado com ajuste de inadimplencia" | OK |

### 6.2 Graficos e Tabelas

| Elemento | Titulo | Subtitulo | Avaliacao |
|----------|--------|-----------|-----------|
| Grafico 1 | "Fluxo de Parcela Ajustado ao Risco" | "Comparativo entre fluxo esperado (barras) e fluxo contratado (linha)" | OK |
| Grafico 2 | "Fluxo Esperado Mensal" | "Volume esperado de recebiveis ajustado pelo risco de credito" | OK |
| Tabela | "Fluxo Mensal" | "Valores esperados e contratados por periodo" | OK |

### 6.3 Headers da Tabela

| Header Atual | Avaliacao | Sugestao |
|-------------|-----------|----------|
| "Data Base Fluxo" | **AJUSTAR** | "Mes de Referencia" ou "Data-Base" - Consistencia com pagina de Pagamentos. "Data Base Fluxo" e um termo inventado. |
| "Fluxo Esperado" | OK | -- |
| "Fluxo Contratado" | OK | -- |

---

## 7. PAGINA: PDD (PddPage.tsx)

### 7.1 Titulo e Subtitulo

| Elemento | Texto Atual | Avaliacao |
|----------|-------------|-----------|
| h2 | "PDD - Provisao para Devedores Duvidosos" | OK |
| Subtitulo | "Comparativo de provisao por rating: modelo Liquid vs. minimo exigido pelo Bacen (Resolucao 2682)" | OK - Preciso e informativo |

### 7.2 KPI Cards

| KPI | Label Atual | Avaliacao | Sugestao |
|-----|-------------|-----------|----------|
| totalPddLiquid | "Total PDD Liquid" | OK | -- |
| totalPddBacen | "Total PDD Min. Bacen" | **AJUSTAR** | "Total PDD Minima Bacen" - Nao abreviar "Minima" no KPI card; a abreviacao "Min." e aceitavel em tabelas mas nao em destaque |
| totalDelta | "Delta Total" | **AJUSTAR** | "Delta PDD Total" - "Delta Total" e ambiguo fora de contexto. Adicionar "PDD" para clareza. |

### 7.3 Grafico

| Grafico | Titulo | Subtitulo | Avaliacao |
|---------|--------|-----------|-----------|
| Stacked | "PDD Liquid vs PDD Minimo Bacen" | "Comparativo de provisao por rating: modelo interno vs. exigencia regulatoria" | OK |

### 7.4 Tabela

| Tabela | Titulo | Subtitulo | Avaliacao |
|--------|--------|-----------|-----------|
| PDD por Rating | "PDD por Rating Liquid" | "Provisao minima Bacen, provisao Liquid e diferenca (delta) por classificacao de risco" | OK |

### 7.5 Headers da Tabela

| Header Atual | Avaliacao |
|-------------|-----------|
| "Rating Liquid" | OK |
| "Qtd. Contratos" | OK |
| "PDD Minimo Bacen" | **AJUSTAR** -> "PDD Minima Bacen" - "PDD" e feminino (Provisao...), entao o adjetivo deve concordar: "minima" |
| "PDD Liquid" | OK |
| "Delta PDD" | OK |
| "Valor Atraso" | **AJUSTAR** -> "Valor em Atraso" |
| "Saldo Devedor" | OK |

### 7.6 Texto Explicativo (box inferior)

| Texto Atual | Avaliacao | Sugestao |
|-------------|-----------|----------|
| "A PDD adicional e a diferenca entre a PDD Min. Bacen e a PDD Liquid." | **AJUSTAR** | "A PDD adicional (Delta PDD) e a diferenca entre a PDD Liquid e a PDD Minima Bacen." - (a) Corrigir a ordem: delta = Liquid - Bacen; (b) Usar o mesmo nome que aparece na tabela ("Delta PDD"); (c) Nao abreviar "Minima" em texto corrido. |
| "Aqui nao foi considerado a possivel recuperacao..." | **AJUSTAR** | "Nesta analise, nao foi considerada a possivel recuperacao de valores em caso de inadimplencia (LGD - Loss Given Default)." - Concordancia verbal ("considerada") e expandir sigla LGD na primeira ocorrencia. |

---

## 8. PAGINA: PRICING (PricingPage.tsx)

### 8.1 Titulo e Subtitulo

| Elemento | Texto Atual | Avaliacao |
|----------|-------------|-----------|
| h2 | "Pricing da Carteira" | OK |
| Subtitulo | "Precificacao da carteira com desagio calculado por rating Liquid e categoria de elegibilidade" | OK |

### 8.2 KPI Cards

| KPI | Label | Subtitle | Avaliacao |
|-----|-------|----------|-----------|
| totalPricing | "Pricing Total" | "Valor de mercado estimado da carteira" | OK |
| desagioTotal | "Desagio Medio" | "Desconto sobre o valor nominal" | OK |

### 8.3 Abas

| Aba | Texto Atual | Avaliacao |
|-----|-------------|-----------|
| rating | "Por Rating Liquid" | OK |
| elegibilidade | "Por Elegibilidade" | OK |

### 8.4 Headers da Tabela Rating

| Header Atual | Avaliacao | Sugestao |
|-------------|-----------|----------|
| "Rating Liquid" | OK | -- |
| "Contratos" | OK | -- |
| "Contratos com Atraso" | OK | -- |
| "LTV" | OK | -- |
| "Prazo Decorrido" | OK | -- |
| "Prazo Remanescente" | OK | -- |
| "Correcao Monetaria" | **AJUSTAR** | "Ind. Correcao" ou "Indice" - O header "Correcao Monetaria" sugere um valor monetario, mas o campo mostra um numero (quantidade? indice?). Se for quantidade de contratos com correcao, renomear para "Com Indice". Se for o indice, renomear para "Indice". |
| "Saldo Nominal" | OK | -- |
| "Saldo Devedor" | OK | -- |
| "Pricing" | OK | -- |
| "Desagio" | OK | -- |

---

## 9. PAGINA: SIMULACAO (SimulacaoPage.tsx)

### 9.1 Titulo e Subtitulo

| Elemento | Texto Atual | Avaliacao |
|----------|-------------|-----------|
| h2 | "Simulacao de Repasse Bancario" | OK |
| Subtitulo | "Stress test de LTV para avaliar viabilidade de repasse da carteira a instituicoes financeiras" | OK |

### 9.2 KPI Cards

| KPI | Label | Subtitle | Avaliacao |
|-----|-------|----------|-----------|
| contratosLtvAlto | "Contratos com LTV > 80%" | "Contratos com alto comprometimento do imovel" | OK |
| saldoLtvAlto | "Saldo Devedor com LTV > 80%" | "Exposicao financeira em contratos de alto LTV" | OK |

### 9.3 Grafico

| Grafico | Titulo Atual | Avaliacao | Sugestao |
|---------|-------------|-----------|----------|
| LTV Bar | "LTV Banco - Saldo Devedor / Valor do contrato atualizado" | **AJUSTAR** | "Distribuicao de Saldo Devedor por Faixa de LTV Bancario" - O titulo atual e confuso: mistura o nome do indicador com a formula. O subtitulo ja explica "Valor do imovel distribuido por faixa de LTV bancario". |

| Subtitulo Atual | Avaliacao | Sugestao |
|-----------------|-----------|----------|
| "Valor do imovel distribuido por faixa de LTV bancario" | **AJUSTAR** | "Saldo devedor distribuido por faixa de LTV bancario" - O eixo Y mostra saldo devedor, nao valor do imovel. |

### 9.4 Tabela Stress

| Tabela | Titulo Atual | Avaliacao |
|--------|-------------|-----------|
| Stress | "Matriz LTV x LTV Stress (10%)" | OK - Claro |
| Subtitulo | "Cenario ilustrativo -- dados estaticos . Migracao de faixas de LTV em cenario de desvalorizacao de 10% do imovel" | OK - Importante o aviso de dados estaticos |

### 9.5 Headers da Tabela Stress

| Header Atual | Avaliacao | Sugestao |
|-------------|-----------|----------|
| "Faixa LTV Banco" | OK | -- |
| "04. 40% a 50%" etc. | **AJUSTAR** | Remover o prefixo numerico ("04.", "05." etc.) dos headers - parece ser um artefato do dado, nao um label para o usuario. Exibir apenas "40% a 50%", "50% a 60%" etc. |

---

## 10. PAGINA: INADIMPLENCIA / ELEGIBILIDADE (ElegibilidadePage.tsx)

### 10.1 Titulo e Subtitulo

| Elemento | Texto Atual | Avaliacao |
|----------|-------------|-----------|
| AppBar | "Inadimplencia" | OK (mas ver item 1.1 sobre inconsistencia com URL) |
| h2 | "Analise de Inadimplencia" | OK |
| Subtitulo | "Visao multidimensional da inadimplencia: por LTV, safra de originacao, faixa de atraso, matriz de cobranca e restricoes cadastrais" | OK - Excelente resumo do conteudo |

### 10.2 KPI Cards

| KPI | Label | Subtitle | Avaliacao |
|-----|-------|----------|-----------|
| contratosInadimplentes | "Contratos Inadimplentes" | "Contratos com qualquer atraso" | OK |
| valorAtraso | "Valor em Atraso" | "Soma dos valores vencidos" | OK |
| inadimplencia | "Inadimplencia" | "Valor em atraso / saldo devedor" | OK |
| totalContratos | "Total de Contratos" | "Contratos ativos na carteira" | OK |

### 10.3 Abas

| Aba | Texto Atual | Avaliacao | Sugestao |
|-----|-------------|-----------|----------|
| ltv | "LTV e Inadimplencia" | OK | -- |
| safra | "Por Safra" | OK | -- |
| faixa | "Por Faixa de Atraso" | OK | -- |
| matriz | "Matriz de Cobranca" | OK | -- |
| restricoes | "Restricoes Cadastrais" | OK | -- |

### 10.4 KPIs dentro da aba LTV

| KPI | Label | Subtitle | Avaliacao |
|-----|-------|----------|-----------|
| Inadimplencia | "Inadimplencia" | "Taxa de inadimplencia da carteira" | OK |
| LTV Medio | "LTV Medio" | "Loan-to-Value medio ponderado" | OK |

### 10.5 Tabelas e Graficos

| Elemento | Titulo | Subtitulo | Avaliacao |
|----------|--------|-----------|-----------|
| Tabela Faixa | "Inadimplencia por Faixa de Atraso" | "Distribuicao de contratos, saldo e valor em atraso por faixa de dias" | OK |
| Grafico LTV | "LTV por Faixa" | "Saldo devedor a valor presente dividido pelo valor do imovel" | OK |
| Tabela Safra | "Inadimplencia por Safra" | "Contratos e taxa de inadimplencia agrupados pelo mes de originacao" | OK |
| Grafico Safra | "Inadimplencia por Safra" | "Contratos totais, com atraso e taxa de inadimplencia por safra" | OK |
| Grafico Faixa tempo | "Contratos por Faixa de Atraso" | "Quantidade absoluta de contratos por faixa ao longo do tempo" | OK |
| Grafico Pct | "Distribuicao Percentual por Faixa" | "Proporcao de contratos em cada faixa de atraso" | OK |
| Grafico Valor | "Valor em Atraso por Faixa" | "Composicao do valor em atraso por faixa de dias" | OK |
| Grafico Saldo | "Saldo Devedor por Faixa" | "Composicao do saldo devedor por faixa de atraso" | OK |
| Tabela Matriz | "Matriz de Cobranca" | "Classificacao de contratos por categoria de risco e perfil de cobranca" | OK |
| Tabela Restric Rating | "Restricoes por Rating Liquid" | "Distribuicao de restricoes cadastrais por classificacao de risco" | OK |
| Tabela Restric Tipo | "Restricoes por Tipo" | "Quantidade e valor por tipo de restricao cadastral" | OK |
| Grafico Restric | "Contratos por Faixa de Valor de Restricao" | "Distribuicao de contratos agrupados pelo valor total de restricoes" | OK |
| Tabela Restric Faixa | "Restricoes por Faixa de Valor" | "Contratos agrupados pelo valor total de restricoes" | OK |
| Tabela Detalhe | "Detalhamento de Restricoes" | "Lista de contratos com restricoes cadastrais: tipo, valor e quantidade" | OK |

### 10.6 Headers de Tabelas

**Tabela Faixa de Atraso:**
| Header | Avaliacao | Sugestao |
|--------|-----------|----------|
| "Faixa Atraso" | **AJUSTAR** | "Faixa de Atraso" |
| "Total Contratos" | **AJUSTAR** | "Total de Contratos" |
| Demais | OK | -- |

**Tabela Safra:**
| Header | Avaliacao |
|--------|-----------|
| Todos | OK |

**Tabela Matriz de Cobranca:**
| Header | Avaliacao | Sugestao |
|--------|-----------|----------|
| "Categoria" | **AJUSTAR** | "Categoria de Inadimplencia" - O header "Categoria" isolado e ambiguo |
| "Perfil de Cobranca" | OK | -- |
| Demais | OK | -- |

**Tabela Restricoes por Rating:**
| Header | Avaliacao | Sugestao |
|--------|-----------|----------|
| "Valor Atraso" | **AJUSTAR** | "Valor em Atraso" |
| Demais | OK | -- |

**Tabela Restricoes por Tipo:**
| Header | Avaliacao |
|--------|-----------|
| Todos | OK |

**Tabela Detalhamento Restricoes:**
| Header | Avaliacao | Sugestao |
|--------|-----------|----------|
| "Tipo Restricao" | **AJUSTAR** | "Tipo de Restricao" |
| "Valor Restricao" | **AJUSTAR** | "Valor da Restricao" |
| "Qtd. Restricoes" | OK | -- |
| Demais | OK | -- |

---

## 11. PAGINA: REPASSE (RepassePage.tsx)

### 11.1 Titulos

| Elemento | Texto Atual | Avaliacao | Sugestao |
|----------|-------------|-----------|----------|
| AppBar | "Grupos Estrategia de Repasse" | **AJUSTAR** | "Estrategia de Repasse" - O AppBar usa "Grupos Estrategia de Repasse" mas o h2 usa "Estrategia de Repasse". Alinhar. |
| h2 | "Estrategia de Repasse" | OK | -- |
| Subtitulo | "Agrupamento de contratos por viabilidade de repasse bancario, analise de renda e modalidade pro-soluto" | OK | -- |

### 11.2 KPI Cards

| KPI | Label | Subtitle | Avaliacao |
|-----|-------|----------|-----------|
| totalContratos | "Total de Contratos" | "Contratos analisados para repasse" | OK |
| totalSaldoDevedor | "Saldo Devedor Total" | "Exposicao total da carteira" | OK |
| totalRestricoesVal | "Contratos com Restricao" | "Total de contratos com apontamentos cadastrais" | OK |

### 11.3 Tabela Principal

| Header Atual | Avaliacao | Sugestao |
|-------------|-----------|----------|
| "Grupo" | OK | -- |
| "Contratos" | OK | -- |
| "Saldo Nominal" | OK | -- |
| "Saldo Devedor" | OK | -- |
| "Restricoes" | **AJUSTAR** | "Qtd. Restricoes" - "Restricoes" sozinho e ambiguo (quantidade? valor?) |
| "Renda Suficiente" | **AJUSTAR** | "Renda Suficiente (Qtd.)" - Esclarecer que e quantidade de contratos |
| "Delta Renda Baixo" | **AJUSTAR** | "Delta Renda: Baixo" - Separar com dois-pontos para indicar que e uma subcategoria |
| "Delta Renda Medio" | **AJUSTAR** | "Delta Renda: Medio" |
| "Delta Renda Alto" | **AJUSTAR** | "Delta Renda: Alto" |
| "Limite Simulacao" | **AJUSTAR** | "Limite de Simulacao" - Adicionar preposicao |
| "Pro-Soluto Simulacao" | **AJUSTAR** | "Pro-Soluto: Simulacao" |
| "Pro-Soluto CNPJ" | OK | -- |
| "Pro-Soluto S/ Info" | **AJUSTAR** | "Pro-Soluto: S/ Informacao" - Expandir abreviacao |
| "Area Privativa" | OK | -- |

### 11.4 Tabela Descricao dos Grupos

| Header | Avaliacao |
|--------|-----------|
| "Grupo" | OK |
| "Restricao" | OK |
| "LTV Banco" | OK |
| "Renda" | OK |

### 11.5 Graficos

| Grafico | Titulo | Subtitulo | Avaliacao |
|---------|--------|-----------|-----------|
| Saldo por Grupo | "Saldo Devedor por Grupo" | "Exposicao financeira por grupo de estrategia de repasse" | OK |
| Descricao | "Descricao dos Grupos" | "Criterios de classificacao: restricao, LTV bancario e renda" | OK |

---

## 12. PAGINA: DETALHAMENTO (DetalhamentoPage.tsx)

### 12.1 Titulo e Subtitulo

| Elemento | Texto Atual | Avaliacao |
|----------|-------------|-----------|
| AppBar | "Detalhamento Base Analitica" | OK |
| h2 | "Detalhamento da Base Analitica" | OK |
| Subtitulo | "Listagem completa de contratos da carteira com dados cadastrais para analise granular" | OK |

### 12.2 Tabela

| Header Atual | Avaliacao | Sugestao |
|-------------|-----------|----------|
| "Data Base Report" | **AJUSTAR** | "Data-Base" - Consistencia (mesmo ajuste da pagina Pagamentos) |
| "Projeto" | OK | -- |
| "ID Contrato" | OK | -- |
| "Documento" | **AJUSTAR** | "CPF/CNPJ" - "Documento" e generico demais. Se o campo contem CPF ou CNPJ do proponente, ser explicito. |
| "Tipo Proponente" | **AJUSTAR** | "Tipo de Proponente" - Adicionar preposicao |
| "Nome Cliente" | **AJUSTAR** | "Nome do Cliente" - Adicionar preposicao |
| "Unidade" | OK | -- |
| "Data Emissao" | **AJUSTAR** | "Data de Emissao" - Adicionar preposicao |

---

## 13. PAGINAS DE ANEXOS

### 13.1 Anexo Rating Liquid (AnexosRatingPage.tsx)

| Elemento | Texto Atual | Avaliacao |
|----------|-------------|-----------|
| h2 | "Metodologia do Rating Liquid" | OK |
| Subtitulo | "Como a classificacao de risco proprietaria da Liquid (A a H) e calculada a partir do comportamento de pagamento" | OK |

**Tabela de Escala:**
| Dado | Avaliacao | Sugestao |
|------|-----------|----------|
| H: "Certeza de Default" | **AJUSTAR** | "Default / Perda Certa" - O termo "certeza" e absoluto demais para um modelo probabilistico. Alternativamente: "Default Provavel" ou "Perda Esperada Maxima". |

### 13.2 Anexo PDD (AnexosPddPage.tsx)

| Elemento | Texto Atual | Avaliacao |
|----------|-------------|-----------|
| h2 | "Metodologia da PDD" | OK |
| Subtitulo | "Conceitos e escala de provisao: PDD Liquid, PDD Minimo Bacen e percentuais por rating (Resolucao 2682)" | **AJUSTAR** | "PDD Minimo" -> "PDD Minima" (concordancia de genero) |

**Tabela Resolucao 2682:**
| Dado | Avaliacao | Sugestao |
|------|-----------|----------|
| Rating C: "31 a 61 dias" | **AJUSTAR** | "31 a 60 dias" - **Erro factual**: A Resolucao 2682 define a faixa C como 31 a 60 dias, nao 31 a 61 dias. |

**Texto explicativo:**
| Texto | Avaliacao | Sugestao |
|-------|-----------|----------|
| "A PDD adicional e a diferenca entre a PDD Min. Bacen e a PDD Liquid." | **AJUSTAR** | Mesma correcao da pagina PDD: ordem e "PDD Liquid - PDD Minima Bacen". |
| "Aqui nao foi considerado a possivel recuperacao..." | **AJUSTAR** | "Nesta analise, nao foi considerada a possivel recuperacao..." (concordancia). |

### 13.3 Anexo Elegibilidade (AnexosElegibilidadePage.tsx)

| Elemento | Texto Atual | Avaliacao |
|----------|-------------|-----------|
| h2 | "Criterios de Elegibilidade" | OK |
| Subtitulo | "Definicao das categorias de elegibilidade para securitizacao: criterios de atraso, LTV, prazo e indice de correcao" | OK |

**Tabela de Criterios - PROBLEMAS GRAVES:**

| Categoria | Campo | Texto Atual | Avaliacao | Sugestao |
|-----------|-------|-------------|-----------|----------|
| Elegibilidade Futura | LTV | "Maior ou igual a 90% ou Periodo decorrido menor que 6 meses" | **ERRO** | Este texto esta repetido nos campos LTV, Prazo Decorrido e Prazo Remanescente. O campo LTV deveria dizer apenas "Maior ou igual a 90%". O Prazo Decorrido deveria dizer "Menor que 6 meses". O Prazo Remanescente deveria dizer "Maior ou igual a 6 meses" (nao necessariamente restritivo). **A concatenacao de criterios esta errada** - cada coluna deve mostrar apenas seu proprio criterio. |
| Elegibilidade Futura Possivel | Mesmos campos | Mesmo problema | **ERRO** | Mesma correcao: separar os criterios por coluna. |
| Carteira Inelegivel | prazoRemanescente | "Qualquer Prazo Decorrido" | **ERRO** | Deveria dizer "Qualquer Prazo Remanescente" (o campo e prazoRemanescente, nao prazoDecorrido). |
| Elegibilidade Possivel | Nomenclatura | "Elegibilidade Possivel" | **AJUSTAR** | Considerar renomear para "Elegivel com Atraso" para maior clareza. A tabela do modelo usa "Carteira Elegivel B" como alternativa. |

---

## 14. CONSISTENCIAS GLOBAIS

### 14.1 Padrao de Capitalizacao de Headers

A aplicacao nao segue um padrao unico:
- Alguns headers usam Title Case: "Saldo Devedor", "Valor Pago"
- Outros usam sentence case: "Pagamento antecipado", "Recuperacao mes anterior"

**Recomendacao**: Padronizar TODOS os headers de tabela em **Title Case** (cada palavra importante capitalizada), que e o padrao mais comum em dashboards profissionais.

### 14.2 Preposicoes Faltantes

Multiplos headers omitem preposicoes ("Valor Atraso" vs "Valor em Atraso", "Total Contratos" vs "Total de Contratos").

**Recomendacao**: Usar preposicoes em todos os headers para clareza, exceto em espacos muito restritos (tooltips, badges).

Lista completa de correcoes:
- "Faixa Atraso" -> "Faixa de Atraso" (Dashboard, Elegibilidade)
- "Valor Atraso" -> "Valor em Atraso" (Dashboard, Contratos, PDD, Elegibilidade)
- "Total Contratos" -> "Total de Contratos" (Contratos, Elegibilidade)
- "Valor Imovel" -> "Valor do Imovel" (Contratos)
- "Tipo Restricao" -> "Tipo de Restricao" (Elegibilidade)
- "Valor Restricao" -> "Valor da Restricao" (Elegibilidade)
- "Tipo Proponente" -> "Tipo de Proponente" (Detalhamento)
- "Nome Cliente" -> "Nome do Cliente" (Detalhamento)
- "Data Emissao" -> "Data de Emissao" (Detalhamento)
- "Limite Simulacao" -> "Limite de Simulacao" (Repasse)

### 14.3 Termo "Data Base Report"

Aparece em Pagamentos e Detalhamento com variacoes ("Data Base Report", "Data Base Fluxo").

**Recomendacao**: Padronizar como **"Data-Base"** ou **"Mes de Referencia"** em toda a aplicacao. "Data-base" e o termo padrao em securitizacao para a data de corte do relatorio.

### 14.4 Termo "Valor Over 90"

Aparece apenas em Contratos. Deveria ser "Valor > 90 dias" ou "Valor Atraso > 90d" para consistencia com o portugues usado no restante da interface.

### 14.5 Genero de "PDD"

"PDD" e feminino (Provisao para Devedores Duvidosos). O adjetivo "minimo" deve concordar: "PDD **Minima** Bacen", nao "PDD Minimo Bacen".

**Locais afetados**:
- PddPage: header da tabela "PDD Minimo Bacen"
- AnexosPddPage: subtitulo "PDD Minimo Bacen" e titulo da tabela
- Glossario: termo `pdd_minimo_bacen` (o texto do glossario ja usa "minima" implicitamente, mas o label do campo nao)

**Nota**: O campo no banco de dados se chama `pdd_minimo_bacen` (com "o"), entao a correcao e apenas visual/label, nao no campo de dados.

---

## 15. PRIORIDADE DE IMPLEMENTACAO

### Prioridade ALTA (erros factuais ou conceituais)

1. **Glossario `pro_soluto`**: Erro conceitual sobre quem assume o risco
2. **Glossario `delta_pdd`**: Ordem invertida na formula
3. **Anexo PDD**: Rating C "31 a 61 dias" deve ser "31 a 60 dias"
4. **Anexo Elegibilidade**: Criterios repetidos/trocados entre colunas
5. **PDD texto explicativo**: Ordem invertida do Delta PDD

### Prioridade MEDIA (inconsistencias que confundem)

6. **Navegacao**: Alinhar nomes de menu com titulos de pagina (Repasse, Simulacao)
7. **"PDD Minimo" -> "PDD Minima"**: Concordancia de genero (3 locais)
8. **"Valor Over 90" -> "Valor > 90 dias"**: Termo em ingles (1 local)
9. **"Data Base Report" / "Data Base Fluxo"**: Padronizar para "Data-Base" (3 locais)
10. **Preposicoes faltantes em headers**: ~10 locais

### Prioridade BAIXA (melhorias de qualidade)

11. **Capitalizacao padrao em headers**: ~8 locais
12. **Glossario**: Adicionar 8 termos ausentes
13. **Glossario**: Enriquecer descricoes de ~15 termos
14. **Remover `indice_repasse` do glossario**: Indicador descontinuado
15. **Subtitulos opcionais**: Pequenas melhorias de clareza

---

## 16. RESUMO QUANTITATIVO

| Categoria | Total Revisado | OK | Ajustar | Erro Grave |
|-----------|---------------|-----|---------|------------|
| Navegacao (menu) | 10 | 6 | 4 | 0 |
| Glossario (termos) | 33 | 17 | 14 | 2 |
| Titulos de pagina (h2) | 13 | 13 | 0 | 0 |
| Subtitulos de pagina | 13 | 11 | 2 | 0 |
| KPI labels | 22 | 20 | 2 | 0 |
| Headers de tabela | ~85 | ~65 | ~18 | 2 |
| Titulos de graficos | 18 | 17 | 1 | 0 |
| Subtitulos de graficos | 18 | 17 | 1 | 0 |
| Nomes de abas | 10 | 9 | 1 | 0 |
| Textos explicativos | 3 | 0 | 1 | 2 |
| **TOTAL** | **~225** | **~175** | **~44** | **~6** |
