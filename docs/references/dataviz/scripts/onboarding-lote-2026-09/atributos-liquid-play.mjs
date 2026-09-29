/**
 * Atributos NOVOS do contrato `liquid-play`, vindos dos 7 datasets `*_monitor`
 * do lote de setembro/2026 (SPL, Masa, BRZ, Construtora Sudoeste, Jotanunes,
 * OM, MS).
 *
 * Só entra aqui coluna que EXISTE em pelo menos um dataset e que o contrato
 * ainda não conhece. Tipos vêm da introspecção do `INFORMATION_SCHEMA` — não
 * de suposição.
 *
 * ─── Convenções de sufixo do domínio, herdadas do contrato atual ───
 *   `_fi`      financiamento imobiliário (a parcela bancária)
 *   `_ps`      pró-soluto (a parcela direta com a incorporadora)
 *   `_outros`  demais origens de recebível
 *   `_pre`     fase pré-chaves (antes da entrega da unidade)
 *   `_pos`     fase pós-chaves
 *   `_chaves`  no ato da entrega das chaves
 *   `_pe`      plano empresário (financiamento à produção)
 *   `_hist`    série histórica (o contrato já tem os `_hist`; estes são o
 *              valor corrente equivalente)
 *
 * ⚠️ `Elegibilidade` (maiúscula, em Masa e MS) NÃO está aqui de propósito: é a
 * MESMA coisa que o `elegibilidade` já no contrato, com outra caixa. Vira
 * binding (`contratos.elegibilidade` → `Elegibilidade`), não atributo novo —
 * criar os dois partiria o vocabulário em dois nomes para um conceito.
 */

/** Gera as 3 fases de um valor decomposto por momento do contrato. */
function porFase(prefixo, rotulo, descricaoBase, unit = 'BRL') {
  const fases = [
    ['pre', 'Pré-Chaves', 'na fase pré-chaves (antes da entrega da unidade)'],
    ['pos', 'Pós-Chaves', 'na fase pós-chaves (após a entrega da unidade)'],
    ['chaves', 'Chaves', 'no ato da entrega das chaves'],
  ];
  return fases.map(([sufixo, rotuloFase, descFase]) => ({
    id: `${prefixo}_${sufixo}`,
    label: `${rotulo} — ${rotuloFase}`,
    description: `${descricaoBase} ${descFase}.`,
    type: 'FLOAT64',
    unit,
  }));
}

export const CONTRATOS = [
  // ── Atraso decomposto por origem × fase ───────────────────────────
  ...porFase('atraso_fi', 'Atraso FI', 'Valor em atraso do financiamento imobiliário'),
  ...porFase('atraso_ps', 'Atraso Pró-Soluto', 'Valor em atraso do pró-soluto'),
  ...porFase('atraso_outros', 'Atraso Outros', 'Valor em atraso das demais origens de recebível'),

  // ── Saldo devedor decomposto por origem × fase ────────────────────
  ...porFase('saldo_fi', 'Saldo FI', 'Saldo devedor do financiamento imobiliário'),
  ...porFase('saldo_ps', 'Saldo Pró-Soluto', 'Saldo devedor do pró-soluto'),
  ...porFase('saldo_outros', 'Saldo Outros', 'Saldo devedor das demais origens de recebível'),

  // ── Pior atraso observado no pró-soluto, por fase ─────────────────
  ...porFase(
    'max_atraso_ps',
    'Atraso Máximo Pró-Soluto',
    'Maior atraso já observado no pró-soluto',
    'dias',
  ),

  // ── Restrições de crédito por proponente ──────────────────────────
  {
    id: 'restricoes_1st',
    label: 'Restrições — 1º Proponente',
    description: 'Valor total de restrições de crédito no nome do primeiro proponente.',
    type: 'FLOAT64',
    unit: 'BRL',
  },
  {
    id: 'restricoes_2nd',
    label: 'Restrições — 2º Proponente',
    description: 'Valor total de restrições de crédito no nome do segundo proponente.',
    type: 'FLOAT64',
    unit: 'BRL',
  },
  {
    id: 'restricoes_fiador',
    label: 'Restrições — Fiador',
    description: 'Valor total de restrições de crédito no nome do fiador.',
    type: 'FLOAT64',
    unit: 'BRL',
  },
  {
    id: 'restricoes_sum',
    label: 'Restrições — Soma',
    description:
      'Soma das restrições de crédito de todos os envolvidos no contrato (proponentes e fiador).',
    type: 'FLOAT64',
    unit: 'BRL',
  },

  // ── Plano empresário: valor corrente (o contrato já tem os `_hist`) ──
  {
    id: 'desagio_pe',
    label: 'Deságio do Plano Empresário',
    description:
      'Deságio corrente aplicado ao recebível no plano empresário. O contrato já traz a série em `desagio_pe_hist`; este é o valor da data-base.',
    type: 'FLOAT64',
    unit: '%',
  },
  {
    id: 'desagio_pe_ps',
    label: 'Deságio do Plano Empresário — Pró-Soluto',
    description:
      'Deságio corrente aplicado à parcela pró-soluto no plano empresário. Equivalente corrente de `desagio_pe_ps_hist`.',
    type: 'FLOAT64',
    unit: '%',
  },
  {
    id: 'pricing_pe',
    label: 'Pricing do Plano Empresário',
    description:
      'Preço corrente do recebível no plano empresário. Equivalente corrente de `pricing_pe_hist`.',
    type: 'FLOAT64',
    unit: 'BRL',
  },
  {
    id: 'pricing_pe_ps',
    label: 'Pricing do Plano Empresário — Pró-Soluto',
    description:
      'Preço corrente da parcela pró-soluto no plano empresário. Equivalente corrente de `pricing_pe_ps_hist`.',
    type: 'FLOAT64',
    unit: 'BRL',
  },

  // ── PDD segregada do pró-soluto ───────────────────────────────────
  {
    id: 'pdd_liquid_ps',
    label: 'PDD Liquid — Pró-Soluto',
    description:
      'Provisão para devedores duvidosos da parcela pró-soluto pelo critério Liquid.',
    type: 'FLOAT64',
    unit: 'BRL',
  },
  {
    id: 'pdd_minimo_bacen_ps',
    label: 'PDD Mínima Bacen — Pró-Soluto',
    description:
      'Provisão mínima exigida pela Resolução Bacen para a parcela pró-soluto.',
    type: 'FLOAT64',
    unit: 'BRL',
  },
  {
    id: 'delta_pdd_ps',
    label: 'Delta de PDD — Pró-Soluto',
    description:
      'Diferença entre a PDD Liquid e a PDD mínima Bacen na parcela pró-soluto. Positivo = provisão acima do mínimo regulatório.',
    type: 'FLOAT64',
    unit: 'BRL',
  },
  {
    id: 'saldo_nominal_ps',
    label: 'Saldo Nominal — Pró-Soluto',
    description:
      'Saldo nominal (sem desconto a valor presente) da parcela pró-soluto.',
    type: 'FLOAT64',
    unit: 'BRL',
  },

  // ── Scores ────────────────────────────────────────────────────────
  {
    id: 'score_bvs',
    label: 'Score BVS',
    description: 'Score de crédito do proponente fornecido pelo bureau BVS.',
    type: 'FLOAT64',
  },
  {
    id: 'score_final',
    label: 'Score Final',
    description:
      'Score consolidado usado na decisão, após combinar as fontes de bureau disponíveis.',
    type: 'FLOAT64',
  },

  // ── Dimensões de recorte ──────────────────────────────────────────
  {
    id: 'credit_line',
    label: 'Linha de Crédito',
    description: 'Linha de crédito sob a qual o contrato foi originado.',
    type: 'STRING',
  },
  {
    id: 'incorporadora',
    label: 'Incorporadora',
    description:
      'Incorporadora responsável pelo empreendimento. Recorte acima de `projeto` quando um cliente carrega mais de uma incorporadora.',
    type: 'STRING',
  },
  {
    id: 'product',
    label: 'Produto',
    description: 'Produto de crédito do contrato (ex.: SBPE, MCMV, carteira própria).',
    type: 'STRING',
  },
  {
    id: 'regional',
    label: 'Regional',
    description: 'Regional comercial responsável pelo contrato.',
    type: 'STRING',
  },
  {
    id: 'securitizacao',
    label: 'Securitização',
    description:
      'Operação de securitização à qual o recebível está vinculado, quando houver.',
    type: 'STRING',
  },
  {
    id: 'segmento',
    label: 'Segmento',
    description: 'Segmento de mercado do empreendimento ou do cliente.',
    type: 'STRING',
  },
  {
    id: 'status_financiamento',
    label: 'Status do Financiamento',
    description:
      'Situação do financiamento imobiliário do contrato (ex.: em análise, contratado, repassado).',
    type: 'STRING',
  },
  {
    id: 'status_obra',
    label: 'Status da Obra',
    description:
      'Estágio da obra do empreendimento. Distinto de `building_status`, que alguns clientes usam com codificação própria.',
    type: 'STRING',
  },
  {
    id: 'tipo_contrato',
    label: 'Tipo de Contrato',
    description:
      'Natureza do contrato. ⚠️ NÃO é `status_contrato` (situação) nem `tipo_recebivel` (natureza do recebível) — ver a nota de Masa/MS em docs/documentations.',
    type: 'STRING',
  },
  {
    id: 'tipo_processo',
    label: 'Tipo de Processo',
    description: 'Tipo do processo operacional que originou ou tramita o contrato.',
    type: 'STRING',
  },
  {
    id: 'juridico',
    label: 'Situação Jurídica',
    description:
      'Marcação de contrato em tratativa jurídica. Presente apenas em Masa neste lote.',
    type: 'STRING',
  },

  // ── Datas, valores e contagens ────────────────────────────────────
  {
    id: 'data_entrega',
    label: 'Data de Entrega',
    description:
      'Data de entrega da unidade ao comprador. Declarada como DATE: SPL e BRZ trazem DATE, OM traz TIMESTAMP — a divergência está registrada em docs/documentations.',
    type: 'DATE',
  },
  {
    id: 'valor_pago',
    label: 'Valor Pago',
    description: 'Total já pago pelo comprador no contrato até a data-base.',
    type: 'FLOAT64',
    unit: 'BRL',
  },
  {
    id: 'numero_parcelas_em_aberto',
    label: 'Parcelas em Aberto',
    description: 'Quantidade de parcelas ainda não liquidadas do contrato.',
    type: 'INT64',
    unit: 'parcelas',
  },
  {
    id: 'faixa_atraso_outros_1',
    label: 'Faixa de Atraso Outros — Critério 1',
    description:
      'Faixa de atraso das demais origens de recebível pelo primeiro critério de corte, na mesma escada de `faixa_atraso_1`.',
    type: 'STRING',
  },
  {
    id: 'faixa_atraso_outros_2',
    label: 'Faixa de Atraso Outros — Critério 2',
    description:
      'Faixa de atraso das demais origens de recebível pelo segundo critério de corte, na mesma escada de `faixa_atraso_2`.',
    type: 'STRING',
  },
];

/** Dimensões que se repetem nas três entidades — mesma definição, mesmo texto. */
const DIMENSOES_COMPARTILHADAS = {
  incorporadora: CONTRATOS.find((a) => a.id === 'incorporadora'),
  regional: CONTRATOS.find((a) => a.id === 'regional'),
  securitizacao: CONTRATOS.find((a) => a.id === 'securitizacao'),
  status_financiamento: CONTRATOS.find((a) => a.id === 'status_financiamento'),
  tipo_contrato: CONTRATOS.find((a) => a.id === 'tipo_contrato'),
  tipo_processo: CONTRATOS.find((a) => a.id === 'tipo_processo'),
  juridico: CONTRATOS.find((a) => a.id === 'juridico'),
};

export const FLUXO_CAIXA = [
  DIMENSOES_COMPARTILHADAS.incorporadora,
  DIMENSOES_COMPARTILHADAS.juridico,
  DIMENSOES_COMPARTILHADAS.regional,
  DIMENSOES_COMPARTILHADAS.securitizacao,
  DIMENSOES_COMPARTILHADAS.status_financiamento,
  DIMENSOES_COMPARTILHADAS.tipo_contrato,
  DIMENSOES_COMPARTILHADAS.tipo_processo,
  {
    id: 'situacao_ps',
    label: 'Situação do Pró-Soluto',
    description:
      'Situação da parcela pró-soluto na linha de fluxo. Presente apenas em Jotanunes neste lote.',
    type: 'STRING',
  },
  {
    id: 'tipo',
    label: 'Tipo',
    description:
      'Classificador livre da linha de fluxo. ⚠️ Nome genérico herdado do dataset de origem (Jotanunes) — não confundir com `tipo_recebivel`.',
    type: 'STRING',
  },
];

export const PAGAMENTOS = [
  DIMENSOES_COMPARTILHADAS.incorporadora,
  DIMENSOES_COMPARTILHADAS.juridico,
  DIMENSOES_COMPARTILHADAS.regional,
  DIMENSOES_COMPARTILHADAS.securitizacao,
  DIMENSOES_COMPARTILHADAS.status_financiamento,
  DIMENSOES_COMPARTILHADAS.tipo_contrato,
  DIMENSOES_COMPARTILHADAS.tipo_processo,
];

export const NOVOS_ATRIBUTOS = {
  contratos: CONTRATOS,
  fluxo_caixa: FLUXO_CAIXA,
  pagamentos: PAGAMENTOS,
};

/** Correção de tipo inválido já gravado: `FLOAT` não existe no enum FieldType. */
export const CORRECOES_DE_TIPO = [
  { entidade: 'contratos', atributo: 'ltv_dirty', de: 'FLOAT', para: 'FLOAT64' },
];
