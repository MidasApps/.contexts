import { tool } from 'ai';
import { z } from 'zod';

export const parseMacroDataTool = tool({
  description: 'Estrutura e interpreta dados macroeconômicos coletados de search_web e get_bcb_indicator, relacionando-os com métricas de carteira.',
  inputSchema: z.object({
    indicators: z.array(z.object({
      name: z.string(),
      value: z.union([z.number(), z.string()]).describe('Valor do indicador (número ou string — será convertido).'),
      date: z.string(),
      source: z.string(),
    })).describe('Lista de indicadores coletados.'),
    context: z.string().optional().describe('Contexto adicional da carteira para relacionar.'),
  }),
  execute: async ({ indicators, context }) => {
    const analysis = indicators.map(ind => {
      const val = typeof ind.value === 'string' ? parseFloat(ind.value.replace(',', '.')) : ind.value;
      let impact = '';
      const name = ind.name.toLowerCase();
      if (name.includes('cdi')) {
        // BCB SGS 4389 returns daily rate (e.g. 0.0528%), annualize for comparison
        const annualCdi = val < 1 ? (Math.pow(1 + val / 100, 252) - 1) * 100 : val;
        impact = annualCdi > 12 ? 'Alta: pressão sobre custo de funding e inadimplência' : 'Moderada: ambiente favorável para securitização';
      } else if (name.includes('selic')) {
        impact = val > 12 ? 'Alta: pressão sobre custo de funding e inadimplência' : 'Moderada: ambiente favorável para securitização';
      } else if (name.includes('ipca')) {
        impact = val > 0.5 ? 'Alta: inflacao mensal acima do esperado, pressão sobre renda dos devedores e saldo devedor' : 'Baixa: inflação mensal controlada';
      } else if (name.includes('igpm')) {
        impact = val > 0.65 ? 'Alta: variação mensal elevada, impacto em contratos indexados ao IGP-M' : 'Moderada: variação mensal dentro do esperado';
      }
      return { ...ind, value: val, impacto_carteira: impact };
    });
    return { success: true, indicators: analysis, context };
  },
});
