import { z } from "zod";

/** ISO 4217 code, uppercase; same CHECK as Postgres (`^[A-Z]{3}$`). */
export const CurrencySchema = z.string().regex(/^[A-Z]{3}$/);
export type Currency = z.infer<typeof CurrencySchema>;

/**
 * Money in minor units (`BRL 123,45` is `12345`); never float or decimal string.
 * Sub-fields carry catalog meta because every nested field of a contract needs it.
 */
export const MoneySchema = z.object({
  amountMinor: z.int().nonnegative().meta({ description: "Amount in the currency's minor unit.", pii: "none" }),
  currency: CurrencySchema.meta({ description: "ISO 4217 currency code.", pii: "none" }),
});
export type Money = z.infer<typeof MoneySchema>;
