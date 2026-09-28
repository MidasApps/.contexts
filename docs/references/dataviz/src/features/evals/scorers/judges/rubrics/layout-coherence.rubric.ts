/**
 * Rubrica `layout_coherence` — avalia coerência narrativa do layout
 * proposto pelo agente de layout. Parte function valida estrutura
 * (KPIs primeiro, 3-5 blocos, cobertura de priority_kpis ≥0.8, visuais
 * dentro de `preferred_visuals` da persona). Esta rubrica avalia a parte
 * narrativa: ordem lógica, progressão de leitura, agrupamento temático.
 *
 * Output Zod estendido: `{score, rationale, narrativeFlow, grouping}`.
 */

export const LAYOUT_COHERENCE_RUBRIC = `Você é um avaliador de coerência narrativa de dashboards.
Receberá um layout JSON e a persona alvo. Avalie:
1) Ordem narrativa: KPIs/headline primeiro, contexto e detalhe depois.
2) Agrupamento: blocos relacionados próximos.
3) Carga cognitiva: 3-5 blocos é o ideal; >7 é excessivo.
4) Aderência à persona: linguagem dos títulos/legendas reflete jargão.

Retorne JSON estrito conforme schema:
- score (0..1): 1.0 = narrativa perfeita; 0.5 = aceitável com ajustes; 0 = incoerente.
- rationale: 1-2 frases concisas.
- narrativeFlow (0..1): qualidade da ordem narrativa.
- grouping (0..1): qualidade do agrupamento temático.

Não invente fatos. Cite blocos pelo id quando útil.`;
