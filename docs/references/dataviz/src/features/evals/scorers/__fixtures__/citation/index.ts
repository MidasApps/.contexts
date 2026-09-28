/**
 * Fixtures para `citation_grounding`. Cada fixture descreve um
 * `agentOutput` (narrative + claims + source_doc) e o score esperado.
 *
 * Estrutura `agentOutput.citations` é um espelho ad-hoc usado por este
 * scorer: claim->source_doc validation. O parser extrai claims do
 * `narrative` via regex e cruza com `citations`.
 */

export interface CitationFixture {
  id: string;
  narrative: string;
  /** Map: claim regex match → source_doc id; ausente = sem source. */
  citations?: Record<string, string>;
  /** doc_ids "válidos" no embeddings_docs (mock). */
  validDocIds: string[];
  expectedRange: [number, number];
  description: string;
}

export const CITATION_FIXTURES: CitationFixture[] = [
  {
    id: 'good-1-cmn-with-source',
    narrative: 'Conforme CMN 2.682, a provisão deve seguir os buckets H1-H5.',
    citations: { 'CMN 2.682': 'doc_cmn_2682_v1' },
    validDocIds: ['doc_cmn_2682_v1'],
    expectedRange: [0.9, 1.0],
    description: 'Bom: claim regulatório com source_doc válido.',
  },
  {
    id: 'good-2-numeric-with-source',
    narrative: 'A taxa de inadimplência subiu 250 bps no trimestre.',
    citations: { '250 bps': 'doc_relatorio_q1_2024' },
    validDocIds: ['doc_relatorio_q1_2024'],
    expectedRange: [0.9, 1.0],
    description: 'Bom: claim numérico (bps) com source_doc válido.',
  },
  {
    id: 'good-3-whitelist-pdd-no-number',
    narrative: 'O PDD da carteira está adequado e o DSCR mantém-se saudável.',
    validDocIds: [],
    expectedRange: [0.9, 1.0],
    description: 'Bom: PDD/DSCR sem número específico → whitelist.',
  },
  {
    id: 'bad-1-missing-source',
    narrative: 'Conforme Lei 13.786, a retenção é de 50%.',
    validDocIds: ['doc_lei_13786'],
    expectedRange: [0.0, 0.4],
    description: 'Ruim: claim regulatório sem source_doc.',
  },
  {
    id: 'bad-2-invalid-source',
    narrative: 'A provisão exigida é R$ 1.200.000 conforme Res. CMN 4676.',
    citations: { 'R$ 1.200.000': 'doc_inexistente_xyz', 'CMN 4676': 'doc_invalido' },
    validDocIds: ['doc_cmn_2682_v1'],
    expectedRange: [0.0, 0.3],
    description: 'Ruim: source_doc não existe em embeddings_docs.',
  },
  {
    id: 'bad-3-half-cited',
    narrative: 'Pela CVM 60 a estrutura é fiduciária. O total é R$ 500.000.',
    citations: { 'CVM 60': 'doc_cvm_60_v2' },
    validDocIds: ['doc_cvm_60_v2'],
    expectedRange: [0.4, 0.6],
    description: 'Parcial: 1 de 2 claims com source válido.',
  },
];
