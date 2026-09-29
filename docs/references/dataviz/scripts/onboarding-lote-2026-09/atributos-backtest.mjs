/**
 * Contrato `backtest` — vocabulário do produto Liquid Backtest.
 *
 * ─── Por que contrato PRÓPRIO, e não uma extensão do `liquid-play` ───
 *
 * Medido na introspecção: das 96 colunas de `contratos` do contrato do Monitor,
 * o backtest reaproveita 21. As outras 77 são dele — scores de bureau (BVS,
 * Serasa), `perfil_backtest`, `timeline`, `lote`/`quadra`. Enfiar isso no
 * `liquid-play` acrescentaria 77 atributos que nenhum cliente Monitor tem, e
 * todo cliente Monitor passaria a exibir 77 lacunas de binding.
 *
 * É o que a ADR `multi-product-dataset-integration` §2.1 já previa: produto é a
 * unidade de packaging, e "Backtest" tem modelo de dados incompatível com
 * "Credit".
 *
 * ─── Como os tipos foram decididos ───
 *
 * `brz_backtest.contratos` está com **81 de 81 colunas STRING** — inclusive
 * `saldo_devedor`, `valor_atraso`, `data_base_report`. `jotanunes_backtest`
 * está tipado em 49 das 83. Onde os dois divergem (41 colunas), o contrato
 * declara o tipo do **Jotanunes**, porque é o que descreve o dado de verdade:
 * `saldo_devedor` é dinheiro, não texto.
 *
 * Consequência que precisa estar escrita: para BRZ, o contrato declara FLOAT64
 * e o BigQuery entrega STRING. Toda métrica que somar vai falhar ou precisar de
 * CAST. A correção é no dataset, não aqui — BigQuery é somente leitura para
 * este app. Ver `docs/documentations/`.
 *
 * Onde a coluna só existe no BRZ (`bvs_eos_*`, `serasa_score_hcr3`, …) o tipo
 * declarado é STRING porque é o único tipo observável — não porque se saiba que
 * é texto. Está marcado no campo `tipoNaoVerificado`.
 *
 * ─── Caixa dos identificadores ───
 *
 * Os datasets de backtest trazem `Cidade`, `Estado`, `Regional` e
 * `Status_contrato` com inicial maiúscula, contra `cidade`/`estado`/… no
 * Monitor. O atributo é declarado em minúscula (o vocabulário é um só) e a
 * caixa real entra no `schemaBindings`. Dois nomes para um conceito é o que a
 * camada de binding existe para evitar.
 */

/** Colunas cujo tipo veio do BRZ (100% STRING) e portanto não é verificável. */
const SO_NO_BRZ = new Set([
  'bvs_affordability_v3', 'bvs_eos_2026', 'bvs_eos_cartao_2026',
  'bvs_eos_emprestimo_2026', 'bvs_eos_imob_2026', 'bvs_eos_mix_2026',
  'bvs_eos_varejo_2026', 'bvs_onescore_2025_fpd', 'bvs_scr_affordability_v1',
  'serasa_score_hcr3', 'serasa_score_hpg3', 'serasa_score_hsv5',
  'serasa_score_hva5', 'serasa_xqtrestrati', 'serasa_xvlrestrati',
]);

/**
 * Indicador de bureau. A semântica exata do código não está documentada na
 * origem, então a descrição diz o que se SABE (fornecedor, família, recorte) e
 * não inventa a régua.
 */
function bureau(id, fornecedor, familia, recorte, type = 'STRING') {
  const nao = SO_NO_BRZ.has(id);
  return {
    id,
    label: id,
    description:
      `${familia} do bureau ${fornecedor}${recorte ? ` — ${recorte}` : ''}. ` +
      `Código de origem preservado; a régua exata do indicador não está documentada na fonte.` +
      (nao ? ' Tipo observado apenas no dataset BRZ, que está integralmente em STRING — não verificado.' : ''),
    type,
    ...(nao ? { tipoNaoVerificado: true } : {}),
  };
}

const FAIXAS_ATRASO = {
  '61_90': '61 a 90 dias de atraso',
  '91_180': '91 a 180 dias de atraso',
  '181_360': '181 a 360 dias de atraso',
  acima360: 'acima de 360 dias de atraso',
  '1_60': '1 a 60 dias de atraso',
  geral: 'consolidado de todas as faixas',
};

export const CONTRATOS = [
  // ── Identificação e recortes ──────────────────────────────────────
  {
    id: 'id_contrato',
    label: 'ID do Contrato',
    description: 'Identificador do contrato na base de origem. Chave de junção com `pagamentos`.',
    type: 'STRING',
    isKey: true,
    required: true,
  },
  {
    id: 'data_base_report',
    label: 'Data-Base do Relatório',
    description: 'Data-base do snapshot. Toda métrica de estoque filtra por ela.',
    type: 'DATE',
    required: true,
  },
  {
    id: 'perfil_backtest',
    label: 'Perfil do Backtest',
    description:
      'Cenário/perfil da simulação a que esta linha pertence. É o recorte que distingue um backtest de outro dentro do mesmo dataset.',
    type: 'STRING',
  },
  {
    id: 'timeline',
    label: 'Timeline',
    description: 'Marcação temporal do cenário simulado, na codificação da origem.',
    type: 'STRING',
  },
  {
    id: 'type',
    label: 'Tipo',
    description:
      'Classificador da linha na origem. ⚠️ Nome genérico herdado do dataset — não é `tipo_parcela` nem `perfil_backtest`.',
    type: 'STRING',
  },
  { id: 'projeto', label: 'Projeto', description: 'Empreendimento a que o contrato pertence.', type: 'STRING' },
  { id: 'incorporadora', label: 'Incorporadora', description: 'Incorporadora responsável pelo empreendimento.', type: 'STRING' },
  { id: 'segmento', label: 'Segmento', description: 'Segmento de mercado do empreendimento.', type: 'STRING' },
  { id: 'regional', label: 'Regional', description: 'Regional comercial responsável. Coluna de origem: `Regional`.', type: 'STRING' },
  { id: 'cidade', label: 'Cidade', description: 'Cidade do imóvel. Coluna de origem: `Cidade`.', type: 'STRING' },
  { id: 'estado', label: 'Estado', description: 'UF do imóvel. Coluna de origem: `Estado`.', type: 'STRING' },
  {
    id: 'status_contrato',
    label: 'Status do Contrato',
    description: 'Situação do contrato no snapshot. Coluna de origem: `Status_contrato`.',
    type: 'STRING',
  },
  { id: 'categoria_venda', label: 'Categoria de Venda', description: 'Categoria comercial da venda.', type: 'STRING' },
  { id: 'quadra', label: 'Quadra', description: 'Quadra da unidade no empreendimento.', type: 'STRING' },
  { id: 'lote', label: 'Lote', description: 'Lote da unidade no empreendimento.', type: 'INT64' },
  { id: 'data_emissao', label: 'Data de Emissão', description: 'Data de emissão do contrato.', type: 'TIMESTAMP' },

  // ── Proponente ────────────────────────────────────────────────────
  { id: 'cpf', label: 'CPF', description: 'CPF do proponente. ⚠️ PII — ver restrição de log na rule `observability`.', type: 'STRING' },
  { id: 'cnpj', label: 'CNPJ', description: 'CNPJ do proponente pessoa jurídica.', type: 'STRING' },
  { id: 'qtd_proponents', label: 'Quantidade de Proponentes', description: 'Número de proponentes no contrato.', type: 'INT64', unit: 'proponentes' },
  { id: 'faixa_renda', label: 'Faixa de Renda', description: 'Faixa de renda familiar do proponente.', type: 'STRING' },
  { id: 'faixa_mcmv', label: 'Faixa MCMV', description: 'Faixa do programa Minha Casa Minha Vida aplicável.', type: 'STRING' },

  // ── Imóvel ────────────────────────────────────────────────────────
  { id: 'valor_imovel', label: 'Valor do Imóvel', description: 'Valor de avaliação do imóvel.', type: 'FLOAT64', unit: 'BRL' },
  { id: 'faixa_imovel', label: 'Faixa do Imóvel', description: 'Faixa de valor do imóvel.', type: 'STRING' },
  { id: 'private_area', label: 'Área Privativa', description: 'Área privativa da unidade.', type: 'FLOAT64', unit: 'm²' },

  // ── Posição financeira ────────────────────────────────────────────
  { id: 'saldo_devedor', label: 'Saldo Devedor', description: 'Saldo devedor total do contrato na data-base.', type: 'FLOAT64', unit: 'BRL' },
  { id: 'saldo_devedor_fi', label: 'Saldo Devedor — FI', description: 'Saldo devedor da parcela de financiamento imobiliário.', type: 'FLOAT64', unit: 'BRL' },
  { id: 'saldo_devedor_ps', label: 'Saldo Devedor — Pró-Soluto', description: 'Saldo devedor da parcela pró-soluto.', type: 'FLOAT64', unit: 'BRL' },
  { id: 'valor_pago', label: 'Valor Pago', description: 'Total pago pelo comprador até a data-base.', type: 'FLOAT64', unit: 'BRL' },
  { id: 'valor_pago_ps', label: 'Valor Pago — Pró-Soluto', description: 'Total pago na parcela pró-soluto até a data-base.', type: 'FLOAT64', unit: 'BRL' },
  { id: 'valor_atraso', label: 'Valor em Atraso', description: 'Valor total em atraso na data-base.', type: 'FLOAT64', unit: 'BRL' },
  { id: 'valor_atraso_fi', label: 'Valor em Atraso — FI', description: 'Valor em atraso da parcela de financiamento imobiliário.', type: 'FLOAT64', unit: 'BRL' },
  { id: 'valor_atraso_ps', label: 'Valor em Atraso — Pró-Soluto', description: 'Valor em atraso da parcela pró-soluto.', type: 'FLOAT64', unit: 'BRL' },
  { id: 'dias_atraso', label: 'Dias de Atraso', description: 'Dias de atraso da parcela mais antiga em aberto.', type: 'INT64', unit: 'dias' },
  { id: 'dias_atraso_ps', label: 'Dias de Atraso — Pró-Soluto', description: 'Dias de atraso na parcela pró-soluto.', type: 'INT64', unit: 'dias' },
  { id: 'inadimplencia', label: 'Inadimplência', description: 'Razão entre valor em atraso e saldo devedor.', type: 'FLOAT64', unit: '%' },
  { id: 'inadimplencia_ps', label: 'Inadimplência — Pró-Soluto', description: 'Inadimplência restrita à parcela pró-soluto.', type: 'FLOAT64', unit: '%' },
  { id: 'desagio', label: 'Deságio', description: 'Deságio aplicado ao recebível.', type: 'FLOAT64', unit: '%' },
  { id: 'pricing', label: 'Pricing', description: 'Preço do recebível no cenário simulado.', type: 'FLOAT64', unit: 'BRL' },
  { id: 'vpl', label: 'VPL', description: 'Valor presente líquido do fluxo do contrato.', type: 'FLOAT64', unit: 'BRL' },
  { id: 'vpl_ps', label: 'VPL — Pró-Soluto', description: 'Valor presente líquido do fluxo pró-soluto.', type: 'FLOAT64', unit: 'BRL' },

  // ── Rating e score ────────────────────────────────────────────────
  { id: 'rating_liquid', label: 'Rating Liquid', description: 'Classificação de risco do contrato pelo modelo Liquid.', type: 'STRING' },
  { id: 'score_liquid', label: 'Score Liquid', description: 'Score numérico de risco do contrato pelo modelo Liquid.', type: 'FLOAT64' },

  // ── Bureau BVS — cobrança por faixa de atraso ─────────────────────
  ...Object.entries(FAIXAS_ATRASO)
    .filter(([f]) => f !== '1_60')
    .map(([f, desc]) => bureau(`bvs_cobranca_${f}`, 'BVS', 'Indicador de cobrança', desc, 'INT64')),

  // ── Bureau BVS — recuperação ──────────────────────────────────────
  ...['1_60', '61_90', '91_180', '181_360', 'acima360', 'geral'].map((f) =>
    bureau(`bvs_recuperacao_45d_${f}`, 'BVS', 'Indicador de recuperação em 45 dias', FAIXAS_ATRASO[f], 'INT64'),
  ),
  bureau('bvs_recuperacao_60d_geral', 'BVS', 'Indicador de recuperação em 60 dias', FAIXAS_ATRASO.geral, 'INT64'),

  // ── Bureau BVS — concessão ────────────────────────────────────────
  ...[
    ['bvs_concessao_p5_geral', 'modelo P5, consolidado'],
    ['bvs_concessao_p6_geral', 'modelo P6, consolidado'],
    ['bvs_concessao_p7_geral', 'modelo P7, consolidado'],
    ['bvs_concessao_p7_cp', 'modelo P7, crédito pessoal'],
    ['bvs_concessao_p7_imob', 'modelo P7, imobiliário'],
    ['bvs_concessao_p7_mix', 'modelo P7, carteira mista'],
    ['bvs_concessao_p7_over', 'modelo P7, overall'],
  ].map(([id, recorte]) => bureau(id, 'BVS', 'Score de concessão', recorte, 'INT64')),

  // ── Bureau BVS — restrições, renda e demais ───────────────────────
  bureau('bvs_renda_g2_v31', 'BVS', 'Estimativa de renda', 'modelo G2 v3.1', 'INT64'),
  bureau('bvs_affordability', 'BVS', 'Indicador de capacidade de pagamento', null, 'INT64'),
  bureau('bvs_affordability_v3', 'BVS', 'Indicador de capacidade de pagamento', 'versão 3'),
  bureau('bvs_scr_affordability_v1', 'BVS', 'Capacidade de pagamento com base no SCR', 'versão 1'),
  bureau('bvs_classe_grau_endv', 'BVS', 'Classe de grau de endividamento', null),
  bureau('bvs_d_ativ_cartao_01', 'BVS', 'Indicador de atividade em cartão', null),
  bureau('bvs_flag_restritivo', 'BVS', 'Marcação de apontamento restritivo', null),
  bureau('bvs_onescore_2025_fpd', 'BVS', 'OneScore 2025', 'first payment default'),
  bureau('bvs_qtd_ccf', 'BVS', 'Quantidade de registros CCF', 'cheques sem fundo'),
  bureau('bvs_qtd_cheque', 'BVS', 'Quantidade de apontamentos de cheque', null),
  bureau('bvs_qtd_protesto', 'BVS', 'Quantidade de protestos', null),
  bureau('bvs_qtd_scpc', 'BVS', 'Quantidade de apontamentos SCPC', null),
  bureau('bvs_vl_protesto', 'BVS', 'Valor de protestos', null),
  bureau('bvs_vl_scpc', 'BVS', 'Valor de apontamentos SCPC', null),
  ...['2026', 'cartao_2026', 'emprestimo_2026', 'imob_2026', 'mix_2026', 'varejo_2026'].map((s) =>
    bureau(`bvs_eos_${s}`, 'BVS', 'Indicador EOS', s.replace(/_/g, ' ')),
  ),

  // ── Bureau Serasa ─────────────────────────────────────────────────
  ...['hcp4', 'hfi4', 'hsv4', 'hva4'].map((m) =>
    bureau(`serasa_score_${m}`, 'Serasa', 'Score', `modelo ${m.toUpperCase()}`, 'INT64'),
  ),
  ...['hcr3', 'hipn', 'hpg3', 'hrm4', 'hsv5', 'hva5'].map((m) =>
    bureau(`serasa_score_${m}`, 'Serasa', 'Score', `modelo ${m.toUpperCase()}`),
  ),
  bureau('serasa_flag_restritivo_2b', 'Serasa', 'Marcação de apontamento restritivo', 'régua 2B', 'INT64'),
  bureau('serasa_income_commitment', 'Serasa', 'Comprometimento de renda estimado', null),
  bureau('serasa_income_source', 'Serasa', 'Origem da renda estimada', null),
  bureau('serasa_payment_capacity', 'Serasa', 'Capacidade de pagamento estimada', null),
  bureau('serasa_mensagem_tipo_registro', 'Serasa', 'Tipo de registro retornado na consulta', null),
  bureau('serasa_xqtrestrati', 'Serasa', 'Quantidade de apontamentos restritivos', null),
  bureau('serasa_xvlrestrati', 'Serasa', 'Valor de apontamentos restritivos', null),
];

export const PAGAMENTOS = [
  {
    id: 'data_base_report',
    label: 'Data-Base do Relatório',
    description: 'Data-base do snapshot de pagamentos.',
    type: 'DATE',
    required: true,
  },
  { id: 'projeto', label: 'Projeto', description: 'Empreendimento a que o pagamento pertence.', type: 'STRING' },
  { id: 'incorporadora', label: 'Incorporadora', description: 'Incorporadora responsável pelo empreendimento.', type: 'STRING' },
  { id: 'segmento', label: 'Segmento', description: 'Segmento de mercado do empreendimento.', type: 'STRING' },
  // ⚠️ Em `pagamentos` a caixa das colunas NÃO segue a de `contratos`: aqui
  // `cidade`, `estado` e `regional` vêm em minúscula, e só `Status_contrato`
  // mantém a inicial maiúscula. Repetir a nota de `contratos` seria descrever
  // a tabela errada.
  { id: 'regional', label: 'Regional', description: 'Regional comercial responsável pelo contrato do pagamento.', type: 'STRING' },
  { id: 'cidade', label: 'Cidade', description: 'Cidade do imóvel a que o pagamento se refere.', type: 'STRING' },
  { id: 'estado', label: 'Estado', description: 'UF do imóvel a que o pagamento se refere.', type: 'STRING' },
  { id: 'status_contrato', label: 'Status do Contrato', description: 'Situação do contrato no snapshot. Coluna de origem: `Status_contrato` (única com caixa divergente nesta entidade).', type: 'STRING' },
  { id: 'categoria_venda', label: 'Categoria de Venda', description: 'Categoria comercial da venda.', type: 'STRING' },
  { id: 'perfil_backtest', label: 'Perfil do Backtest', description: 'Cenário/perfil da simulação a que a linha pertence.', type: 'STRING' },
  { id: 'tipo_parcela', label: 'Tipo de Parcela', description: 'Natureza da parcela paga (ex.: mensal, balão, intercalada).', type: 'STRING' },
  { id: 'tipo_recebimento', label: 'Tipo de Recebimento', description: 'Forma pela qual o pagamento foi recebido.', type: 'STRING' },
  {
    id: 'type',
    label: 'Tipo',
    description: 'Classificador da linha na origem. ⚠️ Nome genérico herdado do dataset.',
    type: 'STRING',
  },
  { id: 'valor_pago', label: 'Valor Pago', description: 'Valor efetivamente pago na parcela.', type: 'FLOAT64', unit: 'BRL' },
];

export const ENTIDADES = {
  contratos: {
    label: 'Contratos (Backtest)',
    description:
      'Contratos da carteira no cenário simulado, com scores de bureau e posição financeira por perfil de backtest.',
    atributos: CONTRATOS,
  },
  pagamentos: {
    label: 'Pagamentos (Backtest)',
    description: 'Pagamentos observados no cenário simulado, por parcela e tipo de recebimento.',
    atributos: PAGAMENTOS,
  },
};

/**
 * Caixa real da coluna no BigQuery, quando difere do id canônico do atributo.
 * Vira `schemaBindings` nos dois clientes de backtest.
 */
export const CAIXA_REAL = {
  cidade: 'Cidade',
  estado: 'Estado',
  regional: 'Regional',
  status_contrato: 'Status_contrato',
};
