/** Grupo B — Lançamentos. */
import { sql, monthEnd, monthRef, band, bucket, window12, quartiles } from './_helpers.mjs';

const CAT = 'Lançamentos';
const k = (o) => sql({ category: CAT, ...o });
const LAUNCH_SALES = `{vendas.departamento} = 'lancamentos' AND {vendas.distrato} = FALSE`;

export const metrics = [
  // ── B1. Painel de Lançamentos ──────────────────────────────────────────
  k({ id: 'lanc_vgv_mes', label: 'VGV de lançamentos no mês', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COALESCE(SUM({vendas.valor_venda}), 0) AS value FROM {vendas} WHERE ${LAUNCH_SALES} AND ${monthEnd('vendas', 'data_venda')}` }),
  k({ id: 'lanc_unidades_vendidas_mes', label: 'Unidades vendidas no mês', unit: 'un', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COUNT(1) AS value FROM {vendas} WHERE ${LAUNCH_SALES} AND ${monthEnd('vendas', 'data_venda')}` }),
  k({ id: 'lanc_vso_mes', label: 'VSO do mês', description: 'Vendas sobre oferta: unidades vendidas no mês / (disponíveis no início do mês + vendidas no mês).', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    WITH m AS (SELECT ${monthRef('vendas', 'data_venda')} AS ref),
         vend AS (SELECT COUNT(1) AS n FROM {vendas}, m WHERE ${LAUNCH_SALES} AND DATE_TRUNC({vendas.data_venda}, MONTH) = m.ref),
         disp AS (SELECT COUNT(1) AS n FROM {espelho_vendas} e JOIN {empreendimentos} p ON p.{empreendimentos.empreendimento_id} = e.{espelho_vendas.empreendimento_id}, m
                  WHERE p.{empreendimentos.data_lancamento} <= m.ref AND (e.{espelho_vendas.status} = 'disponivel' OR e.{espelho_vendas.data_venda} >= m.ref))
    SELECT SAFE_DIVIDE(vend.n, disp.n) AS value FROM vend, disp` }),
  k({ id: 'lanc_vso_acumulada', label: 'VSO acumulada', description: 'Unidades vendidas / total de unidades dos empreendimentos já lançados.', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(COUNTIF(e.{espelho_vendas.status} = 'vendida'), COUNT(1)) AS value
    FROM {espelho_vendas} e JOIN {empreendimentos} p ON p.{empreendimentos.empreendimento_id} = e.{espelho_vendas.empreendimento_id}
    WHERE p.{empreendimentos.fase} != 'pre_lancamento'` }),
  k({ id: 'lanc_ticket_medio', label: 'Ticket médio de lançamento', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT AVG({vendas.valor_venda}) AS value FROM {vendas} WHERE ${LAUNCH_SALES} AND ${monthEnd('vendas', 'data_venda')}` }),
  k({ id: 'lanc_estoque_disponivel_vgv', label: 'VGV em estoque (lançamentos)', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COALESCE(SUM({espelho_vendas.valor_tabela}), 0) AS value FROM {espelho_vendas} WHERE {espelho_vendas.status} = 'disponivel'` }),
  k({ id: 'lanc_reservas_abertas', label: 'Reservas em aberto', unit: 'un', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COUNT(1) AS value FROM {espelho_vendas} WHERE {espelho_vendas.status} = 'reservada'` }),
  k({ id: 'lanc_distrato_pct', label: 'Distratos (12 meses)', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(COUNTIF({vendas.distrato}), COUNT(1)) AS value FROM {vendas} WHERE {vendas.departamento} = 'lancamentos' AND ${window12('vendas', 'data_venda')}` }),
  k({ id: 'lanc_vso_serie_por_empreendimento', scale: ['reserva_jardins', 'vista_parque', 'horizonte_sul', 'alto_do_ipe', 'praca_das_flores', 'origem_campinas'], label: 'VSO mensal por empreendimento', shape: 'timeseries_multi', outputColumns: ['bucket', 'reserva_jardins', 'vista_parque', 'horizonte_sul', 'alto_do_ipe', 'praca_das_flores', 'origem_campinas'], unit: '%', template: `
    WITH v AS (SELECT ${bucket('vendas', 'data_venda')} AS bucket, {vendas.empreendimento_id} AS emp, COUNT(1) AS n FROM {vendas} WHERE ${LAUNCH_SALES} AND ${band('vendas', 'data_venda')} GROUP BY 1, 2),
         t AS (SELECT {empreendimentos.empreendimento_id} AS emp, {empreendimentos.total_unidades} AS total FROM {empreendimentos})
    SELECT v.bucket,
      SAFE_DIVIDE(SUM(IF(v.emp = 'emp-01', v.n, 0)), MAX(IF(t.emp = 'emp-01', t.total, NULL))) AS reserva_jardins,
      SAFE_DIVIDE(SUM(IF(v.emp = 'emp-02', v.n, 0)), MAX(IF(t.emp = 'emp-02', t.total, NULL))) AS vista_parque,
      SAFE_DIVIDE(SUM(IF(v.emp = 'emp-03', v.n, 0)), MAX(IF(t.emp = 'emp-03', t.total, NULL))) AS horizonte_sul,
      SAFE_DIVIDE(SUM(IF(v.emp = 'emp-04', v.n, 0)), MAX(IF(t.emp = 'emp-04', t.total, NULL))) AS alto_do_ipe,
      SAFE_DIVIDE(SUM(IF(v.emp = 'emp-05', v.n, 0)), MAX(IF(t.emp = 'emp-05', t.total, NULL))) AS praca_das_flores,
      SAFE_DIVIDE(SUM(IF(v.emp = 'emp-06', v.n, 0)), MAX(IF(t.emp = 'emp-06', t.total, NULL))) AS origem_campinas
    FROM v JOIN t ON t.emp = v.emp GROUP BY 1 ORDER BY 1` }),
  k({ id: 'lanc_vendas_por_empreendimento_serie', label: 'Unidades vendidas por empreendimento', shape: 'timeseries_pivot', outputColumns: ['bucket', 'reserva_jardins', 'vista_parque', 'horizonte_sul', 'alto_do_ipe', 'praca_das_flores', 'origem_campinas'], unit: 'un', template: `
    SELECT ${bucket('vendas', 'data_venda')} AS bucket,
      COUNTIF({vendas.empreendimento_id} = 'emp-01') AS reserva_jardins, COUNTIF({vendas.empreendimento_id} = 'emp-02') AS vista_parque,
      COUNTIF({vendas.empreendimento_id} = 'emp-03') AS horizonte_sul, COUNTIF({vendas.empreendimento_id} = 'emp-04') AS alto_do_ipe,
      COUNTIF({vendas.empreendimento_id} = 'emp-05') AS praca_das_flores, COUNTIF({vendas.empreendimento_id} = 'emp-06') AS origem_campinas
    FROM {vendas} WHERE ${LAUNCH_SALES} AND ${band('vendas', 'data_venda')} GROUP BY 1 ORDER BY 1` }),
  k({ id: 'lanc_empreendimentos_status', label: 'Empreendimentos', shape: 'rows', outputColumns: ['empreendimento', 'fase', 'total', 'vendidas', 'reservadas', 'disponiveis', 'vso_acum_pct', 'vgv_vendido', 'vgv_estoque', 'previsao_entrega'], template: `
    SELECT p.{empreendimentos.nome} AS empreendimento, p.{empreendimentos.fase} AS fase, p.{empreendimentos.total_unidades} AS total,
      COUNTIF(e.{espelho_vendas.status} = 'vendida') AS vendidas, COUNTIF(e.{espelho_vendas.status} = 'reservada') AS reservadas, COUNTIF(e.{espelho_vendas.status} = 'disponivel') AS disponiveis,
      SAFE_DIVIDE(COUNTIF(e.{espelho_vendas.status} = 'vendida'), COUNT(1)) AS vso_acum_pct,
      SUM(IF(e.{espelho_vendas.status} = 'vendida', e.{espelho_vendas.valor_tabela}, 0)) AS vgv_vendido, SUM(IF(e.{espelho_vendas.status} = 'disponivel', e.{espelho_vendas.valor_tabela}, 0)) AS vgv_estoque,
      p.{empreendimentos.previsao_entrega} AS previsao_entrega
    FROM {empreendimentos} p JOIN {espelho_vendas} e ON e.{espelho_vendas.empreendimento_id} = p.{empreendimentos.empreendimento_id}
    GROUP BY 1, 2, 3, 10 ORDER BY vgv_vendido DESC` }),
  k({ id: 'lanc_mix_forma_pagamento', label: 'Forma de pagamento (lançamentos)', shape: 'breakdown', outputColumns: ['forma', 'value'], unit: 'un', template: `
    SELECT {vendas.forma_pagamento} AS forma, COUNT(1) AS value FROM {vendas} WHERE ${LAUNCH_SALES} AND ${window12('vendas', 'data_venda')} GROUP BY 1 ORDER BY 2 DESC` }),
  k({ id: 'lanc_vendas_por_tipologia', label: 'Vendas por tipologia', shape: 'breakdown', outputColumns: ['tipologia', 'value'], unit: 'un', template: `
    WITH v AS (SELECT {vendas.unidade_emp_id} AS unidade_emp_id FROM {vendas} WHERE ${LAUNCH_SALES} AND ${window12('vendas', 'data_venda')})
    SELECT e.{espelho_vendas.tipologia} AS tipologia, COUNT(1) AS value
    FROM v JOIN {espelho_vendas} e ON e.{espelho_vendas.unidade_emp_id} = v.unidade_emp_id
    GROUP BY 1 ORDER BY 1` }),
  k({ id: 'lanc_desconto_medio_pct', scale: ['value'], label: 'Desconto médio (lançamentos)', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT AVG({vendas.desconto_pct}) AS value FROM {vendas} WHERE ${LAUNCH_SALES} AND ${monthEnd('vendas', 'data_venda')}` }),

  k({ id: 'lanc_vgv_serie', label: 'VGV mensal de lançamentos', shape: 'timeseries', outputColumns: ['bucket', 'value'], unit: 'BRL', template: `
    SELECT ${bucket('vendas', 'data_venda')} AS bucket, SUM({vendas.valor_venda}) AS value FROM {vendas} WHERE ${LAUNCH_SALES} AND ${band('vendas', 'data_venda')} GROUP BY 1 ORDER BY 1` }),
  // ── B2. Espelho de Vendas ──────────────────────────────────────────────
  k({ id: 'espelho_torre_andar', scale: ['value'], label: 'Espelho: torre/andar × tipologia', description: 'Vendidas por célula (torre-andar × tipologia) dos empreendimentos em comercialização.', shape: 'matrix', outputColumns: ['row', 'col', 'value'], template: `
    SELECT CONCAT(p.{empreendimentos.nome}, ' ', e.{espelho_vendas.torre}, ' · ', CAST(e.{espelho_vendas.andar} AS STRING), 'º') AS row, e.{espelho_vendas.tipologia} AS col,
      SAFE_DIVIDE(COUNTIF(e.{espelho_vendas.status} = 'vendida'), COUNT(1)) AS value
    FROM {espelho_vendas} e JOIN {empreendimentos} p ON p.{empreendimentos.empreendimento_id} = e.{espelho_vendas.empreendimento_id}
    WHERE p.{empreendimentos.fase} = 'lancamento'
    GROUP BY 1, 2 ORDER BY 1, 2` }),
  k({ id: 'espelho_unidades', label: 'Unidades do espelho', shape: 'rows', outputColumns: ['empreendimento', 'unidade', 'tipologia', 'area_m2', 'valor_tabela', 'status', 'corretor', 'data_venda'], template: `
    SELECT p.{empreendimentos.nome} AS empreendimento, e.{espelho_vendas.unidade_emp_id} AS unidade, e.{espelho_vendas.tipologia} AS tipologia, e.{espelho_vendas.area_m2} AS area_m2,
      e.{espelho_vendas.valor_tabela} AS valor_tabela, e.{espelho_vendas.status} AS status, c.{corretores.nome} AS corretor, e.{espelho_vendas.data_venda} AS data_venda
    FROM {espelho_vendas} e JOIN {empreendimentos} p ON p.{empreendimentos.empreendimento_id} = e.{espelho_vendas.empreendimento_id}
    LEFT JOIN {corretores} c ON c.{corretores.corretor_id} = e.{espelho_vendas.corretor_id}
    WHERE p.{empreendimentos.fase} IN ('lancamento', 'em_obra')
    ORDER BY 1, 2 LIMIT 500` }),
  k({ id: 'espelho_pct_vendido', label: 'Percentual vendido', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(COUNTIF({espelho_vendas.status} = 'vendida'), COUNT(1)) AS value FROM {espelho_vendas}` }),
  k({ id: 'espelho_vgv_restante', label: 'VGV restante', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COALESCE(SUM({espelho_vendas.valor_tabela}), 0) AS value FROM {espelho_vendas} WHERE {espelho_vendas.status} != 'vendida'` }),
  k({ id: 'espelho_disponiveis_por_tipologia', label: 'Disponíveis por tipologia', shape: 'breakdown', outputColumns: ['tipologia', 'value'], unit: 'un', template: `
    SELECT {espelho_vendas.tipologia} AS tipologia, COUNT(1) AS value FROM {espelho_vendas} WHERE {espelho_vendas.status} = 'disponivel' GROUP BY 1 ORDER BY 1` }),
  k({ id: 'espelho_curva_vendas_acumulada', label: 'Curva de vendas acumulada', shape: 'timeseries', outputColumns: ['bucket', 'value'], unit: 'un', template: `
    SELECT bucket, SUM(n) OVER (ORDER BY bucket) AS value
    FROM (SELECT ${bucket('espelho_vendas', 'data_venda')} AS bucket, COUNT(1) AS n FROM {espelho_vendas} WHERE {espelho_vendas.status} = 'vendida' AND ${band('espelho_vendas', 'data_venda')} GROUP BY 1)
    ORDER BY bucket` }),
  k({ id: 'espelho_preco_m2_por_tipologia', label: 'Preço por m² por tipologia', shape: 'distribution', outputColumns: ['grupo', 'min', 'q1', 'mediana', 'q3', 'max'], unit: 'BRL', template: `
    SELECT e.{espelho_vendas.tipologia} AS grupo, ${quartiles('SAFE_DIVIDE(v.{vendas.valor_venda}, e.{espelho_vendas.area_m2})')}
    FROM {vendas} v JOIN {espelho_vendas} e ON e.{espelho_vendas.unidade_emp_id} = v.{vendas.unidade_emp_id}
    WHERE v.{vendas.departamento} = 'lancamentos' AND v.{vendas.distrato} = FALSE
    GROUP BY 1 ORDER BY 1` }),

  // ── B3. Funil de Lançamento ────────────────────────────────────────────
  k({ id: 'lanc_funil', label: 'Funil de lançamentos', shape: 'funnel', outputColumns: ['etapa', 'value'], template: `
    WITH c AS (SELECT {leads.lead_id} AS lead_id, {leads.qualificado} AS q FROM {leads} WHERE {leads.interesse} = 'compra_lancamento' AND ${monthEnd('leads', 'data_criacao')})
    SELECT 'Leads' AS etapa, COUNT(1) AS value, 1 AS ordem FROM c
    UNION ALL SELECT 'Qualificados', COUNTIF(q), 2 FROM c
    UNION ALL SELECT 'Visita ao stand', COUNT(DISTINCT v.{visitas.lead_id}), 3 FROM {visitas} v JOIN c ON c.lead_id = v.{visitas.lead_id} WHERE v.{visitas.realizada}
    UNION ALL SELECT 'Proposta', COUNT(DISTINCT p.{propostas.lead_id}), 4 FROM {propostas} p JOIN c ON c.lead_id = p.{propostas.lead_id}
    UNION ALL SELECT 'Venda', COUNT(DISTINCT s.{vendas.lead_id}), 5 FROM {vendas} s JOIN c ON c.lead_id = s.{vendas.lead_id}
    ORDER BY ordem` }),
  k({ id: 'lanc_conversao_lead_venda_pct', label: 'Conversão lead → venda (lançamentos)', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(COUNTIF({leads.status} = 'ganho'), COUNT(1)) AS value FROM {leads} WHERE {leads.interesse} = 'compra_lancamento' AND ${monthEnd('leads', 'data_criacao')}` }),
  k({ id: 'lanc_custo_por_venda', label: 'Custo de marketing por venda (lançamentos)', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(
      (SELECT SUM({marketing_investimentos.investimento}) FROM {marketing_investimentos} WHERE {marketing_investimentos.campanha_id} LIKE 'cmp-emp-%' AND ${monthEnd('marketing_investimentos', 'competencia')}),
      (SELECT COUNT(1) FROM {vendas} WHERE ${LAUNCH_SALES} AND ${monthEnd('vendas', 'data_venda')})) AS value` }),
  k({ id: 'lanc_leads_por_origem', label: 'Leads de lançamento por origem', shape: 'breakdown', outputColumns: ['origem', 'value'], unit: 'un', template: `
    SELECT {leads.origem} AS origem, COUNT(1) AS value FROM {leads} WHERE {leads.interesse} = 'compra_lancamento' AND ${monthEnd('leads', 'data_criacao')} GROUP BY 1 ORDER BY 2 DESC` }),
  k({ id: 'lanc_migracao_estagios', label: 'Migração de estágios (lançamentos)', description: 'De onde cada lead saiu para onde chegou no período.', shape: 'flow', outputColumns: ['origem', 'destino', 'value'], template: `
    WITH l AS (SELECT {leads.status} AS status, {leads.qualificado} AS q, {leads.data_primeiro_contato} AS pc FROM {leads} WHERE {leads.interesse} = 'compra_lancamento' AND ${window12('leads', 'data_criacao')})
    SELECT 'Lead' AS origem, 'Atendido' AS destino, COUNTIF(pc IS NOT NULL) AS value FROM l
    UNION ALL SELECT 'Lead', 'Sem contato', COUNTIF(pc IS NULL) FROM l
    UNION ALL SELECT 'Atendido', 'Qualificado', COUNTIF(pc IS NOT NULL AND q) FROM l
    UNION ALL SELECT 'Atendido', 'Perdido cedo', COUNTIF(pc IS NOT NULL AND NOT q) FROM l
    UNION ALL SELECT 'Qualificado', 'Ganho', COUNTIF(q AND status = 'ganho') FROM l
    UNION ALL SELECT 'Qualificado', 'Perdido', COUNTIF(q AND status = 'perdido') FROM l
    UNION ALL SELECT 'Qualificado', 'Em andamento', COUNTIF(q AND status NOT IN ('ganho', 'perdido')) FROM l` }),
  k({ id: 'lanc_motivos_perda', label: 'Motivos de perda (lançamentos)', shape: 'breakdown', outputColumns: ['motivo', 'value'], unit: 'un', template: `
    SELECT {leads.motivo_perda} AS motivo, COUNT(1) AS value FROM {leads} WHERE {leads.interesse} = 'compra_lancamento' AND {leads.status} = 'perdido' AND ${window12('leads', 'data_criacao')} GROUP BY 1 ORDER BY 2 DESC` }),
  k({ id: 'lanc_ranking_corretores', label: 'Ranking de corretores (lançamentos)', shape: 'rows', outputColumns: ['corretor', 'unidade', 'leads', 'visitas', 'propostas', 'vendas', 'vgv', 'conversao_pct'], template: `
    WITH l AS (SELECT {leads.corretor_id} AS corretor_id, COUNT(1) AS leads FROM {leads} WHERE {leads.interesse} = 'compra_lancamento' AND ${window12('leads', 'data_criacao')} GROUP BY 1),
         vi AS (SELECT {visitas.corretor_id} AS corretor_id, COUNTIF({visitas.realizada}) AS visitas FROM {visitas} WHERE {visitas.unidade_emp_id} IS NOT NULL AND ${window12('visitas', 'data_agendada')} GROUP BY 1),
         pr AS (SELECT {propostas.corretor_id} AS corretor_id, COUNT(1) AS propostas FROM {propostas} WHERE {propostas.departamento} = 'lancamentos' AND ${window12('propostas', 'data_envio')} GROUP BY 1),
         v AS (SELECT {vendas.corretor_id} AS corretor_id, COUNT(1) AS vendas, SUM({vendas.valor_venda}) AS vgv FROM {vendas} WHERE ${LAUNCH_SALES} AND ${window12('vendas', 'data_venda')} GROUP BY 1)
    SELECT c.{corretores.nome} AS corretor, u.{unidades.nome} AS unidade, COALESCE(l.leads, 0) AS leads, COALESCE(vi.visitas, 0) AS visitas, COALESCE(pr.propostas, 0) AS propostas, COALESCE(v.vendas, 0) AS vendas, COALESCE(v.vgv, 0) AS vgv, SAFE_DIVIDE(v.vendas, l.leads) AS conversao_pct
    FROM {corretores} c JOIN {unidades} u ON u.{unidades.unidade_id} = c.{corretores.unidade_id}
    LEFT JOIN l ON l.corretor_id = c.{corretores.corretor_id} LEFT JOIN vi ON vi.corretor_id = c.{corretores.corretor_id} LEFT JOIN pr ON pr.corretor_id = c.{corretores.corretor_id} LEFT JOIN v ON v.corretor_id = c.{corretores.corretor_id}
    WHERE c.{corretores.departamento_id} LIKE '%-lancamentos' AND c.{corretores.cargo} = 'corretor'
    ORDER BY vgv DESC LIMIT 50` }),
];
