import { describe, it, expect } from 'vitest';
import { classifyDryRunError } from '../dry-run-error';

describe('classifyDryRunError', () => {
  it('keeps the position of a syntax error, which BigQuery raises before resolving names', () => {
    expect(classifyDryRunError(new Error('Syntax error: Unexpected end of script at [1:46]')))
      .toEqual({ kind: 'sintaxe', position: '[1:46]' });
  });

  it.each([
    'Unrecognized name: zzz at [1:8]',
    'Name zzz not found inside c at [1:10]',
    'Not found: Table p:ds.t was not found in location US',
    'Access Denied: Table p:ds.t: User does not have permission',
    'No matching signature for operator = for argument types: STRING, INT64 at [1:45]',
    'Invalid dataset ID "ΑΙ"',
    'socket hang up',
    'Error: Syntax error: nested, not at the start',
  ])('treats everything else as semantic: %s', (msg) => {
    expect(classifyDryRunError(new Error(msg))).toEqual({ kind: 'semantico' });
  });

  it('treats a non-Error value as semantic', () => {
    expect(classifyDryRunError(undefined)).toEqual({ kind: 'semantico' });
  });
});
