/**
 * Shown instead of a blank window when the bundled env is invalid. Lists
 * variable names only, never values (neutral copy; i18n arrives in SP2).
 */
export function ConfigErrorScreen({ fields }: { fields: readonly string[] }) {
  return (
    <main className="shell">
      <h1>Configuration error</h1>
      <p role="alert">This build is missing valid settings: {fields.join(", ")}.</p>
    </main>
  );
}
