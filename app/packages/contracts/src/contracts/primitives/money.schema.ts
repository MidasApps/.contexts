import { z } from "zod";

/** ISO 4217 code, uppercase; same CHECK as Postgres (`^[A-Z]{3}$`). */
export const CurrencySchema = z.string().regex(/^[A-Z]{3}$/);
export type Currency = z.infer<typeof CurrencySchema>;

/** Money in minor units (`BRL 123,45` is `12345`); never float or decimal string. */
export const MoneySchema = z.object({
  amountMinor: z.int().nonnegative(),
  currency: CurrencySchema,
});
export type Money = z.infer<typeof MoneySchema>;
