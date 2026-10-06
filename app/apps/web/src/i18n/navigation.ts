import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/** Locale-aware navigation of the web router adapter (decision 0012 §2): `Link`, `useRouter`, `usePathname`. */
export const { Link, useRouter, usePathname, getPathname, redirect } = createNavigation(routing);
