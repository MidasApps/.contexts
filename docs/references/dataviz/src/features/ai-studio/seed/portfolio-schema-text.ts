/**
 * Texto da skill `portfolio-schema`, semeada em `aiSkills/{id}` (ADR-0017).
 *
 * Morava em `shared-context.ts` como `_buildSchemaContext()`, e de lá era
 * injetado no prompt dos 8 sub-agentes quando o cliente não tinha
 * `schemaBindings`. Esse caminho foi removido: medido em produção, o cliente
 * ativo TEM os bindings (231 de 265 atributos resolvem coluna física), então o
 * fallback nunca disparava — e, quando disparasse, injetaria o schema de um
 * cliente no prompt de outro, apresentado ao modelo como fato.
 *
 * O texto sobrevive porque é a semente de uma skill que vive no BANCO: quem
 * quiser mudá-lo edita a skill pela administração, não este arquivo. Aqui ele
 * serve só para provisionar um ambiente do zero.
 */
export const PORTFOLIO_SCHEMA_TEXT = `## Schema: Tabela contratos
-- Chave: id_contrato + data_base_report
-- 1 row = 1 contrato em 1 data_base (snapshot mensal)

| Coluna | Tipo | Formato / Valores | Amostra | Descrição |
|--------|------|-------------------|---------|-----------|
| id_contrato | STRING | texto livre | "CT-00123456" | Identificador único do contrato |
| data_base_report | DATE | YYYY-MM-DD (último dia do mês) | 2026-01-31 | Data-base do relatório (snapshot mensal) |
| data_contrato | DATE | YYYY-MM-DD | 2022-06-15 | Data de assinatura do contrato |
| projeto | STRING | texto livre | "VIVA PARK" | Nome do empreendimento |
| nome_empreendimento | STRING | texto livre | "VIVA PARK PORTO BELO" | Nome completo do empreendimento |
| documento | STRING | CPF ou CNPJ | "123.456.789-00" | CPF/CNPJ do devedor |
| nome_cliente | STRING | texto livre | "JOAO SILVA" | Nome do devedor |
| proponent_type | STRING | "PF" ou "PJ" | "PF" | Tipo de proponente |
| unidade | INTEGER | número inteiro | 204 | Número da unidade no empreendimento |
| data_emissao | DATE | YYYY-MM-DD | 2022-06-15 | Data de emissão do contrato |
| safra | STRING | YYYY-MM | "2022-06" | Período de originação |
| saldo_devedor | FLOAT64 | R$ (decimal) | 185432.50 | Saldo devedor atualizado |
| saldo_nominal | FLOAT64 | R$ (decimal) | 200000.00 | Saldo nominal contratado |
| valor_imovel | FLOAT64 | R$ (decimal) | 350000.00 | Valor do imóvel |
| ltv | FLOAT64 | decimal (0 a 2+) | 0.53 | Loan-to-Value: saldo_devedor / valor_imovel |
| faixa_ltv | STRING | faixa categórica | "50-70%" | Faixa de LTV: "0-30%","30-50%","50-70%","70-80%","80-90%","90-100%",">100%" |
| rating_liquid | STRING | letra A-H | "B" | Rating de risco Liquid: A(mínimo) a H(default) |
| elegibilidade | STRING | "Elegivel" ou "Nao Elegivel" | "Elegivel" | Elegibilidade CRI |
| elegivel_cri | BOOLEAN | true/false | true | Flag de elegibilidade CRI |
| dias_atraso | INTEGER | dias (0+) | 45 | Dias em atraso (0 = adimplente) |
| faixa_atraso | STRING | faixa categórica | "31 a 60" | "Adimplente","1 a 30","31 a 60","61 a 90","91 a 120","121 a 150","151 a 180","> 180" |
| valor_atraso | FLOAT64 | R$ (decimal) | 3250.00 | Valor em atraso |
| valor_over_90 | FLOAT64 | R$ (decimal) | 0.00 | Valor com atraso > 90 dias |
| pdd_minimo_bacen | FLOAT64 | R$ (decimal) | 18543.25 | PDD mínimo Bacen (Res. 2682) |
| pdd_liquid | FLOAT64 | R$ (decimal) | 22500.00 | PDD modelo proprietário Liquid |
| delta_pdd | FLOAT64 | R$ (decimal) | 3956.75 | pdd_liquid - pdd_minimo_bacen |
| pricing | FLOAT64 | R$ (decimal) | 178000.00 | Valor de mercado do contrato |
| taxa_juros | FLOAT64 | % a.a. (decimal) | 12.5 | Taxa de juros anual |
| correcao_monetaria | FLOAT64 | índice multiplicador | 1.045 | Índice de correção monetária |
| prazo_decorrido | FLOAT64 | meses (decimal) | 42.0 | Meses desde emissão |
| prazo_remanescente | FLOAT64 | meses (decimal) | 318.0 | Meses até vencimento |
| restricoes | INTEGER | quantidade (0+) | 0 | Qtd restrições cadastrais (PEFIN/REFIN/Protesto) |
| grupos_repasse | STRING | "Grupo 1" a "Grupo 4" | "Grupo 2" | Grupo de repasse bancário |
| renda_suficiente | FLOAT64 | indicador (0 ou 1) | 1.0 | Indicador de renda suficiente para repasse |
| limite_simulacao | FLOAT64 | R$ (decimal) | 250000.00 | Limite para simulação de repasse bancário |
| private_area | FLOAT64 | m² (decimal) | 65.4 | Área privativa do imóvel |

## Schema: Tabela pagamentos
-- Pagamentos recebidos por tipo e período

| Coluna | Tipo | Formato / Valores | Amostra | Descrição |
|--------|------|-------------------|---------|-----------|
| data_base_report | DATE | YYYY-MM-DD (último dia do mês) | 2026-01-31 | Data-base do relatório |
| projeto | STRING | texto livre | "VIVA PARK" | Empreendimento |
| tipo_recebimento | STRING | ver valores abaixo | "Pagamento antecipado" | Tipo de pagamento |
| valor_pago | FLOAT64 | R$ (decimal) | 2500.00 | Valor recebido |

tipo_recebimento IN:
- "Pagamento antecipado" — Pago antes do vencimento
- "Vencimento na referencia" — Pago no mês de vencimento
- "Recuperacao mes anterior" — Recuperado do mês anterior
- "Recuperacao anterior" — Recuperado de períodos anteriores

## Schema: Tabela fluxo_caixa
-- Projeções de fluxo de caixa futuro

| Coluna | Tipo | Formato / Valores | Amostra | Descrição |
|--------|------|-------------------|---------|-----------|
| data_base_fluxo | DATE | YYYY-MM-DD | 2026-07-31 | Data do fluxo projetado |
| data_base_report | DATE | YYYY-MM-DD (último dia do mês) | 2026-01-31 | Data-base de referência |
| projeto | STRING | texto livre | "VIVA PARK" | Empreendimento |
| fluxo_esperado | FLOAT64 | R$ (decimal) | 1250000.00 | Fluxo ajustado por risco de inadimplência |
| fluxo_contratado | FLOAT64 | R$ (decimal) | 1500000.00 | Fluxo total contratado sem ajuste |

## Regras importantes sobre datas
- **data_base_report** é sempre o **último dia do mês** (ex: 2026-01-31, 2025-12-31). Use DATE_TRUNC(data_base_report, MONTH) para agrupar por mês.
- **Tipo DATE no BigQuery**: use aspas simples no formato YYYY-MM-DD em comparações (ex: WHERE data_base_report = '2026-01-31').
- Para agrupar por mês em séries temporais: \`DATE_TRUNC(data_base_report, MONTH)\` retorna DATE, não STRING.
- Para formatar como texto: \`FORMAT_DATE('%Y-%m', data_base_report)\` retorna STRING "2026-01".

## Fórmulas derivadas comuns
inadimplencia_pct = SAFE_DIVIDE(SUM(valor_atraso), SUM(saldo_devedor)) * 100
ltv_medio = AVG(ltv)
over_90_pct = SAFE_DIVIDE(COUNT(DISTINCT CASE WHEN dias_atraso > 90 THEN id_contrato END), COUNT(DISTINCT id_contrato)) * 100
desagio = SAFE_DIVIDE(SUM(pricing) - SUM(saldo_nominal), SUM(saldo_nominal)) * 100
pct_contratos = SAFE_DIVIDE(COUNT(*), SUM(COUNT(*)) OVER()) * 100`;
