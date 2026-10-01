"use client";

import { useEffect, useState } from "react";

/** Seconds left until `expiresAt` (never negative), re-read every second with the injected clock. */
export const useCountdown = (expiresAt: string | null, now: () => Date, tickMs = 1000): number => {
  const remaining = (): number => (expiresAt === null ? 0 : Math.max(0, Math.ceil((Date.parse(expiresAt) - now().getTime()) / 1000)));
  const [seconds, setSeconds] = useState(remaining);
  useEffect(() => {
    if (expiresAt === null) return undefined;
    const timer = setInterval(() => setSeconds(remaining()), tickMs);
    return () => clearInterval(timer);
    // `remaining` reads the latest props; the interval restarts only when the code changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt, tickMs]);
  return seconds;
};

/** `7KQ2M9XA` → `7KQ2-M9XA` (easier to read aloud and type; the server ignores dashes). */
export const groupActivationCode = (code: string): string => (code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code);
