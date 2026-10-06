"use client";

import { PageNotFound } from "#/widgets/page-state/index.ts";

/** Not-found page: a URL outside the route map, or a resource SP1 hides with 404 (SP2 spec §4). */
export function NotFoundView() {
  return <PageNotFound />;
}
