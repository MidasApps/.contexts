import { tool } from 'ai';
import { z } from 'zod';

export const sentimentAnalysisTool = tool({
  description: 'Analisa sentimento de textos coletados via search_web sobre mercado imobiliário e crédito. Delega análise para o próprio LLM.',
  inputSchema: z.object({
    textos: z.array(z.object({
      source: z.string(),
      content: z.string(),
    })).describe('Textos coletados para análise de sentimento.'),
  }),
  execute: async ({ textos: texts }) => ({
    success: true,
    action: 'analyze_inline',
    content: texts.map(t => ({ source: t.source, preview: t.content.substring(0, 500) })),
    note: 'Analyze the sentiment of this content directly in your response',
  }),
});
