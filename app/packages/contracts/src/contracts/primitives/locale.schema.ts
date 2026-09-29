import { z } from "zod";

const isCanonicalLocale = (tag: string): boolean => {
  try {
    return Intl.getCanonicalLocales(tag)[0] === tag;
  } catch {
    // RangeError: not a structurally valid BCP 47 tag.
    return false;
  }
};

/** BCP 47 language tag in canonical form (`pt-BR`, not `pt-br`), so stored values compare equal. */
export const LocaleSchema = z
  .string()
  .min(1)
  .refine(isCanonicalLocale, { error: "Expected a canonical BCP 47 tag." });
export type Locale = z.infer<typeof LocaleSchema>;
