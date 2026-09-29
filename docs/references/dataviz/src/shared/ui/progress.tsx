"use client"

import * as React from "react"
import { Progress as ProgressPrimitive } from "radix-ui"

import { cn } from "@/shared/lib/utils"

/**
 * Barra de progresso — primitivo do Radix, não uma `div` com `width` calculada.
 *
 * A versão à mão trazia `role="progressbar"` e os `aria-value*` escritos um a
 * um, que é a parte fácil de errar em silêncio: `aria-valuenow` sem
 * `aria-valuemin`, ou o `role` num elemento que também recebe clique. O
 * primitivo cuida disso e ainda expõe `data-state` para estilizar
 * carregamento e conclusão sem prop extra.
 */
function Progress({
  className,
  value,
  indicatorClassName,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
  /** Classe do preenchimento — é ela que carrega a cor do veredito. */
  indicatorClassName?: string
}) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "relative h-[7px] w-full overflow-hidden rounded-full bg-muted",
        className
      )}
      value={value}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          "h-full w-full flex-1 rounded-full bg-primary transition-transform duration-500",
          indicatorClassName
        )}
        style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
