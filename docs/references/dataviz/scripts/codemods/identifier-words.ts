import lexiconData from './lexicon/pt-lexicon.json';

/**
 * Splits identifiers into words and tells which words are Portuguese.
 *
 * The rule being enforced is `.contexts/engineering/rules/development.md`,
 * "Idioma dos identificadores". The lexicon is a denylist of accent-folded
 * Portuguese words that are not English words, so a name such as `total` or
 * `real` is never flagged. Domain acronyms (`pdd`, `ltv`, `vgv`) are glossary
 * terms and are not Portuguese vocabulary.
 */

export type Lexicon = Readonly<{
  minWordLength: number;
  shortPortuguese: readonly string[];
  domainTerms: readonly string[];
  portuguese: readonly string[];
}>;

export type WordClass = 'portuguese' | 'domain' | 'other';

export type IdentifierAnalysis = Readonly<{
  words: readonly string[];
  portugueseWords: readonly string[];
  /** Portuguese and English words in the same identifier (`larguraField`). */
  isMixed: boolean;
}>;

export type WordClassifier = Readonly<{
  classifyWord: (word: string) => WordClass;
  analyzeIdentifier: (name: string) => IdentifierAnalysis;
}>;

const ACCENT_MARKS = /[̀-ͯ]/g;
const NON_ASCII = /[^\x00-\x7f]/;

export const foldAccents = (text: string): string =>
  text.normalize('NFD').replace(ACCENT_MARKS, '').toLowerCase();

/** `larguraDoBloco` → `largura Do Bloco`; `HTTPServer` → `HTTP Server`; `_`, `-`, `$`, `.` split. */
export const splitIdentifier = (name: string): string[] =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_\-$.]+/)
    .filter(Boolean);

export const createWordClassifier = (lexicon: Lexicon): WordClassifier => {
  const portuguese = new Set(lexicon.portuguese);
  const domain = new Set(lexicon.domainTerms);
  const shortPortuguese = new Set(lexicon.shortPortuguese);

  const classifyWord = (word: string): WordClass => {
    const folded = foldAccents(word);
    if (folded.length < lexicon.minWordLength && !shortPortuguese.has(folded)) return 'other';
    if (NON_ASCII.test(word)) return 'portuguese';
    if (domain.has(folded)) return 'domain';
    return portuguese.has(folded) || shortPortuguese.has(folded) ? 'portuguese' : 'other';
  };

  const analyzeIdentifier = (name: string): IdentifierAnalysis => {
    const words = splitIdentifier(name);
    const classes = words.map(classifyWord);
    const portugueseWords = words.filter((_, i) => classes[i] === 'portuguese').map(foldAccents);
    const hasOtherWord = words.some((word, i) => classes[i] === 'other' && /^[a-z]{3,}$/i.test(word));
    return { words, portugueseWords, isMixed: portugueseWords.length > 0 && hasOtherWord };
  };

  return { classifyWord, analyzeIdentifier };
};

/** Classifier backed by the committed lexicon (`lexicon/pt-lexicon.json`). */
export const defaultWordClassifier: WordClassifier = createWordClassifier(lexiconData);
