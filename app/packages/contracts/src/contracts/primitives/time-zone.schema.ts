import { z } from "zod";

// Intl accepts raw offsets (`+03:00`) as time zones; the contract only allows IANA names.
const IANA_NAME_SHAPE = /^[A-Za-z][A-Za-z0-9_+\-/]*$/;

const isIanaTimeZone = (zone: string): boolean => {
  if (!IANA_NAME_SHAPE.test(zone)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    // RangeError: unknown time zone.
    return false;
  }
};

/** IANA time zone name (`America/Sao_Paulo`, `UTC`). */
export const TimeZoneSchema = z.string().refine(isIanaTimeZone, { error: "Expected an IANA time zone name." });
export type TimeZone = z.infer<typeof TimeZoneSchema>;
