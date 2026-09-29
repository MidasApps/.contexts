import { describe, it, expect } from 'vitest';
import { lookupGlossaryTool, LOOKUP_GLOSSARY_TOOL_NAME } from './lookup-glossary';
import { GLOSSARY_VERSION } from '@/shared/config/glossary';

describe('lookup_glossary tool', () => {
  it('exports correct tool name constant', () => {
    expect(LOOKUP_GLOSSARY_TOOL_NAME).toBe('lookup_glossary');
  });

  it('returns structured entry for known term', async () => {
    const out = (await lookupGlossaryTool.execute!(
      { term: 'LTV' },
      { toolCallId: 'tc', messages: [] } as never,
    )) as { term: string; found: boolean; definition?: string; glossaryVersion: string };
    expect(out.found).toBe(true);
    expect(out.term).toBe('ltv');
    expect(out.definition).toBeDefined();
    expect(out.definition!.length).toBeGreaterThan(10);
    expect(out.glossaryVersion).toBe(GLOSSARY_VERSION);
  });

  it('returns suggestions for unknown term ordered by Levenshtein', async () => {
    const out = (await lookupGlossaryTool.execute!(
      { term: 'ltvz' },
      { toolCallId: 'tc', messages: [] } as never,
    )) as { found: boolean; suggestions: string[] };
    expect(out.found).toBe(false);
    expect(out.suggestions).toHaveLength(3);
    expect(out.suggestions[0]).toBe('ltv'); // closest neighbor
  });

  it('inputSchema requires term as non-empty string', () => {
    const t = lookupGlossaryTool as unknown as { inputSchema: { parse: (x: unknown) => unknown } };
    expect(() => t.inputSchema.parse({ term: '' })).toThrow();
    expect(() => t.inputSchema.parse({})).toThrow();
    expect(() => t.inputSchema.parse({ term: 'ltv' })).not.toThrow();
  });

  it('resolves human-form term ("Loan-to-Value")', async () => {
    const out = (await lookupGlossaryTool.execute!(
      { term: 'Loan-to-Value' },
      { toolCallId: 'tc', messages: [] } as never,
    )) as { found: boolean; term: string };
    expect(out.found).toBe(true);
    expect(out.term).toBe('ltv');
  });
});
