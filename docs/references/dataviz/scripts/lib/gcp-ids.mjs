/**
 * Resolve projeto GCP e id do banco Firestore sem cair em conta de terceiros.
 * Scripts one-off importam daqui em vez de hardcodar project/database.
 */

export const DEFAULT_DATABASE_ID = 'dataviz';
export const DEFAULT_DEV_DATABASE_ID = 'dataviz-dev';

export function resolveGcpProject(explicit) {
  const id = (
    explicit
    || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    || process.env.GOOGLE_CLOUD_PROJECT
    || process.env.GCP_PROJECT_ID
    || ''
  ).trim();
  if (!id) {
    console.error(
      'Projeto GCP ausente. Passe --project=<id> ou defina NEXT_PUBLIC_FIREBASE_PROJECT_ID / GOOGLE_CLOUD_PROJECT.',
    );
    process.exit(1);
  }
  return id;
}

export function resolveDatabaseId(explicit, fallback = DEFAULT_DATABASE_ID) {
  return (
    explicit
    || process.env.DATAVIZ_DATABASE_ID
    || process.env.FIRESTORE_DATABASE_ID
    || fallback
  ).trim();
}
