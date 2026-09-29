import { describe, expect, it } from 'vitest';
import { PRODUCTION_DATABASE } from './provisioning-manifest';
import { PRODUCTION_DATABASE_ID, decideSeedWrite, readSeedFlags } from './production-guard.mjs';

const OTHER_DB = 'dataviz-dev';

describe('PRODUCTION_DATABASE_ID', () => {
  it('matches PRODUCTION_DATABASE from the provisioning manifest', () => {
    expect(PRODUCTION_DATABASE_ID).toBe(PRODUCTION_DATABASE);
  });
});

describe('decideSeedWrite', () => {
  it('refuses --apply on the production database', () => {
    const decision = decideSeedWrite({ databaseId: PRODUCTION_DATABASE_ID, dryRun: false, apply: true, allowProd: false });
    expect(decision.ok).toBe(false);
    expect(decision.ok ? '' : decision.reason).toContain('--allow-prod');
  });

  it('allows --apply on the production database with --allow-prod', () => {
    expect(decideSeedWrite({ databaseId: PRODUCTION_DATABASE_ID, dryRun: false, apply: true, allowProd: true })).toEqual({ ok: true });
  });

  it('allows --dry-run on the production database', () => {
    expect(decideSeedWrite({ databaseId: PRODUCTION_DATABASE_ID, dryRun: true, apply: false, allowProd: false })).toEqual({ ok: true });
  });

  it('allows --apply on a non-production database', () => {
    expect(decideSeedWrite({ databaseId: OTHER_DB, dryRun: false, apply: true, allowProd: false })).toEqual({ ok: true });
  });

  it('refuses --dry-run together with --apply, on any database and even with --allow-prod', () => {
    for (const databaseId of [PRODUCTION_DATABASE_ID, OTHER_DB]) {
      const decision = decideSeedWrite({ databaseId, dryRun: true, apply: true, allowProd: true });
      expect(decision.ok).toBe(false);
      expect(decision.ok ? '' : decision.reason).toContain('--dry-run');
    }
  });
});

describe('readSeedFlags', () => {
  it('reads --dry-run, --apply and --allow-prod from argv', () => {
    expect(readSeedFlags(['node', 'seed.mjs', '--apply', '--allow-prod'])).toEqual({ dryRun: false, apply: true, allowProd: true });
    expect(readSeedFlags(['node', 'seed.mjs', '--dry-run'])).toEqual({ dryRun: true, apply: false, allowProd: false });
  });
});
