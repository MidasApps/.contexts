// Sessions keep the browser and OS family only (SP1 spec §4): the full User-Agent string
// is a fingerprint, so it is never stored.
const BROWSERS: readonly (readonly [RegExp, string])[] = [
  [/\bEdg(?:e|A|iOS)?\//, "Edge"],
  [/\bOPR\//, "Opera"],
  [/\bFirefox\/|\bFxiOS\//, "Firefox"],
  [/\bChrome\/|\bCriOS\//, "Chrome"],
  [/\bVersion\/[\d.]+.*\bSafari\//, "Safari"],
];

const SYSTEMS: readonly (readonly [RegExp, string])[] = [
  [/\bAndroid\b/, "Android"],
  [/\biPhone\b|\biPad\b|\biPod\b/, "iOS"],
  [/\bWindows\b/, "Windows"],
  [/\bMacintosh\b|\bMac OS X\b/, "macOS"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bLinux\b/, "Linux"],
];

const familyOf = (userAgent: string, families: readonly (readonly [RegExp, string])[]): string | undefined =>
  families.find(([pattern]) => pattern.test(userAgent))?.[1];

/** `Firefox on Windows`; unknown parts are named generically, the raw string is never echoed. */
export const summarizeUserAgent = (userAgent: string | null): string => {
  const source = userAgent ?? "";
  return `${familyOf(source, BROWSERS) ?? "Unknown browser"} on ${familyOf(source, SYSTEMS) ?? "unknown OS"}`;
};
