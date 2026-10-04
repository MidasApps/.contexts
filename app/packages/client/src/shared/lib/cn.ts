import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// globals.css adds theme values tailwind-merge cannot infer (decisions 0014 and 0057): without them
// `shadow-popover` would be read as a shadow colour and survive next to `shadow-modal`, and
// `text-caption` as a text colour that drops `text-muted-foreground`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      shadow: ["hover", "popover", "modal"],
      radius: ["2xs"],
      text: ["micro", "tiny", "label", "caption", "body-sm", "body", "title"],
    },
  },
});

/**
 * Composes class names (clsx) and resolves conflicting Tailwind utilities so the last one wins
 * (tailwind-merge). The shadcn components import it as their `utils` alias.
 */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
