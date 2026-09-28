import { describe, expect, it } from 'vitest';
import {
  indexKey,
  collectionGroupFromName,
  indexRequestBody,
  missingIndexes,
} from './firestore-index-payload.mjs';

const conversationsIndex = {
  collectionGroup: 'conversations',
  queryScope: 'COLLECTION',
  fields: [
    { fieldPath: 'userId', order: 'ASCENDING' },
    { fieldPath: 'updatedAt', order: 'DESCENDING' },
  ],
};

describe('firestore-index-payload', () => {
  it('ignores the __name__ field the API appends when building the key', () => {
    const fromApi = {
      queryScope: 'COLLECTION',
      fields: [...conversationsIndex.fields, { fieldPath: '__name__', order: 'DESCENDING' }],
    };
    expect(indexKey('conversations', fromApi)).toBe(indexKey('conversations', conversationsIndex));
  });

  it('keeps arrayConfig fields distinct from ordered fields', () => {
    const body = indexRequestBody({
      queryScope: 'COLLECTION',
      fields: [{ fieldPath: 'tags', arrayConfig: 'CONTAINS' }, { fieldPath: 'ts', order: 'ASCENDING' }],
    });
    expect(body).toEqual({
      queryScope: 'COLLECTION',
      fields: [{ fieldPath: 'tags', arrayConfig: 'CONTAINS' }, { fieldPath: 'ts', order: 'ASCENDING' }],
    });
  });

  it('extracts the collection group from an API index name', () => {
    expect(
      collectionGroupFromName('projects/p/databases/d/collectionGroups/sqlCatalog/indexes/CICAg'),
    ).toBe('sqlCatalog');
    expect(collectionGroupFromName(undefined)).toBeNull();
  });

  it('reports only the declared indexes the API does not have yet', () => {
    const existing = [
      {
        name: 'projects/p/databases/d/collectionGroups/conversations/indexes/1',
        queryScope: 'COLLECTION',
        fields: [...conversationsIndex.fields, { fieldPath: '__name__', order: 'DESCENDING' }],
      },
    ];
    const otherIndex = { ...conversationsIndex, collectionGroup: 'sqlCatalog' };
    expect(missingIndexes([conversationsIndex, otherIndex], existing)).toEqual([otherIndex]);
  });
});
