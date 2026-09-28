/**
 * Barrel + registry público dos scorers (Sprint 3.D).
 *
 * O `SCORER_REGISTRY` instancia scorers com defaults razoáveis para o
 * runner CLI (Task 11). Para uso em testes/customização, importe os
 * factories `create*` diretamente.
 */

export type {
  Scorer,
  ScorerInput,
  ScoreResult,
  ScorerName,
  AgentOutput,
  PersonaId,
  BriefingFixture,
  EvalRun,
} from './types';

export { createScorer } from './create-scorer';

export { createSqlCorrectness } from './sql-correctness';
export { createCitationGrounding } from './citation-grounding';
export { createLayoutCoherence } from './layout-coherence';
export { createPersonaFit } from './persona-fit';
export { createBusinessCorrectness } from './business-correctness';

export { createFaithfulness } from './builtin/faithfulness';
export { createPromptAlignment } from './builtin/prompt-alignment';
export { createToolCallAccuracy } from './builtin/tool-call-accuracy';

export { runJudge, clearJudgeCache, BaseJudgeOutputSchema } from './judges/judge-runner';

import { createSqlCorrectness } from './sql-correctness';
import { createCitationGrounding } from './citation-grounding';
import { createLayoutCoherence } from './layout-coherence';
import { createPersonaFit } from './persona-fit';
import { createBusinessCorrectness } from './business-correctness';
import { createFaithfulness } from './builtin/faithfulness';
import { createPromptAlignment } from './builtin/prompt-alignment';

/**
 * Registry default. `tool_call_accuracy` requer `expectedTools` por
 * fixture, então é exposto como factory aqui (não instanciado). O runner
 * (Task 11) instancia por fixture com a lista esperada.
 */
export const SCORER_REGISTRY = {
  sql_correctness: createSqlCorrectness(),
  citation_grounding: createCitationGrounding(),
  layout_coherence: createLayoutCoherence(),
  persona_fit: createPersonaFit(),
  business_correctness: createBusinessCorrectness(),
  faithfulness: createFaithfulness(),
  prompt_alignment: createPromptAlignment(),
} as const;

// TOOL_CALL_ACCURACY_FACTORY era só um alias de createToolCallAccuracy, sem
// nenhum consumidor. Quem precisa importa a factory direto.
