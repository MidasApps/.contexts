import { generateObject } from 'ai';
import { z } from 'zod';
import { getModel } from '@/features/ai-agents/model-registry';
import type { AiStudioRecord } from '../repo';

const RouteSchema = z.object({ workflowId: z.string() });

/**
 * Escolhe o workflow mais adequado ao comando pela sua `description` ("quando
 * usar"), via um roteador LLM barato (tier 'router'). Fail-soft: qualquer
 * falha, sem-match ou id inválido → o workflow `isDefault` (ou o 1º ativo).
 * Nunca lança.
 */
export async function selectWorkflow(
  command: string,
  workflows: AiStudioRecord[],
): Promise<AiStudioRecord> {
  const fallback = workflows.find((w) => w.isDefault === true) ?? workflows[0];
  if (workflows.length <= 1) return fallback;
  try {
    const { object } = await generateObject({
      model: getModel('router'),
      schema: RouteSchema,
      temperature: 0,
      prompt: [
        'Escolha o workflow mais adequado ao comando do usuário.',
        `Comando: ${command}`,
        '',
        'Workflows disponíveis (id — quando usar):',
        ...workflows.map((w) => `${w.id} — ${String(w.description ?? '')}`),
        '',
        'Responda com o workflowId EXATO de um item da lista.',
      ].join('\n'),
    });
    return workflows.find((w) => w.id === object.workflowId) ?? fallback;
  } catch {
    return fallback;
  }
}
