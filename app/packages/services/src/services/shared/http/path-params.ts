const PARAM_SEGMENT = /^\{([a-z][A-Za-z0-9]*)\}$/;

const splitPath = (path: string): string[] => {
  const trimmed = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  return trimmed.split("/");
};

const decodeSegment = (segment: string): string | null => {
  try {
    return decodeURIComponent(segment);
  } catch {
    // URIError: a malformed escape is just a path that does not match.
    return null;
  }
};

/**
 * Matches a request path against an endpoint template (`/v1/units/{unitId}`) and returns
 * the decoded `{param}` values; values are validated later by the endpoint's `params` schema.
 * @returns `null` when the path does not match (segment count, static segment, empty or malformed value).
 * @example matchPathParams("/v1/units/{unitId}", "/v1/units/u1") // { unitId: "u1" }
 */
export const matchPathParams = (template: string, pathname: string): Record<string, string> | null => {
  const expected = splitPath(template);
  const actual = splitPath(pathname);
  if (expected.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (const [index, segment] of expected.entries()) {
    const value = actual[index] ?? "";
    const name = PARAM_SEGMENT.exec(segment)?.[1];
    if (name === undefined) {
      if (segment !== value) return null;
      continue;
    }
    const decoded = value === "" ? null : decodeSegment(value);
    if (decoded === null) return null;
    params[name] = decoded;
  }
  return params;
};
