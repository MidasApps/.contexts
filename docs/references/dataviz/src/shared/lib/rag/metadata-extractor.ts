import { generateObject } from 'ai';
import { vertex } from '@ai-sdk/google-vertex';
import { z } from 'zod';

export const ChunkMetadataSchema = z.object({
  docType: z
    .enum(['regulatory', 'market', 'persona', 'methodology', 'benchmark'])
    .nullable(),
  product: z
    .enum(['MCMV', 'SBPE', 'LCI', 'CRI', 'CRA', 'SPE', 'BQML', 'OTHER'])
    .nullable(),
  persona: z
    .enum(['originador', 'securitizadora', 'gestor_fundo', 'incorporadora', 'analista'])
    .nullable(),
  regulatoryArea: z.string().nullable(),
});

export type ChunkMetadata = z.infer<typeof ChunkMetadataSchema>;

const NULL_METADATA: ChunkMetadata = {
  docType: null,
  product: null,
  persona: null,
  regulatoryArea: null,
};

export async function extractChunkMetadata(
  text: string,
  ctx: { sourcePath: string },
): Promise<ChunkMetadata> {
  try {
    const { object } = await generateObject({
      model: vertex(process.env.RAG_EXTRACTOR_MODEL ?? 'gemini-2.5-flash'),
      schema: ChunkMetadataSchema,
      temperature: 0,
      prompt: [
        'Classifique este chunk de documento de benchmark de crédito imobiliário.',
        '',
        `Arquivo: ${ctx.sourcePath}`,
        '',
        'Conteúdo:',
        text.slice(0, 2000),
        '',
        'Retorne null nos campos sem evidência clara.',
      ].join('\n'),
    });
    return object;
  } catch {
    return NULL_METADATA;
  }
}
