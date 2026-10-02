type NumberFormatter = (value: number, options: Intl.NumberFormatOptions) => string;

const KB = 1024;
const MB = KB * 1024;

/**
 * A file size in the user's locale with a unit ("48 kB", "1,2 MB"), for attachment details.
 * `format` is `useFormatter().number`, so the locale's separators and unit names apply.
 */
export const formatFileSize = (bytes: number, format: NumberFormatter): string => {
  if (bytes < KB) return format(bytes, { style: "unit", unit: "byte", unitDisplay: "short" });
  if (bytes < MB) return format(Math.round(bytes / KB), { style: "unit", unit: "kilobyte", unitDisplay: "short" });
  return format(bytes / MB, { style: "unit", unit: "megabyte", unitDisplay: "short", maximumFractionDigits: 1 });
};
