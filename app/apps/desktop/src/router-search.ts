/**
 * Plain `URLSearchParams` search handling for TanStack Router. Its default JSON-aware parser turns
 * `?unit=123` into a number and re-quotes strings; the shared route map (decision 0012) reads and
 * writes raw strings, so the desktop keeps search values exactly as `routeHref` wrote them.
 */
export const parsePlainSearch = (searchStr: string): Record<string, string> => Object.fromEntries(new URLSearchParams(searchStr));

export const stringifyPlainSearch = (search: Record<string, unknown>): string => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) if (typeof value === "string") params.set(key, value);
  const text = params.toString();
  return text === "" ? "" : `?${text}`;
};
