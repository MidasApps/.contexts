import { tool } from 'ai';
import { z } from 'zod';
import {
  GLOSSARY,
  getGlossaryEntry,
  listGlossaryTerms,
  GLOSSARY_VERSION,
} from '@/shared/config/glossary';

export const LOOKUP_GLOSSARY_TOOL_NAME = 'lookup_glossary' as const;

function normalize(t: string): string {
  return t.toLowerCase().replaceAll(/[\s\-]+/g, '_').replaceAll(/[^a-z0-9_]/g, '');
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const dp: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    dp[i] = [i];
  }
  for (let j = 1; j <= b.length; j++) {
    dp[0]![j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
    }
  }
  return dp[a.length]![b.length]!;
}

function suggest(term: string): string[] {
  const t = normalize(term);
  return listGlossaryTerms()
    .map((k) => ({ k, d: levenshtein(t, k) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
    .map((x) => x.k);
}

export const lookupGlossaryTool = tool({
  description:
    'Consulta o glossário oficial do dashboard (LTV, DSCR, WAL, PDD, RET, OC, ES, CRI, CRA, LCI, MCMV, SBPE, CMN 2.682, CVM 60, INCC, IPCA, etc.). Retorna definição estruturada + fórmula + benchmark + regulamento quando disponíveis.',
  inputSchema: z.object({
    term: z.string().min(1).describe('Termo a consultar (LTV, DSCR, MCMV, etc.)'),
  }),
  execute: async ({ term }) => {
    const entry = getGlossaryEntry(term);
    if (!entry) {
      return {
        term: normalize(term),
        found: false as const,
        suggestions: suggest(term),
        glossaryVersion: GLOSSARY_VERSION,
      };
    }
    const canonicalSlug =
      Object.entries(GLOSSARY).find(([, v]) => v === entry)?.[0] ?? normalize(term);
    return {
      term: canonicalSlug,
      found: true as const,
      glossaryVersion: GLOSSARY_VERSION,
      definition: entry.definition,
      formula: entry.formula,
      benchmark: entry.benchmark,
      regulamento: entry.regulations,
      sourceDoc: entry.sourceDoc,
      humanTerm: entry.term,
    };
  },
});
