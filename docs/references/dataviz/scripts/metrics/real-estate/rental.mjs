/** Grupo D — Locação. */
import { sql, monthEnd, monthRef, pin, band, bucket, window12, quartiles } from './_helpers.mjs';

const CAT = 'Locação';
const k = (o) => sql({ category: CAT, ...o });
const S = 'carteira_locacao_snapshot';
const ACTIVE_LEASES = `{${S}.status} = 'ativo' AND ${pin(S)}`;
const INVOICE_MONTH = monthEnd('faturas_locacao', 'competencia');
const OVERDUE_INVOICE = `{faturas_locacao.status} IN ('em_atraso', 'inadimplente', 'acordo')`;

export const metrics = [
  // ── D1. Painel de Locação ──────────────────────────────────────────────
  k({ id: 'loc_contratos_ativos', label: 'Contratos ativos', unit: 'un', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COUNT(1) AS value FROM {${S}} WHERE ${ACTIVE_LEASES}` }),
  k({ id: 'loc_valor_administrado_mes', label: 'Aluguel administrado', description: 'Soma dos aluguéis dos contratos ativos na foto do mês.', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COALESCE(SUM({${S}.valor_aluguel}), 0) AS value FROM {${S}} WHERE ${ACTIVE_LEASES}` }),
  k({ id: 'loc_receita_taxa_adm_mes', label: 'Receita de taxa de administração', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COALESCE(SUM({${S}.taxa_adm_valor}), 0) AS value FROM {${S}} WHERE ${ACTIVE_LEASES}` }),
  k({ id: 'loc_taxa_adm_media_pct', label: 'Taxa de administração média', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(SUM({${S}.taxa_adm_valor}), SUM({${S}.valor_aluguel})) AS value FROM {${S}} WHERE ${ACTIVE_LEASES}` }),
  k({ id: 'loc_novos_contratos_mes', label: 'Novos contratos no mês', unit: 'un', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COUNT(1) AS value FROM {contratos_locacao} WHERE ${monthEnd('contratos_locacao', 'data_inicio')}` }),
  k({ id: 'loc_receita_intermediacao_mes', label: 'Receita de intermediação', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COALESCE(SUM({contratos_locacao.taxa_intermediacao}), 0) AS value FROM {contratos_locacao} WHERE ${monthEnd('contratos_locacao', 'data_inicio')}` }),
  k({ id: 'loc_aluguel_medio', label: 'Aluguel médio', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT AVG({${S}.valor_aluguel}) AS value FROM {${S}} WHERE ${ACTIVE_LEASES}` }),
  k({ id: 'loc_tempo_medio_para_alugar', label: 'Tempo médio para alugar', unit: 'dias', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT AVG({contratos_locacao.dias_para_alugar}) AS value FROM {contratos_locacao} WHERE ${monthEnd('contratos_locacao', 'data_inicio')}` }),
  k({ id: 'loc_atingimento_meta_pct', scale: ['value'], label: 'Atingimento da meta de locações', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE((SELECT COUNT(1) FROM {contratos_locacao} WHERE ${monthEnd('contratos_locacao', 'data_inicio')}),
      (SELECT SUM({metas.meta_locacoes}) FROM {metas} WHERE {metas.departamento_id} IS NULL AND {metas.corretor_id} IS NULL AND ${monthEnd('metas', 'competencia')})) AS value` }),
  k({ id: 'loc_inadimplencia_pct', scale: ['value'], label: 'Inadimplência', description: 'Contratos ativos com atraso na foto do mês. Média nacional ≈ 3,2%.', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(COUNTIF({${S}.dias_atraso} > 0), COUNT(1)) AS value FROM {${S}} WHERE ${ACTIVE_LEASES}` }),
  k({ id: 'loc_vacancia_pct', scale: ['value'], label: 'Vacância', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(COUNTIF({estoque_snapshot.status} = 'disponivel'), COUNT(1)) AS value FROM {estoque_snapshot} WHERE {estoque_snapshot.finalidade} != 'venda' AND ${pin('estoque_snapshot')}` }),
  k({ id: 'loc_carteira_serie', label: 'Carteira: ativos, novos e encerrados', shape: 'timeseries_multi', outputColumns: ['bucket', 'ativos', 'novos', 'encerrados'], unit: 'un', template: `
    WITH a AS (SELECT {${S}.data_base_report} AS bucket, COUNT(1) AS ativos FROM {${S}} WHERE {${S}.status} = 'ativo' AND ${band(S, 'data_base_report')} GROUP BY 1),
         n AS (SELECT LAST_DAY(${bucket('contratos_locacao', 'data_inicio')}) AS bucket, COUNT(1) AS novos FROM {contratos_locacao} WHERE ${band('contratos_locacao', 'data_inicio')} GROUP BY 1),
         e AS (SELECT LAST_DAY(${bucket('contratos_locacao', 'data_encerramento')}) AS bucket, COUNT(1) AS encerrados FROM {contratos_locacao} WHERE {contratos_locacao.data_encerramento} IS NOT NULL AND ${band('contratos_locacao', 'data_encerramento')} GROUP BY 1)
    SELECT a.bucket, a.ativos, COALESCE(n.novos, 0) AS novos, COALESCE(e.encerrados, 0) AS encerrados FROM a LEFT JOIN n USING (bucket) LEFT JOIN e USING (bucket) ORDER BY 1` }),
  k({ id: 'loc_receita_recorrente_serie', label: 'Receita recorrente mensal', shape: 'timeseries', outputColumns: ['bucket', 'value'], unit: 'BRL', template: `
    SELECT {${S}.data_base_report} AS bucket, SUM({${S}.taxa_adm_valor}) AS value FROM {${S}} WHERE {${S}.status} = 'ativo' AND ${band(S, 'data_base_report')} GROUP BY 1 ORDER BY 1` }),
  k({ id: 'loc_mix_garantia', label: 'Contratos por garantia', shape: 'breakdown', outputColumns: ['garantia', 'value'], unit: 'un', template: `
    SELECT {${S}.garantia} AS garantia, COUNT(1) AS value FROM {${S}} WHERE ${ACTIVE_LEASES} GROUP BY 1 ORDER BY 2 DESC` }),
  k({ id: 'loc_contratos_por_tipo', label: 'Contratos por tipo de imóvel', shape: 'breakdown', outputColumns: ['tipo', 'value'], unit: 'un', template: `
    SELECT {${S}.tipo} AS tipo, COUNT(1) AS value FROM {${S}} WHERE ${ACTIVE_LEASES} GROUP BY 1 ORDER BY 2 DESC` }),
  k({ id: 'loc_contratos_por_unidade', label: 'Contratos por unidade', shape: 'breakdown', outputColumns: ['unidade', 'value'], unit: 'un', template: `
    SELECT u.{unidades.nome} AS unidade, COUNT(1) AS value FROM {${S}} s JOIN {unidades} u ON u.{unidades.unidade_id} = s.{${S}.unidade_id}
    WHERE s.{${S}.status} = 'ativo' AND ${pin(S).replace(`{${S}.data_base_report} =`, `s.{${S}.data_base_report} =`)} GROUP BY 1 ORDER BY 2 DESC` }),

  // ── D2. Carteira Administrada ──────────────────────────────────────────
  k({ id: 'loc_churn_contratos_pct', label: 'Churn de contratos', description: 'Encerrados no mês sobre ativos no início do mês.', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(
      (SELECT COUNT(1) FROM {contratos_locacao} WHERE {contratos_locacao.data_encerramento} IS NOT NULL AND ${monthEnd('contratos_locacao', 'data_encerramento')}),
      (SELECT COUNT(1) FROM {${S}} WHERE {${S}.status} = 'ativo' AND {${S}.data_base_report} = LAST_DAY(DATE_SUB(${monthRef('contratos_locacao', 'data_encerramento')}, INTERVAL 1 MONTH)))) AS value` }),
  k({ id: 'loc_churn_proprietarios_pct', label: 'Churn de proprietários', description: 'Imóveis de locação retirados da administração no mês sobre a carteira.', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(
      (SELECT COUNT(1) FROM {contratos_locacao} WHERE {contratos_locacao.motivo_encerramento} IN ('proprietario_retirou', 'venda_imovel') AND ${monthEnd('contratos_locacao', 'data_encerramento')}),
      (SELECT COUNT(1) FROM {${S}} WHERE ${ACTIVE_LEASES})) AS value` }),
  k({ id: 'loc_renovacao_pct', label: 'Taxa de renovação', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(COUNTIF({contratos_locacao.renovado}), COUNTIF({contratos_locacao.renovado} OR {contratos_locacao.motivo_encerramento} = 'fim_contrato')) AS value
    FROM {contratos_locacao} WHERE {contratos_locacao.data_fim_prevista} <= (SELECT MAX({${S}.data_base_report}) FROM {${S}} WHERE {filter.ate:${S}.data_base_report}) OR {contratos_locacao.renovado}` }),
  k({ id: 'loc_duracao_media_meses', label: 'Duração média dos contratos', unit: 'meses', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT AVG({${S}.meses_de_contrato}) AS value FROM {${S}} WHERE ${ACTIVE_LEASES}` }),
  k({ id: 'loc_valor_carteira_estimado', label: 'Valor estimado da carteira', description: '12 × receita mensal de taxa de administração (referência de mercado: 10 a 15×).', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT 12 * COALESCE(SUM({${S}.taxa_adm_valor}), 0) AS value FROM {${S}} WHERE ${ACTIVE_LEASES}` }),
  k({ id: 'loc_encerramentos_por_motivo', label: 'Encerramentos por motivo', shape: 'breakdown', outputColumns: ['motivo', 'value'], unit: 'un', template: `
    SELECT {contratos_locacao.motivo_encerramento} AS motivo, COUNT(1) AS value FROM {contratos_locacao} WHERE {contratos_locacao.data_encerramento} IS NOT NULL AND ${window12('contratos_locacao', 'data_encerramento')} GROUP BY 1 ORDER BY 2 DESC` }),
  k({ id: 'loc_migracao_status_contratos', label: 'Migração de status dos contratos', shape: 'flow', outputColumns: ['origem', 'destino', 'value'], template: `
    WITH c AS (SELECT {contratos_locacao.status} AS status, {contratos_locacao.renovado} AS r FROM {contratos_locacao} WHERE {contratos_locacao.data_inicio} <= (SELECT MAX({${S}.data_base_report}) FROM {${S}} WHERE {filter.ate:${S}.data_base_report}))
    SELECT 'Contratos' AS origem, 'Ativos' AS destino, COUNTIF(status = 'ativo') AS value FROM c
    UNION ALL SELECT 'Contratos', 'Renovados', COUNTIF(r) FROM c
    UNION ALL SELECT 'Contratos', 'Rescindidos', COUNTIF(status = 'rescindido' AND NOT r) FROM c
    UNION ALL SELECT 'Contratos', 'Encerrados no prazo', COUNTIF(status = 'encerrado' AND NOT r) FROM c
    UNION ALL SELECT 'Renovados', 'Ativos (2º ciclo)', COUNTIF(r AND status = 'renovado') FROM c
    UNION ALL SELECT 'Renovados', 'Encerrados depois', COUNTIF(r AND status IN ('encerrado', 'rescindido')) FROM c` }),
  k({ id: 'loc_distribuicao_aluguel', label: 'Distribuição do aluguel', shape: 'breakdown', outputColumns: ['bucket', 'value'], unit: 'un', template: `
    SELECT CASE WHEN {${S}.valor_aluguel} < 1500 THEN '1. até 1,5k' WHEN {${S}.valor_aluguel} < 2500 THEN '2. 1,5k–2,5k' WHEN {${S}.valor_aluguel} < 4000 THEN '3. 2,5k–4k' WHEN {${S}.valor_aluguel} < 7000 THEN '4. 4k–7k' ELSE '5. acima de 7k' END AS bucket, COUNT(1) AS value
    FROM {${S}} WHERE ${ACTIVE_LEASES} GROUP BY 1 ORDER BY 1` }),
  k({ id: 'loc_aluguel_por_regiao_dist', label: 'Aluguel por região', shape: 'distribution', outputColumns: ['grupo', 'min', 'q1', 'mediana', 'q3', 'max'], unit: 'BRL', template: `
    SELECT {${S}.regiao} AS grupo, ${quartiles(`{${S}.valor_aluguel}`)} FROM {${S}} WHERE ${ACTIVE_LEASES} GROUP BY 1 ORDER BY mediana DESC` }),
  k({ id: 'loc_vencimentos_90_dias', label: 'Contratos vencendo em 90 dias', shape: 'rows', outputColumns: ['contrato', 'imovel', 'unidade', 'valor_aluguel', 'data_fim_prevista', 'indice_reajuste', 'garantia'], template: `
    SELECT c.{contratos_locacao.contrato_id} AS contrato, c.{contratos_locacao.imovel_id} AS imovel, u.{unidades.nome} AS unidade, c.{contratos_locacao.valor_aluguel} AS valor_aluguel, c.{contratos_locacao.data_fim_prevista} AS data_fim_prevista, c.{contratos_locacao.indice_reajuste} AS indice_reajuste, c.{contratos_locacao.garantia} AS garantia
    FROM {${S}} s JOIN {contratos_locacao} c ON c.{contratos_locacao.contrato_id} = s.{${S}.contrato_id} JOIN {unidades} u ON u.{unidades.unidade_id} = c.{contratos_locacao.unidade_id}
    WHERE s.{${S}.status} = 'ativo' AND s.{${S}.vence_em_90_dias} AND ${pin(S).replace(`{${S}.data_base_report} =`, `s.{${S}.data_base_report} =`)}
    ORDER BY data_fim_prevista LIMIT 300` }),
  k({ id: 'loc_reajustes_mes', label: 'Reajustes do mês', description: 'Contratos com aniversário no mês de referência.', shape: 'rows', outputColumns: ['contrato', 'unidade', 'valor_aluguel', 'indice_reajuste', 'aniversario'], template: `
    SELECT c.{contratos_locacao.contrato_id} AS contrato, u.{unidades.nome} AS unidade, c.{contratos_locacao.valor_aluguel} AS valor_aluguel, c.{contratos_locacao.indice_reajuste} AS indice_reajuste,
      DATE_ADD(c.{contratos_locacao.data_inicio}, INTERVAL 12 * DIV(DATE_DIFF((SELECT MAX({${S}.data_base_report}) FROM {${S}} WHERE {filter.ate:${S}.data_base_report}), c.{contratos_locacao.data_inicio}, MONTH), 12) MONTH) AS aniversario
    FROM {contratos_locacao} c JOIN {unidades} u ON u.{unidades.unidade_id} = c.{contratos_locacao.unidade_id}
    WHERE c.{contratos_locacao.data_encerramento} IS NULL AND EXTRACT(MONTH FROM c.{contratos_locacao.data_inicio}) = EXTRACT(MONTH FROM (SELECT MAX({${S}.data_base_report}) FROM {${S}} WHERE {filter.ate:${S}.data_base_report}))
      AND c.{contratos_locacao.data_inicio} < DATE_SUB((SELECT MAX({${S}.data_base_report}) FROM {${S}} WHERE {filter.ate:${S}.data_base_report}), INTERVAL 11 MONTH)
    ORDER BY valor_aluguel DESC LIMIT 300` }),
  k({ id: 'loc_carteira_regiao_x_tipo', label: 'Carteira: região × tipo', shape: 'matrix', outputColumns: ['row', 'col', 'value'], unit: 'un', template: `
    SELECT {${S}.regiao} AS row, {${S}.tipo} AS col, COUNT(1) AS value FROM {${S}} WHERE ${ACTIVE_LEASES} GROUP BY 1, 2 ORDER BY 1, 2` }),

  // ── D3. Inadimplência & Repasses ───────────────────────────────────────
  k({ id: 'loc_inadimplencia_valor', label: 'Valor em atraso', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COALESCE(SUM({faturas_locacao.valor_total}), 0) AS value FROM {faturas_locacao} WHERE ${OVERDUE_INVOICE} AND {faturas_locacao.competencia} <= ${monthRef('faturas_locacao', 'competencia')}` }),
  k({ id: 'loc_inadimplencia_qtd', label: 'Faturas em atraso', unit: 'un', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COUNT(1) AS value FROM {faturas_locacao} WHERE ${OVERDUE_INVOICE} AND {faturas_locacao.competencia} <= ${monthRef('faturas_locacao', 'competencia')}` }),
  k({ id: 'loc_atraso_medio_dias', label: 'Atraso médio', unit: 'dias', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT AVG({faturas_locacao.dias_atraso}) AS value FROM {faturas_locacao} WHERE {faturas_locacao.dias_atraso} > 0 AND ${INVOICE_MONTH}` }),
  k({ id: 'loc_recuperacao_pct', label: 'Recuperação de atrasos', description: 'Faturas pagas com atraso sobre faturas que atrasaram, na competência do mês.', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(COUNTIF({faturas_locacao.status} = 'pago_atrasado'), COUNTIF({faturas_locacao.dias_atraso} > 0)) AS value FROM {faturas_locacao} WHERE ${INVOICE_MONTH}` }),
  k({ id: 'loc_acordos_ativos', label: 'Acordos ativos', unit: 'un', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COUNT(1) AS value FROM {faturas_locacao} WHERE {faturas_locacao.status} = 'acordo'` }),
  k({ id: 'loc_repasse_garantido_pct', label: 'Contratos com repasse garantido', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(COUNTIF({faturas_locacao.repasse_garantido}), COUNT(1)) AS value FROM {faturas_locacao} WHERE ${INVOICE_MONTH}` }),
  k({ id: 'loc_aging_serie', label: 'Aging da carteira', shape: 'timeseries_pivot', outputColumns: ['bucket', 'em_dia', 'ate_30', 'de_31_a_60', 'de_61_a_90', 'mais_de_90'], unit: 'un', template: `
    SELECT {${S}.data_base_report} AS bucket,
      COUNTIF({${S}.faixa_atraso} = 'em_dia') AS em_dia, COUNTIF({${S}.faixa_atraso} = '1-30') AS ate_30, COUNTIF({${S}.faixa_atraso} = '31-60') AS de_31_a_60,
      COUNTIF({${S}.faixa_atraso} = '61-90') AS de_61_a_90, COUNTIF({${S}.faixa_atraso} = '90+') AS mais_de_90
    FROM {${S}} WHERE {${S}.status} = 'ativo' AND ${band(S, 'data_base_report')} GROUP BY 1 ORDER BY 1` }),
  k({ id: 'loc_inadimplencia_por_unidade', scale: ['value'], label: 'Inadimplência por unidade', shape: 'breakdown', outputColumns: ['unidade', 'value'], unit: '%', template: `
    SELECT u.{unidades.nome} AS unidade, SAFE_DIVIDE(COUNTIF(s.{${S}.dias_atraso} > 0), COUNT(1)) AS value FROM {${S}} s JOIN {unidades} u ON u.{unidades.unidade_id} = s.{${S}.unidade_id}
    WHERE s.{${S}.status} = 'ativo' AND ${pin(S).replace(`{${S}.data_base_report} =`, `s.{${S}.data_base_report} =`)} GROUP BY 1 ORDER BY 2 DESC` }),
  k({ id: 'loc_inadimplencia_por_garantia', scale: ['value'], label: 'Inadimplência por garantia', shape: 'breakdown', outputColumns: ['garantia', 'value'], unit: '%', template: `
    SELECT {${S}.garantia} AS garantia, SAFE_DIVIDE(COUNTIF({${S}.dias_atraso} > 0), COUNT(1)) AS value FROM {${S}} WHERE ${ACTIVE_LEASES} GROUP BY 1 ORDER BY 2 DESC` }),
  k({ id: 'loc_inadimplencia_serie', scale: ['value'], label: 'Inadimplência mensal', shape: 'timeseries', outputColumns: ['bucket', 'value'], unit: '%', template: `
    SELECT {${S}.data_base_report} AS bucket, SAFE_DIVIDE(COUNTIF({${S}.dias_atraso} > 0), COUNT(1)) AS value FROM {${S}} WHERE {${S}.status} = 'ativo' AND ${band(S, 'data_base_report')} GROUP BY 1 ORDER BY 1` }),
  k({ id: 'loc_repasses_mes', label: 'Repasses a proprietários no mês', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COALESCE(SUM({faturas_locacao.valor_repasse}), 0) AS value FROM {faturas_locacao} WHERE {faturas_locacao.data_repasse} IS NOT NULL AND ${monthEnd('faturas_locacao', 'data_repasse')}` }),
  k({ id: 'loc_repasses_no_prazo_pct', label: 'Repasses no prazo', unit: '%', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT SAFE_DIVIDE(COUNTIF({faturas_locacao.repasse_no_prazo}), COUNT(1)) AS value FROM {faturas_locacao} WHERE {faturas_locacao.data_repasse} IS NOT NULL AND ${monthEnd('faturas_locacao', 'data_repasse')}` }),
  k({ id: 'loc_faturas_em_atraso', label: 'Faturas em atraso', shape: 'rows', outputColumns: ['contrato', 'imovel', 'unidade', 'competencia', 'valor_total', 'dias_atraso', 'garantia', 'status'], template: `
    SELECT f.{faturas_locacao.contrato_id} AS contrato, f.{faturas_locacao.imovel_id} AS imovel, u.{unidades.nome} AS unidade, f.{faturas_locacao.competencia} AS competencia, f.{faturas_locacao.valor_total} AS valor_total, f.{faturas_locacao.dias_atraso} AS dias_atraso, c.{contratos_locacao.garantia} AS garantia, f.{faturas_locacao.status} AS status
    FROM {faturas_locacao} f JOIN {contratos_locacao} c ON c.{contratos_locacao.contrato_id} = f.{faturas_locacao.contrato_id} JOIN {unidades} u ON u.{unidades.unidade_id} = f.{faturas_locacao.unidade_id}
    WHERE f.{faturas_locacao.status} IN ('em_atraso', 'inadimplente', 'acordo')
    ORDER BY dias_atraso DESC LIMIT 300` }),

  // ── D4. Vacância & Renovações ──────────────────────────────────────────
  k({ id: 'loc_imoveis_vagos', label: 'Imóveis vagos', unit: 'un', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COUNT(1) AS value FROM {estoque_snapshot} WHERE {estoque_snapshot.finalidade} != 'venda' AND {estoque_snapshot.status} = 'disponivel' AND ${pin('estoque_snapshot')}` }),
  k({ id: 'loc_vacancia_media_dias', label: 'Vacância média', unit: 'dias', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT AVG({estoque_snapshot.dias_em_estoque}) AS value FROM {estoque_snapshot} WHERE {estoque_snapshot.finalidade} != 'venda' AND {estoque_snapshot.status} = 'disponivel' AND ${pin('estoque_snapshot')}` }),
  k({ id: 'loc_aluguel_perdido_mes', label: 'Aluguel não realizado (vagos)', unit: 'BRL', shape: 'scalar', outputColumns: ['value'], template: `
    SELECT COALESCE(SUM({estoque_snapshot.valor_aluguel_anuncio}), 0) AS value FROM {estoque_snapshot} WHERE {estoque_snapshot.finalidade} != 'venda' AND {estoque_snapshot.status} = 'disponivel' AND ${pin('estoque_snapshot')}` }),
  k({ id: 'loc_vagos_por_faixa_dias', label: 'Vagos por tempo', shape: 'breakdown', outputColumns: ['faixa', 'value'], unit: 'un', template: `
    SELECT {estoque_snapshot.faixa_estoque} AS faixa, COUNT(1) AS value FROM {estoque_snapshot} WHERE {estoque_snapshot.finalidade} != 'venda' AND {estoque_snapshot.status} = 'disponivel' AND ${pin('estoque_snapshot')} GROUP BY 1 ORDER BY 1` }),
  k({ id: 'loc_vacancia_serie', scale: ['value'], label: 'Vacância mensal', shape: 'timeseries', outputColumns: ['bucket', 'value'], unit: '%', template: `
    SELECT {estoque_snapshot.data_base_report} AS bucket, SAFE_DIVIDE(COUNTIF({estoque_snapshot.status} = 'disponivel'), COUNT(1)) AS value FROM {estoque_snapshot} WHERE {estoque_snapshot.finalidade} != 'venda' AND ${band('estoque_snapshot', 'data_base_report')} GROUP BY 1 ORDER BY 1` }),
  k({ id: 'loc_vagos_90_dias', label: 'Vagos há mais de 90 dias', shape: 'rows', outputColumns: ['codigo', 'regiao', 'tipo', 'valor_aluguel_anuncio', 'dias_vago', 'visitas'], template: `
    SELECT i.{imoveis.codigo} AS codigo, s.{estoque_snapshot.regiao} AS regiao, s.{estoque_snapshot.tipo} AS tipo, s.{estoque_snapshot.valor_aluguel_anuncio} AS valor_aluguel_anuncio, s.{estoque_snapshot.dias_em_estoque} AS dias_vago, s.{estoque_snapshot.visitas_acumuladas} AS visitas
    FROM {estoque_snapshot} s JOIN {imoveis} i ON i.{imoveis.imovel_id} = s.{estoque_snapshot.imovel_id}
    WHERE s.{estoque_snapshot.finalidade} != 'venda' AND s.{estoque_snapshot.status} = 'disponivel' AND s.{estoque_snapshot.dias_em_estoque} > 90 AND ${pin('estoque_snapshot').replace('{estoque_snapshot.data_base_report} =', 's.{estoque_snapshot.data_base_report} =')}
    ORDER BY dias_vago DESC LIMIT 200` }),
  k({ id: 'loc_aluguel_x_dias_vago', label: 'Aluguel × dias vago', shape: 'points', outputColumns: ['x', 'y', 'group'], template: `
    SELECT {estoque_snapshot.valor_aluguel_anuncio} AS x, {estoque_snapshot.dias_em_estoque} AS y, {estoque_snapshot.regiao} AS \`group\`
    FROM {estoque_snapshot} WHERE {estoque_snapshot.finalidade} != 'venda' AND {estoque_snapshot.status} = 'disponivel' AND ${pin('estoque_snapshot')} LIMIT 800` }),
];
