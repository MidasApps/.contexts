/**
 * Mapping persona → themes for RAG filtering.
 * Slugs alinhados com KNOWN_PERSONAS (Sprint 1.D).
 */

const PERSONA_THEMES: Record<string, string[]> = {
  'ceo-incorporadora': ['vgv', 'vso', 'banco_terreno', 'lancamento', 'caixa', 'pipeline'],
  'cfo-securitizadora': [
    'overcollateralization',
    'subordinacao',
    'tranche',
    'patrimonio_separado',
    'pdd',
    'rating',
    'wal',
    'duration',
  ],
  'cfo-incorporadora': ['margem', 'caixa', 'vso', 'distratos', 'queima', 'funding'],
  'diretor-fii-cri': ['yield', 'duration', 'pmt', 'oc', 'es', 'dy', 'p_vp', 'rating'],
  'diretor-credito-banco': ['originacao', 'market_share', 'ltv', 'sbpe', 'mcmv', 'pdd'],
  'gestor-credito-obra': ['evolucao_obra', 'medicao', 'cronograma', 'desembolso'],
  'gestor-repasse': ['repasse', 'mcmv', 'sbpe', 'caixa', 'banco'],
  controller: ['pdd', 'cmn_2682', 'ifrs9', 'provisao', 'bucket', 'aging'],
  'gestor-carteira-securitizadora': ['saldo', 'originacao', 'liquidacao', 'aging', 'taxa_media'],
  'analista-credito': ['analise_cadastro', 'serasa', 'renda', 'comprometimento', 'score'],
  'analista-cobranca': ['cobranca', 'recuperacao', 'over_30', 'over_60', 'over_90'],
  corretor: ['venda', 'pipeline', 'distrato', 'comissao'],
  'backoffice-cartorario': ['registro', 'matricula', 'cartorio', 'averbacao'],
};

const GENERIC = ['analise-credito', 'imobiliario', 'geral'];

export function retrievePersonaThemes(personaId: string): string[] {
  const themes = PERSONA_THEMES[personaId];
  if (themes && themes.length > 0) return themes;
  console.warn(
    `[retrieve-persona-themes] unknown personaId=${personaId}, returning generic themes`,
  );
  return GENERIC;
}

export function listKnownPersonaIds(): string[] {
  return Object.keys(PERSONA_THEMES);
}
