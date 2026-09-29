/** Grupo F — Financeiro. */
import { sql, monthEnd, monthRef, band, bucket, window12 } from './_helpers.mjs';

const CAT = 'Financeiro';
const k = (o) => sql({ category: CAT, ...o });
const F = 'financeiro_lancamentos';
const MONTH = monthEnd(F, 'competencia');
const REVENUE = `{${F}.natureza} = 'receita'`;
const EXPENSE = `{${F}.natureza} = 'despesa'`;

export const metrics = [
  // ── F1. DRE Gerencial ──────────────────────────────────────────────────
  k({ id: 'fin_receita_bruta_mes', label: 'Receita bruta', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COALESCE(SUM({${F}.valor}), 0) AS value FROM {${F}} WHERE ${REVENUE} AND ${MONTH}` }),
  k({ id: 'fin_despesas_mes', label: 'Despesas', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COALESCE(SUM({${F}.valor}), 0) AS value FROM {${F}} WHERE ${EXPENSE} AND ${MONTH}` }),
  k({ id: 'fin_resultado_mes', label: 'Resultado', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SUM(IF(${REVENUE}, {${F}.valor}, -{${F}.valor})) AS value FROM {${F}} WHERE ${MONTH}` }),
  k({ id: 'fin_margem_pct', label: 'Margem', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(SUM(IF(${REVENUE}, {${F}.valor}, -{${F}.valor})), SUM(IF(${REVENUE}, {${F}.valor}, 0))) AS value FROM {${F}} WHERE ${MONTH}` }),
  k({ id: 'fin_receita_recorrente_pct', label: 'Receita recorrente', description: 'Taxa de administração sobre a receita total.', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(SUM(IF({${F}.categoria} = 'taxa_administracao', {${F}.valor}, 0)), SUM({${F}.valor})) AS value FROM {${F}} WHERE ${REVENUE} AND ${MONTH}` }),
  k({ id: 'fin_despesa_pessoal_pct', label: 'Pessoal e comissões sobre a receita', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(SUM(IF({${F}.categoria} IN ('pessoal', 'comissao_corretor'), {${F}.valor}, 0)), SUM(IF(${REVENUE}, {${F}.valor}, 0))) AS value FROM {${F}} WHERE ${MONTH}` }),
  k({ id: 'fin_dre_cascata', label: 'DRE em cascata', shape: 'breakdown', outputColumns: ['bucket', 'value'], unit: 'BRL', template: `
    WITH f AS (SELECT {${F}.natureza} AS natureza, {${F}.categoria} AS categoria, {${F}.valor} AS valor FROM {${F}} WHERE ${MONTH})
    SELECT 'Receita' AS bucket, SUM(IF(natureza = 'receita', valor, 0)) AS value, 0 AS ordem FROM f
    UNION ALL SELECT 'Comissões de corretores', -SUM(IF(categoria = 'comissao_corretor', valor, 0)), 1 FROM f
    UNION ALL SELECT 'Pessoal', -SUM(IF(categoria = 'pessoal', valor, 0)), 2 FROM f
    UNION ALL SELECT 'Marketing', -SUM(IF(categoria = 'marketing', valor, 0)), 3 FROM f
    UNION ALL SELECT 'Ocupação', -SUM(IF(categoria = 'ocupacao', valor, 0)), 4 FROM f
    UNION ALL SELECT 'Tecnologia', -SUM(IF(categoria = 'tecnologia', valor, 0)), 5 FROM f
    UNION ALL SELECT 'Administrativo', -SUM(IF(categoria = 'administrativo', valor, 0)), 6 FROM f
    UNION ALL SELECT 'Impostos', -SUM(IF(categoria = 'impostos', valor, 0)), 7 FROM f
    ORDER BY ordem` }),
  k({ id: 'fin_receita_por_categoria_serie', label: 'Receita por categoria', shape: 'timeseries_pivot', outputColumns: ['bucket', 'comissao_pronto', 'comissao_lancamento', 'taxa_administracao', 'intermediacao_locacao', 'servicos'], unit: 'BRL', template: `
    SELECT ${bucket(F, 'competencia')} AS bucket,
      SUM(IF({${F}.categoria} = 'comissao_venda_pronto', {${F}.valor}, 0)) AS comissao_pronto, SUM(IF({${F}.categoria} = 'comissao_venda_lancamento', {${F}.valor}, 0)) AS comissao_lancamento,
      SUM(IF({${F}.categoria} = 'taxa_administracao', {${F}.valor}, 0)) AS taxa_administracao, SUM(IF({${F}.categoria} = 'taxa_intermediacao_locacao', {${F}.valor}, 0)) AS intermediacao_locacao,
      SUM(IF({${F}.categoria} = 'servicos', {${F}.valor}, 0)) AS servicos
    FROM {${F}} WHERE ${REVENUE} AND ${band(F, 'competencia')} GROUP BY 1 ORDER BY 1` }),
  k({ id: 'fin_despesa_por_categoria_serie', label: 'Despesa por categoria', shape: 'timeseries_pivot', outputColumns: ['bucket', 'pessoal', 'comissao_corretor', 'marketing', 'ocupacao', 'tecnologia', 'administrativo', 'impostos'], unit: 'BRL', template: `
    SELECT ${bucket(F, 'competencia')} AS bucket,
      SUM(IF({${F}.categoria} = 'pessoal', {${F}.valor}, 0)) AS pessoal, SUM(IF({${F}.categoria} = 'comissao_corretor', {${F}.valor}, 0)) AS comissao_corretor, SUM(IF({${F}.categoria} = 'marketing', {${F}.valor}, 0)) AS marketing,
      SUM(IF({${F}.categoria} = 'ocupacao', {${F}.valor}, 0)) AS ocupacao, SUM(IF({${F}.categoria} = 'tecnologia', {${F}.valor}, 0)) AS tecnologia, SUM(IF({${F}.categoria} = 'administrativo', {${F}.valor}, 0)) AS administrativo, SUM(IF({${F}.categoria} = 'impostos', {${F}.valor}, 0)) AS impostos
    FROM {${F}} WHERE ${EXPENSE} AND ${band(F, 'competencia')} GROUP BY 1 ORDER BY 1` }),
  k({ id: 'fin_resultado_serie', label: 'Receita, despesa e resultado', shape: 'timeseries_multi', outputColumns: ['bucket', 'receita', 'despesa', 'resultado'], unit: 'BRL', template: `
    SELECT ${bucket(F, 'competencia')} AS bucket, SUM(IF(${REVENUE}, {${F}.valor}, 0)) AS receita, SUM(IF(${EXPENSE}, {${F}.valor}, 0)) AS despesa, SUM(IF(${REVENUE}, {${F}.valor}, -{${F}.valor})) AS resultado
    FROM {${F}} WHERE ${band(F, 'competencia')} GROUP BY 1 ORDER BY 1` }),
  k({ id: 'fin_dre_por_unidade', label: 'DRE por unidade', shape: 'rows', outputColumns: ['unidade', 'receita', 'despesa', 'resultado', 'margem_pct', 'receita_por_corretor'], template: `
    WITH f AS (SELECT {${F}.unidade_id} AS unidade_id, SUM(IF(${REVENUE}, {${F}.valor}, 0)) AS receita, SUM(IF(${EXPENSE}, {${F}.valor}, 0)) AS despesa FROM {${F}} WHERE ${MONTH} GROUP BY 1),
         c AS (SELECT {corretores.unidade_id} AS unidade_id, COUNTIF({corretores.ativo} AND {corretores.cargo} = 'corretor') AS corretores FROM {corretores} GROUP BY 1)
    SELECT u.{unidades.nome} AS unidade, f.receita, f.despesa, f.receita - f.despesa AS resultado, SAFE_DIVIDE(f.receita - f.despesa, f.receita) AS margem_pct, SAFE_DIVIDE(f.receita, c.corretores) AS receita_por_corretor
    FROM f JOIN {unidades} u ON u.{unidades.unidade_id} = f.unidade_id LEFT JOIN c ON c.unidade_id = f.unidade_id ORDER BY resultado DESC` }),
  k({ id: 'fin_dre_por_departamento', label: 'DRE por departamento', shape: 'rows', outputColumns: ['departamento', 'receita', 'despesa', 'resultado', 'margem_pct'], template: `
    SELECT d.{departamentos.nome} AS departamento, SUM(IF(f.{${F}.natureza} = 'receita', f.{${F}.valor}, 0)) AS receita, SUM(IF(f.{${F}.natureza} = 'despesa', f.{${F}.valor}, 0)) AS despesa,
      SUM(IF(f.{${F}.natureza} = 'receita', f.{${F}.valor}, -f.{${F}.valor})) AS resultado, SAFE_DIVIDE(SUM(IF(f.{${F}.natureza} = 'receita', f.{${F}.valor}, -f.{${F}.valor})), SUM(IF(f.{${F}.natureza} = 'receita', f.{${F}.valor}, 0))) AS margem_pct
    FROM {${F}} f JOIN {departamentos} d ON d.{departamentos.departamento_id} = f.{${F}.departamento_id}
    WHERE ${MONTH.replace(`{${F}.competencia}, MONTH) =`, `f.{${F}.competencia}, MONTH) =`)}
    GROUP BY 1 ORDER BY resultado DESC` }),
  k({ id: 'fin_resultado_vs_mes_anterior', label: 'Resultado: mês vs. anterior', shape: 'timeseries', outputColumns: ['bucket', 'value'], unit: 'BRL', template: `
    SELECT ${bucket(F, 'competencia')} AS bucket, SUM(IF(${REVENUE}, {${F}.valor}, -{${F}.valor})) AS value FROM {${F}}
    WHERE ${bucket(F, 'competencia')} IN (${monthRef(F, 'competencia')}, DATE_SUB(${monthRef(F, 'competencia')}, INTERVAL 1 MONTH)) GROUP BY 1 ORDER BY 1` }),

  k({ id: 'fin_receita_serie', label: 'Receita mensal', shape: 'timeseries', outputColumns: ['bucket', 'value'], unit: 'BRL', template: `
    SELECT ${bucket('financeiro_lancamentos', 'competencia')} AS bucket, SUM({financeiro_lancamentos.valor}) AS value FROM {financeiro_lancamentos} WHERE ${REVENUE} AND ${band('financeiro_lancamentos', 'competencia')} GROUP BY 1 ORDER BY 1` }),
  // ── F2. Comissões ──────────────────────────────────────────────────────
  k({ id: 'com_a_receber_total', label: 'Comissões a receber', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COALESCE(SUM({vendas.comissao_imobiliaria}), 0) AS value FROM {vendas} WHERE {vendas.data_recebimento_comissao} IS NULL AND {vendas.distrato} = FALSE` }),
  k({ id: 'com_recebida_mes', label: 'Comissões recebidas no mês', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COALESCE(SUM({vendas.comissao_imobiliaria}), 0) AS value FROM {vendas} WHERE {vendas.data_recebimento_comissao} IS NOT NULL AND ${monthEnd('vendas', 'data_recebimento_comissao')}` }),
  k({ id: 'com_prazo_medio_recebimento_dias', label: 'Prazo médio de recebimento', unit: 'dias', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT AVG(DATE_DIFF({vendas.data_recebimento_comissao}, {vendas.data_venda}, DAY)) AS value FROM {vendas} WHERE {vendas.data_recebimento_comissao} IS NOT NULL AND ${monthEnd('vendas', 'data_recebimento_comissao')}` }),
  k({ id: 'com_a_pagar_corretores', label: 'Comissões a pagar a corretores', description: 'Comissão já recebida da venda e ainda não paga ao corretor.', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COALESCE(SUM({vendas.comissao_corretor}), 0) AS value FROM {vendas} WHERE {vendas.data_recebimento_comissao} IS NOT NULL AND {vendas.comissao_corretor_paga} = FALSE AND {vendas.distrato} = FALSE` }),
  k({ id: 'com_split_medio_corretor_pct', label: 'Split médio do corretor', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(SUM({vendas.comissao_corretor}), SUM({vendas.comissao_total})) AS value FROM {vendas} WHERE ${monthEnd('vendas', 'data_venda')}` }),
  k({ id: 'com_perda_por_distrato_mes', label: 'Comissão perdida por distrato', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COALESCE(SUM({vendas.comissao_imobiliaria}), 0) AS value FROM {vendas} WHERE {vendas.distrato} AND ${monthEnd('vendas', 'data_distrato')}` }),
  k({ id: 'com_aging_a_receber', label: 'Aging de comissões a receber', shape: 'breakdown', outputColumns: ['faixa', 'value'], unit: 'BRL', template: `
    SELECT CASE WHEN d <= 30 THEN '1. até 30 dias' WHEN d <= 60 THEN '2. 31–60' WHEN d <= 90 THEN '3. 61–90' ELSE '4. mais de 90' END AS faixa, SUM(v) AS value
    FROM (SELECT DATE_DIFF((SELECT MAX({vendas.data_venda}) FROM {vendas}), {vendas.data_venda}, DAY) AS d, {vendas.comissao_imobiliaria} AS v FROM {vendas} WHERE {vendas.data_recebimento_comissao} IS NULL AND {vendas.distrato} = FALSE)
    GROUP BY 1 ORDER BY 1` }),
  k({ id: 'com_a_receber_por_incorporadora', label: 'A receber por incorporadora', shape: 'breakdown', outputColumns: ['incorporadora', 'value'], unit: 'BRL', template: `
    SELECT e.{empreendimentos.incorporadora} AS incorporadora, SUM(v.{vendas.comissao_imobiliaria}) AS value
    FROM {vendas} v JOIN {empreendimentos} e ON e.{empreendimentos.empreendimento_id} = v.{vendas.empreendimento_id}
    WHERE v.{vendas.data_recebimento_comissao} IS NULL AND v.{vendas.distrato} = FALSE GROUP BY 1 ORDER BY 2 DESC` }),
  k({ id: 'com_pendentes', label: 'Comissões pendentes', shape: 'rows', outputColumns: ['venda', 'referencia', 'corretor', 'valor', 'dias', 'departamento'], template: `
    SELECT v.{vendas.venda_id} AS venda, COALESCE(e.{empreendimentos.nome}, v.{vendas.imovel_id}) AS referencia, c.{corretores.nome} AS corretor, v.{vendas.comissao_imobiliaria} AS valor,
      DATE_DIFF((SELECT MAX({vendas.data_venda}) FROM {vendas}), v.{vendas.data_venda}, DAY) AS dias, v.{vendas.departamento} AS departamento
    FROM {vendas} v LEFT JOIN {empreendimentos} e ON e.{empreendimentos.empreendimento_id} = v.{vendas.empreendimento_id} JOIN {corretores} c ON c.{corretores.corretor_id} = v.{vendas.corretor_id}
    WHERE v.{vendas.data_recebimento_comissao} IS NULL AND v.{vendas.distrato} = FALSE ORDER BY dias DESC LIMIT 300` }),
  k({ id: 'com_por_corretor_mes', label: 'Comissões por corretor', shape: 'rows', outputColumns: ['corretor', 'unidade', 'vendas', 'comissao_gerada', 'a_receber', 'paga'], template: `
    SELECT c.{corretores.nome} AS corretor, u.{unidades.nome} AS unidade, COUNT(1) AS vendas, SUM(v.{vendas.comissao_corretor}) AS comissao_gerada,
      SUM(IF(v.{vendas.comissao_corretor_paga}, 0, v.{vendas.comissao_corretor})) AS a_receber, SUM(IF(v.{vendas.comissao_corretor_paga}, v.{vendas.comissao_corretor}, 0)) AS paga
    FROM {vendas} v JOIN {corretores} c ON c.{corretores.corretor_id} = v.{vendas.corretor_id} JOIN {unidades} u ON u.{unidades.unidade_id} = v.{vendas.unidade_id}
    WHERE v.{vendas.distrato} = FALSE AND ${monthEnd('vendas', 'data_venda').replace('{vendas.data_venda}, MONTH) =', 'v.{vendas.data_venda}, MONTH) =')}
    GROUP BY 1, 2 ORDER BY comissao_gerada DESC LIMIT 100` }),

  // ── F3. Fluxo de Caixa & Recebíveis ────────────────────────────────────
  k({ id: 'cx_entradas_mes', label: 'Entradas realizadas', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COALESCE(SUM({${F}.valor}), 0) AS value FROM {${F}} WHERE ${REVENUE} AND {${F}.status} = 'realizado' AND ${MONTH}` }),
  k({ id: 'cx_saidas_mes', label: 'Saídas realizadas', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COALESCE(SUM({${F}.valor}), 0) AS value FROM {${F}} WHERE ${EXPENSE} AND {${F}.status} = 'realizado' AND ${MONTH}` }),
  k({ id: 'cx_saldo_mes', label: 'Saldo do mês', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SUM(IF(${REVENUE}, {${F}.valor}, -{${F}.valor})) AS value FROM {${F}} WHERE {${F}.status} = 'realizado' AND ${MONTH}` }),
  k({ id: 'cx_previsto_proximos_90', label: 'Previsto para os próximos 90 dias', description: 'Comissões a receber + 3 × taxa de administração mensal − 3 × despesas fixas.', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT (SELECT COALESCE(SUM({vendas.comissao_imobiliaria}), 0) FROM {vendas} WHERE {vendas.data_recebimento_comissao} IS NULL AND {vendas.distrato} = FALSE)
         + 3 * (SELECT COALESCE(SUM({${F}.valor}), 0) FROM {${F}} WHERE {${F}.categoria} = 'taxa_administracao' AND ${MONTH})
         - 3 * (SELECT COALESCE(SUM({${F}.valor}), 0) FROM {${F}} WHERE {${F}.categoria} IN ('pessoal', 'ocupacao', 'tecnologia', 'administrativo') AND ${MONTH}) AS value` }),
  k({ id: 'cx_realizado_vs_previsto_serie', label: 'Saldo realizado × projetado', shape: 'timeseries_multi', outputColumns: ['bucket', 'realizado', 'projetado'], unit: 'BRL', template: `
    WITH r AS (SELECT ${bucket(F, 'competencia')} AS bucket, SUM(IF(${REVENUE}, {${F}.valor}, -{${F}.valor})) AS realizado FROM {${F}} WHERE ${band(F, 'competencia')} GROUP BY 1),
         m AS (SELECT AVG(realizado) AS media FROM (SELECT realizado FROM r ORDER BY bucket DESC LIMIT 3))
    SELECT bucket, realizado, NULL AS projetado FROM r
    UNION ALL SELECT DATE_ADD(MAX(bucket), INTERVAL n MONTH), NULL, (SELECT media FROM m) FROM r, UNNEST([1, 2, 3]) AS n GROUP BY n
    ORDER BY bucket` }),
  k({ id: 'cx_entradas_por_fonte_serie', label: 'Entradas por fonte', shape: 'timeseries_pivot', outputColumns: ['bucket', 'vendas', 'locacao', 'servicos'], unit: 'BRL', template: `
    SELECT ${bucket(F, 'competencia')} AS bucket,
      SUM(IF({${F}.categoria} IN ('comissao_venda_pronto', 'comissao_venda_lancamento'), {${F}.valor}, 0)) AS vendas,
      SUM(IF({${F}.categoria} IN ('taxa_administracao', 'taxa_intermediacao_locacao'), {${F}.valor}, 0)) AS locacao,
      SUM(IF({${F}.categoria} = 'servicos', {${F}.valor}, 0)) AS servicos
    FROM {${F}} WHERE ${REVENUE} AND {${F}.status} = 'realizado' AND ${band(F, 'competencia')} GROUP BY 1 ORDER BY 1` }),
  k({ id: 'cx_contas_a_pagar_vencidas', label: 'Contas a pagar vencidas', shape: 'rows', outputColumns: ['lancamento', 'unidade', 'categoria', 'data_vencimento', 'valor', 'dias'], template: `
    SELECT f.{${F}.lancamento_id} AS lancamento, u.{unidades.nome} AS unidade, f.{${F}.categoria} AS categoria, f.{${F}.data_vencimento} AS data_vencimento, f.{${F}.valor} AS valor,
      DATE_DIFF((SELECT MAX({${F}.data_vencimento}) FROM {${F}}), f.{${F}.data_vencimento}, DAY) AS dias
    FROM {${F}} f JOIN {unidades} u ON u.{unidades.unidade_id} = f.{${F}.unidade_id}
    WHERE f.{${F}.status} = 'atrasado' ORDER BY dias DESC LIMIT 200` }),
];
