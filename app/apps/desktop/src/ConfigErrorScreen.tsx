import { loadMessages, type SupportedLocale } from "@core/i18n";
import { IntlProvider, useTranslations } from "use-intl";

function ConfigErrorMessage({ fields }: { fields: readonly string[] }) {
  const t = useTranslations("shell.configError");
  return (
    <main className="grid min-h-svh place-items-center p-6">
      <div className="flex max-w-md flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
        <p role="alert" className="text-sm text-muted-foreground">
          {t("description", { fields: fields.join(", ") })}
        </p>
      </div>
    </main>
  );
}

/**
 * Shown instead of a blank window when the bundled env is invalid (the build normally refuses
 * such a bundle). Lists variable names only, never values; the shell providers are not mounted,
 * so it brings its own intl provider with the core messages.
 */
export function ConfigErrorScreen({ fields, locale }: { fields: readonly string[]; locale: SupportedLocale }) {
  return (
    <IntlProvider locale={locale} messages={loadMessages(locale)}>
      <ConfigErrorMessage fields={fields} />
    </IntlProvider>
  );
}
