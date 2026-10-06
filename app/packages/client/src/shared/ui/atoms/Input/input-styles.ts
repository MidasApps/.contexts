/**
 * Text-control look shared by Input, Textarea and the Select trigger (`.design-system/componentes.html`
 * "Inputs"): page background, `--input` border, 10 px radius; focus turns the border to `--ring`
 * (≥ 3:1 against the page in both themes) plus a soft 3 px halo. Invalid controls
 * (`aria-invalid`) switch the border to destructive — the message itself carries the meaning.
 */
export const textControlClasses = [
  "w-full min-w-0 rounded-sm border border-input bg-background text-sm text-foreground",
  "transition-[border-color,box-shadow] placeholder:text-muted-foreground",
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 focus-visible:outline-none",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/25",
].join(" ");
