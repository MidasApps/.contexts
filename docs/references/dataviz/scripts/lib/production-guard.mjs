/**
 * Production write guard for the one-off seeds.
 *
 * Lives in `.mjs` because the seeds run under plain `node` too, which cannot
 * import `provisioning-manifest.ts`. The id mirrors `PRODUCTION_DATABASE` there;
 * `production-guard.test.ts` fails if the two ever diverge.
 */

export const PRODUCTION_DATABASE_ID = 'dataviz';

/** @param {string[]} argv */
export function readSeedFlags(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
    apply: argv.includes('--apply'),
    allowProd: argv.includes('--allow-prod'),
  };
}

/**
 * Pure decision: may this seed run with these flags against this database?
 * `--dry-run` with `--apply` is refused everywhere, because the seeds gate
 * writes on `--apply` alone and would write while announcing a dry-run.
 *
 * @param {{ databaseId: string, dryRun: boolean, apply: boolean, allowProd: boolean }} input
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function decideSeedWrite({ databaseId, dryRun, apply, allowProd }) {
  if (dryRun && apply) {
    return { ok: false, reason: '--dry-run e --apply são mutuamente exclusivos. Passe apenas um.' };
  }
  if (apply && databaseId.trim() === PRODUCTION_DATABASE_ID && !allowProd) {
    return {
      ok: false,
      reason: `database=${databaseId} é o banco de PRODUÇÃO. Use um banco de desenvolvimento ou passe --allow-prod explicitamente.`,
    };
  }
  return { ok: true };
}

/**
 * Exits with code 2 when the decision refuses. Call it before any Firestore
 * client is created, so a refused run makes no GCP call.
 *
 * @param {{ databaseId: string, argv: string[], label: string }} input
 */
export function assertSeedWriteAllowed({ databaseId, argv, label }) {
  const decision = decideSeedWrite({ databaseId, ...readSeedFlags(argv) });
  if (!decision.ok) {
    console.error(`[${label}] RECUSADO: ${decision.reason}`);
    process.exit(2);
  }
}
