import { describe, it, expect } from 'vitest';
import { CONFIG_COLLECTIONS, FORBIDDEN_COLLECTIONS } from '../provisioning-manifest';
import { readFileSync } from 'node:fs';

/**
 * O manifesto tem que cobrir TODA coleção que a aplicação usa.
 *
 * Motivo concreto: `conversations` ficou de fora da primeira versão. A
 * consequência não foi teórica — a coleção escapou do backup (não foi
 * exportada) E da purga (o `--all` só varre o que está no manifesto), então
 * sete conversas do cliente `brz`, já purgado, sobreviveram no banco de dev
 * carregando `messages` sobre a carteira dele.
 *
 * Uma lista escrita à mão só é confiável se algo a confrontar com a realidade.
 * `firestore.indexes.json` serve de oráculo independente: ele nomeia coleções
 * que a aplicação consulta de fato, e é mantido por outro motivo (performance),
 * então não "concorda por construção" com o manifesto.
 */
describe('manifesto cobre as coleções que a aplicação usa', () => {
  const known = new Set([
    ...CONFIG_COLLECTIONS.map((c) => c.name),
    ...Object.keys(FORBIDDEN_COLLECTIONS),
  ]);

  const indices = JSON.parse(readFileSync('firestore.indexes.json', 'utf-8')) as {
    indexes: { collectionGroup: string }[];
  };
  const indexed = [...new Set(indices.indexes.map((i) => i.collectionGroup))];

  it.each(indexed)('coleção indexada "%s" está no manifesto', (collection) => {
    expect(
      known.has(collection),
      `"${collection}" tem índice em firestore.indexes.json mas não está no manifesto — ` +
      'escaparia do backup e da purga, como aconteceu com `conversations`',
    ).toBe(true);
  });

  it('conversations é tratada como PII — carrega messages e userId', () => {
    expect(Object.keys(FORBIDDEN_COLLECTIONS)).toContain('conversations');
  });
});
