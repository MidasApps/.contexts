import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Composes class names (clsx) and resolves conflicting Tailwind utilities so the last one wins
 * (tailwind-merge). The shadcn components import it as their `utils` alias.
 */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
