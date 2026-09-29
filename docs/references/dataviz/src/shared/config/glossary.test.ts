import { describe, it, expect } from 'vitest';
import {
  GLOSSARY,
  GLOSSARY_VERSION,
  getGlossaryEntry,
  getGlossaryDefinition,
  listGlossaryTerms,
} from './glossary';

describe('glossary', () => {
  it('has at least 50 entries', () => {
    expect(Object.keys(GLOSSARY).length).toBeGreaterThanOrEqual(50);
  });

  it('exports GLOSSARY_VERSION', () => {
    expect(typeof GLOSSARY_VERSION).toBe('string');
    expect(GLOSSARY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('every entry has term and non-empty definition', () => {
    for (const [slug, entry] of Object.entries(GLOSSARY)) {
      expect(entry.term, `entry ${slug} term`).toBeTypeOf('string');
      expect(entry.definition.length, `entry ${slug} definition`).toBeGreaterThan(10);
    }
  });

  it('getGlossaryEntry resolves by slug, term, and alias', () => {
    expect(getGlossaryEntry('ltv')).toBeDefined();
    expect(getGlossaryEntry('LTV')).toBeDefined();
    expect(getGlossaryEntry('Loan-to-Value')).toBeDefined();
  });

  it('getGlossaryDefinition returns string for known term, empty for unknown', () => {
    expect(getGlossaryDefinition('ltv').length).toBeGreaterThan(0);
    expect(getGlossaryDefinition('zzz_unknown_term')).toBe('');
  });

  it('listGlossaryTerms returns sorted unique slugs', () => {
    const terms = listGlossaryTerms();
    expect(terms.length).toBe(Object.keys(GLOSSARY).length);
    const sorted = [...terms].sort();
    expect(terms).toEqual(sorted);
  });

  it('includes core securitization terms', () => {
    const required = ['ltv', 'dscr', 'wal', 'pdd', 'oc', 'es', 'cri', 'mcmv', 'sbpe', 'incc', 'ipca'];
    for (const t of required) {
      expect(GLOSSARY[t], `missing ${t}`).toBeDefined();
    }
  });
});
