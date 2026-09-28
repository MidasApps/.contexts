import { tool } from 'ai';
import { z } from 'zod';

export const extractRegulatoryUpdatesTool = tool({
  description: 'Busca atualizações regulatórias recentes do CVM e Bacen relevantes para securitização. Usa search_web com queries direcionadas.',
  inputSchema: z.object({
    topico: z.enum(['cvm', 'bacen', 'cri', 'fidc', 'geral']).default('geral').describe('Tópico regulatório.'),
  }),
  execute: async ({ topico: topic }) => {
    const queries: Record<string, string[]> = {
      cvm: ['CVM regulamentação CRI 2025 2026', 'CVM instrução securitização recebíveis'],
      bacen: ['Bacen resolução crédito imobiliário 2025 2026', 'Bacen provisão PDD atualização'],
      cri: ['CRI certificado recebíveis imobiliários regulamentação', 'ANBIMA CRI mercado'],
      fidc: ['FIDC imobiliário regulamentação CVM', 'FIDC crédito imobiliário normas'],
      geral: ['regulamentação securitização Brasil 2025 2026', 'CVM Bacen crédito imobiliário normas'],
    };
    return {
      success: true,
      action: 'requires_search_web',
      suggestedQueries: queries[topic] ?? queries.geral,
      fontes_prioritarias: ['bcb.gov.br', 'cvm.gov.br', 'anbima.com.br', 'gov.br'],
      note: 'Use search_web with each query above to get actual regulatory updates',
    };
  },
});
