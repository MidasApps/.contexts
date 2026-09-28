# Imobiliárias de médio e grande porte — base de exemplos para o DataViz

> Catálogo de referência para plugar o domínio **imobiliária** (multi-unidade,
> multi-departamento) no DataViz. Respeita o modelo de visualização do app:
> grupo → página → blocos; cada bloco aceita um `shape` de métrica; toda
> métrica é `metrics/imobiliaria.<slug>` com `recipe.kind = 'sql'` em
> vocabulário de placeholders. Nada aqui é dado real de cliente.
>
> Status: **implementado** (2026-09-18) como tenant demo `imob-demo`
> (dataset `imobiliaria_demo`). Plano em `docs/superpowers/plans/2026-09-24-real-estate-demo-on-demand.md`;
> catálogo em `scripts/metrics/real-estate/*.mjs`; templates em
> `scripts/templates/real-estate/*.mjs`; gerador em `scripts/lib/synthetic-real-estate.ts`.
> Setup em README §4.1b (`pnpm demo:real-estate`). Nota: cartões, composições e listas sobre EVENTOS
> mostram o **mês calendário do fim do período** (pin `monthEnd`); séries obedecem
> à faixa escolhida. Ver `scripts/metrics/real-estate/_helpers.mjs`.

---

## 0. Como ler este documento

| Conceito do app | Como aparece aqui |
|---|---|
| `clients/{c}/groups/{g}` | Seção "Grupo" (um por departamento ou audiência) |
| `clients/{c}/groups/{g}/reports/{r}` (importado de `dashboardTemplates/`) | Subseção "Página" |
| Bloco do `blockMap` | Linha da tabela: **Bloco** = tipo do bloco, **Shape** = forma da métrica |
| `metrics/{id}` | Coluna **Métrica** (`imobiliaria.<slug>`) |
| `filters.metricPageFilters` | Seção "Filtros de página" |
| `dataContracts/imobiliaria` | Seção "Modelo de dados" |

Tipos de bloco disponíveis e o shape que cada um aceita (fonte:
`src/features/report-authoring/schema/block-specs.ts`):

| Bloco | Aceita | Uso típico aqui |
|---|---|---|
| `kpi` | `scalar` | número do mês com sparkline |
| `gauge` | `scalar` | indicador com limite (inadimplência, vacância, tempo de resposta) |
| `progress` | `scalar` | realizado vs. meta (VGV, locações, captações) |
| `comparison` | `timeseries` | mês atual vs. anterior / mesmo mês do ano anterior |
| `targets` | `targets` | painel de metas por unidade/corretor |
| `sparkrows` | `timeseries_multi` | várias métricas com tendência (painel executivo) |
| `donut` / `treemap` | `breakdown` | composição (origem de leads, mix de tipologia, receita por departamento) |
| `chart` (`bar`, `line`, `area`, `composed`, `stacked-bar`, `waterfall`, `histogram`, `pareto`) | `timeseries`, `timeseries_multi`, `timeseries_pivot`, `breakdown` | séries mensais, empilhado por unidade, pareto de motivos de perda, waterfall de DRE |
| `scatter` | `points` | preço × tempo de estoque, investimento × leads |
| `heatmap` | `matrix` | região × mês, corretor × etapa, dia × hora de leads |
| `table` | `rows` | rankings, listas operacionais, espelho de vendas |
| `funnel` | `funnel` | lead → visita → proposta → fechamento |
| `sankey` | `flow` | migração de estágio de lead, migração de status de contrato |
| `boxplot` | `distribution` | dispersão de ticket, de dias de fechamento, por unidade |

Convenções:
- **Foto do mês**: tabelas de snapshot carregam `data_base_report` (1º dia do mês). Manter esse nome de coluna herda de graça a sparkline de KPI e a detecção de sensibilidade a período (`serie-do-kpi.ts`, `sensibilidade-ao-periodo.ts`).
- **Eventos** (leads, visitas, propostas, vendas, faturas) usam a própria data do evento; a métrica recorta com `{filter.date_range:entidade.data}`.
- **Dimensões de corte** em quase toda página: unidade, departamento, corretor, tipo de imóvel, origem do lead, empreendimento.

---

## 1. Quem usa o quê

| Audiência | Perguntas que precisam de resposta em 10 segundos | Grupos |
|---|---|---|
| **Dono / diretoria** | Estamos batendo a meta de VGV e de receita? Qual unidade puxa e qual atrasa? Margem por departamento? Carteira de locação cresce ou sangra? | Visão Executiva, Financeiro |
| **Gestor de unidade / departamento** | Onde o funil vaza? Quem está produzindo? Quantos imóveis parados? Quanto custa um lead por canal? Inadimplência e vacância da minha carteira? | Lançamentos, Prontos, Locação, Marketing, Equipe, Atendimento |
| **Corretor** | Meus leads por estágio, minhas visitas da semana, minhas propostas abertas, minha comissão a receber, minha posição no ranking | Equipe → "Meu Painel" |
| **Financeiro** | Comissões a pagar e a receber, repasses de locação, DRE por unidade, fluxo de caixa projetado | Financeiro |
| **Marketing** | CAC por canal, ROI de campanha, leads qualificados, tempo de resposta | Marketing, Atendimento |

---

## 2. Modelo de dados — dataset `imobiliaria_<tenant>`

Vinte tabelas. Eventos são transacionais; duas tabelas de **snapshot mensal**
(`estoque_snapshot`, `carteira_locacao_snapshot`) trazem a foto do mês no
idioma do app. Nomes já em `snake_case`, prontos para virar
`dataContracts/imobiliaria/entities/{entidade}/attributes/{atributo}`.

### 2.1 Estrutura e pessoas

**`unidades`** — filiais.
`unidade_id`, `nome`, `cidade`, `uf`, `regiao`, `gerente_id`, `data_abertura`, `ativa`

**`departamentos`** — por unidade.
`departamento_id`, `unidade_id`, `nome` (`Lançamentos` · `Prontos` · `Locação` · `Administração de Locação` · `Captação` · `Marketing` · `Financeiro` · `Atendimento/SDR` · `Pós-venda`), `gestor_id`

**`corretores`** — equipe comercial e de apoio.
`corretor_id`, `nome` (sintético), `unidade_id`, `departamento_id`, `cargo` (`corretor` · `gerente` · `coordenador` · `sdr` · `captador`), `creci`, `data_admissao`, `data_desligamento`, `ativo`

**`metas`** — metas mensais em qualquer nível.
`competencia`, `unidade_id`, `departamento_id`, `corretor_id` (nulo = meta do time), `meta_vgv`, `meta_vendas`, `meta_locacoes`, `meta_captacoes`, `meta_leads`, `meta_receita`

### 2.2 Produto (imóveis e empreendimentos)

**`imoveis`** — carteira de prontos (venda e locação).
`imovel_id`, `codigo`, `tipo` (`apartamento` · `casa` · `comercial` · `terreno` · `cobertura` · `studio`), `finalidade` (`venda` · `locacao` · `ambas`), `bairro`, `cidade`, `regiao`, `area_m2`, `quartos`, `vagas`, `valor_anuncio`, `valor_aluguel_anuncio`, `valor_condominio`, `iptu_mensal`, `data_captacao`, `captador_id`, `unidade_id`, `origem_captacao` (`indicacao` · `portal` · `placa` · `prospeccao` · `site` · `parceiro`), `exclusividade`, `status` (`disponivel` · `reservado` · `vendido` · `alugado` · `retirado`), `data_saida`, `motivo_saida`

**`empreendimentos`** — lançamentos.
`empreendimento_id`, `nome`, `incorporadora`, `unidade_id`, `cidade`, `regiao`, `fase` (`pre_lancamento` · `lancamento` · `em_obra` · `pronto`), `data_lancamento`, `previsao_entrega`, `total_unidades`, `vgv_tabela`, `comissao_pct_padrao`

**`espelho_vendas`** — uma linha por unidade do empreendimento.
`unidade_emp_id`, `empreendimento_id`, `torre`, `andar`, `tipologia`, `area_m2`, `valor_tabela`, `status` (`disponivel` · `reservada` · `vendida` · `permutada` · `bloqueada`), `data_reserva`, `data_venda`, `corretor_id`

### 2.3 Funil comercial (eventos)

**`leads`**
`lead_id`, `data_criacao`, `origem` (`zap` · `vivareal` · `olx` · `site` · `instagram` · `meta_ads` · `google_ads` · `whatsapp` · `indicacao` · `placa` · `plantao` · `base`), `campanha_id`, `unidade_id`, `departamento_id`, `corretor_id`, `interesse` (`compra_pronto` · `compra_lancamento` · `locacao`), `empreendimento_id`, `imovel_id`, `faixa_valor`, `tipo_desejado`, `regiao_desejada`, `status` (`novo` · `em_atendimento` · `qualificado` · `visita` · `proposta` · `ganho` · `perdido`), `motivo_perda` (`preco` · `financiamento_negado` · `comprou_concorrente` · `desistiu` · `sem_retorno` · `imovel_indisponivel`), `data_primeiro_contato`, `data_qualificacao`, `data_ultima_interacao`, `data_fechamento`, `qualificado` (bool)

**`interacoes`** — cada toque no lead.
`interacao_id`, `lead_id`, `corretor_id`, `data_hora`, `canal` (`whatsapp` · `telefone` · `email` · `presencial`), `tipo` (`primeiro_contato` · `follow_up` · `agendamento` · `envio_proposta`)

**`visitas`**
`visita_id`, `lead_id`, `imovel_id`, `unidade_emp_id`, `corretor_id`, `unidade_id`, `data_agendada`, `data_realizada`, `realizada` (bool), `no_show` (bool), `feedback` (`gostou` · `neutro` · `nao_gostou`)

**`propostas`**
`proposta_id`, `lead_id`, `imovel_id`, `unidade_emp_id`, `corretor_id`, `unidade_id`, `departamento_id`, `data_envio`, `valor_pedido`, `valor_proposta`, `status` (`enviada` · `contraproposta` · `aceita` · `recusada` · `expirada`), `data_resposta`, `rodadas`

**`vendas`** — fechamento de prontos e lançamentos.
`venda_id`, `proposta_id`, `lead_id`, `imovel_id`, `unidade_emp_id`, `empreendimento_id`, `departamento` (`prontos` · `lancamentos`), `corretor_id`, `unidade_id`, `data_venda`, `valor_venda`, `valor_tabela`, `desconto_pct`, `forma_pagamento` (`financiamento` · `a_vista` · `consorcio` · `permuta` · `direto_incorporadora`), `banco`, `comissao_pct`, `comissao_total`, `comissao_imobiliaria`, `comissao_corretor`, `data_recebimento_comissao`, `distrato` (bool), `data_distrato`, `motivo_distrato`

### 2.4 Locação (eventos + snapshot)

**`contratos_locacao`**
`contrato_id`, `imovel_id`, `unidade_id`, `corretor_id`, `data_inicio`, `data_fim_prevista`, `data_encerramento`, `valor_aluguel`, `valor_encargos`, `taxa_adm_pct`, `taxa_intermediacao`, `garantia` (`fiador` · `seguro_fianca` · `caucao` · `titulo_capitalizacao` · `sem_garantia`), `indice_reajuste` (`IGPM` · `IPCA`), `status` (`ativo` · `encerrado` · `renovado` · `rescindido`), `motivo_encerramento` (`fim_contrato` · `inadimplencia` · `mudanca` · `venda_imovel` · `proprietario_retirou`), `dias_para_alugar` (da captação/vacância à assinatura)

**`faturas_locacao`** — uma por contrato por mês.
`fatura_id`, `contrato_id`, `imovel_id`, `unidade_id`, `competencia`, `valor_aluguel`, `valor_encargos`, `valor_total`, `data_vencimento`, `data_pagamento`, `status` (`pago` · `pago_atrasado` · `em_atraso` · `inadimplente` · `acordo`), `dias_atraso`, `taxa_adm_valor`, `valor_repasse`, `data_repasse`, `repasse_garantido` (bool)

**`carteira_locacao_snapshot`** — foto mensal. `data_base_report`, `contrato_id`, `imovel_id`, `unidade_id`, `status`, `valor_aluguel`, `taxa_adm_valor`, `dias_atraso`, `faixa_atraso` (`em_dia` · `1-30` · `31-60` · `61-90` · `90+`), `meses_de_contrato`, `garantia`

### 2.5 Estoque (snapshot), marketing e financeiro

**`estoque_snapshot`** — foto mensal da carteira de imóveis. `data_base_report`, `imovel_id`, `unidade_id`, `tipo`, `finalidade`, `regiao`, `status`, `valor_anuncio`, `dias_em_estoque`, `faixa_estoque` (`0-30` · `31-90` · `91-180` · `180+`), `exclusividade`, `visitas_acumuladas`, `propostas_acumuladas`

**`campanhas`**
`campanha_id`, `nome`, `canal`, `unidade_id`, `departamento_id`, `empreendimento_id`, `data_inicio`, `data_fim`, `objetivo` (`leads` · `captacao` · `marca`)

**`marketing_investimentos`** — mensal por canal/campanha.
`competencia`, `campanha_id`, `canal`, `unidade_id`, `departamento_id`, `investimento`, `impressoes`, `cliques`, `leads_gerados`, `leads_qualificados`

**`financeiro_lancamentos`** — DRE gerencial.
`lancamento_id`, `competencia`, `unidade_id`, `departamento_id`, `natureza` (`receita` · `despesa`), `categoria` (`comissao_venda_pronto` · `comissao_venda_lancamento` · `taxa_administracao` · `taxa_intermediacao_locacao` · `servicos` · `pessoal` · `comissao_corretor` · `marketing` · `ocupacao` · `tecnologia` · `administrativo` · `impostos`), `valor`, `data_vencimento`, `data_pagamento`, `status` (`previsto` · `realizado` · `atrasado`)

**`pesquisas_satisfacao`**
`pesquisa_id`, `data`, `tipo_cliente` (`comprador` · `proprietario` · `inquilino`), `nota` (0–10), `unidade_id`, `corretor_id`, `departamento_id`, `etapa` (`pos_visita` · `pos_fechamento` · `pos_entrega` · `anual`)

---

## 3. Filtros de página

```js
filters: {
  metricPageFilters: {
    snapshot:    { kind: 'snapshot',   attribute: 'estoque_snapshot.data_base_report' },  // ou carteira_locacao_snapshot
    date_range:  { kind: 'date_range', attribute: 'vendas.data_venda' },                  // páginas de eventos
  },
}
```

Dimensões (via `filterFields` na métrica): `unidade_id`, `departamento_id`,
`corretor_id`, `tipo`, `regiao`, `origem`, `empreendimento_id`, `garantia`.

---

## 4. Catálogo por grupo e página

Legenda das colunas: **Bloco** = tipo de bloco · **Shape** = forma da métrica ·
**Métrica** = `imobiliaria.<slug>` · **Definição** = fórmula/recorte.

### Grupo A — Visão Executiva (dono / diretoria)

#### A1. Painel Executivo

| Bloco | Shape | Métrica | Definição |
|---|---|---|---|
| kpi | scalar | `vgv_mes` | Σ `vendas.valor_venda` no mês (prontos + lançamentos) |
| kpi | scalar | `receita_bruta_mes` | Σ `financeiro_lancamentos.valor` natureza=receita no mês |
| kpi | scalar | `margem_operacional_pct` | (receita − despesa) / receita no mês |
| kpi | scalar | `vendas_qtd_mes` | COUNT vendas no mês |
| kpi | scalar | `locacoes_fechadas_mes` | COUNT `contratos_locacao` iniciados no mês |
| kpi | scalar | `carteira_locacao_ativa` | COUNT contratos `ativo` na foto do mês |
| kpi | scalar | `receita_taxa_adm_mes` | Σ `taxa_adm_valor` na foto do mês (receita recorrente) |
| progress | scalar | `atingimento_meta_vgv_pct` | VGV mês / `metas.meta_vgv` consolidada |
| progress | scalar | `atingimento_meta_receita_pct` | receita / `metas.meta_receita` |
| sparkrows | timeseries_multi | `executivo_tendencias` | 12 meses de VGV, receita, leads, vendas, locações, captações |
| chart stacked-bar | timeseries_pivot | `vgv_por_departamento_serie` | VGV mensal empilhado prontos × lançamentos |
| chart line | timeseries_multi | `receita_por_departamento_serie` | receita mensal por departamento (Lançamentos, Prontos, Locação, Serviços) |
| donut | breakdown | `receita_por_fonte` | comissão pronto / comissão lançamento / taxa adm / intermediação locação / serviços |
| comparison | timeseries | `vgv_vs_ano_anterior` | VGV mês atual × mesmo mês do ano anterior |
| gauge | scalar | `inadimplencia_locacao_pct` | faturas em atraso / faturas do mês (limite 3%) |
| gauge | scalar | `vacancia_carteira_pct` | imóveis de locação `disponivel` / carteira de locação |
| table | rows | `alertas_executivos` | lista: unidade abaixo de 70% da meta, inadimplência > 5%, estoque 180+ acima de X, tempo de resposta > 1h |

#### A2. Comparativo de Unidades

| Bloco | Shape | Métrica | Definição |
|---|---|---|---|
| table | rows | `ranking_unidades` | unidade · VGV · vendas · locações · captações · leads · conversão · receita · margem · atingimento |
| chart bar | breakdown | `vgv_por_unidade` | VGV do período por unidade |
| chart bar | breakdown | `receita_por_unidade` | receita por unidade |
| chart bar | breakdown | `margem_por_unidade` | margem % por unidade |
| targets | targets | `metas_por_unidade` | realizado × meta por unidade (VGV, locações, captações) |
| heatmap | matrix | `vgv_unidade_x_mes` | unidade × mês (12 meses) |
| scatter | points | `unidades_leads_x_conversao` | x = leads, y = conversão %, tamanho = VGV |
| boxplot | distribution | `ticket_por_unidade_dist` | distribuição do `valor_venda` por unidade |
| treemap | breakdown | `carteira_locacao_por_unidade` | contratos ativos por unidade |

#### A3. Metas & Resultados

| Bloco | Shape | Métrica | Definição |
|---|---|---|---|
| targets | targets | `metas_consolidadas` | VGV, vendas, locações, captações, leads, receita: realizado × meta no mês |
| chart composed | timeseries_multi | `vgv_realizado_vs_meta_serie` | barras realizado, linha meta, 12 meses |
| chart composed | timeseries_multi | `receita_realizada_vs_meta_serie` | idem para receita |
| table | rows | `atingimento_por_departamento` | departamento · meta · realizado · % · gap |
| chart waterfall | breakdown | `ponte_meta_vgv` | meta → gap por unidade → realizado |
| kpi | scalar | `forecast_vgv_mes` | run-rate: VGV até hoje / dias úteis decorridos × dias úteis do mês |

### Grupo B — Lançamentos

#### B1. Painel de Lançamentos

| Bloco | Shape | Métrica | Definição |
|---|---|---|---|
| kpi | scalar | `lanc_vgv_mes` | Σ `vendas.valor_venda` departamento=lancamentos |
| kpi | scalar | `lanc_unidades_vendidas_mes` | COUNT vendas lançamentos |
| kpi | scalar | `lanc_vso_mes` | VSO: vendidas no mês / (disponíveis início do mês + lançadas) |
| kpi | scalar | `lanc_vso_acumulada` | vendidas acumuladas / total de unidades (por empreendimento ativo) |
| kpi | scalar | `lanc_ticket_medio` | AVG `valor_venda` lançamentos |
| kpi | scalar | `lanc_estoque_disponivel_vgv` | Σ `valor_tabela` de `espelho_vendas.status=disponivel` |
| kpi | scalar | `lanc_reservas_abertas` | COUNT `espelho_vendas.status=reservada` |
| kpi | scalar | `lanc_distrato_pct` | vendas com `distrato` / vendas (12 m) |
| chart line | timeseries_multi | `lanc_vso_serie_por_empreendimento` | VSO mensal por empreendimento |
| chart stacked-bar | timeseries_pivot | `lanc_vendas_por_empreendimento_serie` | unidades vendidas por mês, empilhado por empreendimento |
| table | rows | `lanc_empreendimentos_status` | empreendimento · fase · total · vendidas · reservadas · disponíveis · VSO acum · VGV vendido · VGV estoque · previsão entrega |
| donut | breakdown | `lanc_mix_forma_pagamento` | financiamento / à vista / consórcio / permuta / direto |
| chart bar | breakdown | `lanc_vendas_por_tipologia` | vendidas por tipologia |
| gauge | scalar | `lanc_desconto_medio_pct` | AVG `desconto_pct` (limite 5%) |

#### B2. Espelho de Vendas (por empreendimento)

| Bloco | Shape | Métrica | Definição |
|---|---|---|---|
| heatmap | matrix | `espelho_torre_andar` | torre/andar × tipologia com status codificado (disponível/reservada/vendida) |
| table | rows | `espelho_unidades` | unidade · tipologia · área · valor tabela · status · corretor · data |
| kpi | scalar | `espelho_pct_vendido` | vendidas / total |
| kpi | scalar | `espelho_vgv_restante` | Σ `valor_tabela` não vendidas |
| chart bar | breakdown | `espelho_disponiveis_por_tipologia` | disponíveis por tipologia |
| chart line | timeseries | `espelho_curva_vendas_acumulada` | vendidas acumuladas por mês desde o lançamento |
| boxplot | distribution | `espelho_preco_m2_por_tipologia` | `valor_venda / area_m2` por tipologia |

#### B3. Funil de Lançamento

| Bloco | Shape | Métrica | Definição |
|---|---|---|---|
| funnel | funnel | `lanc_funil` | leads interesse=lancamento → qualificados → visita ao stand → proposta → venda |
| kpi | scalar | `lanc_conversao_lead_venda_pct` | vendas / leads (coorte do período) |
| kpi | scalar | `lanc_custo_por_venda` | investimento marketing do empreendimento / vendas |
| chart bar | breakdown | `lanc_leads_por_origem` | leads por origem para o empreendimento |
| sankey | flow | `lanc_migracao_estagios` | fluxo de status de leads no período |
| chart pareto | breakdown | `lanc_motivos_perda` | motivos de perda ordenados |
| table | rows | `lanc_ranking_corretores` | corretor · leads · visitas · propostas · vendas · VGV · conversão |

### Grupo C — Prontos / Revenda

#### C1. Painel de Vendas

| Bloco | Shape | Métrica | Definição |
|---|---|---|---|
| kpi | scalar | `prontos_vgv_mes` | Σ `valor_venda` departamento=prontos |
| kpi | scalar | `prontos_vendas_qtd_mes` | COUNT vendas prontos |
| kpi | scalar | `prontos_ticket_medio` | AVG `valor_venda` |
| kpi | scalar | `prontos_comissao_media_pct` | AVG `comissao_pct` |
| kpi | scalar | `prontos_receita_comissao_mes` | Σ `comissao_imobiliaria` |
| kpi | scalar | `prontos_ciclo_venda_dias` | AVG(`data_venda` − `leads.data_criacao`) |
| kpi | scalar | `prontos_desconto_medio_pct` | AVG((`valor_tabela` − `valor_venda`)/`valor_tabela`) |
| progress | scalar | `prontos_atingimento_meta_pct` | VGV / meta do departamento |
| chart composed | timeseries_multi | `prontos_vgv_serie` | VGV mensal (barras) + qtd (linha), 12 m |
| chart stacked-bar | timeseries_pivot | `prontos_vendas_por_unidade_serie` | vendas por mês empilhado por unidade |
| donut | breakdown | `prontos_vendas_por_tipo` | apto / casa / comercial / terreno |
| chart bar | breakdown | `prontos_vendas_por_regiao` | por região |
| donut | breakdown | `prontos_forma_pagamento` | financiamento / à vista / consórcio |
| chart bar | breakdown | `prontos_vendas_por_banco` | financiamentos por banco |
| comparison | timeseries | `prontos_vgv_vs_mes_anterior` | mês × anterior |
| boxplot | distribution | `prontos_ciclo_por_unidade_dist` | dias até fechar, por unidade |

#### C2. Funil Comercial

| Bloco | Shape | Métrica | Definição |
|---|---|---|---|
| funnel | funnel | `prontos_funil` | leads → em atendimento → qualificados → visita realizada → proposta → venda |
| kpi | scalar | `conversao_lead_visita_pct` | visitas realizadas / leads |
| kpi | scalar | `conversao_visita_proposta_pct` | propostas / visitas realizadas |
| kpi | scalar | `conversao_proposta_venda_pct` | vendas / propostas |
| kpi | scalar | `conversao_lead_venda_pct` | vendas / leads (benchmark ≈ 2–3%) |
| kpi | scalar | `visitas_por_venda` | visitas realizadas / vendas |
| kpi | scalar | `propostas_aceitas_pct` | aceitas / enviadas |
| kpi | scalar | `no_show_visitas_pct` | `no_show` / agendadas |
| chart line | timeseries_multi | `conversao_etapas_serie` | conversão por etapa, 12 m |
| chart pareto | breakdown | `motivos_perda` | `motivo_perda` ordenado |
| sankey | flow | `migracao_estagios_leads` | fluxo entre status |
| heatmap | matrix | `funil_corretor_x_etapa` | corretor × etapa (taxa de conversão) |
| table | rows | `propostas_abertas` | proposta · imóvel · lead · corretor · valor · status · dias em aberto |

#### C3. Estoque & Captação

| Bloco | Shape | Métrica | Definição |
|---|---|---|---|
| kpi | scalar | `estoque_imoveis_venda` | COUNT `estoque_snapshot.status=disponivel` finalidade venda |
| kpi | scalar | `estoque_vgv_anunciado` | Σ `valor_anuncio` disponíveis |
| kpi | scalar | `captacoes_mes` | COUNT `imoveis` por `data_captacao` no mês |
| progress | scalar | `atingimento_meta_captacao_pct` | captações / `meta_captacoes` |
| kpi | scalar | `exclusividade_pct` | `exclusividade` / captações |
| kpi | scalar | `tempo_medio_estoque_dias` | AVG `dias_em_estoque` |
| kpi | scalar | `icca_pct` | Índice de Captados sobre Carteira Administrada: captações / carteira início do mês |
| kpi | scalar | `giro_estoque_pct` | vendidos no mês / estoque início do mês |
| chart bar | breakdown | `estoque_por_faixa_dias` | 0-30 / 31-90 / 91-180 / 180+ |
| chart stacked-bar | timeseries_pivot | `estoque_serie_por_faixa` | evolução mensal por faixa de dias |
| treemap | breakdown | `estoque_por_regiao_tipo` | Σ valor por região › tipo |
| scatter | points | `preco_x_dias_estoque` | x = `valor_anuncio`, y = `dias_em_estoque`, cor = tipo |
| table | rows | `imoveis_parados_180` | imóveis 180+ dias: código · tipo · região · valor · visitas · propostas · captador |
| table | rows | `ranking_captadores` | captador · captações · exclusivas · vendidos · tempo médio |
| chart line | timeseries_multi | `captacoes_vs_saidas_serie` | entradas × saídas de carteira por mês |
| donut | breakdown | `saidas_por_motivo` | vendido / retirado pelo proprietário / vendido por outro / expirado |

### Grupo D — Locação

#### D1. Painel de Locação

| Bloco | Shape | Métrica | Definição |
|---|---|---|---|
| kpi | scalar | `loc_contratos_ativos` | foto do mês, status ativo |
| kpi | scalar | `loc_valor_administrado_mes` | Σ `valor_aluguel` ativos (aluguel total administrado) |
| kpi | scalar | `loc_receita_taxa_adm_mes` | Σ `taxa_adm_valor` |
| kpi | scalar | `loc_taxa_adm_media_pct` | AVG `taxa_adm_pct` |
| kpi | scalar | `loc_novos_contratos_mes` | contratos iniciados no mês |
| kpi | scalar | `loc_receita_intermediacao_mes` | Σ `taxa_intermediacao` dos iniciados |
| kpi | scalar | `loc_aluguel_medio` | AVG `valor_aluguel` |
| kpi | scalar | `loc_tempo_medio_para_alugar` | AVG `dias_para_alugar` |
| progress | scalar | `loc_atingimento_meta_pct` | novos contratos / `meta_locacoes` |
| gauge | scalar | `loc_inadimplencia_pct` | faturas `em_atraso`+`inadimplente` / faturas da competência (limite 3%; média nacional ≈ 3,2%) |
| gauge | scalar | `loc_vacancia_pct` | imóveis para locação disponíveis / (disponíveis + alugados) |
| chart composed | timeseries_multi | `loc_carteira_serie` | contratos ativos (linha) e novos × encerrados (barras) |
| chart line | timeseries | `loc_receita_recorrente_serie` | taxa de adm mensal, 12 m |
| donut | breakdown | `loc_mix_garantia` | fiador / seguro fiança / caução / título / sem garantia |
| chart bar | breakdown | `loc_contratos_por_tipo` | por tipo de imóvel |
| chart bar | breakdown | `loc_contratos_por_unidade` | por unidade |

#### D2. Carteira Administrada

| Bloco | Shape | Métrica | Definição |
|---|---|---|---|
| kpi | scalar | `loc_churn_contratos_pct` | encerrados no mês / ativos início do mês |
| kpi | scalar | `loc_churn_proprietarios_pct` | imóveis retirados da administração / carteira |
| kpi | scalar | `loc_renovacao_pct` | renovados / (renovados + encerrados no vencimento) |
| kpi | scalar | `loc_duracao_media_meses` | AVG `meses_de_contrato` |
| kpi | scalar | `loc_valor_carteira_estimado` | receita mensal de taxa adm × 12 (referência de valuation 10–15×) |
| chart bar | breakdown | `loc_encerramentos_por_motivo` | fim contrato / inadimplência / mudança / venda / proprietário retirou |
| sankey | flow | `loc_migracao_status_contratos` | ativo → renovado / encerrado / rescindido |
| chart histogram | breakdown | `loc_distribuicao_aluguel` | faixas de `valor_aluguel` |
| boxplot | distribution | `loc_aluguel_por_regiao_dist` | dispersão do aluguel por região |
| table | rows | `loc_vencimentos_90_dias` | contratos vencendo em 90 dias: imóvel · inquilino (id) · aluguel · reajuste · status renovação |
| table | rows | `loc_reajustes_mes` | contratos com aniversário no mês: índice · % · novo aluguel |
| heatmap | matrix | `loc_carteira_regiao_x_tipo` | contratos por região × tipo |

#### D3. Inadimplência & Repasses

| Bloco | Shape | Métrica | Definição |
|---|---|---|---|
| kpi | scalar | `loc_inadimplencia_valor` | Σ `valor_total` faturas em atraso |
| kpi | scalar | `loc_inadimplencia_qtd` | COUNT faturas em atraso |
| kpi | scalar | `loc_atraso_medio_dias` | AVG `dias_atraso` das atrasadas |
| kpi | scalar | `loc_recuperacao_pct` | atrasadas do mês anterior pagas neste mês |
| kpi | scalar | `loc_acordos_ativos` | faturas status=acordo |
| kpi | scalar | `loc_repasse_garantido_pct` | contratos com repasse garantido / ativos |
| chart stacked-bar | timeseries_pivot | `loc_aging_serie` | em dia / 1-30 / 31-60 / 61-90 / 90+ por mês |
| chart bar | breakdown | `loc_inadimplencia_por_unidade` | % por unidade |
| chart bar | breakdown | `loc_inadimplencia_por_garantia` | % por tipo de garantia |
| chart line | timeseries | `loc_inadimplencia_serie` | % mensal, 12 m |
| kpi | scalar | `loc_repasses_mes` | Σ `valor_repasse` |
| kpi | scalar | `loc_repasses_no_prazo_pct` | repasses até D+X / repasses |
| table | rows | `loc_faturas_em_atraso` | contrato · imóvel · competência · valor · dias · garantia · status cobrança |

#### D4. Vacância & Renovações

| Bloco | Shape | Métrica | Definição |
|---|---|---|---|
| kpi | scalar | `loc_imoveis_vagos` | disponíveis para locação na foto |
| kpi | scalar | `loc_vacancia_media_dias` | AVG dias vagos |
| kpi | scalar | `loc_aluguel_perdido_mes` | Σ `valor_aluguel_anuncio` dos vagos (receita não realizada do proprietário) |
| chart bar | breakdown | `loc_vagos_por_faixa_dias` | 0-30 / 31-60 / 61-90 / 90+ |
| chart line | timeseries | `loc_vacancia_serie` | % mensal |
| table | rows | `loc_vagos_90_dias` | imóvel · região · tipo · aluguel · dias vago · visitas · ação sugerida |
| scatter | points | `loc_aluguel_x_dias_vago` | preço × dias vago |

### Grupo E — Marketing

#### E1. Painel de Marketing

| Bloco | Shape | Métrica | Definição |
|---|---|---|---|
| kpi | scalar | `mkt_leads_mes` | COUNT leads no mês |
| kpi | scalar | `mkt_leads_qualificados_mes` | COUNT `qualificado` |
| kpi | scalar | `mkt_taxa_qualificacao_pct` | qualificados / leads |
| kpi | scalar | `mkt_investimento_mes` | Σ `investimento` |
| kpi | scalar | `mkt_cpl` | custo por lead: investimento / leads |
| kpi | scalar | `mkt_cpl_qualificado` | investimento / qualificados |
| kpi | scalar | `mkt_cac` | investimento / (vendas + locações fechadas) |
| kpi | scalar | `mkt_roi_pct` | (receita atribuída − investimento) / investimento |
| progress | scalar | `mkt_atingimento_meta_leads_pct` | leads / `meta_leads` |
| chart composed | timeseries_multi | `mkt_leads_vs_investimento_serie` | leads (barras) × investimento (linha) |
| chart stacked-bar | timeseries_pivot | `mkt_leads_por_origem_serie` | leads por mês empilhado por origem |
| donut | breakdown | `mkt_leads_por_origem` | composição por origem |
| donut | breakdown | `mkt_leads_por_interesse` | compra pronto / lançamento / locação |
| heatmap | matrix | `mkt_leads_dia_x_hora` | dia da semana × hora de criação |

#### E2. Origem de Leads & CAC

| Bloco | Shape | Métrica | Definição |
|---|---|---|---|
| table | rows | `mkt_canais_performance` | canal · investimento · leads · qualificados · visitas · vendas/locações · CPL · CAC · conversão · ROI |
| chart bar | breakdown | `mkt_cpl_por_canal` | CPL por canal |
| chart bar | breakdown | `mkt_conversao_por_canal` | lead→fechamento por canal |
| scatter | points | `mkt_investimento_x_leads_canal` | x = investimento, y = leads, tamanho = vendas |
| chart pareto | breakdown | `mkt_leads_pareto_origem` | origens acumulando 80% dos leads |
| chart bar | breakdown | `mkt_receita_atribuida_por_canal` | comissão + intermediação dos fechamentos por origem |

#### E3. Campanhas

| Bloco | Shape | Métrica | Definição |
|---|---|---|---|
| table | rows | `mkt_campanhas` | campanha · canal · período · investimento · impressões · cliques · CTR · leads · CPL · fechamentos · ROI |
| chart line | timeseries_multi | `mkt_campanha_leads_diario` | leads por dia das campanhas ativas |
| kpi | scalar | `mkt_ctr_medio_pct` | cliques / impressões |
| kpi | scalar | `mkt_campanhas_ativas` | COUNT campanhas em curso |

### Grupo F — Financeiro

#### F1. DRE Gerencial

| Bloco | Shape | Métrica | Definição |
|---|---|---|---|
| kpi | scalar | `fin_receita_bruta_mes` | Σ receitas |
| kpi | scalar | `fin_despesas_mes` | Σ despesas |
| kpi | scalar | `fin_resultado_mes` | receita − despesa |
| kpi | scalar | `fin_margem_pct` | resultado / receita |
| kpi | scalar | `fin_receita_recorrente_pct` | taxa adm / receita (previsibilidade) |
| kpi | scalar | `fin_despesa_pessoal_pct` | pessoal + comissão corretor / receita |
| chart waterfall | breakdown | `fin_dre_cascata` | receita → (−) comissões corretores → (−) pessoal → (−) marketing → (−) ocupação → (−) tecnologia → (−) impostos → resultado |
| chart stacked-bar | timeseries_pivot | `fin_receita_por_categoria_serie` | receita mensal por categoria |
| chart stacked-bar | timeseries_pivot | `fin_despesa_por_categoria_serie` | despesa mensal por categoria |
| chart line | timeseries_multi | `fin_resultado_serie` | receita, despesa, resultado, 12 m |
| table | rows | `fin_dre_por_unidade` | unidade · receita · despesa · resultado · margem · receita/corretor |
| table | rows | `fin_dre_por_departamento` | departamento · receita · despesa · resultado · margem |
| comparison | timeseries | `fin_resultado_vs_mes_anterior` | mês × anterior |

#### F2. Comissões

| Bloco | Shape | Métrica | Definição |
|---|---|---|---|
| kpi | scalar | `com_a_receber_total` | Σ `comissao_imobiliaria` sem `data_recebimento_comissao` |
| kpi | scalar | `com_recebida_mes` | Σ recebidas no mês |
| kpi | scalar | `com_prazo_medio_recebimento_dias` | AVG(`data_recebimento_comissao` − `data_venda`) |
| kpi | scalar | `com_a_pagar_corretores` | Σ `comissao_corretor` de vendas com comissão recebida e não paga |
| kpi | scalar | `com_split_medio_corretor_pct` | AVG `comissao_corretor` / `comissao_total` |
| kpi | scalar | `com_perda_por_distrato_mes` | Σ comissão de vendas distratadas no mês |
| chart stacked-bar | timeseries_pivot | `com_aging_a_receber` | a receber por faixa de dias desde a venda |
| chart bar | breakdown | `com_a_receber_por_incorporadora` | lançamentos: pendente por incorporadora |
| table | rows | `com_pendentes` | venda · empreendimento/imóvel · corretor · valor · dias · status |
| table | rows | `com_por_corretor_mes` | corretor · vendas · comissão gerada · a receber · paga |

#### F3. Fluxo de Caixa & Recebíveis

| Bloco | Shape | Métrica | Definição |
|---|---|---|---|
| kpi | scalar | `cx_entradas_mes` | Σ realizadas natureza=receita |
| kpi | scalar | `cx_saidas_mes` | Σ realizadas natureza=despesa |
| kpi | scalar | `cx_saldo_mes` | entradas − saídas |
| kpi | scalar | `cx_previsto_proximos_90` | Σ previstos (comissões a receber + taxa adm projetada − despesas previstas) |
| chart composed | timeseries_multi | `cx_realizado_vs_previsto_serie` | 6 m realizados + 3 m previstos |
| chart stacked-bar | timeseries_pivot | `cx_entradas_por_fonte_serie` | entradas por fonte |
| table | rows | `cx_contas_a_pagar_vencidas` | lançamento · categoria · vencimento · valor · dias |

### Grupo G — Equipe (gestor e corretor)

#### G1. Ranking de Corretores

| Bloco | Shape | Métrica | Definição |
|---|---|---|---|
| table | rows | `eq_ranking_corretores` | corretor · unidade · depto · leads · visitas · propostas · vendas · locações · VGV · comissão · conversão · atingimento |
| chart bar | breakdown | `eq_vgv_por_corretor_top20` | top 20 por VGV |
| chart bar | breakdown | `eq_locacoes_por_corretor_top20` | top 20 por locações |
| targets | targets | `eq_metas_por_corretor` | realizado × meta individual |
| heatmap | matrix | `eq_corretor_x_mes_vgv` | corretor × mês |
| boxplot | distribution | `eq_vgv_por_corretor_dist_unidade` | dispersão de VGV por corretor, por unidade |
| chart pareto | breakdown | `eq_concentracao_vgv` | % do VGV concentrado nos top corretores |

#### G2. Produtividade

| Bloco | Shape | Métrica | Definição |
|---|---|---|---|
| kpi | scalar | `eq_corretores_ativos` | ativos na foto |
| kpi | scalar | `eq_vgv_por_corretor` | VGV / corretores ativos |
| kpi | scalar | `eq_leads_por_corretor` | leads / corretores |
| kpi | scalar | `eq_visitas_por_corretor` | visitas realizadas / corretores |
| kpi | scalar | `eq_interacoes_por_lead` | interações / leads |
| kpi | scalar | `eq_corretores_sem_venda_90d_pct` | sem venda em 90 dias / ativos |
| kpi | scalar | `eq_turnover_pct` | desligados no período / headcount médio |
| kpi | scalar | `eq_ramp_up_dias` | AVG dias da admissão à 1ª venda |
| chart line | timeseries_multi | `eq_produtividade_serie` | VGV/corretor e vendas/corretor, 12 m |
| chart histogram | breakdown | `eq_distribuicao_vendas_por_corretor` | corretores por faixa de vendas no mês |
| scatter | points | `eq_leads_x_vendas_corretor` | x = leads, y = vendas, tamanho = VGV |
| table | rows | `eq_leads_sem_contato_24h` | leads sem `data_primeiro_contato` em 24 h, por corretor |

#### G3. Meu Painel (corretor — filtrado por `corretor_id` do usuário)

| Bloco | Shape | Métrica | Definição |
|---|---|---|---|
| kpi | scalar | `meu_vgv_mes` | meu VGV |
| progress | scalar | `meu_atingimento_meta_pct` | meu VGV / minha meta |
| kpi | scalar | `meus_leads_ativos` | leads meus em status aberto |
| kpi | scalar | `meus_leads_novos_sem_contato` | leads novos sem primeiro contato |
| kpi | scalar | `minhas_visitas_semana` | visitas agendadas 7 dias |
| kpi | scalar | `minhas_propostas_abertas` | propostas enviadas/contraproposta |
| kpi | scalar | `minha_comissao_a_receber` | Σ `comissao_corretor` pendente |
| kpi | scalar | `minha_posicao_ranking` | posição no ranking da unidade |
| funnel | funnel | `meu_funil` | meu funil do período |
| table | rows | `meus_leads_por_estagio` | lead · origem · interesse · estágio · última interação · próxima ação |
| table | rows | `minhas_visitas_agenda` | data · imóvel · lead · status |
| table | rows | `minhas_propostas` | proposta · imóvel · valor · status · dias |
| chart line | timeseries | `meu_vgv_serie` | meu VGV 12 m |

### Grupo H — Atendimento & Clientes

#### H1. Tempo de Resposta

| Bloco | Shape | Métrica | Definição |
|---|---|---|---|
| gauge | scalar | `at_tempo_primeiro_contato_min` | MEDIAN(`data_primeiro_contato` − `data_criacao`) em minutos (limite 60) |
| kpi | scalar | `at_leads_respondidos_1h_pct` | respondidos em ≤ 1 h / leads |
| kpi | scalar | `at_leads_sem_contato_24h` | COUNT sem contato em 24 h |
| kpi | scalar | `at_leads_sem_interacao_7d` | abertos sem interação em 7 dias |
| chart line | timeseries | `at_tempo_resposta_serie` | mediana mensal |
| chart bar | breakdown | `at_tempo_resposta_por_unidade` | por unidade |
| heatmap | matrix | `at_tempo_resposta_dia_x_hora` | dia × hora (onde o SLA quebra) |
| table | rows | `at_leads_atrasados` | lead · origem · corretor · horas sem contato |

#### H2. Satisfação (NPS)

| Bloco | Shape | Métrica | Definição |
|---|---|---|---|
| kpi | scalar | `nps_compradores` | % promotores − % detratores (compradores) |
| kpi | scalar | `nps_proprietarios` | idem proprietários |
| kpi | scalar | `nps_inquilinos` | idem inquilinos |
| kpi | scalar | `nps_respostas_mes` | COUNT pesquisas |
| chart line | timeseries_multi | `nps_serie` | os três NPS, 12 m |
| chart bar | breakdown | `nps_por_unidade` | NPS por unidade |
| chart bar | breakdown | `nps_por_corretor_top` | por corretor (mín. N respostas) |
| donut | breakdown | `nps_distribuicao` | promotores / neutros / detratores |

#### H3. Pós-venda & Distratos

| Bloco | Shape | Métrica | Definição |
|---|---|---|---|
| kpi | scalar | `pv_distratos_mes` | COUNT `distrato` no mês |
| kpi | scalar | `pv_distrato_pct_12m` | distratos / vendas (12 m) |
| kpi | scalar | `pv_vgv_distratado_mes` | Σ valor distratado |
| chart bar | breakdown | `pv_distratos_por_motivo` | financiamento negado / desistência / atraso obra / outro |
| chart bar | breakdown | `pv_distratos_por_empreendimento` | por empreendimento |
| chart line | timeseries | `pv_distrato_serie` | % mensal |
| table | rows | `pv_distratos_lista` | venda · empreendimento · corretor · valor · motivo · dias após venda |

**Total: 8 grupos · 25 páginas · 268 métricas** (262 nos blocos das páginas + 6 séries simples para sparklines de KPI), todas mapeadas em shapes que
o app renderiza hoje. Nenhum bloco novo.

---

## 5. Benchmarks de referência (para gauges e alertas)

| Indicador | Referência de mercado | Uso no catálogo |
|---|---|---|
| Conversão lead → fechamento | ≈ 2,8% média nacional (pesquisa Universal Software, 2019); medir por canal | `conversao_lead_venda_pct` |
| Inadimplência de locação | ≈ 3,2% média nacional, ≈ 5,4% Nordeste | `loc_inadimplencia_pct` (gauge limite 3–5%) |
| Valuation de carteira de locação | 10–15× a receita mensal de taxa de administração | `loc_valor_carteira_estimado` |
| Tempo de resposta ao lead | mercado premia resposta em minutos; SLA sugerido ≤ 1 h | `at_tempo_primeiro_contato_min` |
| VSO de lançamento | alto = boa aceitação; acompanhar mensal e acumulado por empreendimento | `lanc_vso_mes`, `lanc_vso_acumulada` |
| ICCA (captados sobre carteira) | crescimento da carteira | `icca_pct` |

Fontes: [Imobi Report — KPIs de locação](https://imobireport.com.br/imobi-report-explica/9-indicadores-de-desempenho-kpis-para-uma-imobiliaria-de-locacao/) ·
[CV CRM — KPIs de vendas](https://cvcrm.com.br/blog/kpis-de-vendas/) ·
[DNA de Vendas — KPIs imobiliárias](https://dnadevendas.com.br/blog/kpis-para-vendas-imobiliarias/) ·
[Portal VGV — KPIs para incorporadoras](https://www.portalvgv.com.br/indicadores-de-desempenho-kpis-essenciais-para-incorporadoras/) ·
[Microsistec — KPIs para imobiliárias](https://microsistec.com.br/blog/kpis-e-indicadores-para-imobiliarias/) ·
[Universal Software — valor de carteira de locação](https://blog.universalsoftware.com.br/quanto-vale-carteira-de-locacao/) ·
[Âncora — inadimplência na locação](https://ancoraimobiliaria.com.br/blog/administracao-aluguel/inadimplencia-recorde-brasil-mercado-de-locacao/) ·
[Confiax — indicadores de locação](https://www.confiaxseguros.com.br/blog/gestao-de-indicadores-na-locacao-imobiliaria-como-usar-dados-para-aumentar-resultados/) ·
[ImobiBrasil — sistema para imobiliária com filiais](https://www.imobibrasil.com.br/blog/sistema-para-imobiliaria-grande-equipes-e-filiais/) ·
[ImobTotal — multi-filiais](https://www.imobtotal.com.br/sistema-imobiliario-multiplas-filiais) ·
[CV CRM — gestão de lançamentos](https://cvcrm.com.br/blog/estrategia-de-gestao-de-lancamentos-imobiliarios/)

---

## 6. Exemplos de recipe no vocabulário do app

Mesmo padrão de `scripts/metrics/covenants-v2.mjs`: placeholders
`{entidade}`, `{entidade.atributo}`, `{filter.X:entidade.atributo}`; `shape` e
`outputColumns` declarados.

```js
// KPI de evento no período (shape scalar)
{
  id: 'imobiliaria.prontos_vgv_mes',
  label: 'VGV Prontos', unit: 'BRL', shape: 'scalar', outputColumns: ['value'],
  requires: ['imobiliaria.vendas.valor_venda', 'imobiliaria.vendas.data_venda', 'imobiliaria.vendas.departamento'],
  filterFields: ['vendas.unidade_id', 'vendas.corretor_id'],
  recipe: { kind: 'sql', template: `
    SELECT COALESCE(SUM({vendas.valor_venda}), 0) AS value
    FROM {vendas}
    WHERE {vendas.departamento} = 'prontos'
      AND {vendas.distrato} = FALSE
      AND {filter.date_range:vendas.data_venda}
  ` },
}

// KPI de snapshot pinado no último mês ≤ filtro (shape scalar)
{
  id: 'imobiliaria.loc_inadimplencia_pct',
  label: 'Inadimplência de locação', unit: '%', shape: 'scalar', outputColumns: ['value'],
  requires: ['imobiliaria.carteira_locacao_snapshot.status', 'imobiliaria.carteira_locacao_snapshot.dias_atraso',
             'imobiliaria.carteira_locacao_snapshot.data_base_report'],
  recipe: { kind: 'sql', template: `
    SELECT SAFE_DIVIDE(COUNTIF({carteira_locacao_snapshot.dias_atraso} > 0), COUNT(1)) AS value
    FROM {carteira_locacao_snapshot}
    WHERE {carteira_locacao_snapshot.status} = 'ativo'
      AND {carteira_locacao_snapshot.data_base_report} = (
        SELECT MAX({carteira_locacao_snapshot.data_base_report}) FROM {carteira_locacao_snapshot}
        WHERE {filter.ate:carteira_locacao_snapshot.data_base_report})
  ` },
}

// Funil (shape funnel): colunas stage, value, ordenadas
{
  id: 'imobiliaria.prontos_funil',
  label: 'Funil comercial', shape: 'funnel', outputColumns: ['stage', 'value', 'order'],
  requires: ['imobiliaria.leads.lead_id', 'imobiliaria.leads.data_criacao', 'imobiliaria.leads.qualificado',
             'imobiliaria.visitas.lead_id', 'imobiliaria.visitas.realizada',
             'imobiliaria.propostas.lead_id', 'imobiliaria.vendas.lead_id'],
  recipe: { kind: 'sql', template: `
    WITH coorte AS (
      SELECT {leads.lead_id} AS lead_id, {leads.qualificado} AS qualificado
      FROM {leads} WHERE {filter.date_range:leads.data_criacao}
    )
    SELECT 'Leads' AS stage, COUNT(1) AS value, 1 AS \`order\` FROM coorte
    UNION ALL SELECT 'Qualificados', COUNTIF(qualificado), 2 FROM coorte
    UNION ALL SELECT 'Visita realizada', COUNT(DISTINCT v.lead_id), 3
      FROM {visitas} v JOIN coorte c ON v.{visitas.lead_id} = c.lead_id WHERE v.{visitas.realizada}
    UNION ALL SELECT 'Proposta', COUNT(DISTINCT p.{propostas.lead_id}), 4
      FROM {propostas} p JOIN coorte c ON p.{propostas.lead_id} = c.lead_id
    UNION ALL SELECT 'Venda', COUNT(DISTINCT s.{vendas.lead_id}), 5
      FROM {vendas} s JOIN coorte c ON s.{vendas.lead_id} = c.lead_id
    ORDER BY \`order\`
  ` },
}
```

> Atenção às JOINs entre entidades: usar `kind: 'sql'` com aliases explícitos,
> não `kind: 'derived'` (o resolvedor de `derived` gera JOIN sem qualificação e
> quebra quando duas entidades compartilham nome de coluna).

---

## 7. Carga sintética sugerida (demo de porte médio/grande)

Determinística por `--seed`, no molde de `scripts/lib/synthetic-portfolio.ts`;
o loader `scripts/bq-seed-synthetic-data.ts` já é genérico (basta uma entrada
nova no mapa de destino).

| Dimensão | Volume | Observação |
|---|---|---|
| Unidades | 6 (3 capitais, 3 interior) | uma unidade deliberadamente abaixo da meta |
| Departamentos | 8 por unidade | conforme §2.1 |
| Corretores | 140 ativos + 25 desligados em 24 m | distribuição de produtividade em cauda longa (Pareto) |
| Empreendimentos | 8 (2 pré-lançamento, 3 lançamento, 2 obra, 1 pronto) | 80–320 unidades cada; VSO decrescente após 6 m |
| Imóveis (prontos) | 4.500 na carteira, 1.200 captações/ano | 30% exclusividade; 12% param 180+ dias |
| Leads | ≈ 9.000/mês | sazonalidade (queda dez/jan, pico mar/set); mix de origem por unidade |
| Visitas | 22% dos leads; 18% no-show | |
| Propostas | 35% das visitas; 55% aceitas | 1–3 rodadas |
| Vendas | ≈ 2,5–3% dos leads | 6% de distrato em lançamentos |
| Contratos de locação | 3.800 ativos; 90 novos/mês; churn 1,8%/mês | garantia: 45% seguro fiança, 30% fiador, 20% caução, 5% outros |
| Faturas | 3.800/mês × 24 m | inadimplência 3–6% variando por unidade e garantia |
| Marketing | 10 canais, 30 campanhas | CPL entre R$ 25 e R$ 180 por canal |
| Financeiro | ≈ 400 lançamentos/mês | margem 12–22% por unidade |
| NPS | 600 respostas/mês | |
| Período | 24 meses (out/2024 – set/2026) | `data_base_report` mensal nos dois snapshots |

---

## 8. O que muda no app (recap)

**Só configuração** (Firestore + BigQuery): dataset e tabelas; `dataContracts/imobiliaria`
com entidades e atributos do §2; `products/imobiliaria`; `clients/<tenant>.productBindings`
com `contractRef: 'imobiliaria'` (o mesmo prefixo de `requires[0]` de todas as métricas);
`metrics/imobiliaria.*`; `dashboardTemplates/imobiliaria-*`; grupos e reports; textos do
assistente no AI Studio; acesso de usuários por `clientAccess`.

**Código, pequeno e aditivo**: ampliar `TemplateCategory` em
`src/shared/schemas/dashboard-template.ts` (ex.: `'Imobiliária'`); gerador
sintético `scripts/lib/synthetic-real-estate.ts` + `scripts/lib/real-estate-schemas.mjs`;
adicionar entradas de glossário e persona/ICP. (`queryFilterOptions` já lê a
tabela que o binding do cliente declara — ver `app/api/filter-options/date-source.ts`.)

**Persona "Meu Painel"**: exige que o usuário carregue `corretor_id` (claim ou
`users/{id}`), aplicado como filtro fixo nas métricas `meu_*`. Hoje o tenancy é
por `clientIds` (ADR-0018); o recorte por corretor é uma extensão a decidir.
