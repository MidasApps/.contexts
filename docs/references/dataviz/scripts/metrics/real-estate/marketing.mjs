/** Grupo E — Marketing. */
import { sql, monthEnd, monthRef, band, bucket, window12 } from './_helpers.mjs';

const CAT = 'Marketing';
const k = (o) => sql({ category: CAT, ...o });
const INVESTMENTS = 'marketing_investimentos';
const INVESTMENT_MONTH = monthEnd(INVESTMENTS, 'competencia');
const LEADS_MONTH = monthEnd('leads', 'data_criacao');

export const metrics = [
  // ── E1. Painel de Marketing ────────────────────────────────────────────
  k({ id: 'mkt_leads_mes', label: 'Leads no mês', unit: 'un', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COUNT(1) AS value FROM {leads} WHERE ${LEADS_MONTH}` }),
  k({ id: 'mkt_leads_qualificados_mes', label: 'Leads qualificados no mês', unit: 'un', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COUNTIF({leads.qualificado}) AS value FROM {leads} WHERE ${LEADS_MONTH}` }),
  k({ id: 'mkt_taxa_qualificacao_pct', label: 'Taxa de qualificação', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(COUNTIF({leads.qualificado}), COUNT(1)) AS value FROM {leads} WHERE ${LEADS_MONTH}` }),
  k({ id: 'mkt_investimento_mes', label: 'Investimento em mídia no mês', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COALESCE(SUM({${INVESTMENTS}.investimento}), 0) AS value FROM {${INVESTMENTS}} WHERE ${INVESTMENT_MONTH}` }),
  k({ id: 'mkt_cpl', label: 'Custo por lead (CPL)', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(SUM({${INVESTMENTS}.investimento}), SUM({${INVESTMENTS}.leads_gerados})) AS value FROM {${INVESTMENTS}} WHERE ${INVESTMENT_MONTH}` }),
  k({ id: 'mkt_cpl_qualificado', label: 'Custo por lead qualificado', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(SUM({${INVESTMENTS}.investimento}), SUM({${INVESTMENTS}.leads_qualificados})) AS value FROM {${INVESTMENTS}} WHERE ${INVESTMENT_MONTH}` }),
  k({ id: 'mkt_cac', label: 'CAC — custo por fechamento', description: 'Investimento em mídia sobre fechamentos (vendas + locações) de leads de mídia paga.', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE((SELECT SUM({${INVESTMENTS}.investimento}) FROM {${INVESTMENTS}} WHERE ${INVESTMENT_MONTH}),
      (SELECT COUNTIF({leads.status} = 'ganho') FROM {leads} WHERE {leads.campanha_id} IS NOT NULL AND ${LEADS_MONTH})) AS value` }),
  k({ id: 'mkt_roi_pct', label: 'ROI de mídia', description: '(receita atribuída a leads de mídia − investimento) / investimento, últimos 12 meses.', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    WITH inv AS (SELECT SUM({${INVESTMENTS}.investimento}) AS v FROM {${INVESTMENTS}} WHERE ${window12(INVESTMENTS, 'competencia')}),
         rec AS (SELECT SUM(s.{vendas.comissao_imobiliaria}) AS v FROM {vendas} s JOIN {leads} l ON l.{leads.lead_id} = s.{vendas.lead_id} WHERE l.{leads.campanha_id} IS NOT NULL AND ${window12('vendas', 'data_venda').replace('{vendas.data_venda} >=', 's.{vendas.data_venda} >=')})
    SELECT SAFE_DIVIDE(rec.v - inv.v, inv.v) AS value FROM inv, rec` }),
  k({ id: 'mkt_atingimento_meta_leads_pct', scale: ['value'], label: 'Atingimento da meta de leads', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE((SELECT COUNT(1) FROM {leads} WHERE ${LEADS_MONTH}),
      (SELECT SUM({metas.meta_leads}) FROM {metas} WHERE {metas.departamento_id} IS NULL AND {metas.corretor_id} IS NULL AND ${monthEnd('metas', 'competencia')})) AS value` }),
  k({ id: 'mkt_leads_vs_investimento_serie', label: 'Leads × investimento', shape: 'timeseries_multi', outputColumns: ['bucket', 'leads', 'investimento'], template: `
    WITH l AS (SELECT ${bucket('leads', 'data_criacao')} AS bucket, COUNT(1) AS leads FROM {leads} WHERE ${band('leads', 'data_criacao')} GROUP BY 1),
         i AS (SELECT ${bucket(INVESTMENTS, 'competencia')} AS bucket, SUM({${INVESTMENTS}.investimento}) AS investimento FROM {${INVESTMENTS}} WHERE ${band(INVESTMENTS, 'competencia')} GROUP BY 1)
    SELECT l.bucket, l.leads, COALESCE(i.investimento, 0) AS investimento FROM l LEFT JOIN i USING (bucket) ORDER BY 1` }),
  k({ id: 'mkt_leads_por_origem_serie', label: 'Leads por origem', shape: 'timeseries_pivot', outputColumns: ['bucket', 'portais', 'midia_paga', 'site', 'social', 'indicacao', 'outros'], unit: 'un', template: `
    SELECT ${bucket('leads', 'data_criacao')} AS bucket,
      COUNTIF({leads.origem} IN ('zap', 'vivareal', 'olx')) AS portais, COUNTIF({leads.origem} IN ('meta_ads', 'google_ads')) AS midia_paga, COUNTIF({leads.origem} = 'site') AS site,
      COUNTIF({leads.origem} IN ('instagram', 'whatsapp')) AS social, COUNTIF({leads.origem} = 'indicacao') AS indicacao, COUNTIF({leads.origem} IN ('placa', 'plantao', 'base')) AS outros
    FROM {leads} WHERE ${band('leads', 'data_criacao')} GROUP BY 1 ORDER BY 1` }),
  k({ id: 'mkt_leads_por_origem', label: 'Composição por origem', shape: 'breakdown', outputColumns: ['origem', 'value'], unit: 'un', template: `
    SELECT {leads.origem} AS origem, COUNT(1) AS value FROM {leads} WHERE ${LEADS_MONTH} GROUP BY 1 ORDER BY 2 DESC` }),
  k({ id: 'mkt_leads_por_interesse', label: 'Leads por interesse', shape: 'breakdown', outputColumns: ['interesse', 'value'], unit: 'un', template: `
    SELECT {leads.interesse} AS interesse, COUNT(1) AS value FROM {leads} WHERE ${LEADS_MONTH} GROUP BY 1 ORDER BY 2 DESC` }),
  k({ id: 'mkt_leads_dia_x_hora', label: 'Leads por dia da semana e hora', shape: 'matrix', outputColumns: ['row', 'col', 'value'], unit: 'un', template: `
    SELECT FORMAT_DATE('%u %a', DATE({leads.data_hora_criacao})) AS row, FORMAT_TIMESTAMP('%Hh', {leads.data_hora_criacao}) AS col, COUNT(1) AS value
    FROM {leads} WHERE ${window12('leads', 'data_criacao')} GROUP BY 1, 2 ORDER BY 1, 2` }),

  k({ id: 'mkt_leads_serie', label: 'Leads mensais', shape: 'timeseries', outputColumns: ['bucket', 'value'], unit: 'un', template: `
    SELECT ${bucket('leads', 'data_criacao')} AS bucket, COUNT(1) AS value FROM {leads} WHERE ${band('leads', 'data_criacao')} GROUP BY 1 ORDER BY 1` }),
  // ── E2. Origem de Leads & CAC ──────────────────────────────────────────
  k({ id: 'mkt_canais_performance', label: 'Performance por canal', shape: 'rows', outputColumns: ['canal', 'investimento', 'leads', 'qualificados', 'visitas', 'fechamentos', 'cpl', 'cac', 'conversao_pct', 'receita_atribuida'], template: `
    WITH i AS (SELECT {${INVESTMENTS}.canal} AS canal, SUM({${INVESTMENTS}.investimento}) AS investimento FROM {${INVESTMENTS}} WHERE ${window12(INVESTMENTS, 'competencia')} GROUP BY 1),
         l AS (SELECT {leads.origem} AS canal, COUNT(1) AS leads, COUNTIF({leads.qualificado}) AS qualificados, COUNTIF({leads.status} = 'ganho') AS fechamentos FROM {leads} WHERE ${window12('leads', 'data_criacao')} GROUP BY 1),
         v AS (SELECT ld.{leads.origem} AS canal, COUNT(DISTINCT vi.{visitas.lead_id}) AS visitas FROM {visitas} vi JOIN {leads} ld ON ld.{leads.lead_id} = vi.{visitas.lead_id} WHERE vi.{visitas.realizada} AND ${window12('visitas', 'data_agendada').replace('{visitas.data_agendada} >=', 'vi.{visitas.data_agendada} >=')} GROUP BY 1),
         r AS (SELECT ld.{leads.origem} AS canal, SUM(s.{vendas.comissao_imobiliaria}) AS receita FROM {vendas} s JOIN {leads} ld ON ld.{leads.lead_id} = s.{vendas.lead_id} WHERE ${window12('vendas', 'data_venda').replace('{vendas.data_venda} >=', 's.{vendas.data_venda} >=')} GROUP BY 1)
    SELECT l.canal, COALESCE(i.investimento, 0) AS investimento, l.leads, l.qualificados, COALESCE(v.visitas, 0) AS visitas, l.fechamentos,
      SAFE_DIVIDE(i.investimento, l.leads) AS cpl, SAFE_DIVIDE(i.investimento, l.fechamentos) AS cac, SAFE_DIVIDE(l.fechamentos, l.leads) AS conversao_pct, COALESCE(r.receita, 0) AS receita_atribuida
    FROM l LEFT JOIN i USING (canal) LEFT JOIN v USING (canal) LEFT JOIN r USING (canal) ORDER BY leads DESC` }),
  k({ id: 'mkt_cpl_por_canal', label: 'CPL por canal', shape: 'breakdown', outputColumns: ['canal', 'value'], unit: 'BRL', template: `
    SELECT {${INVESTMENTS}.canal} AS canal, SAFE_DIVIDE(SUM({${INVESTMENTS}.investimento}), SUM({${INVESTMENTS}.leads_gerados})) AS value FROM {${INVESTMENTS}} WHERE ${INVESTMENT_MONTH} GROUP BY 1 ORDER BY 2 DESC` }),
  k({ id: 'mkt_conversao_por_canal', scale: ['value'], label: 'Conversão por canal', shape: 'breakdown', outputColumns: ['canal', 'value'], unit: '%', template: `
    SELECT {leads.origem} AS canal, SAFE_DIVIDE(COUNTIF({leads.status} = 'ganho'), COUNT(1)) AS value FROM {leads} WHERE ${window12('leads', 'data_criacao')} GROUP BY 1 ORDER BY 2 DESC` }),
  k({ id: 'mkt_investimento_x_leads_canal', label: 'Investimento × leads por canal', shape: 'points', outputColumns: ['x', 'y', 'size', 'group'], template: `
    WITH i AS (SELECT {${INVESTMENTS}.canal} AS canal, SUM({${INVESTMENTS}.investimento}) AS investimento, SUM({${INVESTMENTS}.leads_gerados}) AS leads FROM {${INVESTMENTS}} WHERE ${window12(INVESTMENTS, 'competencia')} GROUP BY 1),
         l AS (SELECT {leads.origem} AS canal, COUNTIF({leads.status} = 'ganho') AS fechamentos FROM {leads} WHERE ${window12('leads', 'data_criacao')} GROUP BY 1)
    SELECT i.investimento AS x, i.leads AS y, COALESCE(l.fechamentos, 0) AS size, i.canal AS \`group\` FROM i LEFT JOIN l USING (canal)` }),
  k({ id: 'mkt_leads_pareto_origem', label: 'Pareto de origens', shape: 'breakdown', outputColumns: ['bucket', 'value'], unit: 'un', template: `
    SELECT {leads.origem} AS bucket, COUNT(1) AS value FROM {leads} WHERE ${window12('leads', 'data_criacao')} GROUP BY 1 ORDER BY 2 DESC` }),
  k({ id: 'mkt_receita_atribuida_por_canal', label: 'Receita atribuída por canal', shape: 'breakdown', outputColumns: ['canal', 'value'], unit: 'BRL', template: `
    SELECT ld.{leads.origem} AS canal, SUM(s.{vendas.comissao_imobiliaria}) AS value FROM {vendas} s JOIN {leads} ld ON ld.{leads.lead_id} = s.{vendas.lead_id}
    WHERE ${window12('vendas', 'data_venda').replace('{vendas.data_venda} >=', 's.{vendas.data_venda} >=')} GROUP BY 1 ORDER BY 2 DESC` }),

  // ── E3. Campanhas ──────────────────────────────────────────────────────
  k({ id: 'mkt_campanhas', label: 'Campanhas', shape: 'rows', outputColumns: ['campanha', 'canal', 'unidade', 'investimento', 'impressoes', 'cliques', 'ctr_pct', 'leads', 'cpl', 'qualificados'], template: `
    SELECT c.{campanhas.nome} AS campanha, c.{campanhas.canal} AS canal, u.{unidades.nome} AS unidade, SUM(i.{${INVESTMENTS}.investimento}) AS investimento, SUM(i.{${INVESTMENTS}.impressoes}) AS impressoes, SUM(i.{${INVESTMENTS}.cliques}) AS cliques,
      SAFE_DIVIDE(SUM(i.{${INVESTMENTS}.cliques}), SUM(i.{${INVESTMENTS}.impressoes})) AS ctr_pct, SUM(i.{${INVESTMENTS}.leads_gerados}) AS leads, SAFE_DIVIDE(SUM(i.{${INVESTMENTS}.investimento}), SUM(i.{${INVESTMENTS}.leads_gerados})) AS cpl, SUM(i.{${INVESTMENTS}.leads_qualificados}) AS qualificados
    FROM {${INVESTMENTS}} i JOIN {campanhas} c ON c.{campanhas.campanha_id} = i.{${INVESTMENTS}.campanha_id} JOIN {unidades} u ON u.{unidades.unidade_id} = c.{campanhas.unidade_id}
    WHERE ${monthEnd(INVESTMENTS, 'competencia').replace(`{${INVESTMENTS}.competencia}, MONTH) =`, `i.{${INVESTMENTS}.competencia}, MONTH) =`)}
    GROUP BY 1, 2, 3 ORDER BY investimento DESC` }),
  k({ id: 'mkt_campanha_leads_diario', label: 'Leads por dia (campanhas de lançamento)', shape: 'timeseries_multi', outputColumns: ['bucket', 'lancamentos', 'always_on'], unit: 'un', template: `
    SELECT {leads.data_criacao} AS bucket, COUNTIF({leads.campanha_id} LIKE 'cmp-emp-%') AS lancamentos, COUNTIF({leads.campanha_id} IS NOT NULL AND {leads.campanha_id} NOT LIKE 'cmp-emp-%') AS always_on
    FROM {leads} WHERE ${monthEnd('leads', 'data_criacao')} GROUP BY 1 ORDER BY 1` }),
  k({ id: 'mkt_ctr_medio_pct', label: 'CTR médio', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(SUM({${INVESTMENTS}.cliques}), SUM({${INVESTMENTS}.impressoes})) AS value FROM {${INVESTMENTS}} WHERE ${INVESTMENT_MONTH}` }),
  k({ id: 'mkt_campanhas_ativas', label: 'Campanhas ativas', unit: 'un', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COUNT(DISTINCT {${INVESTMENTS}.campanha_id}) AS value FROM {${INVESTMENTS}} WHERE ${INVESTMENT_MONTH}` }),
];
