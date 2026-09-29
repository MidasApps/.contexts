import { z } from "zod";

/** ISO 8601 UTC timestamp with `Z` suffix (contracts/api.md §8.1). */
export const IsoDateTimeSchema = z.iso.datetime({ offset: false });
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;
