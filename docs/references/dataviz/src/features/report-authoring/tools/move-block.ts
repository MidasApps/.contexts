import { tool } from 'ai';
import { z } from 'zod';

export function createMoveBlockTool() {
  return tool({
    description: 'Move um bloco para uma nova posição relativa a outro bloco. Use para reorganizar o layout.',
    inputSchema: z.object({
      pageIndex: z.number().describe('Índice da página'),
      blockId: z.string().describe('ID do bloco a mover'),
      targetBlockId: z.string().describe('ID do bloco de referência'),
      position: z.enum(['before', 'after', 'left', 'right']).describe('Posição relativa: before/after = nova linha acima/abaixo, left/right = mesma linha'),
    }),
    execute: async ({ pageIndex, blockId, targetBlockId, position }) => {
      return { action: 'move_block', pageIndex, blockId, targetBlockId, position };
    },
  });
}
