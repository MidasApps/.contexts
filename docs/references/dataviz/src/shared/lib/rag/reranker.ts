import { generateObject } from 'ai';
import { vertex } from '@ai-sdk/google-vertex';
import { z } from 'zod';

const RankSchema = z.object({
  ranked: z.array(z.object({ index: z.number().int(), score: z.number() })),
});

export interface Candidate {
  content: string;
  similarity: number;
  [k: string]: unknown;
}

export async function rerank<T extends Candidate>(input: {
  query: string;
  candidates: T[];
  topN: number;
}): Promise<T[]> {
  if (input.candidates.length <= input.topN) return input.candidates;
  const docs = input.candidates
    .map((c, i) => `[${i}] ${c.content.slice(0, 800)}`)
    .join('\n\n---\n\n');
  try {
    const { object } = await generateObject({
      model: vertex(process.env.RAG_RERANK_MODEL ?? 'gemini-2.5-flash'),
      schema: RankSchema,
      temperature: 0,
      prompt: [
        'Reordene os documentos por relevância à query.',
        `Query: ${input.query}`,
        '',
        'Documentos:',
        docs,
        '',
        'Retorne ranked com index original e score 0..1.',
      ].join('\n'),
    });
    const sorted = [...object.ranked].sort((a, b) => b.score - a.score).slice(0, input.topN);
    return sorted
      .map((r) => input.candidates[r.index])
      .filter((c): c is T => c !== undefined);
  } catch {
    return input.candidates.slice(0, input.topN);
  }
}
