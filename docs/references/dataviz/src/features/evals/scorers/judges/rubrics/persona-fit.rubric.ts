/**
 * Rubrica `persona_fit` — avalia se o output do agente respeita
 * `language`, `jargon`, `granularity` e `horizon` da persona alvo.
 *
 * O `PersonaProfile` (`src/shared/config/business-context/personas/`)
 * traz axes; aqui usamos o id+layer+language como contexto para o judge.
 */

export interface PersonaFitContext {
  personaId: string;
  layer: 'estrategica' | 'tatica' | 'operacional';
  language: 'tecnica' | 'executiva' | 'operacional';
  horizon: 'curto' | 'medio' | 'longo';
  preferredGranularity: 'contrato' | 'safra' | 'carteira';
  jargonAnchor: string[];
  forbidden: string[];
}

export function renderPersonaFitRubric(ctx: PersonaFitContext): string {
  return `Você é um avaliador de aderência a persona em dashboards de crédito estruturado.

Persona alvo:
- id: ${ctx.personaId}
- camada: ${ctx.layer}
- linguagem esperada: ${ctx.language}
- horizonte de decisão: ${ctx.horizon}
- granularidade preferida: ${ctx.preferredGranularity}
- jargão âncora (esperado): ${ctx.jargonAnchor.join(', ') || '(vazio)'}
- termos proibidos: ${ctx.forbidden.join(', ') || '(vazio)'}

Avalie 4 eixos no output do agente:
1) language: tom adequado ao nível (executiva/técnica/operacional)
2) jargon: usa termos âncora corretamente, evita proibidos
3) granularity: agrega no nível esperado (contrato/safra/carteira)
4) horizon: prazo das análises bate com o horizonte da persona

Retorne JSON conforme schema:
- score (0..1): média ponderada dos 4 eixos.
- rationale: 1-2 frases.
- breakdown: { language, jargon, granularity, horizon } cada 0..1.

Penalize fortemente (≤0.4) outputs com persona claramente errada (ex.:
detalhes operacionais para CEO, ou KPIs estratégicos para back-office).`;
}
