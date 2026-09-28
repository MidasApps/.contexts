import { readFileSync } from 'node:fs';

/**
 * `local/english-identifiers`: identifiers are English.
 *
 * The rule is `.contexts/engineering/rules/development.md`, "Idioma dos
 * identificadores". A name is reported when one of its words is in the
 * Portuguese lexicon the rename codemod uses (`scripts/codemods/lexicon/`), so
 * the rule and the migration agree on what "Portuguese" means.
 *
 * Two kinds of names, two policies:
 * - Bindings (variables, functions, classes, types, interfaces, enums,
 *   parameters, imports, catch params) are ours to name. The only exemption is
 *   the codemod's protected names (`recusa`, `ordem`, `etapa`...): a local
 *   that carries a persisted or model-facing key keeps its name, as the
 *   migration did.
 * - Keys (object literal keys and type/class members) are often not ours: a
 *   Firestore field, a BigQuery column, a tool input the model sends, a log
 *   field. Keys are exempt when they are snake_case, quoted, in the data
 *   contract vocabulary, in the codemod's protected names, or in
 *   `english-identifiers-allowlist.json`, the reviewed keep-list. Renaming any
 *   of those is a data migration, not a lint fix.
 *
 * Option `{ checkKeys: false }` checks bindings only (used for `scripts/`,
 * where seed payloads are data).
 */

const read = (relative) => JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'));

const lexicon = read('../scripts/codemods/lexicon/pt-lexicon.json');
const contractVocabulary = read('../scripts/codemods/lexicon/contract-vocabulary.json');
const protectedNames = read('../scripts/codemods/lexicon/protected-names.json');
const allowlist = read('./english-identifiers-allowlist.json');

const portuguese = new Set(lexicon.portuguese);
const shortPortuguese = new Set(lexicon.shortPortuguese);
const domainTerms = new Set(lexicon.domainTerms);
const protectedSet = new Set(Object.values(protectedNames.groups).flat());
const allowedKeys = new Set([...contractVocabulary.names, ...protectedSet, ...allowlist.names]);

const ACCENT_MARKS = /[̀-ͯ]/g;
const NON_ASCII = /[^\x00-\x7f]/;

// Same splitting and classification as scripts/codemods/identifier-words.ts.
const foldAccents = (text) => text.normalize('NFD').replace(ACCENT_MARKS, '').toLowerCase();

const splitIdentifier = (name) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_\-$.]+/)
    .filter(Boolean);

const isPortugueseWord = (word) => {
  const folded = foldAccents(word);
  if (folded.length < lexicon.minWordLength && !shortPortuguese.has(folded)) return false;
  if (NON_ASCII.test(word)) return true;
  if (domainTerms.has(folded)) return false;
  return portuguese.has(folded) || shortPortuguese.has(folded);
};

const portugueseWordsOf = (name) => splitIdentifier(name).filter(isPortugueseWord).map(foldAccents);

/** `saldo_devedor`, `data_base_report`: column and field names from the data, never ours to rename. */
const isSnakeCase = (name) => /^[a-z0-9]+(_[a-z0-9]+)+$/.test(name);

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Identifiers are English (.contexts/engineering/rules/development.md, "Idioma dos identificadores").',
    },
    schema: [
      {
        type: 'object',
        properties: { checkKeys: { type: 'boolean' } },
        additionalProperties: false,
      },
    ],
    messages: {
      portugueseBinding:
        "'{{name}}' has Portuguese words ({{words}}). Use an English name; see "
        + '.contexts/engineering/rules/development.md#idioma-dos-identificadores.',
      portugueseKey:
        "Key '{{name}}' has Portuguese words ({{words}}). Use an English name; see "
        + '.contexts/engineering/rules/development.md#idioma-dos-identificadores. '
        + 'If the key is persisted or read by the model, add it to '
        + 'eslint-rules/english-identifiers-allowlist.json with the reason.',
    },
  },

  create(context) {
    const checkKeys = context.options[0]?.checkKeys ?? true;

    const checkBinding = (node) => {
      if (!node || node.type !== 'Identifier' || isSnakeCase(node.name) || protectedSet.has(node.name)) return;
      const words = portugueseWordsOf(node.name);
      if (words.length > 0) {
        context.report({ node, messageId: 'portugueseBinding', data: { name: node.name, words: words.join(', ') } });
      }
    };

    /** Every identifier a pattern binds: `{ a, b: c, ...d }`, `[e = 1]`. */
    const checkPattern = (pattern) => {
      if (!pattern) return;
      switch (pattern.type) {
        case 'Identifier': return checkBinding(pattern);
        case 'ObjectPattern':
          for (const property of pattern.properties) {
            checkPattern(property.type === 'RestElement' ? property.argument : property.value);
          }
          return;
        case 'ArrayPattern': return pattern.elements.forEach(checkPattern);
        case 'AssignmentPattern': return checkPattern(pattern.left);
        case 'RestElement': return checkPattern(pattern.argument);
        case 'TSParameterProperty': return checkPattern(pattern.parameter);
        default: return undefined;
      }
    };

    const checkKey = (node, computed) => {
      if (!checkKeys || computed || !node || node.type !== 'Identifier') return;
      const { name } = node;
      if (isSnakeCase(name) || allowedKeys.has(name)) return;
      const words = portugueseWordsOf(name);
      if (words.length > 0) {
        context.report({ node, messageId: 'portugueseKey', data: { name, words: words.join(', ') } });
      }
    };

    const checkFunction = (node) => {
      checkBinding(node.id);
      node.params.forEach(checkPattern);
    };

    return {
      VariableDeclarator: (node) => checkPattern(node.id),
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      ArrowFunctionExpression: (node) => node.params.forEach(checkPattern),
      CatchClause: (node) => checkPattern(node.param),
      ClassDeclaration: (node) => checkBinding(node.id),
      TSInterfaceDeclaration: (node) => checkBinding(node.id),
      TSTypeAliasDeclaration: (node) => checkBinding(node.id),
      TSEnumDeclaration: (node) => checkBinding(node.id),
      ImportSpecifier: (node) => checkBinding(node.local),
      ImportDefaultSpecifier: (node) => checkBinding(node.local),
      ImportNamespaceSpecifier: (node) => checkBinding(node.local),
      // Keys. A shorthand `{ saldo }` is checked through its binding.
      Property: (node) => {
        if (node.parent?.type === 'ObjectExpression' && !node.shorthand) checkKey(node.key, node.computed);
      },
      PropertyDefinition: (node) => checkKey(node.key, node.computed),
      MethodDefinition: (node) => checkKey(node.key, node.computed),
      TSPropertySignature: (node) => checkKey(node.key, node.computed),
      TSMethodSignature: (node) => checkKey(node.key, node.computed),
      TSEnumMember: (node) => checkKey(node.id, false),
    };
  },
};

export default rule;
