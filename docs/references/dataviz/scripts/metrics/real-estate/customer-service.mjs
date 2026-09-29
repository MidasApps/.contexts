/** Grupo H — Atendimento & Clientes. */
import { sql, monthEnd, band, bucket, window12 } from './_helpers.mjs';

const CAT = 'Atendimento';
const k = (o) => sql({ category: CAT, ...o });
const LEADS_MONTH = monthEnd('leads', 'data_criacao');
const NPS = (filter) => `SAFE_DIVIDE(COUNTIF({pesquisas_satisfacao.nota} >= 9) - COUNTIF({pesquisas_satisfacao.nota} <= 6), COUNTIF(${filter}))`;

export const metrics = [
  // ── H1. Tempo de Resposta ──────────────────────────────────────────────
  k({ id: 'at_tempo_primeiro_contato_min', label: 'Tempo até o 1º contato (mediana)', unit: 'min', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT APPROX_QUANTILES({leads.minutos_primeiro_contato}, 2)[OFFSET(1)] AS value FROM {leads} WHERE {leads.minutos_primeiro_contato} IS NOT NULL AND ${LEADS_MONTH}` }),
  k({ id: 'at_leads_respondidos_1h_pct', label: 'Leads respondidos em até 1 h', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(COUNTIF({leads.minutos_primeiro_contato} <= 60), COUNT(1)) AS value FROM {leads} WHERE ${LEADS_MONTH}` }),
  k({ id: 'at_leads_sem_contato_24h', label: 'Leads sem contato em 24 h', unit: 'un', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COUNTIF({leads.data_primeiro_contato} IS NULL OR {leads.minutos_primeiro_contato} > 1440) AS value FROM {leads} WHERE ${LEADS_MONTH}` }),
  k({ id: 'at_leads_sem_interacao_7d', label: 'Leads abertos sem interação há 7 dias', unit: 'un', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COUNT(1) AS value FROM {leads} WHERE {leads.status} NOT IN ('ganho', 'perdido') AND COALESCE({leads.data_ultima_interacao}, {leads.data_criacao}) < DATE_SUB((SELECT MAX({leads.data_criacao}) FROM {leads}), INTERVAL 7 DAY)` }),
  k({ id: 'at_tempo_resposta_serie', label: 'Tempo de resposta mensal (mediana)', shape: 'timeseries', outputColumns: ['bucket', 'value'], unit: 'min', template: `
    SELECT ${bucket('leads', 'data_criacao')} AS bucket, APPROX_QUANTILES({leads.minutos_primeiro_contato}, 2)[OFFSET(1)] AS value FROM {leads} WHERE {leads.minutos_primeiro_contato} IS NOT NULL AND ${band('leads', 'data_criacao')} GROUP BY 1 ORDER BY 1` }),
  k({ id: 'at_tempo_resposta_por_unidade', label: 'Tempo de resposta por unidade', shape: 'breakdown', outputColumns: ['unidade', 'value'], unit: 'min', template: `
    SELECT u.{unidades.nome} AS unidade, APPROX_QUANTILES(l.{leads.minutos_primeiro_contato}, 2)[OFFSET(1)] AS value FROM {leads} l JOIN {unidades} u ON u.{unidades.unidade_id} = l.{leads.unidade_id}
    WHERE l.{leads.minutos_primeiro_contato} IS NOT NULL AND ${LEADS_MONTH.replace('{leads.data_criacao}, MONTH) =', 'l.{leads.data_criacao}, MONTH) =')} GROUP BY 1 ORDER BY 2 DESC` }),
  k({ id: 'at_tempo_resposta_dia_x_hora', label: 'Tempo de resposta por dia e hora', shape: 'matrix', outputColumns: ['row', 'col', 'value'], unit: 'min', template: `
    SELECT FORMAT_DATE('%u %a', DATE({leads.data_hora_criacao})) AS row, FORMAT_TIMESTAMP('%Hh', {leads.data_hora_criacao}) AS col, APPROX_QUANTILES({leads.minutos_primeiro_contato}, 2)[OFFSET(1)] AS value
    FROM {leads} WHERE {leads.minutos_primeiro_contato} IS NOT NULL AND ${window12('leads', 'data_criacao')} GROUP BY 1, 2 ORDER BY 1, 2` }),
  k({ id: 'at_leads_atrasados', label: 'Leads com resposta atrasada', shape: 'rows', outputColumns: ['lead', 'origem', 'unidade', 'corretor', 'horas_sem_contato'], template: `
    SELECT l.{leads.lead_id} AS lead, l.{leads.origem} AS origem, u.{unidades.nome} AS unidade, c.{corretores.nome} AS corretor,
      COALESCE(ROUND(l.{leads.minutos_primeiro_contato} / 60, 1), ROUND(TIMESTAMP_DIFF(TIMESTAMP((SELECT MAX({leads.data_criacao}) FROM {leads})), l.{leads.data_hora_criacao}, MINUTE) / 60, 1)) AS horas_sem_contato
    FROM {leads} l JOIN {unidades} u ON u.{unidades.unidade_id} = l.{leads.unidade_id} JOIN {corretores} c ON c.{corretores.corretor_id} = l.{leads.corretor_id}
    WHERE (l.{leads.data_primeiro_contato} IS NULL OR l.{leads.minutos_primeiro_contato} > 60) AND ${LEADS_MONTH.replace('{leads.data_criacao}, MONTH) =', 'l.{leads.data_criacao}, MONTH) =')}
    ORDER BY horas_sem_contato DESC LIMIT 200` }),

  // ── H2. Satisfação (NPS) ───────────────────────────────────────────────
  k({ id: 'nps_compradores', label: 'NPS compradores', unit: 'pts', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT 100 * ${NPS('TRUE')} AS value FROM {pesquisas_satisfacao} WHERE {pesquisas_satisfacao.tipo_cliente} = 'comprador' AND ${monthEnd('pesquisas_satisfacao', 'data')}` }),
  k({ id: 'nps_proprietarios', label: 'NPS proprietários', unit: 'pts', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT 100 * ${NPS('TRUE')} AS value FROM {pesquisas_satisfacao} WHERE {pesquisas_satisfacao.tipo_cliente} = 'proprietario' AND ${monthEnd('pesquisas_satisfacao', 'data')}` }),
  k({ id: 'nps_inquilinos', label: 'NPS inquilinos', unit: 'pts', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT 100 * ${NPS('TRUE')} AS value FROM {pesquisas_satisfacao} WHERE {pesquisas_satisfacao.tipo_cliente} = 'inquilino' AND ${monthEnd('pesquisas_satisfacao', 'data')}` }),
  k({ id: 'nps_respostas_mes', label: 'Respostas no mês', unit: 'un', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COUNT(1) AS value FROM {pesquisas_satisfacao} WHERE ${monthEnd('pesquisas_satisfacao', 'data')}` }),
  k({ id: 'nps_serie', label: 'NPS mensal por público', shape: 'timeseries_multi', outputColumns: ['bucket', 'compradores', 'proprietarios', 'inquilinos'], unit: 'pts', template: `
    SELECT ${bucket('pesquisas_satisfacao', 'data')} AS bucket,
      100 * SAFE_DIVIDE(COUNTIF({pesquisas_satisfacao.tipo_cliente} = 'comprador' AND {pesquisas_satisfacao.nota} >= 9) - COUNTIF({pesquisas_satisfacao.tipo_cliente} = 'comprador' AND {pesquisas_satisfacao.nota} <= 6), COUNTIF({pesquisas_satisfacao.tipo_cliente} = 'comprador')) AS compradores,
      100 * SAFE_DIVIDE(COUNTIF({pesquisas_satisfacao.tipo_cliente} = 'proprietario' AND {pesquisas_satisfacao.nota} >= 9) - COUNTIF({pesquisas_satisfacao.tipo_cliente} = 'proprietario' AND {pesquisas_satisfacao.nota} <= 6), COUNTIF({pesquisas_satisfacao.tipo_cliente} = 'proprietario')) AS proprietarios,
      100 * SAFE_DIVIDE(COUNTIF({pesquisas_satisfacao.tipo_cliente} = 'inquilino' AND {pesquisas_satisfacao.nota} >= 9) - COUNTIF({pesquisas_satisfacao.tipo_cliente} = 'inquilino' AND {pesquisas_satisfacao.nota} <= 6), COUNTIF({pesquisas_satisfacao.tipo_cliente} = 'inquilino')) AS inquilinos
    FROM {pesquisas_satisfacao} WHERE ${band('pesquisas_satisfacao', 'data')} GROUP BY 1 ORDER BY 1` }),
  k({ id: 'nps_por_unidade', label: 'NPS por unidade', shape: 'breakdown', outputColumns: ['unidade', 'value'], unit: 'pts', template: `
    SELECT u.{unidades.nome} AS unidade, 100 * SAFE_DIVIDE(COUNTIF(p.{pesquisas_satisfacao.nota} >= 9) - COUNTIF(p.{pesquisas_satisfacao.nota} <= 6), COUNT(1)) AS value
    FROM {pesquisas_satisfacao} p JOIN {unidades} u ON u.{unidades.unidade_id} = p.{pesquisas_satisfacao.unidade_id}
    WHERE ${window12('pesquisas_satisfacao', 'data').replace('{pesquisas_satisfacao.data} >=', 'p.{pesquisas_satisfacao.data} >=')} GROUP BY 1 ORDER BY 2 DESC` }),
  k({ id: 'nps_por_corretor_top', label: 'NPS por corretor (mín. 20 respostas)', shape: 'breakdown', outputColumns: ['corretor', 'value'], unit: 'pts', template: `
    SELECT c.{corretores.nome} AS corretor, 100 * SAFE_DIVIDE(COUNTIF(p.{pesquisas_satisfacao.nota} >= 9) - COUNTIF(p.{pesquisas_satisfacao.nota} <= 6), COUNT(1)) AS value
    FROM {pesquisas_satisfacao} p JOIN {corretores} c ON c.{corretores.corretor_id} = p.{pesquisas_satisfacao.corretor_id}
    WHERE ${window12('pesquisas_satisfacao', 'data').replace('{pesquisas_satisfacao.data} >=', 'p.{pesquisas_satisfacao.data} >=')} GROUP BY 1 HAVING COUNT(1) >= 20 ORDER BY 2 DESC LIMIT 20` }),
  k({ id: 'nps_distribuicao', label: 'Promotores, neutros e detratores', shape: 'breakdown', outputColumns: ['grupo', 'value'], unit: 'un', template: `
    SELECT CASE WHEN {pesquisas_satisfacao.nota} >= 9 THEN 'Promotores' WHEN {pesquisas_satisfacao.nota} >= 7 THEN 'Neutros' ELSE 'Detratores' END AS grupo, COUNT(1) AS value
    FROM {pesquisas_satisfacao} WHERE ${monthEnd('pesquisas_satisfacao', 'data')} GROUP BY 1 ORDER BY 1` }),

  // ── H3. Pós-venda & Distratos ──────────────────────────────────────────
  k({ id: 'pv_distratos_mes', label: 'Distratos no mês', unit: 'un', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COUNT(1) AS value FROM {vendas} WHERE {vendas.distrato} AND ${monthEnd('vendas', 'data_distrato')}` }),
  k({ id: 'pv_distrato_pct_12m', label: 'Taxa de distrato (12 meses)', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(COUNTIF({vendas.distrato}), COUNT(1)) AS value FROM {vendas} WHERE ${window12('vendas', 'data_venda')}` }),
  k({ id: 'pv_vgv_distratado_mes', label: 'VGV distratado no mês', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COALESCE(SUM({vendas.valor_venda}), 0) AS value FROM {vendas} WHERE {vendas.distrato} AND ${monthEnd('vendas', 'data_distrato')}` }),
  k({ id: 'pv_distratos_por_motivo', label: 'Distratos por motivo', shape: 'breakdown', outputColumns: ['motivo', 'value'], unit: 'un', template: `
    SELECT {vendas.motivo_distrato} AS motivo, COUNT(1) AS value FROM {vendas} WHERE {vendas.distrato} AND ${window12('vendas', 'data_distrato')} GROUP BY 1 ORDER BY 2 DESC` }),
  k({ id: 'pv_distratos_por_empreendimento', label: 'Distratos por empreendimento', shape: 'breakdown', outputColumns: ['empreendimento', 'value'], unit: 'un', template: `
    SELECT COALESCE(e.{empreendimentos.nome}, 'Prontos') AS empreendimento, COUNT(1) AS value FROM {vendas} v LEFT JOIN {empreendimentos} e ON e.{empreendimentos.empreendimento_id} = v.{vendas.empreendimento_id}
    WHERE v.{vendas.distrato} AND ${window12('vendas', 'data_distrato').replace('{vendas.data_distrato} >=', 'v.{vendas.data_distrato} >=')} GROUP BY 1 ORDER BY 2 DESC` }),
  k({ id: 'pv_distrato_serie', scale: ['value'], label: 'Taxa de distrato mensal', shape: 'timeseries', outputColumns: ['bucket', 'value'], unit: '%', template: `
    SELECT ${bucket('vendas', 'data_venda')} AS bucket, SAFE_DIVIDE(COUNTIF({vendas.distrato}), COUNT(1)) AS value FROM {vendas} WHERE ${band('vendas', 'data_venda')} GROUP BY 1 ORDER BY 1` }),
  k({ id: 'pv_distratos_lista', label: 'Distratos', shape: 'rows', outputColumns: ['venda', 'referencia', 'corretor', 'valor_venda', 'motivo', 'dias_apos_venda'], template: `
    SELECT v.{vendas.venda_id} AS venda, COALESCE(e.{empreendimentos.nome}, v.{vendas.imovel_id}) AS referencia, c.{corretores.nome} AS corretor, v.{vendas.valor_venda} AS valor_venda, v.{vendas.motivo_distrato} AS motivo, DATE_DIFF(v.{vendas.data_distrato}, v.{vendas.data_venda}, DAY) AS dias_apos_venda
    FROM {vendas} v LEFT JOIN {empreendimentos} e ON e.{empreendimentos.empreendimento_id} = v.{vendas.empreendimento_id} JOIN {corretores} c ON c.{corretores.corretor_id} = v.{vendas.corretor_id}
    WHERE v.{vendas.distrato} AND ${window12('vendas', 'data_distrato').replace('{vendas.data_distrato} >=', 'v.{vendas.data_distrato} >=')} ORDER BY v.{vendas.data_distrato} DESC LIMIT 200` }),
];
