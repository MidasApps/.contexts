import { describe, it, expect } from 'vitest';
import { createWordClassifier, defaultWordClassifier, foldAccents, splitIdentifier } from '../identifier-words';

const classifier = createWordClassifier({
  minWordLength: 3,
  shortPortuguese: ['da', 'em'],
  domainTerms: ['ltv', 'vgv'],
  portuguese: ['largura', 'bloco', 'valor', 'nivel', 'metrica'],
});

describe('splitIdentifier', () => {
  it.each([
    ['larguraDoBloco', ['largura', 'Do', 'Bloco']],
    ['LARGURA_MAXIMA', ['LARGURA', 'MAXIMA']],
    ['HTTPServer', ['HTTP', 'Server']],
    ['block-specs', ['block', 'specs']],
    ['$nivel.valor', ['nivel', 'valor']],
  ])('%s', (name, words) => {
    expect(splitIdentifier(name)).toEqual(words);
  });
});

describe('word classification', () => {
  it('flags Portuguese words, accented or not', () => {
    expect(classifier.classifyWord('Largura')).toBe('portuguese');
    expect(classifier.classifyWord('métrica')).toBe('portuguese');
    expect(classifier.classifyWord('nível')).toBe('portuguese');
  });

  it('keeps domain acronyms, English words and short tokens out', () => {
    expect(classifier.classifyWord('ltv')).toBe('domain');
    expect(classifier.classifyWord('width')).toBe('other');
    expect(classifier.classifyWord('db')).toBe('other');
  });

  it('counts the reviewed short Portuguese words', () => {
    expect(classifier.classifyWord('da')).toBe('portuguese');
  });

  it('marks identifiers that mix languages', () => {
    const analysis = classifier.analyzeIdentifier('larguraField');
    expect(analysis.portugueseWords).toEqual(['largura']);
    expect(analysis.isMixed).toBe(true);
    expect(classifier.analyzeIdentifier('larguraDoBloco').isMixed).toBe(false);
    expect(classifier.analyzeIdentifier('blockWidth').portugueseWords).toEqual([]);
  });

  it('folds accents', () => {
    expect(foldAccents('Posição')).toBe('posicao');
  });
});

describe('committed lexicon', () => {
  it.each(['estadoDoDado', 'paginaDoRelatorio', 'guardaTemplateDeMetrica', 'specDoBloco'])(
    'flags %s',
    (name) => {
      expect(defaultWordClassifier.analyzeIdentifier(name).portugueseWords.length).toBeGreaterThan(0);
    },
  );

  it.each(['total', 'real', 'base', 'media', 'grade', 'data', 'value', 'ltvRatio', 'vgvMonthly'])(
    'does not flag %s',
    (name) => {
      expect(defaultWordClassifier.analyzeIdentifier(name).portugueseWords).toEqual([]);
    },
  );
});
