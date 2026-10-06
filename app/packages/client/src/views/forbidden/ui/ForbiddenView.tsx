"use client";

import { PageForbidden } from "#/widgets/page-state/index.ts";

/** Forbidden page: signed in without the permission the page needs (API 403, SP2 spec §4). */
export function ForbiddenView() {
  return <PageForbidden />;
}
