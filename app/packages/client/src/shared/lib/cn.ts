import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// globals.css adds theme values tailwind-merge cannot infer (decision 0014): without them
// `shadow-popover` would be read as a shadow colour and survive next to `shadow-modal`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      shadow: ["hover", "popover", "modal"],
      radius: ["2xs"],
    },
  },
});

/**
 * Composes class names (clsx) and resolves conflicting Tailwind utilities so the last one wins
 * (tailwind-merge). The shadcn components import it as their `utils` alias.
 */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
