// Sem domínio configurado, ninguém é admin por e-mail (fail-closed).
const DEFAULT_ADMIN_EMAIL_DOMAIN = '';
// Database canônico do app — runtime (browser) e admin (APIs) leem o mesmo DB.
const DEFAULT_DATAVIZ_DATABASE_ID = 'dataviz';

function readEnv(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export const ADMIN_EMAIL_DOMAIN = readEnv(
  process.env.ADMIN_EMAIL_DOMAIN ?? process.env.NEXT_PUBLIC_ADMIN_EMAIL_DOMAIN,
) ?? DEFAULT_ADMIN_EMAIL_DOMAIN;

export const DEV_BYPASS_EMAIL = ADMIN_EMAIL_DOMAIN
  ? `dev@${ADMIN_EMAIL_DOMAIN}`
  : 'dev@local.invalid';

/**
 * Banco Firestore dedicado para a nova arquitetura multi-produto/dataset.
 * Armazena: dataSources/, products/, clients/ (com productBindings).
 * Vide ADR: adrs/multi-product-dataset-integration.md
 *
 * Acessos LITERAIS a `process.env.X`: o Next só embute `NEXT_PUBLIC_*` no bundle
 * do navegador quando a expressão aparece assim. Passar `process.env` inteiro
 * deixaria o navegador sempre no default.
 */
export const DATAVIZ_DATABASE_ID = resolveDatavizDatabaseId({
  DATAVIZ_DATABASE_ID: process.env.DATAVIZ_DATABASE_ID,
  NEXT_PUBLIC_DATAVIZ_DATABASE_ID: process.env.NEXT_PUBLIC_DATAVIZ_DATABASE_ID,
});

/**
 * A regra acima, pura, para quem precisa decidir ANTES de abrir o Firestore
 * (a guarda do playground local do Mastra). Atenção ao `??`: um
 * `DATAVIZ_DATABASE_ID=` vazio NÃO cai para o `NEXT_PUBLIC_*` — vira o default.
 * A guarda tem de ver exatamente isto, e não uma releitura "mais esperta".
 */
export function resolveDatavizDatabaseId(env: Record<string, string | undefined>): string {
  return readEnv(env.DATAVIZ_DATABASE_ID ?? env.NEXT_PUBLIC_DATAVIZ_DATABASE_ID) ?? DEFAULT_DATAVIZ_DATABASE_ID;
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email || !ADMIN_EMAIL_DOMAIN) return false;
  return email.toLowerCase().endsWith(`@${ADMIN_EMAIL_DOMAIN.toLowerCase()}`);
}

export function isDevAuthBypassEnabled(): boolean {
  return process.env.NODE_ENV === 'development'
    && (
      process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === 'true'
      || Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST)
      || Boolean(process.env.FIRESTORE_EMULATOR_HOST)
      || !process.env.FIREBASE_ADMIN_PRIVATE_KEY
    );
}
