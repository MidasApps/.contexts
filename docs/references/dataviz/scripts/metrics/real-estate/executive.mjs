/** Grupo A — Visão Executiva (dono / diretoria). */
import { sql, monthEnd, monthRef, pin, band, bucket, window12, monthLabel, quartiles, branchTarget, pivotBranches } from './_helpers.mjs';

const CAT = 'Visão Executiva';
const k = (o) => sql({ category: CAT, ...o });

export const metrics = [
  // ── A1. Painel Executivo ───────────────────────────────────────────────
  k({ id: 'vgv_mes', label: 'VGV do mês', description: 'Valor geral de vendas (prontos + lançamentos) no último mês do período, sem distratos.', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COALESCE(SUM({vendas.valor_venda}), 0) AS value
    FROM {vendas}
    WHERE {vendas.distrato} = FALSE AND ${monthEnd('vendas', 'data_venda')}` }),
  k({ id: 'receita_bruta_mes', label: 'Receita bruta do mês', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COALESCE(SUM({financeiro_lancamentos.valor}), 0) AS value
    FROM {financeiro_lancamentos}
    WHERE {financeiro_lancamentos.natureza} = 'receita' AND ${monthEnd('financeiro_lancamentos', 'competencia')}` }),
  k({ id: 'margem_operacional_pct', label: 'Margem operacional', description: '(receita − despesa) / receita no mês.', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(SUM(IF({financeiro_lancamentos.natureza} = 'receita', {financeiro_lancamentos.valor}, 0)) - SUM(IF({financeiro_lancamentos.natureza} = 'despesa', {financeiro_lancamentos.valor}, 0)),
                       SUM(IF({financeiro_lancamentos.natureza} = 'receita', {financeiro_lancamentos.valor}, 0))) AS value
    FROM {financeiro_lancamentos}
    WHERE ${monthEnd('financeiro_lancamentos', 'competencia')}` }),
  k({ id: 'vendas_qtd_mes', label: 'Vendas no mês', unit: 'un', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COUNT(1) AS value FROM {vendas} WHERE {vendas.distrato} = FALSE AND ${monthEnd('vendas', 'data_venda')}` }),
  k({ id: 'locacoes_fechadas_mes', label: 'Locações fechadas no mês', unit: 'un', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COUNT(1) AS value FROM {contratos_locacao} WHERE ${monthEnd('contratos_locacao', 'data_inicio')}` }),
  k({ id: 'carteira_locacao_ativa', label: 'Contratos de locação ativos', unit: 'un', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COUNT(1) AS value FROM {carteira_locacao_snapshot}
    WHERE {carteira_locacao_snapshot.status} = 'ativo' AND ${pin('carteira_locacao_snapshot')}` }),
  k({ id: 'receita_taxa_adm_mes', label: 'Receita recorrente (taxa de administração)', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COALESCE(SUM({carteira_locacao_snapshot.taxa_adm_valor}), 0) AS value FROM {carteira_locacao_snapshot}
    WHERE {carteira_locacao_snapshot.status} = 'ativo' AND ${pin('carteira_locacao_snapshot')}` }),
  k({ id: 'atingimento_meta_vgv_pct', scale: ['value'], label: 'Atingimento da meta de VGV', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(
      (SELECT SUM({vendas.valor_venda}) FROM {vendas} WHERE {vendas.distrato} = FALSE AND ${monthEnd('vendas', 'data_venda')}),
      (SELECT SUM({metas.meta_vgv}) FROM {metas} WHERE {metas.departamento_id} IS NULL AND {metas.corretor_id} IS NULL AND ${monthEnd('metas', 'competencia')})) AS value` }),
  k({ id: 'atingimento_meta_receita_pct', scale: ['value'], label: 'Atingimento da meta de receita', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(
      (SELECT SUM({financeiro_lancamentos.valor}) FROM {financeiro_lancamentos} WHERE {financeiro_lancamentos.natureza} = 'receita' AND ${monthEnd('financeiro_lancamentos', 'competencia')}),
      (SELECT SUM({metas.meta_receita}) FROM {metas} WHERE {metas.departamento_id} IS NULL AND {metas.corretor_id} IS NULL AND ${monthEnd('metas', 'competencia')})) AS value` }),
  k({ id: 'executivo_tendencias', label: 'Tendências do negócio', description: 'VGV, receita, leads, vendas, locações e captações por mês.', shape: 'timeseries_multi', outputColumns: ['bucket', 'vgv', 'receita', 'leads', 'vendas', 'locacoes', 'captacoes'], template: `
    WITH v AS (SELECT ${bucket('vendas', 'data_venda')} AS bucket, SUM({vendas.valor_venda}) AS vgv, COUNT(1) AS vendas FROM {vendas} WHERE {vendas.distrato} = FALSE AND ${band('vendas', 'data_venda')} GROUP BY 1),
         r AS (SELECT ${bucket('financeiro_lancamentos', 'competencia')} AS bucket, SUM({financeiro_lancamentos.valor}) AS receita FROM {financeiro_lancamentos} WHERE {financeiro_lancamentos.natureza} = 'receita' AND ${band('financeiro_lancamentos', 'competencia')} GROUP BY 1),
         l AS (SELECT ${bucket('leads', 'data_criacao')} AS bucket, COUNT(1) AS leads FROM {leads} WHERE ${band('leads', 'data_criacao')} GROUP BY 1),
         c AS (SELECT ${bucket('contratos_locacao', 'data_inicio')} AS bucket, COUNT(1) AS locacoes FROM {contratos_locacao} WHERE ${band('contratos_locacao', 'data_inicio')} GROUP BY 1),
         p AS (SELECT ${bucket('imoveis', 'data_captacao')} AS bucket, COUNT(1) AS captacoes FROM {imoveis} WHERE ${band('imoveis', 'data_captacao')} GROUP BY 1),
         m AS (SELECT bucket FROM v UNION DISTINCT SELECT bucket FROM l)
    SELECT m.bucket, COALESCE(v.vgv, 0) AS vgv, COALESCE(r.receita, 0) AS receita, COALESCE(l.leads, 0) AS leads, COALESCE(v.vendas, 0) AS vendas, COALESCE(c.locacoes, 0) AS locacoes, COALESCE(p.captacoes, 0) AS captacoes
    FROM m LEFT JOIN v USING (bucket) LEFT JOIN r USING (bucket) LEFT JOIN l USING (bucket) LEFT JOIN c USING (bucket) LEFT JOIN p USING (bucket)
    ORDER BY m.bucket` }),
  k({ id: 'vgv_por_departamento_serie', label: 'VGV por departamento', shape: 'timeseries_pivot', outputColumns: ['bucket', 'prontos', 'lancamentos'], unit: 'BRL', template: `
    SELECT ${bucket('vendas', 'data_venda')} AS bucket,
      SUM(IF({vendas.departamento} = 'prontos', {vendas.valor_venda}, 0)) AS prontos,
      SUM(IF({vendas.departamento} = 'lancamentos', {vendas.valor_venda}, 0)) AS lancamentos
    FROM {vendas} WHERE {vendas.distrato} = FALSE AND ${band('vendas', 'data_venda')} GROUP BY 1 ORDER BY 1` }),
  k({ id: 'receita_por_departamento_serie', label: 'Receita por departamento', shape: 'timeseries_multi', outputColumns: ['bucket', 'lancamentos', 'prontos', 'locacao', 'servicos'], unit: 'BRL', template: `
    SELECT ${bucket('financeiro_lancamentos', 'competencia')} AS bucket,
      SUM(IF({financeiro_lancamentos.categoria} = 'comissao_venda_lancamento', {financeiro_lancamentos.valor}, 0)) AS lancamentos,
      SUM(IF({financeiro_lancamentos.categoria} = 'comissao_venda_pronto', {financeiro_lancamentos.valor}, 0)) AS prontos,
      SUM(IF({financeiro_lancamentos.categoria} IN ('taxa_administracao', 'taxa_intermediacao_locacao'), {financeiro_lancamentos.valor}, 0)) AS locacao,
      SUM(IF({financeiro_lancamentos.categoria} = 'servicos', {financeiro_lancamentos.valor}, 0)) AS servicos
    FROM {financeiro_lancamentos} WHERE {financeiro_lancamentos.natureza} = 'receita' AND ${band('financeiro_lancamentos', 'competencia')} GROUP BY 1 ORDER BY 1` }),
  k({ id: 'receita_por_fonte', label: 'Receita por fonte', shape: 'breakdown', outputColumns: ['fonte', 'value'], unit: 'BRL', template: `
    SELECT {financeiro_lancamentos.categoria} AS fonte, SUM({financeiro_lancamentos.valor}) AS value
    FROM {financeiro_lancamentos} WHERE {financeiro_lancamentos.natureza} = 'receita' AND ${monthEnd('financeiro_lancamentos', 'competencia')}
    GROUP BY 1 ORDER BY 2 DESC` }),
  k({ id: 'vgv_vs_ano_anterior', label: 'VGV: mês atual vs. mesmo mês do ano anterior', shape: 'timeseries', outputColumns: ['bucket', 'value'], unit: 'BRL', template: `
    SELECT ${bucket('vendas', 'data_venda')} AS bucket, SUM({vendas.valor_venda}) AS value
    FROM {vendas}
    WHERE {vendas.distrato} = FALSE AND ${bucket('vendas', 'data_venda')} IN (${monthRef('vendas', 'data_venda')}, DATE_SUB(${monthRef('vendas', 'data_venda')}, INTERVAL 12 MONTH))
    GROUP BY 1 ORDER BY 1` }),
  k({ id: 'inadimplencia_locacao_pct', scale: ['value'], label: 'Inadimplência de locação', description: 'Contratos ativos com aluguel em atraso na foto do mês.', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(COUNTIF({carteira_locacao_snapshot.dias_atraso} > 0), COUNT(1)) AS value
    FROM {carteira_locacao_snapshot} WHERE {carteira_locacao_snapshot.status} = 'ativo' AND ${pin('carteira_locacao_snapshot')}` }),
  k({ id: 'vacancia_carteira_pct', scale: ['value'], label: 'Vacância da carteira de locação', description: 'Imóveis para locação disponíveis sobre a carteira de locação na foto do mês.', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(COUNTIF({estoque_snapshot.status} = 'disponivel'), COUNT(1)) AS value
    FROM {estoque_snapshot} WHERE {estoque_snapshot.finalidade} != 'venda' AND ${pin('estoque_snapshot')}` }),
  k({ id: 'alertas_executivos', label: 'Alertas', description: 'Unidades fora do limite: meta de VGV < 70%, inadimplência > 5%, resposta ao lead > 60 min.', shape: 'rows', outputColumns: ['unidade', 'alerta', 'valor'], template: `
    WITH vgv AS (SELECT {vendas.unidade_id} AS unidade_id, SUM({vendas.valor_venda}) AS vgv FROM {vendas} WHERE {vendas.distrato} = FALSE AND ${monthEnd('vendas', 'data_venda')} GROUP BY 1),
         meta AS (${branchTarget('meta_vgv')}),
         inad AS (SELECT {carteira_locacao_snapshot.unidade_id} AS unidade_id, SAFE_DIVIDE(COUNTIF({carteira_locacao_snapshot.dias_atraso} > 0), COUNT(1)) AS pct FROM {carteira_locacao_snapshot} WHERE {carteira_locacao_snapshot.status} = 'ativo' AND ${pin('carteira_locacao_snapshot')} GROUP BY 1),
         sla AS (SELECT {leads.unidade_id} AS unidade_id, APPROX_QUANTILES({leads.minutos_primeiro_contato}, 2)[OFFSET(1)] AS mediana FROM {leads} WHERE {leads.minutos_primeiro_contato} IS NOT NULL AND ${monthEnd('leads', 'data_criacao')} GROUP BY 1),
         u AS (SELECT {unidades.unidade_id} AS unidade_id, {unidades.nome} AS nome FROM {unidades})
    SELECT u.nome AS unidade, 'Meta de VGV abaixo de 70% (atingido, %)' AS alerta, ROUND(100 * SAFE_DIVIDE(COALESCE(vgv.vgv, 0), meta.meta), 1) AS valor FROM meta JOIN u USING (unidade_id) LEFT JOIN vgv USING (unidade_id) WHERE SAFE_DIVIDE(COALESCE(vgv.vgv, 0), meta.meta) < 0.7
    UNION ALL SELECT u.nome, 'Inadimplência de locação acima de 5% (%)', ROUND(100 * pct, 1) FROM inad JOIN u USING (unidade_id) WHERE pct > 0.05
    UNION ALL SELECT u.nome, 'Tempo de resposta ao lead acima de 60 min (min)', mediana FROM sla JOIN u USING (unidade_id) WHERE mediana > 60
    ORDER BY 1, 2` }),

  k({ id: 'vgv_serie', label: 'VGV mensal', shape: 'timeseries', outputColumns: ['bucket', 'value'], unit: 'BRL', template: `
    SELECT ${bucket('vendas', 'data_venda')} AS bucket, SUM({vendas.valor_venda}) AS value FROM {vendas} WHERE {vendas.distrato} = FALSE AND ${band('vendas', 'data_venda')} GROUP BY 1 ORDER BY 1` }),
  // ── A2. Comparativo de Unidades ────────────────────────────────────────
  k({ id: 'ranking_unidades', label: 'Ranking de unidades', shape: 'rows', outputColumns: ['unidade', 'vgv', 'vendas', 'locacoes', 'captacoes', 'leads', 'conversao_pct', 'receita', 'margem_pct', 'atingimento_pct'], template: `
    WITH u AS (SELECT {unidades.unidade_id} AS unidade_id, {unidades.nome} AS nome FROM {unidades}),
         v AS (SELECT {vendas.unidade_id} AS unidade_id, SUM({vendas.valor_venda}) AS vgv, COUNT(1) AS vendas FROM {vendas} WHERE {vendas.distrato} = FALSE AND ${monthEnd('vendas', 'data_venda')} GROUP BY 1),
         c AS (SELECT {contratos_locacao.unidade_id} AS unidade_id, COUNT(1) AS locacoes FROM {contratos_locacao} WHERE ${monthEnd('contratos_locacao', 'data_inicio')} GROUP BY 1),
         p AS (SELECT {imoveis.unidade_id} AS unidade_id, COUNT(1) AS captacoes FROM {imoveis} WHERE ${monthEnd('imoveis', 'data_captacao')} GROUP BY 1),
         l AS (SELECT {leads.unidade_id} AS unidade_id, COUNT(1) AS leads, COUNTIF({leads.status} = 'ganho') AS ganhos FROM {leads} WHERE ${monthEnd('leads', 'data_criacao')} GROUP BY 1),
         f AS (SELECT {financeiro_lancamentos.unidade_id} AS unidade_id, SUM(IF({financeiro_lancamentos.natureza} = 'receita', {financeiro_lancamentos.valor}, 0)) AS receita, SUM(IF({financeiro_lancamentos.natureza} = 'despesa', {financeiro_lancamentos.valor}, 0)) AS despesa FROM {financeiro_lancamentos} WHERE ${monthEnd('financeiro_lancamentos', 'competencia')} GROUP BY 1),
         m AS (${branchTarget('meta_vgv')})
    SELECT u.nome AS unidade, COALESCE(v.vgv, 0) AS vgv, COALESCE(v.vendas, 0) AS vendas, COALESCE(c.locacoes, 0) AS locacoes, COALESCE(p.captacoes, 0) AS captacoes, COALESCE(l.leads, 0) AS leads,
           SAFE_DIVIDE(l.ganhos, l.leads) AS conversao_pct, COALESCE(f.receita, 0) AS receita, SAFE_DIVIDE(f.receita - f.despesa, f.receita) AS margem_pct, SAFE_DIVIDE(v.vgv, m.meta) AS atingimento_pct
    FROM u LEFT JOIN v USING (unidade_id) LEFT JOIN c USING (unidade_id) LEFT JOIN p USING (unidade_id) LEFT JOIN l USING (unidade_id) LEFT JOIN f USING (unidade_id) LEFT JOIN m USING (unidade_id)
    ORDER BY vgv DESC` }),
  k({ id: 'vgv_por_unidade', label: 'VGV por unidade', shape: 'breakdown', outputColumns: ['unidade', 'value'], unit: 'BRL', template: `
    WITH v AS (SELECT {vendas.unidade_id} AS unidade_id, SUM({vendas.valor_venda}) AS vgv FROM {vendas} WHERE {vendas.distrato} = FALSE AND ${monthEnd('vendas', 'data_venda')} GROUP BY 1)
    SELECT u.{unidades.nome} AS unidade, COALESCE(v.vgv, 0) AS value FROM {unidades} u LEFT JOIN v ON v.unidade_id = u.{unidades.unidade_id} ORDER BY 2 DESC` }),
  k({ id: 'receita_por_unidade', label: 'Receita por unidade', shape: 'breakdown', outputColumns: ['unidade', 'value'], unit: 'BRL', template: `
    WITH f AS (SELECT {financeiro_lancamentos.unidade_id} AS unidade_id, SUM({financeiro_lancamentos.valor}) AS receita FROM {financeiro_lancamentos} WHERE {financeiro_lancamentos.natureza} = 'receita' AND ${monthEnd('financeiro_lancamentos', 'competencia')} GROUP BY 1)
    SELECT u.{unidades.nome} AS unidade, COALESCE(f.receita, 0) AS value FROM {unidades} u LEFT JOIN f ON f.unidade_id = u.{unidades.unidade_id} ORDER BY 2 DESC` }),
  k({ id: 'margem_por_unidade', scale: ['value'], label: 'Margem por unidade', shape: 'breakdown', outputColumns: ['unidade', 'value'], unit: '%', template: `
    SELECT u.{unidades.nome} AS unidade,
      SAFE_DIVIDE(SUM(IF(f.{financeiro_lancamentos.natureza} = 'receita', f.{financeiro_lancamentos.valor}, 0)) - SUM(IF(f.{financeiro_lancamentos.natureza} = 'despesa', f.{financeiro_lancamentos.valor}, 0)), SUM(IF(f.{financeiro_lancamentos.natureza} = 'receita', f.{financeiro_lancamentos.valor}, 0))) AS value
    FROM {unidades} u JOIN {financeiro_lancamentos} f ON f.{financeiro_lancamentos.unidade_id} = u.{unidades.unidade_id}
    WHERE ${monthEnd('financeiro_lancamentos', 'competencia').replace('{financeiro_lancamentos.competencia}', 'f.{financeiro_lancamentos.competencia}')}
    GROUP BY 1 ORDER BY 2 DESC` }),
  k({ id: 'metas_por_unidade', label: 'Metas de VGV por unidade', shape: 'targets', outputColumns: ['label', 'value', 'target'], unit: 'BRL', template: `
    WITH v AS (SELECT {vendas.unidade_id} AS unidade_id, SUM({vendas.valor_venda}) AS vgv FROM {vendas} WHERE {vendas.distrato} = FALSE AND ${monthEnd('vendas', 'data_venda')} GROUP BY 1),
         m AS (${branchTarget('meta_vgv')})
    SELECT u.{unidades.nome} AS label, COALESCE(v.vgv, 0) AS value, m.meta AS target
    FROM m JOIN {unidades} u ON u.{unidades.unidade_id} = m.unidade_id LEFT JOIN v ON v.unidade_id = m.unidade_id
    ORDER BY target DESC` }),
  k({ id: 'vgv_unidade_x_mes', label: 'VGV por unidade e mês', shape: 'matrix', outputColumns: ['row', 'col', 'value'], unit: 'BRL', template: `
    SELECT u.{unidades.nome} AS row, ${monthLabel('v.{vendas.data_venda}')} AS col, SUM(v.{vendas.valor_venda}) AS value
    FROM {vendas} v JOIN {unidades} u ON u.{unidades.unidade_id} = v.{vendas.unidade_id}
    WHERE v.{vendas.distrato} = FALSE AND ${window12('vendas', 'data_venda').replace('{vendas.data_venda} >=', 'v.{vendas.data_venda} >=')}
    GROUP BY 1, 2 ORDER BY 1, 2` }),
  k({ id: 'unidades_leads_x_conversao', scale: ['y'], label: 'Unidades: leads × conversão', shape: 'points', outputColumns: ['x', 'y', 'size', 'group'], template: `
    WITH l AS (SELECT {leads.unidade_id} AS unidade_id, COUNT(1) AS leads, COUNTIF({leads.status} = 'ganho') AS ganhos FROM {leads} WHERE ${window12('leads', 'data_criacao')} GROUP BY 1),
         v AS (SELECT {vendas.unidade_id} AS unidade_id, SUM({vendas.valor_venda}) AS vgv FROM {vendas} WHERE {vendas.distrato} = FALSE AND ${window12('vendas', 'data_venda')} GROUP BY 1)
    SELECT l.leads AS x, SAFE_DIVIDE(l.ganhos, l.leads) AS y, COALESCE(v.vgv, 0) AS size, u.{unidades.nome} AS \`group\`
    FROM l JOIN {unidades} u ON u.{unidades.unidade_id} = l.unidade_id LEFT JOIN v ON v.unidade_id = l.unidade_id` }),
  k({ id: 'ticket_por_unidade_dist', label: 'Ticket de venda por unidade', shape: 'distribution', outputColumns: ['grupo', 'min', 'q1', 'mediana', 'q3', 'max'], unit: 'BRL', template: `
    SELECT u.{unidades.nome} AS grupo, ${quartiles('v.{vendas.valor_venda}')}
    FROM {vendas} v JOIN {unidades} u ON u.{unidades.unidade_id} = v.{vendas.unidade_id}
    WHERE v.{vendas.distrato} = FALSE AND ${window12('vendas', 'data_venda').replace('{vendas.data_venda} >=', 'v.{vendas.data_venda} >=')}
    GROUP BY 1 ORDER BY mediana DESC` }),
  k({ id: 'carteira_locacao_por_unidade', label: 'Carteira de locação por unidade', shape: 'breakdown', outputColumns: ['unidade', 'value'], unit: 'un', template: `
    SELECT u.{unidades.nome} AS unidade, COUNT(1) AS value
    FROM {carteira_locacao_snapshot} s JOIN {unidades} u ON u.{unidades.unidade_id} = s.{carteira_locacao_snapshot.unidade_id}
    WHERE s.{carteira_locacao_snapshot.status} = 'ativo' AND ${pin('carteira_locacao_snapshot').replace('{carteira_locacao_snapshot.data_base_report} =', 's.{carteira_locacao_snapshot.data_base_report} =')}
    GROUP BY 1 ORDER BY 2 DESC` }),

  // ── A3. Metas & Resultados ─────────────────────────────────────────────
  k({ id: 'metas_consolidadas', label: 'Metas consolidadas do mês', shape: 'targets', outputColumns: ['label', 'value', 'target'], template: `
    WITH m AS (SELECT SUM({metas.meta_vgv}) AS vgv, SUM({metas.meta_vendas}) AS vendas, SUM({metas.meta_locacoes}) AS locacoes, SUM({metas.meta_captacoes}) AS captacoes, SUM({metas.meta_leads}) AS leads, SUM({metas.meta_receita}) AS receita
                   FROM {metas} WHERE {metas.departamento_id} IS NULL AND {metas.corretor_id} IS NULL AND ${monthEnd('metas', 'competencia')}),
         v AS (SELECT SUM({vendas.valor_venda}) AS vgv, COUNT(1) AS vendas FROM {vendas} WHERE {vendas.distrato} = FALSE AND ${monthEnd('vendas', 'data_venda')}),
         c AS (SELECT COUNT(1) AS locacoes FROM {contratos_locacao} WHERE ${monthEnd('contratos_locacao', 'data_inicio')}),
         p AS (SELECT COUNT(1) AS captacoes FROM {imoveis} WHERE ${monthEnd('imoveis', 'data_captacao')}),
         l AS (SELECT COUNT(1) AS leads FROM {leads} WHERE ${monthEnd('leads', 'data_criacao')}),
         r AS (SELECT SUM({financeiro_lancamentos.valor}) AS receita FROM {financeiro_lancamentos} WHERE {financeiro_lancamentos.natureza} = 'receita' AND ${monthEnd('financeiro_lancamentos', 'competencia')})
    SELECT 'VGV' AS label, v.vgv AS value, m.vgv AS target FROM m, v
    UNION ALL SELECT 'Vendas', v.vendas, m.vendas FROM m, v
    UNION ALL SELECT 'Locações', c.locacoes, m.locacoes FROM m, c
    UNION ALL SELECT 'Captações', p.captacoes, m.captacoes FROM m, p
    UNION ALL SELECT 'Leads', l.leads, m.leads FROM m, l
    UNION ALL SELECT 'Receita', r.receita, m.receita FROM m, r` }),
  k({ id: 'vgv_realizado_vs_meta_serie', label: 'VGV realizado vs. meta', shape: 'timeseries_multi', outputColumns: ['bucket', 'realizado', 'meta'], unit: 'BRL', template: `
    WITH v AS (SELECT ${bucket('vendas', 'data_venda')} AS bucket, SUM({vendas.valor_venda}) AS realizado FROM {vendas} WHERE {vendas.distrato} = FALSE AND ${band('vendas', 'data_venda')} GROUP BY 1),
         m AS (SELECT ${bucket('metas', 'competencia')} AS bucket, SUM({metas.meta_vgv}) AS meta FROM {metas} WHERE {metas.departamento_id} IS NULL AND {metas.corretor_id} IS NULL AND ${band('metas', 'competencia')} GROUP BY 1)
    SELECT m.bucket, COALESCE(v.realizado, 0) AS realizado, m.meta FROM m LEFT JOIN v USING (bucket) ORDER BY 1` }),
  k({ id: 'receita_realizada_vs_meta_serie', label: 'Receita realizada vs. meta', shape: 'timeseries_multi', outputColumns: ['bucket', 'realizado', 'meta'], unit: 'BRL', template: `
    WITH r AS (SELECT ${bucket('financeiro_lancamentos', 'competencia')} AS bucket, SUM({financeiro_lancamentos.valor}) AS realizado FROM {financeiro_lancamentos} WHERE {financeiro_lancamentos.natureza} = 'receita' AND ${band('financeiro_lancamentos', 'competencia')} GROUP BY 1),
         m AS (SELECT ${bucket('metas', 'competencia')} AS bucket, SUM({metas.meta_receita}) AS meta FROM {metas} WHERE {metas.departamento_id} IS NULL AND {metas.corretor_id} IS NULL AND ${band('metas', 'competencia')} GROUP BY 1)
    SELECT m.bucket, COALESCE(r.realizado, 0) AS realizado, m.meta FROM m LEFT JOIN r USING (bucket) ORDER BY 1` }),
  k({ id: 'atingimento_por_departamento', label: 'Atingimento por departamento', shape: 'rows', outputColumns: ['departamento', 'meta', 'realizado', 'atingimento_pct', 'gap'], unit: 'BRL', template: `
    WITH m AS (SELECT d.{departamentos.nome} AS departamento, SUM(mt.{metas.meta_vgv}) AS meta
               FROM {metas} mt JOIN {departamentos} d ON d.{departamentos.departamento_id} = mt.{metas.departamento_id}
               WHERE mt.{metas.corretor_id} IS NULL AND mt.{metas.meta_vgv} > 0 AND ${monthEnd('metas', 'competencia').replace('{metas.competencia}, MONTH) =', 'mt.{metas.competencia}, MONTH) =')} GROUP BY 1),
         v AS (SELECT IF({vendas.departamento} = 'prontos', 'Prontos', 'Lançamentos') AS departamento, SUM({vendas.valor_venda}) AS realizado FROM {vendas} WHERE {vendas.distrato} = FALSE AND ${monthEnd('vendas', 'data_venda')} GROUP BY 1)
    SELECT m.departamento, m.meta, COALESCE(v.realizado, 0) AS realizado, SAFE_DIVIDE(v.realizado, m.meta) AS atingimento_pct, COALESCE(v.realizado, 0) - m.meta AS gap
    FROM m LEFT JOIN v USING (departamento) ORDER BY atingimento_pct DESC` }),
  k({ id: 'ponte_meta_vgv', label: 'Ponte meta → realizado (VGV)', description: 'Meta consolidada e o desvio de cada unidade; a barra final acumulada é o realizado.', shape: 'breakdown', outputColumns: ['bucket', 'value'], unit: 'BRL', template: `
    WITH v AS (SELECT {vendas.unidade_id} AS unidade_id, SUM({vendas.valor_venda}) AS vgv FROM {vendas} WHERE {vendas.distrato} = FALSE AND ${monthEnd('vendas', 'data_venda')} GROUP BY 1),
         m AS (${branchTarget('meta_vgv')}),
         d AS (SELECT u.{unidades.nome} AS nome, COALESCE(v.vgv, 0) - m.meta AS desvio, m.meta AS meta, COALESCE(v.vgv, 0) AS vgv FROM m JOIN {unidades} u ON u.{unidades.unidade_id} = m.unidade_id LEFT JOIN v ON v.unidade_id = m.unidade_id)
    SELECT 'Meta' AS bucket, SUM(meta) AS value, 0 AS ordem FROM d
    UNION ALL SELECT nome, desvio, 1 FROM d
    ORDER BY ordem, value` }),
  k({ id: 'forecast_vgv_mes', label: 'Forecast de VGV do mês', description: 'Run-rate: VGV até o último dia com venda, projetado para o mês inteiro.', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(SUM({vendas.valor_venda}), EXTRACT(DAY FROM MAX({vendas.data_venda}))) * EXTRACT(DAY FROM LAST_DAY(MAX({vendas.data_venda}))) AS value
    FROM {vendas} WHERE {vendas.distrato} = FALSE AND ${monthEnd('vendas', 'data_venda')}` }),
];
