/** Grupo C — Prontos / Revenda. */
import { sql, monthEnd, monthRef, pin, band, bucket, window12, quartiles, pivotBranches } from './_helpers.mjs';

const CAT = 'Prontos';
const k = (o) => sql({ category: CAT, ...o });
const READY_SALES = `{vendas.departamento} = 'prontos' AND {vendas.distrato} = FALSE`;
const PURCHASE_LEADS = `{leads.interesse} = 'compra_pronto'`;

export const metrics = [
  // ── C1. Painel de Vendas ───────────────────────────────────────────────
  k({ id: 'prontos_vgv_mes', label: 'VGV de prontos no mês', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COALESCE(SUM({vendas.valor_venda}), 0) AS value FROM {vendas} WHERE ${READY_SALES} AND ${monthEnd('vendas', 'data_venda')}` }),
  k({ id: 'prontos_vendas_qtd_mes', label: 'Vendas de prontos no mês', unit: 'un', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COUNT(1) AS value FROM {vendas} WHERE ${READY_SALES} AND ${monthEnd('vendas', 'data_venda')}` }),
  k({ id: 'prontos_ticket_medio', label: 'Ticket médio (prontos)', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT AVG({vendas.valor_venda}) AS value FROM {vendas} WHERE ${READY_SALES} AND ${monthEnd('vendas', 'data_venda')}` }),
  k({ id: 'prontos_comissao_media_pct', label: 'Comissão média', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT AVG({vendas.comissao_pct}) AS value FROM {vendas} WHERE ${READY_SALES} AND ${monthEnd('vendas', 'data_venda')}` }),
  k({ id: 'prontos_receita_comissao_mes', label: 'Receita de comissão (prontos)', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COALESCE(SUM({vendas.comissao_imobiliaria}), 0) AS value FROM {vendas} WHERE ${READY_SALES} AND ${monthEnd('vendas', 'data_venda')}` }),
  k({ id: 'prontos_ciclo_venda_dias', label: 'Ciclo de venda', description: 'Dias entre a criação do lead e o fechamento.', unit: 'dias', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT AVG({vendas.dias_ciclo}) AS value FROM {vendas} WHERE ${READY_SALES} AND ${monthEnd('vendas', 'data_venda')}` }),
  k({ id: 'prontos_desconto_medio_pct', scale: ['value'], label: 'Desconto médio (prontos)', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT AVG({vendas.desconto_pct}) AS value FROM {vendas} WHERE ${READY_SALES} AND ${monthEnd('vendas', 'data_venda')}` }),
  k({ id: 'prontos_atingimento_meta_pct', scale: ['value'], label: 'Atingimento da meta (prontos)', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(
      (SELECT SUM({vendas.valor_venda}) FROM {vendas} WHERE ${READY_SALES} AND ${monthEnd('vendas', 'data_venda')}),
      (SELECT SUM({metas.meta_vgv}) FROM {metas} WHERE {metas.departamento_id} LIKE '%-prontos' AND {metas.corretor_id} IS NULL AND ${monthEnd('metas', 'competencia')})) AS value` }),
  k({ id: 'prontos_vgv_serie', label: 'VGV e vendas por mês (prontos)', shape: 'timeseries_multi', outputColumns: ['bucket', 'vgv', 'vendas'], template: `
    SELECT ${bucket('vendas', 'data_venda')} AS bucket, SUM({vendas.valor_venda}) AS vgv, COUNT(1) AS vendas FROM {vendas} WHERE ${READY_SALES} AND ${band('vendas', 'data_venda')} GROUP BY 1 ORDER BY 1` }),
  k({ id: 'prontos_vendas_por_unidade_serie', label: 'Vendas por unidade (prontos)', shape: 'timeseries_pivot', outputColumns: ['bucket', 'centro', 'zona_sul', 'zona_norte', 'abc', 'campinas', 'litoral'], unit: 'un', template: `
    SELECT bucket, ${pivotBranches('1')}
    FROM (SELECT ${bucket('vendas', 'data_venda')} AS bucket, {vendas.unidade_id} AS unidade_id FROM {vendas} WHERE ${READY_SALES} AND ${band('vendas', 'data_venda')})
    GROUP BY 1 ORDER BY 1` }),
  k({ id: 'prontos_vendas_por_tipo', label: 'Vendas por tipo de imóvel', shape: 'breakdown', outputColumns: ['tipo', 'value'], unit: 'un', template: `
    SELECT i.{imoveis.tipo} AS tipo, COUNT(1) AS value FROM {vendas} v JOIN {imoveis} i ON i.{imoveis.imovel_id} = v.{vendas.imovel_id}
    WHERE v.{vendas.departamento} = 'prontos' AND v.{vendas.distrato} = FALSE AND ${monthEnd('vendas', 'data_venda').replace('{vendas.data_venda}, MONTH) =', 'v.{vendas.data_venda}, MONTH) =')} GROUP BY 1 ORDER BY 2 DESC` }),
  k({ id: 'prontos_vendas_por_regiao', label: 'Vendas por região', shape: 'breakdown', outputColumns: ['regiao', 'value'], unit: 'un', template: `
    SELECT i.{imoveis.regiao} AS regiao, COUNT(1) AS value FROM {vendas} v JOIN {imoveis} i ON i.{imoveis.imovel_id} = v.{vendas.imovel_id}
    WHERE v.{vendas.departamento} = 'prontos' AND v.{vendas.distrato} = FALSE AND ${monthEnd('vendas', 'data_venda').replace('{vendas.data_venda}, MONTH) =', 'v.{vendas.data_venda}, MONTH) =')} GROUP BY 1 ORDER BY 2 DESC` }),
  k({ id: 'prontos_forma_pagamento', label: 'Forma de pagamento (prontos)', shape: 'breakdown', outputColumns: ['forma', 'value'], unit: 'un', template: `
    SELECT {vendas.forma_pagamento} AS forma, COUNT(1) AS value FROM {vendas} WHERE ${READY_SALES} AND ${window12('vendas', 'data_venda')} GROUP BY 1 ORDER BY 2 DESC` }),
  k({ id: 'prontos_vendas_por_banco', label: 'Financiamentos por banco', shape: 'breakdown', outputColumns: ['banco', 'value'], unit: 'un', template: `
    SELECT {vendas.banco} AS banco, COUNT(1) AS value FROM {vendas} WHERE ${READY_SALES} AND {vendas.forma_pagamento} = 'financiamento' AND ${window12('vendas', 'data_venda')} GROUP BY 1 ORDER BY 2 DESC` }),
  k({ id: 'prontos_vgv_vs_mes_anterior', label: 'VGV: mês vs. mês anterior (prontos)', shape: 'timeseries', outputColumns: ['bucket', 'value'], unit: 'BRL', template: `
    SELECT ${bucket('vendas', 'data_venda')} AS bucket, SUM({vendas.valor_venda}) AS value FROM {vendas}
    WHERE ${READY_SALES} AND ${bucket('vendas', 'data_venda')} IN (${monthRef('vendas', 'data_venda')}, DATE_SUB(${monthRef('vendas', 'data_venda')}, INTERVAL 1 MONTH))
    GROUP BY 1 ORDER BY 1` }),
  k({ id: 'prontos_ciclo_por_unidade_dist', label: 'Ciclo de venda por unidade', shape: 'distribution', outputColumns: ['grupo', 'min', 'q1', 'mediana', 'q3', 'max'], unit: 'dias', template: `
    SELECT u.{unidades.nome} AS grupo, ${quartiles('v.{vendas.dias_ciclo}')}
    FROM {vendas} v JOIN {unidades} u ON u.{unidades.unidade_id} = v.{vendas.unidade_id}
    WHERE v.{vendas.departamento} = 'prontos' AND ${window12('vendas', 'data_venda').replace('{vendas.data_venda} >=', 'v.{vendas.data_venda} >=')}
    GROUP BY 1 ORDER BY mediana` }),

  k({ id: 'prontos_vgv_mensal', label: 'VGV mensal de prontos', shape: 'timeseries', outputColumns: ['bucket', 'value'], unit: 'BRL', template: `
    SELECT ${bucket('vendas', 'data_venda')} AS bucket, SUM({vendas.valor_venda}) AS value FROM {vendas} WHERE ${READY_SALES} AND ${band('vendas', 'data_venda')} GROUP BY 1 ORDER BY 1` }),
  // ── C2. Funil Comercial ────────────────────────────────────────────────
  k({ id: 'prontos_funil', label: 'Funil comercial (prontos)', shape: 'funnel', outputColumns: ['etapa', 'value'], template: `
    WITH c AS (SELECT {leads.lead_id} AS lead_id, {leads.qualificado} AS q, {leads.data_primeiro_contato} AS pc FROM {leads} WHERE ${PURCHASE_LEADS} AND ${monthEnd('leads', 'data_criacao')})
    SELECT 'Leads' AS etapa, COUNT(1) AS value, 1 AS ordem FROM c
    UNION ALL SELECT 'Em atendimento', COUNTIF(pc IS NOT NULL), 2 FROM c
    UNION ALL SELECT 'Qualificados', COUNTIF(q), 3 FROM c
    UNION ALL SELECT 'Visita realizada', COUNT(DISTINCT v.{visitas.lead_id}), 4 FROM {visitas} v JOIN c ON c.lead_id = v.{visitas.lead_id} WHERE v.{visitas.realizada}
    UNION ALL SELECT 'Proposta', COUNT(DISTINCT p.{propostas.lead_id}), 5 FROM {propostas} p JOIN c ON c.lead_id = p.{propostas.lead_id}
    UNION ALL SELECT 'Venda', COUNT(DISTINCT s.{vendas.lead_id}), 6 FROM {vendas} s JOIN c ON c.lead_id = s.{vendas.lead_id}
    ORDER BY ordem` }),
  k({ id: 'conversao_lead_visita_pct', label: 'Conversão lead → visita', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE((SELECT COUNT(DISTINCT {visitas.lead_id}) FROM {visitas} WHERE {visitas.realizada} AND ${monthEnd('visitas', 'data_agendada')}), (SELECT COUNT(1) FROM {leads} WHERE ${monthEnd('leads', 'data_criacao')})) AS value` }),
  k({ id: 'conversao_visita_proposta_pct', label: 'Conversão visita → proposta', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE((SELECT COUNT(1) FROM {propostas} WHERE ${monthEnd('propostas', 'data_envio')}), (SELECT COUNTIF({visitas.realizada}) FROM {visitas} WHERE ${monthEnd('visitas', 'data_agendada')})) AS value` }),
  k({ id: 'conversao_proposta_venda_pct', label: 'Conversão proposta → fechamento', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(COUNTIF({propostas.status} = 'aceita'), COUNTIF({propostas.status} != 'enviada' AND {propostas.status} != 'contraproposta')) AS value FROM {propostas} WHERE ${monthEnd('propostas', 'data_envio')}` }),
  k({ id: 'conversao_lead_venda_pct', label: 'Conversão lead → fechamento', description: 'Benchmark de mercado ≈ 2,8%.', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(COUNTIF({leads.status} = 'ganho'), COUNT(1)) AS value FROM {leads} WHERE ${monthEnd('leads', 'data_criacao')}` }),
  k({ id: 'visitas_por_venda', label: 'Visitas por venda', unit: 'un', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE((SELECT COUNTIF({visitas.realizada}) FROM {visitas} WHERE {visitas.imovel_id} IS NOT NULL AND ${monthEnd('visitas', 'data_agendada')}), (SELECT COUNT(1) FROM {vendas} WHERE ${READY_SALES} AND ${monthEnd('vendas', 'data_venda')})) AS value` }),
  k({ id: 'propostas_aceitas_pct', label: 'Propostas aceitas', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(COUNTIF({propostas.status} = 'aceita'), COUNT(1)) AS value FROM {propostas} WHERE ${monthEnd('propostas', 'data_envio')}` }),
  k({ id: 'no_show_visitas_pct', scale: ['value'], label: 'No-show de visitas', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(COUNTIF({visitas.no_show}), COUNT(1)) AS value FROM {visitas} WHERE ${monthEnd('visitas', 'data_agendada')}` }),
  k({ id: 'conversao_etapas_serie', scale: ['lead_visita', 'visita_proposta', 'proposta_venda'], label: 'Conversão por etapa', shape: 'timeseries_multi', outputColumns: ['bucket', 'lead_visita', 'visita_proposta', 'proposta_venda'], unit: '%', template: `
    WITH l AS (SELECT ${bucket('leads', 'data_criacao')} AS bucket, COUNT(1) AS leads FROM {leads} WHERE ${band('leads', 'data_criacao')} GROUP BY 1),
         v AS (SELECT ${bucket('visitas', 'data_agendada')} AS bucket, COUNTIF({visitas.realizada}) AS visitas FROM {visitas} WHERE ${band('visitas', 'data_agendada')} GROUP BY 1),
         p AS (SELECT ${bucket('propostas', 'data_envio')} AS bucket, COUNT(1) AS propostas, COUNTIF({propostas.status} = 'aceita') AS aceitas FROM {propostas} WHERE ${band('propostas', 'data_envio')} GROUP BY 1)
    SELECT l.bucket, SAFE_DIVIDE(v.visitas, l.leads) AS lead_visita, SAFE_DIVIDE(p.propostas, v.visitas) AS visita_proposta, SAFE_DIVIDE(p.aceitas, p.propostas) AS proposta_venda
    FROM l LEFT JOIN v USING (bucket) LEFT JOIN p USING (bucket) ORDER BY 1` }),
  k({ id: 'motivos_perda', label: 'Motivos de perda', shape: 'breakdown', outputColumns: ['motivo', 'value'], unit: 'un', template: `
    SELECT {leads.motivo_perda} AS motivo, COUNT(1) AS value FROM {leads} WHERE {leads.status} = 'perdido' AND ${window12('leads', 'data_criacao')} GROUP BY 1 ORDER BY 2 DESC` }),
  k({ id: 'migracao_estagios_leads', label: 'Migração de estágios dos leads', shape: 'flow', outputColumns: ['origem', 'destino', 'value'], template: `
    WITH l AS (SELECT {leads.status} AS status, {leads.qualificado} AS q, {leads.data_primeiro_contato} AS pc FROM {leads} WHERE ${PURCHASE_LEADS} AND ${window12('leads', 'data_criacao')})
    SELECT 'Lead' AS origem, 'Atendido' AS destino, COUNTIF(pc IS NOT NULL) AS value FROM l
    UNION ALL SELECT 'Lead', 'Sem contato', COUNTIF(pc IS NULL) FROM l
    UNION ALL SELECT 'Atendido', 'Qualificado', COUNTIF(pc IS NOT NULL AND q) FROM l
    UNION ALL SELECT 'Atendido', 'Perdido cedo', COUNTIF(pc IS NOT NULL AND NOT q) FROM l
    UNION ALL SELECT 'Qualificado', 'Ganho', COUNTIF(q AND status = 'ganho') FROM l
    UNION ALL SELECT 'Qualificado', 'Perdido', COUNTIF(q AND status = 'perdido') FROM l
    UNION ALL SELECT 'Qualificado', 'Em andamento', COUNTIF(q AND status NOT IN ('ganho', 'perdido')) FROM l` }),
  k({ id: 'funil_corretor_x_etapa', scale: ['value'], label: 'Corretor × etapa do funil', description: 'Taxa de conversão de cada etapa por corretor (top 25 por leads).', shape: 'matrix', outputColumns: ['row', 'col', 'value'], unit: '%', template: `
    WITH l AS (SELECT {leads.corretor_id} AS corretor_id, COUNT(1) AS leads, COUNTIF({leads.qualificado}) AS qual, COUNTIF({leads.status} = 'ganho') AS ganho FROM {leads} WHERE ${PURCHASE_LEADS} AND ${window12('leads', 'data_criacao')} GROUP BY 1 ORDER BY leads DESC LIMIT 25),
         v AS (SELECT {visitas.corretor_id} AS corretor_id, COUNT(DISTINCT {visitas.lead_id}) AS visitas FROM {visitas} WHERE {visitas.realizada} AND ${window12('visitas', 'data_agendada')} GROUP BY 1),
         p AS (SELECT {propostas.corretor_id} AS corretor_id, COUNT(DISTINCT {propostas.lead_id}) AS propostas FROM {propostas} WHERE ${window12('propostas', 'data_envio')} GROUP BY 1),
         j AS (SELECT c.{corretores.nome} AS nome, l.leads, l.qual, COALESCE(v.visitas, 0) AS visitas, COALESCE(p.propostas, 0) AS propostas, l.ganho FROM l JOIN {corretores} c ON c.{corretores.corretor_id} = l.corretor_id LEFT JOIN v ON v.corretor_id = l.corretor_id LEFT JOIN p ON p.corretor_id = l.corretor_id)
    SELECT nome AS row, '1. Qualificação' AS col, SAFE_DIVIDE(qual, leads) AS value FROM j
    UNION ALL SELECT nome, '2. Visita', SAFE_DIVIDE(visitas, qual) FROM j
    UNION ALL SELECT nome, '3. Proposta', SAFE_DIVIDE(propostas, visitas) FROM j
    UNION ALL SELECT nome, '4. Fechamento', SAFE_DIVIDE(ganho, propostas) FROM j
    ORDER BY 1, 2` }),
  k({ id: 'propostas_abertas', label: 'Propostas em aberto', shape: 'rows', outputColumns: ['proposta', 'imovel', 'corretor', 'unidade', 'valor_proposta', 'status', 'dias_em_aberto'], template: `
    SELECT p.{propostas.proposta_id} AS proposta, COALESCE(p.{propostas.imovel_id}, p.{propostas.unidade_emp_id}) AS imovel, c.{corretores.nome} AS corretor, u.{unidades.nome} AS unidade,
      p.{propostas.valor_proposta} AS valor_proposta, p.{propostas.status} AS status, DATE_DIFF((SELECT MAX({propostas.data_envio}) FROM {propostas}), p.{propostas.data_envio}, DAY) AS dias_em_aberto
    FROM {propostas} p JOIN {corretores} c ON c.{corretores.corretor_id} = p.{propostas.corretor_id} JOIN {unidades} u ON u.{unidades.unidade_id} = p.{propostas.unidade_id}
    WHERE p.{propostas.status} IN ('enviada', 'contraproposta')
    ORDER BY dias_em_aberto DESC LIMIT 200` }),

  // ── C3. Estoque & Captação ─────────────────────────────────────────────
  k({ id: 'estoque_imoveis_venda', label: 'Imóveis à venda em estoque', unit: 'un', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COUNT(1) AS value FROM {estoque_snapshot} WHERE {estoque_snapshot.status} = 'disponivel' AND {estoque_snapshot.finalidade} != 'locacao' AND ${pin('estoque_snapshot')}` }),
  k({ id: 'estoque_vgv_anunciado', label: 'VGV anunciado em estoque', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COALESCE(SUM({estoque_snapshot.valor_anuncio}), 0) AS value FROM {estoque_snapshot} WHERE {estoque_snapshot.status} = 'disponivel' AND {estoque_snapshot.finalidade} != 'locacao' AND ${pin('estoque_snapshot')}` }),
  k({ id: 'captacoes_mes', label: 'Captações no mês', unit: 'un', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COUNT(1) AS value FROM {imoveis} WHERE ${monthEnd('imoveis', 'data_captacao')}` }),
  k({ id: 'atingimento_meta_captacao_pct', scale: ['value'], label: 'Atingimento da meta de captação', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE((SELECT COUNT(1) FROM {imoveis} WHERE ${monthEnd('imoveis', 'data_captacao')}),
      (SELECT SUM({metas.meta_captacoes}) FROM {metas} WHERE {metas.departamento_id} IS NULL AND {metas.corretor_id} IS NULL AND ${monthEnd('metas', 'competencia')})) AS value` }),
  k({ id: 'exclusividade_pct', label: 'Captações com exclusividade', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(COUNTIF({imoveis.exclusividade}), COUNT(1)) AS value FROM {imoveis} WHERE ${monthEnd('imoveis', 'data_captacao')}` }),
  k({ id: 'tempo_medio_estoque_dias', label: 'Tempo médio em estoque', unit: 'dias', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT AVG({estoque_snapshot.dias_em_estoque}) AS value FROM {estoque_snapshot} WHERE {estoque_snapshot.status} = 'disponivel' AND {estoque_snapshot.finalidade} != 'locacao' AND ${pin('estoque_snapshot')}` }),
  k({ id: 'icca_pct', label: 'ICCA — captados sobre carteira', description: 'Captações do mês sobre a carteira na foto do mês.', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE((SELECT COUNT(1) FROM {imoveis} WHERE ${monthEnd('imoveis', 'data_captacao')}), (SELECT COUNT(1) FROM {estoque_snapshot} WHERE ${pin('estoque_snapshot')})) AS value` }),
  k({ id: 'giro_estoque_pct', label: 'Giro do estoque', description: 'Vendidos no mês sobre imóveis à venda na foto do mês.', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE((SELECT COUNT(1) FROM {vendas} WHERE ${READY_SALES} AND ${monthEnd('vendas', 'data_venda')}), (SELECT COUNT(1) FROM {estoque_snapshot} WHERE {estoque_snapshot.status} = 'disponivel' AND {estoque_snapshot.finalidade} != 'locacao' AND ${pin('estoque_snapshot')})) AS value` }),
  k({ id: 'estoque_por_faixa_dias', label: 'Estoque por tempo de carteira', shape: 'breakdown', outputColumns: ['faixa', 'value'], unit: 'un', template: `
    SELECT {estoque_snapshot.faixa_estoque} AS faixa, COUNT(1) AS value FROM {estoque_snapshot} WHERE {estoque_snapshot.status} = 'disponivel' AND {estoque_snapshot.finalidade} != 'locacao' AND ${pin('estoque_snapshot')} GROUP BY 1 ORDER BY 1` }),
  k({ id: 'estoque_serie_por_faixa', label: 'Evolução do estoque por faixa', shape: 'timeseries_pivot', outputColumns: ['bucket', 'ate_30', 'de_31_a_90', 'de_91_a_180', 'mais_de_180'], unit: 'un', template: `
    SELECT {estoque_snapshot.data_base_report} AS bucket,
      COUNTIF({estoque_snapshot.faixa_estoque} = '0-30') AS ate_30, COUNTIF({estoque_snapshot.faixa_estoque} = '31-90') AS de_31_a_90,
      COUNTIF({estoque_snapshot.faixa_estoque} = '91-180') AS de_91_a_180, COUNTIF({estoque_snapshot.faixa_estoque} = '180+') AS mais_de_180
    FROM {estoque_snapshot} WHERE {estoque_snapshot.status} = 'disponivel' AND {estoque_snapshot.finalidade} != 'locacao' AND ${band('estoque_snapshot', 'data_base_report')} GROUP BY 1 ORDER BY 1` }),
  k({ id: 'estoque_por_regiao_tipo', label: 'Estoque por região e tipo', shape: 'breakdown', outputColumns: ['segmento', 'value'], unit: 'BRL', template: `
    SELECT CONCAT({estoque_snapshot.regiao}, ' · ', {estoque_snapshot.tipo}) AS segmento, SUM({estoque_snapshot.valor_anuncio}) AS value
    FROM {estoque_snapshot} WHERE {estoque_snapshot.status} = 'disponivel' AND {estoque_snapshot.finalidade} != 'locacao' AND ${pin('estoque_snapshot')} GROUP BY 1 ORDER BY 2 DESC` }),
  k({ id: 'preco_x_dias_estoque', label: 'Preço × dias em estoque', shape: 'points', outputColumns: ['x', 'y', 'group'], template: `
    SELECT {estoque_snapshot.valor_anuncio} AS x, {estoque_snapshot.dias_em_estoque} AS y, {estoque_snapshot.tipo} AS \`group\`
    FROM {estoque_snapshot} WHERE {estoque_snapshot.status} = 'disponivel' AND {estoque_snapshot.finalidade} != 'locacao' AND ${pin('estoque_snapshot')} LIMIT 800` }),
  k({ id: 'imoveis_parados_180', label: 'Imóveis parados há mais de 180 dias', shape: 'rows', outputColumns: ['codigo', 'tipo', 'regiao', 'valor_anuncio', 'dias_em_estoque', 'visitas', 'propostas', 'captador'], template: `
    SELECT i.{imoveis.codigo} AS codigo, s.{estoque_snapshot.tipo} AS tipo, s.{estoque_snapshot.regiao} AS regiao, s.{estoque_snapshot.valor_anuncio} AS valor_anuncio, s.{estoque_snapshot.dias_em_estoque} AS dias_em_estoque,
      s.{estoque_snapshot.visitas_acumuladas} AS visitas, s.{estoque_snapshot.propostas_acumuladas} AS propostas, c.{corretores.nome} AS captador
    FROM {estoque_snapshot} s JOIN {imoveis} i ON i.{imoveis.imovel_id} = s.{estoque_snapshot.imovel_id} LEFT JOIN {corretores} c ON c.{corretores.corretor_id} = i.{imoveis.captador_id}
    WHERE s.{estoque_snapshot.status} = 'disponivel' AND s.{estoque_snapshot.finalidade} != 'locacao' AND s.{estoque_snapshot.faixa_estoque} = '180+' AND ${pin('estoque_snapshot').replace('{estoque_snapshot.data_base_report} =', 's.{estoque_snapshot.data_base_report} =')}
    ORDER BY dias_em_estoque DESC LIMIT 200` }),
  k({ id: 'ranking_captadores', label: 'Ranking de captadores', shape: 'rows', outputColumns: ['captador', 'unidade', 'captacoes', 'exclusivas', 'vendidos', 'tempo_medio_dias'], template: `
    SELECT c.{corretores.nome} AS captador, u.{unidades.nome} AS unidade, COUNT(1) AS captacoes, COUNTIF(i.{imoveis.exclusividade}) AS exclusivas, COUNTIF(i.{imoveis.status} = 'vendido') AS vendidos,
      AVG(DATE_DIFF(COALESCE(i.{imoveis.data_saida}, (SELECT MAX({imoveis.data_captacao}) FROM {imoveis})), i.{imoveis.data_captacao}, DAY)) AS tempo_medio_dias
    FROM {imoveis} i JOIN {corretores} c ON c.{corretores.corretor_id} = i.{imoveis.captador_id} JOIN {unidades} u ON u.{unidades.unidade_id} = i.{imoveis.unidade_id}
    WHERE ${window12('imoveis', 'data_captacao').replace('{imoveis.data_captacao} >=', 'i.{imoveis.data_captacao} >=')}
    GROUP BY 1, 2 ORDER BY captacoes DESC LIMIT 50` }),
  k({ id: 'captacoes_serie', label: 'Captações mensais', shape: 'timeseries', outputColumns: ['bucket', 'value'], unit: 'un', template: `
    SELECT ${bucket('imoveis', 'data_captacao')} AS bucket, COUNT(1) AS value FROM {imoveis} WHERE ${band('imoveis', 'data_captacao')} GROUP BY 1 ORDER BY 1` }),
  k({ id: 'captacoes_vs_saidas_serie', label: 'Entradas × saídas de carteira', shape: 'timeseries_multi', outputColumns: ['bucket', 'captacoes', 'saidas'], unit: 'un', template: `
    WITH e AS (SELECT ${bucket('imoveis', 'data_captacao')} AS bucket, COUNT(1) AS captacoes FROM {imoveis} WHERE ${band('imoveis', 'data_captacao')} GROUP BY 1),
         s AS (SELECT ${bucket('imoveis', 'data_saida')} AS bucket, COUNT(1) AS saidas FROM {imoveis} WHERE {imoveis.data_saida} IS NOT NULL AND ${band('imoveis', 'data_saida')} GROUP BY 1)
    SELECT e.bucket, e.captacoes, COALESCE(s.saidas, 0) AS saidas FROM e LEFT JOIN s USING (bucket) ORDER BY 1` }),
  k({ id: 'saidas_por_motivo', label: 'Saídas de carteira por motivo', shape: 'breakdown', outputColumns: ['motivo', 'value'], unit: 'un', template: `
    SELECT {imoveis.motivo_saida} AS motivo, COUNT(1) AS value FROM {imoveis} WHERE {imoveis.motivo_saida} IS NOT NULL AND ${window12('imoveis', 'data_saida')} GROUP BY 1 ORDER BY 2 DESC` }),
];
