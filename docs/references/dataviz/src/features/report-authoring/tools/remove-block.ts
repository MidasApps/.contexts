import { tool } from 'ai';
import { z } from 'zod';

export function createRemoveBlockTool() {
  return tool({
    description: 'Remove um bloco da página.',
    inputSchema: z.object({
      pageIndex: z.number().describe('Índice da página'),
      blockId: z.string().describe('ID do bloco a remover'),
    }),
    execute: async ({ pageIndex, blockId }) => {
      return { action: 'remove_block', pageIndex, blockId };
    },
  });
}
