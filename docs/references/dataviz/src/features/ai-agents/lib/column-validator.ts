/**
 * Whitelist of valid column names from the contratos table schema.
 * Used to validate LLM-provided column names before SQL interpolation.
 */
const CONTRACT_COLUMNS = new Set([
  'id_contrato', 'data_base_report', 'data_contrato', 'projeto',
  'nome_empreendimento', 'documento', 'nome_cliente', 'proponent_type',
  'unidade', 'data_emissao', 'safra', 'saldo_devedor', 'saldo_nominal',
  'valor_imovel', 'ltv', 'faixa_ltv', 'rating_liquid', 'elegibilidade',
  'elegivel_cri', 'dias_atraso', 'faixa_atraso', 'valor_atraso',
  'valor_over_90', 'pdd_minimo_bacen', 'pdd_liquid', 'delta_pdd',
  'pricing', 'taxa_juros', 'correcao_monetaria', 'prazo_decorrido',
  'prazo_remanescente', 'restricoes', 'grupos_repasse',
  'renda_suficiente', 'limite_simulacao', 'private_area',
]);

/** Numeric columns that can be used in aggregations (SUM, AVG, etc.) */
const NUMERIC_COLUMNS = new Set([
  'saldo_devedor', 'saldo_nominal', 'valor_imovel', 'ltv',
  'dias_atraso', 'valor_atraso', 'valor_over_90', 'pdd_minimo_bacen',
  'pdd_liquid', 'delta_pdd', 'pricing', 'taxa_juros',
  'correcao_monetaria', 'prazo_decorrido', 'prazo_remanescente',
  'restricoes', 'renda_suficiente', 'limite_simulacao', 'private_area',
]);

/** Dimension columns usable for GROUP BY */
const DIMENSION_COLUMNS = new Set([
  'id_contrato', 'projeto', 'nome_empreendimento', 'documento',
  'nome_cliente', 'proponent_type', 'safra', 'faixa_ltv',
  'rating_liquid', 'elegibilidade', 'faixa_atraso', 'grupos_repasse',
]);

type ColumnKind = 'any' | 'numeric' | 'dimension';

interface ValidResult { valid: true; column: string }
interface InvalidResult { valid: false; error: string }

export function validateColumn(input: string, kind: ColumnKind = 'any'): ValidResult | InvalidResult {
  const clean = input.trim().toLowerCase().replace(/\s+/g, '_');
  const pool = kind === 'numeric' ? NUMERIC_COLUMNS
    : kind === 'dimension' ? DIMENSION_COLUMNS
    : CONTRACT_COLUMNS;

  if (pool.has(clean)) return { valid: true, column: clean };

  // Fuzzy: find columns that contain the input or vice versa
  const suggestions = [...pool].filter(c => c.includes(clean) || clean.includes(c));

  if (suggestions.length > 0) {
    return { valid: false, error: `Coluna "${input}" não encontrada. Você quis dizer: ${suggestions.join(', ')}?` };
  }
  return { valid: false, error: `Coluna "${input}" não existe na tabela contratos. Colunas ${kind === 'numeric' ? 'numéricas' : kind === 'dimension' ? 'de dimensão' : ''}válidas: ${[...pool].slice(0, 15).join(', ')}...` };
}
