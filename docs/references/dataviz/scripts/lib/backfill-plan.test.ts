import { describe, it, expect } from 'vitest';
import { buildBackfillPlan } from './backfill-plan';

describe('buildBackfillPlan', () => {
  it('mapeia clientAccess → clientIds', () => {
    expect(buildBackfillPlan([
      { email: 'a@x.com', clientAccess: [{ clientId: 'om' }, { clientId: 'brz' }] },
    ])).toEqual([{ email: 'a@x.com', clientIds: ['om', 'brz'] }]);
  });
  it('ignora usuários sem clientAccess ou sem email', () => {
    expect(buildBackfillPlan([
      { email: 'b@x.com', clientAccess: [] },
      { clientAccess: [{ clientId: 'om' }] },
      { email: 'c@x.com' },
    ])).toEqual([]);
  });
});
