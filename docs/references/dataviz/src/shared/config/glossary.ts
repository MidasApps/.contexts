/**
 * Liquid securitization glossary.
 *
 * Structured entries with optional formula, benchmark, regulatory references
 * and aliases. Use {@link getGlossaryEntry} / {@link getGlossaryDefinition}
 * to resolve by slug, human term, or alias.
 */

export const GLOSSARY_VERSION = '2026-05-04';

export interface GlossaryEntry {
  /** Human-friendly term (with accents/spacing/parentheses), e.g. "LTV (Loan-to-Value)". */
  term: string;
  /** Plain Portuguese definition. Always populated. */
  definition: string;
  /** Optional canonical formula (free-form string). */
  formula?: string;
  /** Optional benchmark / threshold guidance. */
  benchmark?: string;
  /** Optional list of regulatory references (e.g. "Resolução CMN 2.682"). */
  regulations?: string[];
  /** Optional source document name (briefing, ADR, etc.). */
  sourceDoc?: string;
  /** Optional alternative spellings / acronyms (case- and separator-insensitive). */
  aliases?: string[];
}

function normalizeTerm(t: string): string {
  return t
    .toLowerCase()
    .replaceAll(/[\s\-]+/g, '_')
    .replaceAll(/[^a-z0-9_]/g, '');
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  // ------------------------------------------------------------------
  // Core risk / pricing metrics
  // ------------------------------------------------------------------
  ltv: {
    term: 'LTV (Loan-to-Value)',
    definition:
      'Razão entre o saldo devedor atualizado a valor presente e o valor do imóvel. Valores acima de 90% indicam risco elevado para securitização.',
    formula: 'LTV = saldo_devedor / valor_imovel',
    benchmark: 'Investment grade ≤ 80%; alto risco > 90%',
    aliases: ['loan_to_value', 'loan-to-value'],
  },
  ltv_banco: {
    term: 'LTV bancário',
    definition:
      'Loan-to-Value calculado conforme critérios bancários para repasse, utilizando o saldo devedor atualizado dividido pelo valor do imóvel.',
    formula: 'LTV_banco = saldo_devedor / valor_imovel',
    benchmark: 'Limite usual de repasse: 80%',
    aliases: ['ltv banco'],
  },
  ltv_banco_stress: {
    term: 'LTV bancário (stress)',
    definition:
      'LTV bancário simulado com desvalorização de 10% no valor do imóvel. Teste de estresse para avaliar sensibilidade da carteira.',
    formula: 'LTV_stress = saldo_devedor / (valor_imovel * 0.9)',
    aliases: ['ltv stress', 'ltv_stress'],
  },
  pdd: {
    term: 'PDD (Provisão para Devedores Duvidosos)',
    definition:
      'Provisão para Devedores Duvidosos: estimativa contábil de perda esperada na carteira.',
    aliases: ['provisao_devedores_duvidosos', 'pdd_total'],
  },
  pdd_minimo_bacen: {
    term: 'PDD mínima Bacen',
    definition:
      'Provisão mínima exigida pelo Bacen conforme Resolução 2682, calculada com base nos dias de atraso.',
    regulations: ['Resolução CMN 2.682/1999'],
    aliases: ['pdd_bacen', 'pdd_minimo'],
  },
  pdd_liquid: {
    term: 'PDD Liquid',
    definition:
      'Provisão calculada pelo modelo proprietário Liquid, baseada na probabilidade de inadimplência do rating.',
  },
  delta_pdd: {
    term: 'Delta PDD',
    definition:
      'Diferença entre a PDD Liquid e a PDD Mínima Bacen. Indica o risco adicional capturado pelo modelo proprietário além da exigência regulatória.',
    formula: 'Delta_PDD = PDD_liquid - PDD_minimo_bacen',
  },
  rating_liquid: {
    term: 'Rating Liquid',
    definition:
      'Classificação de risco proprietária da Liquid, de A (baixo risco) a H (default).',
  },
  desagio: {
    term: 'Deságio',
    definition:
      'Percentual de desconto aplicado sobre o valor nominal na precificação da carteira.',
    formula: 'Deságio (%) = (pricing - saldo_nominal) / saldo_nominal * 100',
  },
  pricing: {
    term: 'Pricing (mark-to-model)',
    definition:
      'Valor de mercado estimado da carteira (mark-to-model), calculado a partir do fluxo esperado descontado pela taxa de deságio por rating Liquid.',
    aliases: ['mark_to_model', 'mtm'],
  },

  // ------------------------------------------------------------------
  // Inadimplência / atraso
  // ------------------------------------------------------------------
  inadimplencia: {
    term: 'Inadimplência',
    definition:
      'Taxa de inadimplência: razão entre o valor em atraso (parcelas vencidas e não pagas) e o saldo devedor total da carteira. Expressa em percentual.',
    formula: 'Inadimplência (%) = Σ valor_atraso / Σ saldo_devedor * 100',
  },
  over_90: {
    term: 'Over 90',
    definition:
      'Percentual de contratos com parcelas vencidas há mais de 90 dias. Indicador crítico de inadimplência crônica na carteira.',
    formula: 'Over 90 (%) = contratos com dias_atraso > 90 / total contratos',
    benchmark: 'Carteira saudável ≤ 5%; alto risco > 10%',
    aliases: ['over90', 'over_90_dias'],
  },
  valor_atraso: {
    term: 'Valor em atraso',
    definition:
      'Soma de todas as parcelas vencidas e não pagas (principal + juros) de todos os contratos da carteira.',
  },
  faixa_atraso: {
    term: 'Faixa de atraso',
    definition:
      'Agrupamento de contratos por quantidade de dias em atraso.',
  },
  recuperacao: {
    term: 'Recuperação',
    definition:
      'Valor recebido no período corrente referente a parcelas que estavam inadimplentes em períodos anteriores. Indicador de eficácia da cobrança.',
  },

  // ------------------------------------------------------------------
  // Saldos, prazos, fluxos
  // ------------------------------------------------------------------
  saldo_nominal: {
    term: 'Saldo nominal',
    definition:
      'Valor nominal total dos contratos, correspondente ao saldo original antes da correção monetária e amortizações.',
  },
  saldo_devedor: {
    term: 'Saldo devedor',
    definition:
      'Valor atualizado da dívida, já considerando pagamentos e correção.',
  },
  correcao_monetaria: {
    term: 'Correção monetária',
    definition:
      'Índice de correção monetária aplicado à atualização do saldo devedor dos contratos (ex.: TR, IPCA, IGP-M, Taxa Fixa).',
  },
  prazo_remanescente: {
    term: 'Prazo remanescente',
    definition:
      'Quantidade de meses restantes até o vencimento do contrato.',
  },
  prazo_decorrido: {
    term: 'Prazo decorrido',
    definition:
      'Quantidade de meses já transcorridos desde a originação do contrato.',
  },
  fluxo_esperado: {
    term: 'Fluxo esperado',
    definition:
      'Projeção dos recebíveis futuros ajustada pela probabilidade de inadimplência (PD) do modelo Liquid. Representa o fluxo de caixa esperado após desconto de perdas estimadas.',
  },
  fluxo_contratado: {
    term: 'Fluxo contratado',
    definition:
      'Soma das parcelas contratadas a vencer no período, sem desconto por risco de inadimplência. Representa o cenário base sem perdas.',
  },
  pagamento_antecipado: {
    term: 'Pagamento antecipado',
    definition:
      'Valor recebido referente a parcelas pagas antes da data de vencimento. Inclui amortizações extraordinárias e liquidações antecipadas.',
  },
  vencimento_referencia: {
    term: 'Vencimento na referência',
    definition:
      'Valor das parcelas com vencimento no mês de referência do relatório.',
  },
  total_contratos: {
    term: 'Total de contratos',
    definition:
      'Número total de contratos ativos na carteira securitizada.',
  },

  // ------------------------------------------------------------------
  // Securitização — instrumentos e estrutura
  // ------------------------------------------------------------------
  cri: {
    term: 'CRI (Certificado de Recebíveis Imobiliários)',
    definition:
      'Título de renda fixa lastreado em créditos imobiliários, emitido por securitizadora. Permite antecipar recebíveis de longo prazo do setor imobiliário.',
    regulations: ['Resolução CVM 60/2021', 'Lei 9.514/1997'],
    aliases: ['certificado_recebiveis_imobiliarios'],
  },
  cra: {
    term: 'CRA (Certificado de Recebíveis do Agronegócio)',
    definition:
      'Título de renda fixa lastreado em créditos do agronegócio, emitido por securitizadora. Análogo ao CRI mas para o setor agro.',
    regulations: ['Lei 11.076/2004', 'Resolução CVM 60/2021'],
    aliases: ['certificado_recebiveis_agronegocio'],
  },
  lci: {
    term: 'LCI (Letra de Crédito Imobiliário)',
    definition:
      'Título emitido por instituições financeiras lastreado em créditos imobiliários. Isento de IR para pessoa física, com garantia do FGC até o limite legal.',
    regulations: ['Lei 10.931/2004'],
  },
  ret: {
    term: 'RET (Regime Especial de Tributação)',
    definition:
      'Regime tributário aplicável a incorporações imobiliárias afetadas em patrimônio de afetação. Permite alíquota reduzida unificada (4% ou 1% para MCMV) em substituição aos tributos federais usuais.',
    regulations: ['Lei 10.931/2004'],
    aliases: ['regime_especial_tributacao', 'patrimonio_afetacao'],
  },
  oc: {
    term: 'OC (Over-Collateralization)',
    definition:
      'Sobrecolateralização: técnica de reforço de crédito em que o lastro da operação excede o valor da emissão, criando colchão para absorver perdas antes que afetem investidores.',
    formula: 'OC (%) = (saldo_lastro - saldo_emissao) / saldo_emissao * 100',
    benchmark: 'Estruturas conservadoras: OC ≥ 15%',
    aliases: ['over_collateralization', 'sobrecolateralizacao'],
  },
  es: {
    term: 'ES (Excess Spread)',
    definition:
      'Diferença entre a taxa média de juros recebida do lastro e a taxa paga aos investidores (líquida de taxas e perdas esperadas). Primeira camada de proteção contra inadimplência.',
    formula: 'ES = taxa_lastro - taxa_emissao - taxas_estrutura - perda_esperada',
    aliases: ['excess_spread'],
  },
  dscr: {
    term: 'DSCR (Debt Service Coverage Ratio)',
    definition:
      'Razão de cobertura do serviço da dívida: mede a capacidade do fluxo de caixa operacional cobrir o serviço da dívida (principal + juros) no período.',
    formula: 'DSCR = fluxo_caixa_operacional / servico_divida',
    benchmark: 'DSCR ≥ 1,2x considerado saudável; DSCR < 1,0 indica déficit',
    aliases: ['debt_service_coverage_ratio'],
  },
  wal: {
    term: 'WAL (Weighted Average Life)',
    definition:
      'Vida média ponderada de uma operação: prazo médio dos fluxos de principal ponderado pelos valores. Usado para precificar e comparar séries de CRI/CRA.',
    formula: 'WAL = Σ (t_i * principal_i) / Σ principal_i',
    aliases: ['weighted_average_life', 'vida_media_ponderada'],
  },
  covenant: {
    term: 'Covenant',
    definition:
      'Cláusula contratual (covenant) que define indicadores financeiros e operacionais mínimos a serem mantidos pelo tomador, com gatilhos de vencimento antecipado em caso de descumprimento.',
  },
  stress_test: {
    term: 'Stress test',
    definition:
      'Simulação de cenário adverso para avaliar a resiliência da carteira.',
    aliases: ['teste_estresse'],
  },
  elegibilidade: {
    term: 'Elegibilidade',
    definition:
      'Classificação do contrato quanto aos critérios para securitização ou repasse.',
  },

  // ------------------------------------------------------------------
  // Programas habitacionais e índices
  // ------------------------------------------------------------------
  mcmv: {
    term: 'MCMV (Minha Casa Minha Vida)',
    definition:
      'Programa habitacional federal voltado a famílias de baixa e média renda, com financiamento subsidiado pelo FGTS e/ou Tesouro. Possui faixas por renda familiar.',
    regulations: ['Lei 11.977/2009', 'Lei 14.620/2023'],
    aliases: ['minha_casa_minha_vida', 'programa_mcmv'],
  },
  faixa_mcmv: {
    term: 'Faixa MCMV',
    definition:
      'Faixa do programa Minha Casa Minha Vida em que o contrato se enquadra, determinada pela renda familiar.',
  },
  sbpe: {
    term: 'SBPE (Sistema Brasileiro de Poupança e Empréstimo)',
    definition:
      'Sistema que canaliza recursos da caderneta de poupança para financiamento habitacional. Faixa de financiamento típica acima do teto MCMV.',
    regulations: ['Resolução CMN 4.676/2018'],
    aliases: ['sistema_brasileiro_poupanca_emprestimo'],
  },
  incc: {
    term: 'INCC (Índice Nacional de Custo da Construção)',
    definition:
      'Índice da FGV que mede a variação dos custos de construção habitacional no Brasil. Comumente usado para corrigir parcelas durante a fase de obra.',
    aliases: ['incc_di', 'indice_custo_construcao'],
  },
  ipca: {
    term: 'IPCA (Índice de Preços ao Consumidor Amplo)',
    definition:
      'Índice oficial de inflação medido pelo IBGE, referência para metas do CMN. Usado para corrigir contratos pós-fixados em IPCA+.',
    aliases: ['indice_precos_consumidor_amplo'],
  },
  sinapi: {
    term: 'SINAPI (Sistema Nacional de Pesquisa de Custos)',
    definition:
      'Sistema operado pela Caixa e IBGE que pesquisa custos e índices da construção civil. Referência para orçamentação de obras públicas e privadas.',
    aliases: ['sistema_nacional_pesquisa_custos'],
  },

  // ------------------------------------------------------------------
  // Operacional / cobrança / repasse
  // ------------------------------------------------------------------
  pro_soluto: {
    term: 'Pro-soluto',
    definition:
      'Operação pro-soluto: modalidade em que o cedente (incorporador) retém o risco de inadimplência do comprador, sem garantia de recompra pelo banco. Comum em carteiras MCMV pré-repasse.',
    aliases: ['prosoluto', 'pro-soluto'],
  },
  prosoluto_total: {
    term: 'Pro-soluto total',
    definition:
      'Valor total de créditos em regime pro-soluto na carteira, sem garantia bancária de recompra.',
  },
  safra: {
    term: 'Safra',
    definition:
      'Safra de originação: mês/ano em que o contrato foi celebrado. Utilizada para análise de cohort e identificação de padrões de inadimplência por vintage.',
    aliases: ['vintage', 'cohort'],
  },
  matriz_cobranca: {
    term: 'Matriz de cobrança',
    definition:
      'Classificação cruzada de contratos por perfil de cobrança (perfil_cobranca) e categoria de inadimplência, utilizada para segmentar estratégias de recuperação de crédito.',
  },
  perfil_cobranca: {
    term: 'Perfil de cobrança',
    definition:
      'Classificação do contrato por perfil de cobrança, cruzando faixa de comprometimento de renda, presença de restrições e relação entre valor da parcela e capacidade de pagamento.',
  },
  restricao: {
    term: 'Restrição',
    definition:
      'Apontamento restritivo de crédito (PEFIN, REFIN, Protestos) vinculado ao CPF/CNPJ do devedor. Impacta a elegibilidade para repasse bancário e a classificação nos grupos de estratégia.',
    aliases: ['restricao_cadastral', 'pefin', 'refin'],
  },
  grupos_repasse: {
    term: 'Grupos de repasse',
    definition:
      'Segmentação de contratos (G1 a G8) por combinação de: presença de restrições cadastrais, LTV bancário acima/abaixo de 80% e suficiência de renda. Utilizada para priorizar estratégias de repasse.',
  },
  renda_suficiente: {
    term: 'Renda suficiente',
    definition:
      'Indicador que compara a renda familiar declarada com o comprometimento de renda exigido pelo banco para aprovação do financiamento.',
  },
  delta_renda: {
    term: 'Delta renda',
    definition:
      'Diferença entre a renda familiar e a renda mínima necessária para aprovação bancária. Classificada em baixo, médio e alto.',
  },

  // ------------------------------------------------------------------
  // Regulação e normativos
  // ------------------------------------------------------------------
  cvm_60: {
    term: 'Resolução CVM 60',
    definition:
      'Norma da CVM que regula a emissão pública de Certificados de Recebíveis (CRI/CRA) e os deveres das securitizadoras. Substituiu a Instrução CVM 414.',
    regulations: ['Resolução CVM 60/2021'],
    aliases: ['resolucao_cvm_60', 'icvm_60'],
  },
  cmn_2682: {
    term: 'Resolução CMN 2.682',
    definition:
      'Resolução do Conselho Monetário Nacional que estabelece os critérios de classificação de risco e provisionamento (PDD) para operações de crédito de instituições financeiras.',
    regulations: ['Resolução CMN 2.682/1999'],
    aliases: ['resolucao_2682', 'res_2682', 'bacen_2682'],
  },
  icvm_175: {
    term: 'Resolução CVM 175',
    definition:
      'Norma da CVM que regulamenta os fundos de investimento no Brasil, consolidando regras anteriores (FII, FIDC, FIP etc.). Estabelece governança, classificação e divulgação.',
    regulations: ['Resolução CVM 175/2022'],
    aliases: ['resolucao_cvm_175', 'cvm_175'],
  },
};

/**
 * Resolves a glossary entry by slug, term (case-insensitive) or alias.
 *
 * Examples: `getGlossaryEntry('ltv')`, `getGlossaryEntry('LTV')`,
 * `getGlossaryEntry('Loan-to-Value')` — all return the same entry.
 */
export function getGlossaryEntry(termOrSlug: string): GlossaryEntry | undefined {
  const slug = normalizeTerm(termOrSlug);
  if (GLOSSARY[slug]) return GLOSSARY[slug];
  for (const entry of Object.values(GLOSSARY)) {
    if (entry.aliases?.some((a) => normalizeTerm(a) === slug)) return entry;
    if (normalizeTerm(entry.term) === slug) return entry;
  }
  return undefined;
}

/** Returns the definition string for a known term, empty string otherwise. */
export function getGlossaryDefinition(termOrSlug: string): string {
  return getGlossaryEntry(termOrSlug)?.definition ?? '';
}

/** Sorted slug list — stable for snapshot/UI rendering. */
export function listGlossaryTerms(): string[] {
  return Object.keys(GLOSSARY).sort();
}

// GLOSSARY_LEGACY (Record<string, string> para chamadores antigos) foi
// removido: estava marcado @deprecated e não tinha mais nenhum chamador.
// Quem precisa de definição usa getGlossaryDefinition.
