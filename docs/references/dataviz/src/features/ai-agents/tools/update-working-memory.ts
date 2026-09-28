import { tool } from 'ai';
import { z } from 'zod';
import {
  getWorkingMemory,
  setWorkingMemory,
} from '@/shared/lib/memory/memory-service';
import {
  WorkingMemorySchema,
} from '@/shared/lib/memory/schema';

// ADR-0006: clientId/personaId/icpId são server-bound (vêm do request body /
// route handler). O modelo NÃO pode sobrescrevê-los via tool — omitidos do
// patch aceito. briefing e productType permanecem mutáveis pelo agente.
const ToolPatchSchema = WorkingMemorySchema.omit({
  clientId: true,
  personaId: true,
  icpId: true,
}).partial();

export function createUpdateWorkingMemoryTool(opts: { threadId: string }) {
  return tool({
    description:
      'Atualiza a working memory da sessão (briefing, decisões, blocos, pendências). Use SEMPRE que decisões importantes forem tomadas. clientId/personaId/icpId são imutáveis nesta tool.',
    inputSchema: z.object({ patch: ToolPatchSchema }),
    execute: async ({ patch }) => {
      // Defensive re-parse: chamadas diretas (testes) ou caminhos futuros
      // que bypassem a validação do AI SDK ainda terão clientId/personaId/
      // icpId removidos do patch antes do merge.
      const safePatch = ToolPatchSchema.parse(patch);
      const current = await getWorkingMemory(opts.threadId);
      const merged = WorkingMemorySchema.parse({
        ...(current ?? {}),
        ...safePatch,
      });
      await setWorkingMemory(opts.threadId, merged);
      return { ok: true as const, persisted: true };
    },
  });
}
