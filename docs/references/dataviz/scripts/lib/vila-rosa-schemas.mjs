/**
 * Schemas físicos (coluna → tipo BigQuery) das tabelas do Vila Rosa e das
 * tabelas auxiliares. Fonte única para:
 *   - `bq-bootstrap-sample-datasets.ts` (datasets de amostra de uma instalação nova);
 *   - `bq-seed-synthetic-data.ts` (schema explícito das tabelas sintéticas);
 *   - `bq-load-aux-tables.ts` (schema de `dataviz_aux.ba_bancos` / `ba_pluggy_categorias`);
 *   - `seed-base-contracts.mjs` (atributos do contrato `liquid-play`);
 *   - `seed-vila-rosa-client.mjs` (`schemaBindings` do cliente `vila-rosa`);
 *   - `lib/real-estate-schemas.mjs` (reexporta `toTableFields` e `missingColumns`).
 * Testes: `lib/vila-rosa-schemas.test.ts` e `lib/synthetic-portfolio.test.ts`.
 *
 * Viviam duplicados dentro dos scripts; uma instalação nova precisava dos
 * mesmos nomes em três lugares e divergiam em silêncio.
 *
 * Origem: docs/bases/vila-rosa/BigQuery/*.json e introspecção de
 * `bq-data-wh.vila_rosa_monitor.INFORMATION_SCHEMA.COLUMNS`.
 */

export const MONITOR_SCHEMA = {
  contratos: [
    ['id_contrato', 'STRING'], ['status_contrato', 'STRING'], ['date_delivery', 'DATE'],
    ['building_status', 'STRING'], ['correcao_monetaria', 'STRING'], ['data_base_report', 'DATE'],
    ['projeto', 'STRING'], ['cidade', 'STRING'], ['estado', 'STRING'], ['categoria_venda', 'STRING'],
    ['data_emissao', 'DATE'], ['valor_imovel', 'FLOAT64'], ['valor_pago_view', 'FLOAT64'],
    ['dias_atraso', 'INT64'], ['dias_atraso_ps', 'INT64'], ['dias_atraso_outros', 'INT64'],
    ['valor_atraso', 'FLOAT64'], ['valor_atraso_ps', 'FLOAT64'], ['valor_atraso_fi', 'INT64'],
    ['valor_atraso_outros', 'INT64'], ['saldo_devedor', 'FLOAT64'], ['saldo_devedor_ps', 'FLOAT64'],
    ['saldo_devedor_fi', 'FLOAT64'], ['saldo_devedor_outros', 'INT64'], ['saldo_nominal', 'FLOAT64'],
    ['taxa_pricing', 'STRING'], ['duration', 'FLOAT64'], ['pricing_pe_ps_hist', 'FLOAT64'],
    ['pricing_pe_hist', 'FLOAT64'], ['desagio_pe_ps_hist', 'FLOAT64'], ['desagio_pe_hist', 'FLOAT64'],
    ['desagio', 'FLOAT64'], ['pricing', 'FLOAT64'], ['ltv', 'FLOAT64'], ['ltv_dirty', 'FLOAT64'],
    ['vpl', 'FLOAT64'], ['renda_familiar', 'FLOAT64'], ['faixa_renda', 'STRING'],
    ['faixa_mcmv', 'STRING'], ['score', 'FLOAT64'], ['faixa_score', 'STRING'],
    ['primeira_parcela', 'DATE'], ['rating_liquid', 'STRING'], ['taxa_contrato', 'FLOAT64'],
    ['plano', 'INT64'], ['prazo_decorrido', 'FLOAT64'], ['prazo_remanescente', 'FLOAT64'],
    ['valor_contrato', 'FLOAT64'], ['valor_over_90', 'FLOAT64'], ['valor_over_90_ps', 'FLOAT64'],
    ['faixa_atraso_1', 'STRING'], ['faixa_atraso_ps_1', 'STRING'], ['faixa_atraso_2', 'STRING'],
    ['faixa_atraso_ps_2', 'STRING'], ['faixa_atraso_3', 'STRING'], ['faixa_atraso_ps_3', 'STRING'],
    ['pdd_minimo_bacen', 'FLOAT64'], ['pdd_liquid', 'FLOAT64'], ['restricoes', 'FLOAT64'],
    ['faixa_remanescente', 'STRING'], ['limite_simulacao', 'FLOAT64'], ['prosoluto_simulacao', 'FLOAT64'],
    ['prosoluto_cnpj', 'FLOAT64'], ['prosoluto_sem_informacao', 'FLOAT64'], ['valor_pefin', 'FLOAT64'],
    ['valor_refin', 'FLOAT64'], ['valor_protesto', 'FLOAT64'], ['quantidade_pefin', 'FLOAT64'],
    ['quantidade_refin', 'FLOAT64'], ['quantidade_protesto', 'FLOAT64'], ['faixa_ltv', 'STRING'],
    ['ltv_banco', 'FLOAT64'], ['ltv_banco_stress', 'FLOAT64'], ['unidade', 'INT64'],
    ['proponent_type', 'STRING'], ['documento', 'INT64'], ['nome_cliente', 'STRING'],
    ['prob', 'FLOAT64'], ['inicio_monitor', 'DATE'], ['ultima_parcela', 'DATE'],
    ['private_area', 'STRING'], ['date_serasa', 'DATE'], ['renda_suficiente', 'INT64'],
    ['delta_renda_baixo', 'INT64'], ['delta_renda_medio', 'INT64'], ['delta_renda_alto', 'INT64'],
    ['prosoluto_total', 'FLOAT64'], ['faixa_ltv_banco', 'STRING'], ['faixa_ltv_stress', 'STRING'],
    ['tipo_restricao', 'STRING'], ['faixa_restricao', 'STRING'], ['elegibilidade', 'STRING'],
    ['delta_pdd', 'FLOAT64'], ['grupos_repasse', 'STRING'], ['categoria_inadimplencia', 'STRING'],
    ['perfil_cobranca', 'STRING'],
  ],
  fluxo_caixa: [
    ['projeto', 'STRING'], ['data_base_report', 'DATE'], ['empresa', 'STRING'],
    ['status_contrato', 'STRING'], ['categoria_venda', 'STRING'], ['building_status', 'STRING'],
    ['date_delivery', 'DATE'], ['estado', 'STRING'], ['cidade', 'STRING'], ['data_emissao', 'DATE'],
    ['data_base_fluxo', 'DATE'], ['fluxo_contratado', 'FLOAT64'], ['fluxo_esperado', 'FLOAT64'],
    ['fluxo_contratado_ps', 'FLOAT64'], ['fluxo_esperado_ps', 'FLOAT64'], ['tipo_recebivel', 'STRING'],
    ['id_contrato', 'STRING'],
  ],
  // Sem JSON de origem — introspectado via BigQuery real (bq-data-wh.vila_rosa_monitor.
  // INFORMATION_SCHEMA.COLUMNS WHERE table_name='pagamentos').
  // 13 colunas confirmadas (diferem do conjunto do Galli, que tem 14 cols distintas).
  pagamentos: [
    ['data_base_report', 'DATE'], ['projeto', 'STRING'], ['categoria_venda', 'STRING'],
    ['status_contrato', 'STRING'], ['building_status', 'STRING'], ['date_delivery', 'DATE'],
    ['estado', 'STRING'], ['cidade', 'STRING'], ['data_emissao', 'DATE'], ['tipo_parcela', 'STRING'],
    ['valor_pago', 'FLOAT64'], ['tipo_recebimento', 'STRING'], ['id_contrato', 'STRING'],
  ],
};

export const COVENANTS_SCHEMA = {
  covenants_calculo: [
    ['empresa', 'STRING'], ['projeto', 'STRING'], ['data_base_report', 'DATE'],
    ['unidades_vendidas', 'INT64'], ['vendido_m2', 'FLOAT64'], ['valor_vendido', 'FLOAT64'],
    ['estoque', 'INT64'], ['estoque_m2', 'FLOAT64'], ['vuv3_estoque', 'FLOAT64'],
    ['vuv3_m2', 'FLOAT64'], ['vuva_estoque', 'FLOAT64'], ['vuva_m2', 'FLOAT64'],
    ['recebiveis_pre_chaves', 'FLOAT64'], ['recebiveis_pos_chaves', 'FLOAT64'],
    ['indice_recebivel', 'FLOAT64'], ['indice_recebivel_estoque', 'FLOAT64'], ['vgv', 'FLOAT64'],
    ['total_de_unidades', 'INT64'], ['total_m2', 'FLOAT64'], ['total_valor_vendido', 'FLOAT64'],
    ['valor_medio_m2', 'FLOAT64'], ['valor_estoque', 'FLOAT64'],
  ],
  certidoes: [
    ['empresa', 'STRING'], ['projeto', 'STRING'], ['cnpj_consultado', 'INT64'],
    ['data_base_report', 'DATE'], ['data_consulta', 'DATE'], ['data_validade', 'DATE'],
    ['certidao_orgao', 'STRING'], ['certidao', 'STRING'], ['tipo', 'STRING'], ['situacao', 'STRING'],
    ['status', 'STRING'], ['id', 'STRING'], ['created_at', 'STRING'], ['endpoint', 'STRING'],
    ['bureau', 'STRING'],
  ],
  ficha_cadastral: [
    ['empresa', 'STRING'], ['projeto', 'STRING'], ['empresa_cnpj', 'STRING'], ['empresa_banco', 'STRING'],
    ['projeto_nome_exibicao', 'STRING'], ['projeto_tipo', 'STRING'], ['projeto_estado', 'STRING'],
    ['projeto_cidade', 'STRING'], ['projeto_vgv', 'FLOAT64'], ['projeto_torres', 'INT64'],
    ['projeto_total_unidades', 'INT64'], ['projeto_total_m2', 'FLOAT64'],
    ['projeto_previsao_entrega', 'DATE'], ['plano_empresario_valor', 'FLOAT64'],
    ['plano_empresario_data_assinatura', 'DATE'], ['pluggy_item_id', 'STRING'],
  ],
  mapa_de_vendas: [
    ['empresa', 'STRING'], ['projeto', 'STRING'], ['data_base_report', 'DATE'],
    ['empreendimento', 'STRING'], ['pavimento', 'STRING'], ['unidade', 'STRING'], ['torre', 'STRING'],
    ['area_privativa', 'FLOAT64'], ['area_calculo', 'FLOAT64'], ['area_total', 'FLOAT64'],
    ['fracao_ideal', 'FLOAT64'], ['vagas', 'INT64'], ['valor_avaliacao', 'FLOAT64'],
    ['valor_liquidez', 'FLOAT64'], ['permuta', 'BOOL'],
  ],
  evolucao_obra: [
    ['empresa', 'STRING'], ['projeto', 'STRING'], ['data_base_report', 'DATE'], ['medicao', 'STRING'],
    ['data_medicao', 'DATE'], ['previsto_acumulado', 'FLOAT64'], ['previsto_periodo', 'FLOAT64'],
    ['realizado_acumulado', 'FLOAT64'], ['realizado_periodo', 'FLOAT64'], ['desvio_acumulado', 'FLOAT64'],
    ['desvio_periodo', 'FLOAT64'],
  ],
  evolucao_plano_empresario: [
    ['empresa', 'STRING'], ['projeto', 'STRING'], ['data_base_report', 'DATE'],
    ['plano_empresario_divida_atual', 'FLOAT64'], ['plano_empresario_contratado', 'FLOAT64'],
  ],
  transacoes: [
    ['id', 'STRING'], ['lancamento', 'STRING'], ['descricao', 'STRING'], ['moeda', 'STRING'],
    ['valor', 'FLOAT64'], ['data', 'DATE'], ['saldo', 'FLOAT64'], ['pagador_conta', 'STRING'],
    ['pagador_agencia', 'STRING'], ['pagador_tipo', 'STRING'], ['pagador_documento', 'STRING'],
    ['pagador', 'STRING'], ['pagador_banco', 'INT64'], ['metodo_pagamento', 'STRING'],
    ['recebedor_conta', 'STRING'], ['recebedor_agencia', 'STRING'], ['recebedor_tipo', 'STRING'],
    ['recebedor_documento', 'STRING'], ['recebedor', 'STRING'], ['recebedor_banco', 'INT64'],
    ['tipo', 'STRING'], ['banco_codigo', 'INT64'], ['agencia_codigo', 'STRING'],
    ['conta_codigo', 'STRING'], ['data_base_report', 'DATE'], ['categoria', 'STRING'],
    ['projeto', 'STRING'], ['empresa', 'STRING'],
  ],
};

/** Tabelas auxiliares de `dataviz_aux` (literais no SQL das métricas de extrato). */
export const AUX_SCHEMA = {
  ba_bancos: [
    ['ispb', 'STRING'], ['nome_reduzido', 'STRING'], ['numero_codigo', 'INT64'],
    ['participa_compe', 'STRING'], ['acesso_principal', 'STRING'], ['nome_extenso', 'STRING'],
    ['inicio_operacao', 'DATE'],
  ],
  ba_pluggy_categorias: [
    ['idx', 'INT64'], ['id', 'INT64'], ['description', 'STRING'], ['description_translated', 'STRING'],
    ['parent_id', 'INT64'], ['parent_description', 'STRING'], ['parent_description_translated', 'STRING'],
  ],
};

/**
 * Converte `[[nome, tipo], ...]` no formato `TableField[]` do SDK do BigQuery.
 * Toda coluna é NULLABLE: os seeds e as amostras não garantem preenchimento.
 */
export function toTableFields(columns) {
  return columns.map(([name, type]) => ({ name, type, mode: 'NULLABLE' }));
}

/**
 * Colunas do schema esperado que não existem na tabela.
 *
 * A comparação ignora caixa porque o BigQuery trata nome de coluna como
 * case-insensitive: `Status_contrato` (cabeçalho do CSV de amostra) e
 * `status_contrato` (contrato) são a MESMA coluna, e um `ADD COLUMN` da
 * segunda falha com "Column already exists".
 */
export function missingColumns(existing, expected) {
  const present = new Set(existing.map((column) => column.toLowerCase()));
  return expected.filter(([name]) => !present.has(name.toLowerCase()));
}
