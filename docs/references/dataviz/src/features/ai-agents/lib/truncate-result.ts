const DEFAULT_MAX_ROWS = 500;
const DEFAULT_MAX_CHARS = 50_000;

/**
 * Truncates an array of results to fit within row and character budgets.
 * Uses binary search to find the maximum number of rows that fit.
 */
export function truncateResult<T>(
  data: T[],
  maxRows = DEFAULT_MAX_ROWS,
  maxChars = DEFAULT_MAX_CHARS,
): { data: T[]; truncated: boolean; totalCount: number; returnedCount: number } {
  const totalCount = data.length;
  let result = data.slice(0, maxRows);

  const serialized = JSON.stringify(result);
  if (serialized.length > maxChars) {
    let lo = 0;
    let hi = result.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (JSON.stringify(result.slice(0, mid)).length <= maxChars) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    result = result.slice(0, lo);
  }

  return {
    data: result,
    truncated: result.length < totalCount,
    totalCount,
    returnedCount: result.length,
  };
}
