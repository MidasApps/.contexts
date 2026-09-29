/** Grupo G — Equipe (gestor e corretor). */
import { sql, monthEnd, monthRef, band, bucket, window12, monthLabel, quartiles } from './_helpers.mjs';

const CAT = 'Equipe';
const k = (o) => sql({ category: CAT, ...o });
const ACTIVE_BROKERS = `{corretores.ativo} AND {corretores.cargo} = 'corretor'`;
/** Filtro de página `corretor` (kind `in`) — sem seleção vira 1=1 e mostra o time. */
const BROKER_FILTER = (e) => `{filter.corretor:${e}.corretor_id}`;

export const metrics = [
  // ── G1. Ranking de Corretores ──────────────────────────────────────────
  k({ id: 'eq_ranking_corretores', label: 'Ranking de corretores', shape: 'rows', outputColumns: ['corretor', 'unidade', 'departamento', 'leads', 'visitas', 'propostas', 'vendas', 'locacoes', 'vgv', 'comissao', 'conversao_pct', 'atingimento_pct'], template: `
    WITH l AS (SELECT {leads.corretor_id} AS corretor_id, COUNT(1) AS leads, COUNTIF({leads.status} = 'ganho') AS ganhos FROM {leads} WHERE ${monthEnd('leads', 'data_criacao')} GROUP BY 1),
         vi AS (SELECT {visitas.corretor_id} AS corretor_id, COUNTIF({visitas.realizada}) AS visitas FROM {visitas} WHERE ${monthEnd('visitas', 'data_agendada')} GROUP BY 1),
         pr AS (SELECT {propostas.corretor_id} AS corretor_id, COUNT(1) AS propostas FROM {propostas} WHERE ${monthEnd('propostas', 'data_envio')} GROUP BY 1),
         v AS (SELECT {vendas.corretor_id} AS corretor_id, COUNT(1) AS vendas, SUM({vendas.valor_venda}) AS vgv, SUM({vendas.comissao_corretor}) AS comissao FROM {vendas} WHERE {vendas.distrato} = FALSE AND ${monthEnd('vendas', 'data_venda')} GROUP BY 1),
         lc AS (SELECT {contratos_locacao.corretor_id} AS corretor_id, COUNT(1) AS locacoes FROM {contratos_locacao} WHERE ${monthEnd('contratos_locacao', 'data_inicio')} GROUP BY 1),
         m AS (SELECT {metas.corretor_id} AS corretor_id, SUM({metas.meta_vgv}) AS meta_vgv, SUM({metas.meta_locacoes}) AS meta_loc FROM {metas} WHERE {metas.corretor_id} IS NOT NULL AND ${monthEnd('metas', 'competencia')} GROUP BY 1)
    SELECT c.{corretores.nome} AS corretor, u.{unidades.nome} AS unidade, d.{departamentos.nome} AS departamento, COALESCE(l.leads, 0) AS leads, COALESCE(vi.visitas, 0) AS visitas, COALESCE(pr.propostas, 0) AS propostas,
      COALESCE(v.vendas, 0) AS vendas, COALESCE(lc.locacoes, 0) AS locacoes, COALESCE(v.vgv, 0) AS vgv, COALESCE(v.comissao, 0) AS comissao, SAFE_DIVIDE(l.ganhos, l.leads) AS conversao_pct,
      IF(m.meta_vgv > 0, SAFE_DIVIDE(v.vgv, m.meta_vgv), SAFE_DIVIDE(lc.locacoes, m.meta_loc)) AS atingimento_pct
    FROM {corretores} c JOIN {unidades} u ON u.{unidades.unidade_id} = c.{corretores.unidade_id} JOIN {departamentos} d ON d.{departamentos.departamento_id} = c.{corretores.departamento_id}
    LEFT JOIN l ON l.corretor_id = c.{corretores.corretor_id} LEFT JOIN vi ON vi.corretor_id = c.{corretores.corretor_id} LEFT JOIN pr ON pr.corretor_id = c.{corretores.corretor_id}
    LEFT JOIN v ON v.corretor_id = c.{corretores.corretor_id} LEFT JOIN lc ON lc.corretor_id = c.{corretores.corretor_id} LEFT JOIN m ON m.corretor_id = c.{corretores.corretor_id}
    WHERE ${ACTIVE_BROKERS.replace('{corretores.ativo}', 'c.{corretores.ativo}').replace('{corretores.cargo}', 'c.{corretores.cargo}')}
    ORDER BY vgv DESC, locacoes DESC LIMIT 200` }),
  k({ id: 'eq_vgv_por_corretor_top20', label: 'Top 20 por VGV', shape: 'breakdown', outputColumns: ['corretor', 'value'], unit: 'BRL', template: `
    SELECT c.{corretores.nome} AS corretor, SUM(v.{vendas.valor_venda}) AS value FROM {vendas} v JOIN {corretores} c ON c.{corretores.corretor_id} = v.{vendas.corretor_id}
    WHERE v.{vendas.distrato} = FALSE AND ${monthEnd('vendas', 'data_venda').replace('{vendas.data_venda}, MONTH) =', 'v.{vendas.data_venda}, MONTH) =')} GROUP BY 1 ORDER BY 2 DESC LIMIT 20` }),
  k({ id: 'eq_locacoes_por_corretor_top20', label: 'Top 20 por locações', shape: 'breakdown', outputColumns: ['corretor', 'value'], unit: 'un', template: `
    SELECT c.{corretores.nome} AS corretor, COUNT(1) AS value FROM {contratos_locacao} l JOIN {corretores} c ON c.{corretores.corretor_id} = l.{contratos_locacao.corretor_id}
    WHERE ${monthEnd('contratos_locacao', 'data_inicio').replace('{contratos_locacao.data_inicio}, MONTH) =', 'l.{contratos_locacao.data_inicio}, MONTH) =')} GROUP BY 1 ORDER BY 2 DESC LIMIT 20` }),
  k({ id: 'eq_metas_por_corretor', label: 'Metas individuais de VGV', shape: 'targets', outputColumns: ['label', 'value', 'target'], unit: 'BRL', template: `
    WITH v AS (SELECT {vendas.corretor_id} AS corretor_id, SUM({vendas.valor_venda}) AS vgv FROM {vendas} WHERE {vendas.distrato} = FALSE AND ${monthEnd('vendas', 'data_venda')} GROUP BY 1),
         m AS (SELECT {metas.corretor_id} AS corretor_id, SUM({metas.meta_vgv}) AS meta FROM {metas} WHERE {metas.corretor_id} IS NOT NULL AND {metas.meta_vgv} > 0 AND ${monthEnd('metas', 'competencia')} GROUP BY 1)
    SELECT c.{corretores.nome} AS label, COALESCE(v.vgv, 0) AS value, m.meta AS target
    FROM m JOIN {corretores} c ON c.{corretores.corretor_id} = m.corretor_id LEFT JOIN v ON v.corretor_id = m.corretor_id
    WHERE c.{corretores.ativo} ORDER BY value DESC LIMIT 30` }),
  k({ id: 'eq_corretor_x_mes_vgv', label: 'VGV por corretor e mês', shape: 'matrix', outputColumns: ['row', 'col', 'value'], unit: 'BRL', template: `
    WITH top AS (SELECT {vendas.corretor_id} AS corretor_id FROM {vendas} WHERE {vendas.distrato} = FALSE AND ${window12('vendas', 'data_venda')} GROUP BY 1 ORDER BY SUM({vendas.valor_venda}) DESC LIMIT 25)
    SELECT c.{corretores.nome} AS row, ${monthLabel('v.{vendas.data_venda}')} AS col, SUM(v.{vendas.valor_venda}) AS value
    FROM {vendas} v JOIN top ON top.corretor_id = v.{vendas.corretor_id} JOIN {corretores} c ON c.{corretores.corretor_id} = v.{vendas.corretor_id}
    WHERE v.{vendas.distrato} = FALSE AND ${window12('vendas', 'data_venda').replace('{vendas.data_venda} >=', 'v.{vendas.data_venda} >=')}
    GROUP BY 1, 2 ORDER BY 1, 2` }),
  k({ id: 'eq_vgv_por_corretor_dist_unidade', label: 'VGV por corretor, por unidade', shape: 'distribution', outputColumns: ['grupo', 'min', 'q1', 'mediana', 'q3', 'max'], unit: 'BRL', template: `
    WITH p AS (SELECT v.{vendas.unidade_id} AS unidade_id, v.{vendas.corretor_id} AS corretor_id, SUM(v.{vendas.valor_venda}) AS vgv FROM {vendas} v WHERE v.{vendas.distrato} = FALSE AND ${window12('vendas', 'data_venda').replace('{vendas.data_venda} >=', 'v.{vendas.data_venda} >=')} GROUP BY 1, 2)
    SELECT u.{unidades.nome} AS grupo, ${quartiles('p.vgv')} FROM p JOIN {unidades} u ON u.{unidades.unidade_id} = p.unidade_id GROUP BY 1 ORDER BY mediana DESC` }),
  k({ id: 'eq_concentracao_vgv', label: 'Concentração de VGV por corretor', shape: 'breakdown', outputColumns: ['bucket', 'value'], unit: 'BRL', template: `
    SELECT c.{corretores.nome} AS bucket, SUM(v.{vendas.valor_venda}) AS value FROM {vendas} v JOIN {corretores} c ON c.{corretores.corretor_id} = v.{vendas.corretor_id}
    WHERE v.{vendas.distrato} = FALSE AND ${window12('vendas', 'data_venda').replace('{vendas.data_venda} >=', 'v.{vendas.data_venda} >=')} GROUP BY 1 ORDER BY 2 DESC LIMIT 40` }),

  // ── G2. Produtividade ──────────────────────────────────────────────────
  k({ id: 'eq_corretores_ativos', label: 'Corretores ativos', unit: 'un', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COUNTIF(${ACTIVE_BROKERS}) AS value FROM {corretores}` }),
  k({ id: 'eq_vgv_por_corretor', label: 'VGV por corretor', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE((SELECT SUM({vendas.valor_venda}) FROM {vendas} WHERE {vendas.distrato} = FALSE AND ${monthEnd('vendas', 'data_venda')}), (SELECT COUNTIF(${ACTIVE_BROKERS} AND {corretores.departamento_id} NOT LIKE '%-locacao') FROM {corretores})) AS value` }),
  k({ id: 'eq_leads_por_corretor', label: 'Leads por corretor', unit: 'un', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE((SELECT COUNT(1) FROM {leads} WHERE ${monthEnd('leads', 'data_criacao')}), (SELECT COUNTIF(${ACTIVE_BROKERS}) FROM {corretores})) AS value` }),
  k({ id: 'eq_visitas_por_corretor', label: 'Visitas por corretor', unit: 'un', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE((SELECT COUNTIF({visitas.realizada}) FROM {visitas} WHERE ${monthEnd('visitas', 'data_agendada')}), (SELECT COUNTIF(${ACTIVE_BROKERS}) FROM {corretores})) AS value` }),
  k({ id: 'eq_interacoes_por_lead', label: 'Interações por lead', unit: 'un', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE((SELECT COUNT(1) FROM {interacoes} WHERE ${monthEnd('interacoes', 'data')}), (SELECT COUNT(1) FROM {leads} WHERE ${monthEnd('leads', 'data_criacao')})) AS value` }),
  k({ id: 'eq_corretores_sem_venda_90d_pct', label: 'Corretores sem venda em 90 dias', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    WITH ref AS (SELECT MAX({vendas.data_venda}) AS d FROM {vendas}),
         com AS (SELECT DISTINCT {vendas.corretor_id} AS corretor_id FROM {vendas}, ref WHERE {vendas.data_venda} > DATE_SUB(ref.d, INTERVAL 90 DAY))
    SELECT SAFE_DIVIDE(COUNTIF(com.corretor_id IS NULL), COUNT(1)) AS value
    FROM {corretores} c LEFT JOIN com ON com.corretor_id = c.{corretores.corretor_id}
    WHERE c.{corretores.ativo} AND c.{corretores.cargo} = 'corretor' AND c.{corretores.departamento_id} NOT LIKE '%-locacao'` }),
  k({ id: 'eq_turnover_pct', label: 'Turnover (12 meses)', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(COUNTIF({corretores.data_desligamento} IS NOT NULL AND {corretores.data_desligamento} >= DATE_SUB((SELECT MAX({vendas.data_venda}) FROM {vendas}), INTERVAL 12 MONTH)), COUNTIF({corretores.cargo} = 'corretor')) AS value FROM {corretores}` }),
  k({ id: 'eq_ramp_up_dias', label: 'Ramp-up até a 1ª venda', unit: 'dias', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT AVG(DATE_DIFF(p.primeira, c.{corretores.data_admissao}, DAY)) AS value
    FROM (SELECT {vendas.corretor_id} AS corretor_id, MIN({vendas.data_venda}) AS primeira FROM {vendas} GROUP BY 1) p JOIN {corretores} c ON c.{corretores.corretor_id} = p.corretor_id
    WHERE c.{corretores.data_admissao} >= DATE_SUB(p.primeira, INTERVAL 18 MONTH)` }),
  k({ id: 'eq_produtividade_serie', label: 'Produtividade por corretor', shape: 'timeseries_multi', outputColumns: ['bucket', 'vgv_por_corretor', 'vendas_por_corretor'], template: `
    WITH n AS (SELECT COUNTIF(${ACTIVE_BROKERS} AND {corretores.departamento_id} NOT LIKE '%-locacao') AS ativos FROM {corretores})
    SELECT ${bucket('vendas', 'data_venda')} AS bucket, SAFE_DIVIDE(SUM({vendas.valor_venda}), n.ativos) AS vgv_por_corretor, SAFE_DIVIDE(COUNT(1), n.ativos) AS vendas_por_corretor
    FROM {vendas}, n WHERE {vendas.distrato} = FALSE AND ${band('vendas', 'data_venda')} GROUP BY 1, n.ativos ORDER BY 1` }),
  k({ id: 'eq_distribuicao_vendas_por_corretor', label: 'Corretores por faixa de vendas no mês', shape: 'breakdown', outputColumns: ['bucket', 'value'], unit: 'un', template: `
    WITH v AS (SELECT {vendas.corretor_id} AS corretor_id, COUNT(1) AS n FROM {vendas} WHERE {vendas.distrato} = FALSE AND ${monthEnd('vendas', 'data_venda')} GROUP BY 1),
         p AS (SELECT c.{corretores.corretor_id} AS corretor_id, COALESCE(v.n, 0) AS n FROM {corretores} c LEFT JOIN v ON v.corretor_id = c.{corretores.corretor_id}
               WHERE c.{corretores.ativo} AND c.{corretores.cargo} = 'corretor' AND c.{corretores.departamento_id} NOT LIKE '%-locacao')
    SELECT CASE WHEN n = 0 THEN '0' WHEN n = 1 THEN '1' WHEN n = 2 THEN '2' WHEN n <= 4 THEN '3-4' ELSE '5+' END AS bucket, COUNT(1) AS value FROM p GROUP BY 1 ORDER BY 1` }),
  k({ id: 'eq_leads_x_vendas_corretor', label: 'Leads × vendas por corretor', shape: 'points', outputColumns: ['x', 'y', 'size', 'group'], template: `
    WITH l AS (SELECT {leads.corretor_id} AS corretor_id, COUNT(1) AS leads FROM {leads} WHERE ${window12('leads', 'data_criacao')} GROUP BY 1),
         v AS (SELECT {vendas.corretor_id} AS corretor_id, COUNT(1) AS vendas, SUM({vendas.valor_venda}) AS vgv FROM {vendas} WHERE {vendas.distrato} = FALSE AND ${window12('vendas', 'data_venda')} GROUP BY 1)
    SELECT l.leads AS x, COALESCE(v.vendas, 0) AS y, COALESCE(v.vgv, 0) AS size, u.{unidades.nome} AS \`group\`
    FROM l JOIN {corretores} c ON c.{corretores.corretor_id} = l.corretor_id JOIN {unidades} u ON u.{unidades.unidade_id} = c.{corretores.unidade_id} LEFT JOIN v ON v.corretor_id = l.corretor_id
    WHERE c.{corretores.cargo} = 'corretor'` }),
  k({ id: 'eq_leads_sem_contato_24h', label: 'Leads sem contato em 24 h', shape: 'rows', outputColumns: ['corretor', 'unidade', 'leads_sem_contato', 'leads_total'], template: `
    SELECT c.{corretores.nome} AS corretor, u.{unidades.nome} AS unidade, COUNTIF(l.{leads.data_primeiro_contato} IS NULL OR l.{leads.minutos_primeiro_contato} > 1440) AS leads_sem_contato, COUNT(1) AS leads_total
    FROM {leads} l JOIN {corretores} c ON c.{corretores.corretor_id} = l.{leads.corretor_id} JOIN {unidades} u ON u.{unidades.unidade_id} = l.{leads.unidade_id}
    WHERE ${monthEnd('leads', 'data_criacao').replace('{leads.data_criacao}, MONTH) =', 'l.{leads.data_criacao}, MONTH) =')}
    GROUP BY 1, 2 HAVING leads_sem_contato > 0 ORDER BY leads_sem_contato DESC LIMIT 100` }),

  // ── G3. Meu Painel (corretor) ──────────────────────────────────────────
  k({ id: 'meu_vgv_mes', label: 'Meu VGV do mês', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COALESCE(SUM({vendas.valor_venda}), 0) AS value FROM {vendas} WHERE {vendas.distrato} = FALSE AND ${BROKER_FILTER('vendas')} AND ${monthEnd('vendas', 'data_venda')}` }),
  k({ id: 'meu_atingimento_meta_pct', scale: ['value'], label: 'Minha meta', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE((SELECT SUM({vendas.valor_venda}) FROM {vendas} WHERE {vendas.distrato} = FALSE AND ${BROKER_FILTER('vendas')} AND ${monthEnd('vendas', 'data_venda')}),
      (SELECT SUM({metas.meta_vgv}) FROM {metas} WHERE {metas.corretor_id} IS NOT NULL AND ${BROKER_FILTER('metas')} AND ${monthEnd('metas', 'competencia')})) AS value` }),
  k({ id: 'meus_leads_ativos', label: 'Meus leads ativos', unit: 'un', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COUNT(1) AS value FROM {leads} WHERE {leads.status} NOT IN ('ganho', 'perdido') AND ${BROKER_FILTER('leads')}` }),
  k({ id: 'meus_leads_novos_sem_contato', label: 'Leads novos sem contato', unit: 'un', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COUNT(1) AS value FROM {leads} WHERE {leads.status} = 'novo' AND {leads.data_primeiro_contato} IS NULL AND ${BROKER_FILTER('leads')}` }),
  k({ id: 'minhas_visitas_semana', label: 'Visitas na última semana', unit: 'un', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COUNT(1) AS value FROM {visitas} WHERE ${BROKER_FILTER('visitas')} AND {visitas.data_agendada} > DATE_SUB((SELECT MAX({visitas.data_agendada}) FROM {visitas} WHERE {filter.ate:visitas.data_agendada}), INTERVAL 7 DAY) AND {filter.ate:visitas.data_agendada}` }),
  k({ id: 'minhas_propostas_abertas', label: 'Minhas propostas em aberto', unit: 'un', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COUNT(1) AS value FROM {propostas} WHERE {propostas.status} IN ('enviada', 'contraproposta') AND ${BROKER_FILTER('propostas')}` }),
  k({ id: 'minha_comissao_a_receber', label: 'Minha comissão a receber', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COALESCE(SUM({vendas.comissao_corretor}), 0) AS value FROM {vendas} WHERE {vendas.comissao_corretor_paga} = FALSE AND {vendas.distrato} = FALSE AND ${BROKER_FILTER('vendas')}` }),
  k({ id: 'minha_posicao_ranking', label: 'Posição no ranking da unidade', unit: 'º', shape: 'scalar', outputColumns: ['value'], template: `
    WITH r AS (SELECT {vendas.corretor_id} AS corretor_id, {vendas.unidade_id} AS unidade_id, RANK() OVER (PARTITION BY {vendas.unidade_id} ORDER BY SUM({vendas.valor_venda}) DESC) AS pos
               FROM {vendas} WHERE {vendas.distrato} = FALSE AND ${monthEnd('vendas', 'data_venda')} GROUP BY 1, 2)
    SELECT MIN(pos) AS value FROM r WHERE {filter.corretor:vendas.corretor_id}` }),
  k({ id: 'meu_funil', label: 'Meu funil', shape: 'funnel', outputColumns: ['etapa', 'value'], template: `
    WITH c AS (SELECT {leads.lead_id} AS lead_id, {leads.qualificado} AS q FROM {leads} WHERE ${BROKER_FILTER('leads')} AND ${monthEnd('leads', 'data_criacao')})
    SELECT 'Leads' AS etapa, COUNT(1) AS value, 1 AS ordem FROM c
    UNION ALL SELECT 'Qualificados', COUNTIF(q), 2 FROM c
    UNION ALL SELECT 'Visita realizada', COUNT(DISTINCT v.{visitas.lead_id}), 3 FROM {visitas} v JOIN c ON c.lead_id = v.{visitas.lead_id} WHERE v.{visitas.realizada}
    UNION ALL SELECT 'Proposta', COUNT(DISTINCT p.{propostas.lead_id}), 4 FROM {propostas} p JOIN c ON c.lead_id = p.{propostas.lead_id}
    UNION ALL SELECT 'Fechamento', COUNT(DISTINCT l.{leads.lead_id}), 5 FROM {leads} l JOIN c ON c.lead_id = l.{leads.lead_id} WHERE l.{leads.status} = 'ganho'
    ORDER BY ordem` }),
  k({ id: 'meus_leads_por_estagio', label: 'Meus leads por estágio', shape: 'rows', outputColumns: ['lead', 'origem', 'interesse', 'estagio', 'ultima_interacao', 'dias_parado'], template: `
    SELECT {leads.lead_id} AS lead, {leads.origem} AS origem, {leads.interesse} AS interesse, {leads.status} AS estagio, {leads.data_ultima_interacao} AS ultima_interacao,
      DATE_DIFF((SELECT MAX({leads.data_criacao}) FROM {leads}), COALESCE({leads.data_ultima_interacao}, {leads.data_criacao}), DAY) AS dias_parado
    FROM {leads} WHERE {leads.status} NOT IN ('ganho', 'perdido') AND ${BROKER_FILTER('leads')} ORDER BY dias_parado DESC LIMIT 200` }),
  k({ id: 'minhas_visitas_agenda', label: 'Minha agenda de visitas', shape: 'rows', outputColumns: ['data', 'imovel', 'lead', 'status'], template: `
    SELECT {visitas.data_agendada} AS data, COALESCE({visitas.imovel_id}, {visitas.unidade_emp_id}) AS imovel, {visitas.lead_id} AS lead, IF({visitas.realizada}, 'realizada', IF({visitas.no_show}, 'no-show', 'agendada')) AS status
    FROM {visitas} WHERE ${BROKER_FILTER('visitas')} AND ${monthEnd('visitas', 'data_agendada')} ORDER BY data DESC LIMIT 100` }),
  k({ id: 'minhas_propostas', label: 'Minhas propostas', shape: 'rows', outputColumns: ['proposta', 'imovel', 'valor_proposta', 'status', 'dias'], template: `
    SELECT {propostas.proposta_id} AS proposta, COALESCE({propostas.imovel_id}, {propostas.unidade_emp_id}) AS imovel, {propostas.valor_proposta} AS valor_proposta, {propostas.status} AS status,
      DATE_DIFF((SELECT MAX({propostas.data_envio}) FROM {propostas}), {propostas.data_envio}, DAY) AS dias
    FROM {propostas} WHERE ${BROKER_FILTER('propostas')} AND ${window12('propostas', 'data_envio')} ORDER BY {propostas.data_envio} DESC LIMIT 100` }),
  k({ id: 'meu_vgv_serie', label: 'Meu VGV mensal', shape: 'timeseries', outputColumns: ['bucket', 'value'], unit: 'BRL', template: `
    SELECT ${bucket('vendas', 'data_venda')} AS bucket, SUM({vendas.valor_venda}) AS value FROM {vendas} WHERE {vendas.distrato} = FALSE AND ${BROKER_FILTER('vendas')} AND ${band('vendas', 'data_venda')} GROUP BY 1 ORDER BY 1` }),
];
