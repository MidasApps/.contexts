import { describe, it, expect } from 'vitest';
import { parseArgs, mergeClaims } from './grant-claims-args';

describe('parseArgs', () => {
  it('--clientIds=a,b,c → array', () => {
    expect(parseArgs(['--email=u@x.com', '--clientIds=a,b,c']).clientIds).toEqual(['a', 'b', 'c']);
  });
  it('alias --clientId=OM → [OM]', () => {
    expect(parseArgs(['--clientId=OM']).clientIds).toEqual(['OM']);
  });
  it('trim e descarte de vazios', () => {
    expect(parseArgs(['--clientIds=a, ,b,']).clientIds).toEqual(['a', 'b']);
  });
  it('--clear e --list', () => {
    expect(parseArgs(['--clear']).clear).toBe(true);
    expect(parseArgs(['--list']).list).toBe(true);
  });
});

describe('mergeClaims', () => {
  it('preserva claims existentes e adiciona clientIds', () => {
    expect(mergeClaims({ role: 'x' }, { clientIds: ['a', 'b'] })).toEqual({ role: 'x', clientIds: ['a', 'b'] });
  });
  it('aplica role', () => {
    expect(mergeClaims({}, { role: 'admin' })).toEqual({ role: 'admin' });
  });
  it('sem clientIds/role → devolve o existente inalterado', () => {
    expect(mergeClaims({ clientIds: ['z'] }, {})).toEqual({ clientIds: ['z'] });
  });
});
